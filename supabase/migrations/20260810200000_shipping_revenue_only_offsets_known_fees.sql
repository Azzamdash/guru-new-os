-- #99 let shipping revenue offset the courier bill, which is right when both
-- numbers are real. They are not always. accrue_order_courier_charge sets
-- courier_expense to 0 down three silent paths: shipment_outcome outside
-- (delivered, returned, customer_returned, exchanged); a null courier_id or
-- blank shipping_governorate; and -- the quiet one -- no matching row in
-- courier_governorate_rates, where selected_rate stays NULL and the fee lands
-- on COALESCE(charge_amount, 0). Note the P&L gates revenue on
-- fulfillment_status while the accrual gates on shipment_outcome, so the two
-- can disagree about the very same order.
--
-- The result was a P&L that showed shipping collected from the customer, no
-- courier bill against it, and the difference ADDED to net profit -- money
-- that is owed to a courier booked as ours. Worse than the double-charge #99
-- removed, because it overstates instead of understates.
--
-- Shipping collected may only offset a courier fee we actually know. Orders
-- with no recorded fee now contribute nothing to either side (fee_known),
-- leaving them neutral rather than profitable, and are counted separately
-- (shipping_unbilled_orders / _amount) so the gap is reported instead of
-- silently absorbed -- the real repair is configuring the missing rates.
-- shipping_revenue is kept whole for display; only the matched subset feeds
-- profit.
--
-- A genuinely free shipment is indistinguishable here from an unconfigured
-- one, so it too stays neutral. That errs toward understating profit, which
-- is the safe direction for money we may still owe.
--
-- Nothing else in the function changes; it is restated in full because
-- CREATE OR REPLACE FUNCTION has no partial form.
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
      (COALESCE(cc.amount, o.courier_expense, 0) > 0) AS fee_known,
      (o.id IS NOT NULL
        AND COALESCE(o.shipping_amount, 0) > 0
        AND COALESCE(cc.amount, o.courier_expense, 0) = 0) AS fee_missing,
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
      si.courier_expense, si.fee_known, si.fee_missing, si.settled,
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
      COALESCE(sum(shipping_amount) FILTER (WHERE type <> 'return' AND settled AND fee_known), 0)::numeric AS shipping_revenue_matched,
      COALESCE(sum(courier_expense) FILTER (WHERE settled), 0)::numeric AS shipping_cost,
      count(*) FILTER (WHERE settled AND fee_missing)::bigint AS shipping_unbilled_orders,
      COALESCE(sum(shipping_amount) FILTER (WHERE type <> 'return' AND settled AND fee_missing), 0)::numeric AS shipping_unbilled_amount,
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
      COALESCE(ib.shipping_revenue_matched, 0)::numeric AS shipping_revenue_matched,
      COALESCE(ib.shipping_cost, 0)::numeric AS shipping_cost,
      COALESCE(ib.shipping_unbilled_orders, 0)::bigint AS shipping_unbilled_orders,
      COALESCE(ib.shipping_unbilled_amount, 0)::numeric AS shipping_unbilled_amount,
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
      'shippingRevenueMatched', COALESCE((SELECT sum(shipping_revenue_matched) FROM brand_rows), 0),
      'shippingCost', COALESCE((SELECT sum(shipping_cost) FROM brand_rows), 0),
      'shippingUnbilledOrders', COALESCE((SELECT sum(shipping_unbilled_orders) FROM brand_rows), 0),
      'shippingUnbilledAmount', COALESCE((SELECT sum(shipping_unbilled_amount) FROM brand_rows), 0),
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
