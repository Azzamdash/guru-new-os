-- Removes refund cash movements for returns where no money was ever collected.
--
-- Before 20260812070000, sync_sales_return_cash booked the full invoice total
-- as cash out whenever an invoice became a return -- including orders cancelled
-- before dispatch and orders that turned back in transit, where the customer
-- never paid. Those movements took real money off the treasury balance for a
-- refund nobody received.
--
-- The trigger is fixed, but it only rewrites a row when its invoice next
-- updates, so rows written earlier sit there until something touches them.
-- This clears them in one pass.
--
-- Deletes only rows that ALL of the following hold for:
--   * the note is the trigger's own generated marker, so nothing hand-entered
--     can match
--   * the invoice still exists and its order collected nothing
-- A refund larger than what was collected is reduced to the collected amount
-- rather than deleted, so a partial COD keeps its real payout.
--
-- Run the SELECT first and read it. Nothing is deleted until you run the
-- second statement.

-- 1. What would change.
SELECT ct.id,
       ct.amount AS booked,
       COALESCE(oc.collected, 0) AS actually_collected,
       CASE WHEN COALESCE(oc.collected, 0) = 0 THEN 'delete' ELSE 'reduce' END AS action,
       si.id AS invoice_id,
       o.shipment_outcome,
       o.fulfillment_status
FROM public.cash_transactions ct
JOIN public.sales_invoices si
  ON ct.note = 'مرتجع مبيعات #' || si.id::text
JOIN public.orders o ON o.invoice_id = si.id
LEFT JOIN LATERAL (
  SELECT COALESCE(sum(c.amount), 0) AS collected
  FROM public.order_collections c
  WHERE c.order_id = o.id
) oc ON true
WHERE ct.amount > COALESCE(oc.collected, 0)
ORDER BY ct.amount DESC;

-- 2. Apply it. Uncomment both statements to run.
--
-- DELETE FROM public.cash_transactions ct
-- USING public.sales_invoices si, public.orders o
-- WHERE ct.note = 'مرتجع مبيعات #' || si.id::text
--   AND o.invoice_id = si.id
--   AND NOT EXISTS (
--     SELECT 1 FROM public.order_collections c WHERE c.order_id = o.id
--   );
--
-- UPDATE public.cash_transactions ct
-- SET amount = oc.collected
-- FROM public.sales_invoices si, public.orders o, LATERAL (
--   SELECT COALESCE(sum(c.amount), 0) AS collected
--   FROM public.order_collections c WHERE c.order_id = o.id
-- ) oc
-- WHERE ct.note = 'مرتجع مبيعات #' || si.id::text
--   AND o.invoice_id = si.id
--   AND oc.collected > 0
--   AND ct.amount > oc.collected;
