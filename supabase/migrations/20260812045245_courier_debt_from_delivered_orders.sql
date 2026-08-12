-- The courier debt on the treasury page counted money the courier never held.
--
-- owed is a running accumulator: courier_invoice_metrics_trigger adds every
-- sales_invoices row's total_amount to the courier it names, on insert, and
-- adjusts it when the invoice changes. Nothing in that trigger looks at the
-- order. So an order cancelled before it was ever dispatched, or one that came
-- back as a return, still sits in the courier's balance as cash they are
-- holding for us -- money that was never collected from anybody.
--
-- The second half of the same overstatement is the fee the courier keeps out
-- of the transfer. owed is the gross the customer pays; collected is fed from
-- the cash movement, which postOrderClearing books net, because the bank only
-- ever sees the transfer. The withheld difference has nowhere to go and stays
-- in the balance forever.
--
-- Both are fixed by deriving the pair rather than accumulating it:
--
--   owed      only invoices whose order actually reached the customer.
--   collected the cash transferred, plus fees settled out of a transfer.
--
-- Derived, not backfilled, so it is right for clearings made before any of
-- this existed and cannot drift afterwards. It also makes reversal free: a
-- clearing reversal already clears settled_at, which withdraws the credit.
--
-- This supersedes credit_courier_withheld_fee, which credited the same fee
-- from the clearing code path. Keeping both would count it twice, so it is
-- dropped here along with its call sites.
--
-- SECURITY DEFINER because the sources are under RLS on pages the treasury
-- role need not hold -- courier_charges wants /couriers, and orders and
-- sales_invoices are brand-scoped -- while the debt itself is a treasury
-- figure. The function re-checks /treasury and per-courier access itself, the
-- same gate courier_financial_metrics carried, and returns three numeric
-- columns per courier and nothing else.
CREATE OR REPLACE FUNCTION public.courier_outstanding_totals()
    RETURNS TABLE(out_courier_id uuid, out_owed numeric, out_collected numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH owed AS (
    -- Delivery is the whole test. orders_sync_invoice keeps one invoice per
    -- order and flips its type in place, so a returned order's invoice is not a
    -- second row to net off against the sale -- it is the same row -- and
    -- excluding the order excludes the invoice with it. The type still decides
    -- the sign, for the rare return invoice sitting on a delivered order.
    --
    -- An invoice with no order at all is counted: there is nothing to say it
    -- was not delivered, and dropping it would quietly erase a real debt.
    SELECT si.courier_id AS cid,
      sum(CASE WHEN si.type = 'return' THEN -si.total_amount ELSE si.total_amount END)::numeric AS amount
    FROM public.sales_invoices si
    LEFT JOIN public.orders o ON o.invoice_id = si.id
    WHERE si.courier_id IS NOT NULL
      AND COALESCE(o.fulfillment_status::text, 'delivered') = 'delivered'
    GROUP BY si.courier_id
  ), withheld AS (
    -- A settled fee discharges the debt only when the courier kept it out of a
    -- transfer -- they collected the gross from the customer either way. A fee
    -- settled by settleCourierCharges is the opposite case: we paid it out of a
    -- wallet, so it is an expense and leaves the COD debt alone. The two are
    -- told apart by the movement that settled them, and a charge settled before
    -- that link was recorded is read as withheld, which is what every one of
    -- them was.
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

REVOKE ALL ON FUNCTION public.courier_outstanding_totals() FROM PUBLIC;
GRANT ALL ON FUNCTION public.courier_outstanding_totals() TO authenticated;
GRANT ALL ON FUNCTION public.courier_outstanding_totals() TO service_role;

-- Only courier_totals changes; the rest is restated because CREATE OR REPLACE
-- FUNCTION has no partial form.
CREATE OR REPLACE FUNCTION public.cash_summary_report(_from date DEFAULT NULL::date, _to date DEFAULT NULL::date, _for_user_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH all_cash AS (
    SELECT COALESCE(sum(CASE WHEN type IN ('collection','deposit') THEN amount ELSE -amount END), 0)::numeric AS balance
    FROM public.cash_daily_metrics
    WHERE brand_key = '00000000-0000-0000-0000-000000000000'::uuid
      OR public.has_brand_access(auth.uid(), brand_key)
  ), wallet_opening AS (
    SELECT COALESCE(sum(opening_balance), 0)::numeric AS amount FROM public.wallets
  ), unlinked_all AS (
    SELECT COALESCE(sum(amount), 0)::numeric AS amount
    FROM public.expense_entries
    WHERE cash_transaction_id IS NULL
      AND (brand_id IS NULL OR public.has_brand_access(auth.uid(), brand_id))
  ), period_cash AS MATERIALIZED (
    SELECT * FROM public.cash_daily_metrics m
    WHERE (_from IS NULL OR m.day >= _from)
      AND (_to IS NULL OR m.day <= _to)
      AND (m.brand_key = '00000000-0000-0000-0000-000000000000'::uuid
        OR public.has_brand_access(auth.uid(), m.brand_key))
  ), period_cash_totals AS (
    SELECT
      COALESCE(sum(amount) FILTER (WHERE type IN ('collection','deposit')), 0)::numeric AS period_in,
      COALESCE(sum(amount) FILTER (WHERE type NOT IN ('collection','deposit')), 0)::numeric AS cash_out,
      COALESCE(sum(amount) FILTER (
        WHERE type = 'personal_withdrawal'
          AND (_for_user_id IS NULL OR user_key = _for_user_id)
      ), 0)::numeric AS personal_total
    FROM period_cash
  ), extra_period_expenses AS (
    SELECT COALESCE(sum(e.amount), 0)::numeric AS amount
    FROM public.expense_entries e
    WHERE (_from IS NULL OR e.effective_to >= _from)
      AND (_to IS NULL OR e.effective_from <= _to)
      AND (e.brand_id IS NULL OR public.has_brand_access(auth.uid(), e.brand_id))
      AND NOT EXISTS (
        SELECT 1 FROM public.cash_transactions ct
        WHERE ct.expense_entry_id = e.id
          AND (_from IS NULL OR ct.occurred_at >= _from::timestamptz)
          AND (_to IS NULL OR ct.occurred_at < (_to + 1)::timestamptz)
      )
  ), withdrawals_by_user AS (
    SELECT user_key AS "userId", sum(amount)::numeric AS total
    FROM period_cash
    WHERE type = 'personal_withdrawal'
      AND user_key <> '00000000-0000-0000-0000-000000000000'::uuid
    GROUP BY user_key
  ), courier_totals AS (
    SELECT out_courier_id AS courier_id, out_owed AS total_owed, out_collected AS total_collected
    FROM public.courier_outstanding_totals()
  ), courier_debts AS (
    SELECT c.id, c.name, c.type, c.brand_id, c.active,
      COALESCE(cm.total_owed, 0)::numeric AS "totalOwed",
      COALESCE(cm.total_collected, 0)::numeric AS "totalCollected",
      (COALESCE(cm.total_owed, 0) - COALESCE(cm.total_collected, 0))::numeric AS remaining
    FROM public.couriers c LEFT JOIN courier_totals cm ON cm.courier_id = c.id
    WHERE public.courier_accessible_to_user(auth.uid(), c.id)
  )
  SELECT jsonb_build_object(
    'balance', (SELECT balance FROM all_cash) + (SELECT amount FROM wallet_opening),
    'unpaidExpenses', (SELECT amount FROM unlinked_all),
    'periodIn', (SELECT period_in FROM period_cash_totals),
    'periodOut', (SELECT cash_out FROM period_cash_totals),
    'periodNet', (SELECT period_in - cash_out FROM period_cash_totals),
    'periodUnpaidExpenses', (SELECT amount FROM extra_period_expenses),
    'personalTotal', (SELECT personal_total FROM period_cash_totals),
    'byUser', COALESCE((SELECT jsonb_agg(to_jsonb(withdrawals_by_user) ORDER BY total DESC, "userId") FROM withdrawals_by_user), '[]'::jsonb),
    'courierDebts', COALESCE((SELECT jsonb_agg(to_jsonb(courier_debts) ORDER BY remaining DESC, id) FROM courier_debts), '[]'::jsonb)
  )
  WHERE public.can_read_page(auth.uid(), '/treasury');
$$;

DROP FUNCTION IF EXISTS public.credit_courier_withheld_fee(uuid, uuid, numeric);
