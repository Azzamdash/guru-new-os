-- Ask the same question the clearing sheet asks.
--
-- courier_outstanding_totals gates owed on fulfillment_status = 'delivered'.
-- The two pages the money actually moves through gate on shipment_outcome:
-- listClearableOrders filters .eq("shipment_outcome", "delivered"), and
-- getCourierAccountStatement counts codValue on the same column. Those two
-- columns are allowed to disagree about one order -- shipment_outcome is the
-- delivery fact the accrual keys off, fulfillment_status is the wider
-- lifecycle -- so the debt could exclude an order the operator can clear, and
-- then take in its collection with no matching charge. The balance would drift
-- and never close, with nothing on screen to say why.
--
-- Whether the courier is holding our cash is a question about the shipment, so
-- shipment_outcome is also the right column on its own terms, not merely the
-- consistent one.
--
-- No effect on current data: every order whose fulfillment_status is
-- 'delivered' also has shipment_outcome 'delivered' today, so the figure is
-- unchanged. This closes the gap before the two columns diverge.
--
-- An order row missing entirely still counts, as before: nothing says the
-- invoice was not delivered, and dropping it would quietly erase a real debt.
CREATE OR REPLACE FUNCTION public.courier_outstanding_totals()
    RETURNS TABLE(out_courier_id uuid, out_owed numeric, out_collected numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH owed AS (
    SELECT si.courier_id AS cid,
      sum(CASE WHEN si.type = 'return' THEN -si.total_amount ELSE si.total_amount END)::numeric AS amount
    FROM public.sales_invoices si
    LEFT JOIN public.orders o ON o.invoice_id = si.id
    WHERE si.courier_id IS NOT NULL
      AND COALESCE(o.shipment_outcome::text, 'delivered') = 'delivered'
    GROUP BY si.courier_id
  ), withheld AS (
    SELECT COALESCE(si.courier_id, o.courier_id) AS cid, sum(cc.amount)::numeric AS amount
    FROM public.courier_charges cc
    JOIN public.orders o ON o.id = cc.order_id
    LEFT JOIN public.sales_invoices si ON si.id = o.invoice_id
    WHERE cc.settled_at IS NOT NULL
      AND COALESCE(si.courier_id, o.courier_id) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.cash_transactions ct
        WHERE ct.id = cc.settled_cash_transaction_id
          AND ct.type NOT IN ('collection', 'deposit')
      )
    GROUP BY 1
  ), transferred AS (
    SELECT m.courier_id AS cid, sum(m.collected)::numeric AS amount
    FROM public.courier_financial_metrics m
    GROUP BY m.courier_id
  )
  SELECT c.id,
    COALESCE(ow.amount, 0)::numeric,
    (COALESCE(tr.amount, 0) + COALESCE(wh.amount, 0))::numeric
  FROM public.couriers c
  LEFT JOIN owed ow ON ow.cid = c.id
  LEFT JOIN withheld wh ON wh.cid = c.id
  LEFT JOIN transferred tr ON tr.cid = c.id
  WHERE public.can_read_page(auth.uid(), '/treasury')
    AND public.courier_accessible_to_user(auth.uid(), c.id);
$$;
