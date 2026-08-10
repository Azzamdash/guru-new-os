-- Two changes, both so an accountant can correct a courier's fee and have the
-- correction actually count.
--
-- 1. Let them edit it at all. courier_charges was granted UPDATE on settled_at
--    and settled_cash_transaction_id only, deliberately, so that settling could
--    never quietly rewrite what a courier is owed. Reviewing a statement is the
--    opposite case: the rate card is our estimate, the courier's statement is
--    what they actually charged, and the accountant has to be able to say so.
--    Grant amount as well. The accrual trigger cannot undo such an edit --
--    persist_order_courier_charge only overwrites rows WHERE settled_at IS NULL,
--    and a corrected fee is settled in the same operation.
--
-- 2. Make the correction reach the P&L. Shipping cost was read from
--    orders.courier_expense, which accrue_order_courier_charge owns and
--    recomputes from the rate card on every touch of the order -- so a manual
--    figure could never survive there. Read courier_charges.amount instead: it
--    is the actual fee ledger (unique per order, protected once settled), with
--    orders.courier_expense kept as the fallback for orders that have no charge
--    row at all. Unedited orders are unaffected, since the trigger writes the
--    same number into both.
GRANT UPDATE(amount) ON TABLE public.courier_charges TO authenticated;

CREATE OR REPLACE FUNCTION public.accounting_profit_report(_from date, _to date, _brand_id uuid DEFAULT NULL::uuid, _exclude_brand_ids uuid[] DEFAULT ARRAY[]::uuid[], _settled_only boolean DEFAULT true) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH scoped_brands AS MATERIALIZED (
    SELECT b.id, b.name, b.type, COALESCE(b.cogs_percent_default, 0)::numeric AS default_cogs_pct
    FROM public.brands b
    WHERE b.active = true
      AND public.can_read_page(auth.uid(), '/reports/profits')
      AND public.has_brand_access(auth.uid(), b.id)
      AND (_brand_id IS NULL OR b.id = _brand_id)
      AND NOT (b.id = ANY(COALESCE(_exclude_brand_ids, ARRAY[]::uuid[])))
  ), scoped_invoices AS MATERIALIZED (
    SELECT si.id, si.brand_id, si.type,
      si.total_amount,
      COALESCE(o.shipping_amount, 0)::numeric AS shipping_amount,
      COALESCE(cc.amount, o.courier_expense, 0)::numeric AS courier_expense,
      (si.total_amount - COALESCE(o.shipping_amount, 0))::numeric AS product_amount,
      ((NOT _settled_only) OR COALESCE(o.fulfillment_status IN ('delivered', 'returned'), true)) AS settled
    FROM public.sales_invoices si
    JOIN scoped_brands b ON b.id = si.brand_id
    LEFT JOIN public.orders o ON o.invoice_id = si.id
    LEFT JOIN public.courier_charges cc ON cc.order_id = o.id
    WHERE si.occurred_at >= _from::timestamptz
      AND si.occurred_at < (_to + 1)::timestamptz
  ), distinct_products AS MATERIALIZED (
    SELECT DISTINCT sii.product_id
    FROM public.sales_invoice_items sii
    JOIN scoped_invoices si ON si.id = sii.invoice_id
    WHERE sii.product_id IS NOT NULL
  ), product_costs AS MATERIALIZED (
    SELECT product_id, COALESCE(public.product_cogs(product_id), 0)::numeric AS unit_cogs
    FROM distinct_products
  ), invoice_items AS MATERIALIZED (
    SELECT
      si.id AS invoice_id,
      COALESCE(sum(pc.unit_cogs * sii.qty) FILTER (WHERE pc.unit_cogs > 0 AND sii.qty > 0), 0)::numeric AS product_cogs,
      COALESCE(sum(COALESCE(NULLIF(sii.subtotal, 0), sii.unit_price * sii.qty)) FILTER (WHERE pc.unit_cogs > 0 AND sii.qty > 0), 0)::numeric AS covered_revenue
    FROM scoped_invoices si
    LEFT JOIN public.sales_invoice_items sii ON sii.invoice_id = si.id
    LEFT JOIN product_costs pc ON pc.product_id = sii.product_id
    GROUP BY si.id
  ), invoice_facts AS MATERIALIZED (
    SELECT
      si.brand_id, si.type, si.total_amount, si.shipping_amount, si.product_amount,
      si.courier_expense, si.settled,
      (ii.product_cogs + GREATEST(0, si.product_amount - ii.covered_revenue) * sb.default_cogs_pct / 100)::numeric AS cogs
    FROM scoped_invoices si
    JOIN scoped_brands sb ON sb.id = si.brand_id
    JOIN invoice_items ii ON ii.invoice_id = si.id
  ), invoice_by_brand AS MATERIALIZED (
    SELECT
      brand_id,
      COALESCE(sum(product_amount) FILTER (WHERE type <> 'return' AND settled), 0)::numeric AS gross_revenue,
      COALESCE(sum(product_amount) FILTER (WHERE type = 'return' AND settled), 0)::numeric AS returns,
      COALESCE(sum(shipping_amount) FILTER (WHERE type <> 'return' AND settled), 0)::numeric AS shipping_revenue,
      COALESCE(sum(courier_expense) FILTER (WHERE settled), 0)::numeric AS shipping_cost,
      COALESCE(sum(CASE WHEN type = 'return' THEN -cogs ELSE cogs END) FILTER (WHERE settled), 0)::numeric AS cogs,
      count(*) FILTER (WHERE type <> 'return' AND settled)::bigint AS orders,
      count(*) FILTER (WHERE type = 'return' AND settled)::bigint AS return_orders,
      COALESCE(sum(product_amount) FILTER (WHERE type <> 'return'), 0)::numeric AS projected_gross_revenue,
      COALESCE(sum(product_amount) FILTER (WHERE type = 'return'), 0)::numeric AS projected_returns
    FROM invoice_facts GROUP BY brand_id
  ), discounts_by_brand AS MATERIALIZED (
    SELECT o.brand_id,
      COALESCE(sum(o.discount_amount) FILTER (WHERE (NOT _settled_only) OR o.fulfillment_status IN ('delivered', 'returned')), 0)::numeric AS discounts,
      COALESCE(sum(o.discount_amount), 0)::numeric AS projected_discounts
    FROM public.orders o JOIN scoped_brands sb ON sb.id = o.brand_id
    WHERE o.occurred_at >= _from::timestamptz
      AND o.occurred_at < (_to + 1)::timestamptz
    GROUP BY o.brand_id
  ), scoped_expenses AS MATERIALIZED (
    SELECT e.brand_id, COALESCE(ec.name, '—') AS category_name, e.amount
    FROM public.expense_entries e
    JOIN scoped_brands sb ON sb.id = e.brand_id
    LEFT JOIN public.expense_categories ec ON ec.id = e.category_id
    WHERE e.posting_date BETWEEN _from AND _to
  ), expense_by_brand AS MATERIALIZED (
    SELECT brand_id, COALESCE(sum(amount), 0)::numeric AS expenses
    FROM scoped_expenses GROUP BY brand_id
  ), expense_category_by_brand AS MATERIALIZED (
    SELECT brand_id, category_name AS name, sum(amount)::numeric AS amount
    FROM scoped_expenses GROUP BY brand_id, category_name
  ), brand_rows AS MATERIALIZED (
    SELECT
      sb.id AS brand_id, sb.name AS brand_name, sb.type AS brand_type,
      COALESCE(ib.gross_revenue, 0)::numeric AS gross_revenue,
      COALESCE(ib.returns, 0)::numeric AS returns,
      COALESCE(ib.shipping_revenue, 0)::numeric AS shipping_revenue,
      COALESCE(ib.shipping_cost, 0)::numeric AS shipping_cost,
      COALESCE(db.discounts, 0)::numeric AS discounts,
      (COALESCE(ib.gross_revenue, 0) - COALESCE(ib.returns, 0))::numeric AS invoice_net_revenue,
      (COALESCE(ib.gross_revenue, 0) - COALESCE(ib.returns, 0) - COALESCE(db.discounts, 0))::numeric AS net_revenue,
      COALESCE(ib.cogs, 0)::numeric AS cogs,
      COALESCE(eb.expenses, 0)::numeric AS expenses,
      COALESCE(ib.orders, 0)::bigint AS orders,
      COALESCE(ib.return_orders, 0)::bigint AS return_orders,
      (COALESCE(ib.projected_gross_revenue, 0) - COALESCE(ib.projected_returns, 0) - COALESCE(db.projected_discounts, 0))::numeric AS projected_net_revenue,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('name', ecb.name, 'amount', ecb.amount) ORDER BY ecb.amount DESC, ecb.name)
        FROM expense_category_by_brand ecb WHERE ecb.brand_id = sb.id
      ), '[]'::jsonb) AS expense_categories
    FROM scoped_brands sb
    LEFT JOIN invoice_by_brand ib ON ib.brand_id = sb.id
    LEFT JOIN discounts_by_brand db ON db.brand_id = sb.id
    LEFT JOIN expense_by_brand eb ON eb.brand_id = sb.id
  ), category_totals AS (
    SELECT category_name AS name, sum(amount)::numeric AS amount
    FROM scoped_expenses GROUP BY category_name
  )
  SELECT jsonb_build_object(
    'from', _from, 'to', _to,
    'rows', COALESCE((SELECT jsonb_agg(to_jsonb(brand_rows) ORDER BY brand_name, brand_id) FROM brand_rows), '[]'::jsonb),
    'expenseCategories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', name, 'value', amount) ORDER BY amount DESC, name)
      FROM category_totals
    ), '[]'::jsonb),
    'totals', jsonb_build_object(
      'grossRevenue', COALESCE((SELECT sum(gross_revenue) FROM brand_rows), 0),
      'returns', COALESCE((SELECT sum(returns) FROM brand_rows), 0),
      'shippingRevenue', COALESCE((SELECT sum(shipping_revenue) FROM brand_rows), 0),
      'shippingCost', COALESCE((SELECT sum(shipping_cost) FROM brand_rows), 0),
      'discounts', COALESCE((SELECT sum(discounts) FROM brand_rows), 0),
      'invoiceNetRevenue', COALESCE((SELECT sum(invoice_net_revenue) FROM brand_rows), 0),
      'netRevenue', COALESCE((SELECT sum(net_revenue) FROM brand_rows), 0),
      'cogs', COALESCE((SELECT sum(cogs) FROM brand_rows), 0),
      'expenses', COALESCE((SELECT sum(expenses) FROM brand_rows), 0),
      'orders', COALESCE((SELECT sum(orders) FROM brand_rows), 0),
      'returnOrders', COALESCE((SELECT sum(return_orders) FROM brand_rows), 0),
      'projectedNetRevenue', COALESCE((SELECT sum(projected_net_revenue) FROM brand_rows), 0)
    )
  );
$$;
