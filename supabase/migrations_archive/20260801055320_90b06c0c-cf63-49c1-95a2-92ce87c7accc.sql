CREATE OR REPLACE FUNCTION public.dashboard_operational_report(_from timestamp with time zone, _to timestamp with time zone, _brand_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _brands uuid[];
  _couriers uuid[];
  _result jsonb;
BEGIN
  IF NOT public.can_read_page(_uid, '/dashboard') THEN
    RETURN NULL;
  END IF;
  IF _brand_id IS NOT NULL AND NOT public.has_brand_access(_uid, _brand_id) THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(array_agg(b.id), '{}')
    INTO _brands
  FROM public.brands b
  WHERE public.has_brand_access(_uid, b.id)
    AND (_brand_id IS NULL OR b.id = _brand_id);

  SELECT coalesce(array_agg(c.id), '{}')
    INTO _couriers
  FROM public.couriers c
  WHERE c.active = true
    AND public.courier_accessible_to_user(_uid, c.id);

  WITH scoped_invoices AS MATERIALIZED (
    SELECT si.id, si.brand_id, si.product_id, si.type, si.qty, si.total_amount, si.occurred_at,
      COALESCE(b.cogs_percent_default, 0)::numeric AS default_cogs_pct
    FROM public.sales_invoices si
    JOIN public.brands b ON b.id = si.brand_id
    WHERE si.occurred_at >= _from AND si.occurred_at <= _to
      AND si.brand_id = ANY(_brands)
  ), distinct_products AS MATERIALIZED (
    SELECT DISTINCT product_id FROM (
      SELECT sii.product_id FROM public.sales_invoice_items sii
      JOIN scoped_invoices si ON si.id = sii.invoice_id WHERE sii.product_id IS NOT NULL
      UNION
      SELECT si.product_id FROM scoped_invoices si WHERE si.product_id IS NOT NULL
    ) p
  ), product_costs AS MATERIALIZED (
    SELECT product_id, COALESCE(public.product_cogs(product_id), 0)::numeric AS unit_cogs
    FROM distinct_products
  ), invoice_item_facts AS MATERIALIZED (
    SELECT si.id AS invoice_id,
      COALESCE(sum(pc.unit_cogs * sii.qty) FILTER (WHERE pc.unit_cogs > 0 AND sii.qty > 0), 0)::numeric AS product_cogs,
      COALESCE(sum(COALESCE(NULLIF(sii.subtotal, 0), sii.unit_price * sii.qty)) FILTER (WHERE pc.unit_cogs > 0 AND sii.qty > 0), 0)::numeric AS covered_revenue
    FROM scoped_invoices si
    LEFT JOIN public.sales_invoice_items sii ON sii.invoice_id = si.id
    LEFT JOIN product_costs pc ON pc.product_id = sii.product_id
    GROUP BY si.id
  ), invoice_facts AS MATERIALIZED (
    SELECT si.*,
      (iif.product_cogs + GREATEST(0, si.total_amount - iif.covered_revenue) * si.default_cogs_pct / 100)::numeric AS cogs
    FROM scoped_invoices si JOIN invoice_item_facts iif ON iif.invoice_id = si.id
  ), monthly_sales AS (
    SELECT extract(month FROM occurred_at)::integer AS month, brand_id AS "brandId",
      sum(CASE WHEN type = 'return' THEN -total_amount ELSE total_amount END)::numeric AS revenue,
      sum(CASE WHEN type = 'return' THEN -cogs ELSE cogs END)::numeric AS cogs
    FROM invoice_facts GROUP BY extract(month FROM occurred_at), brand_id
  ), item_product_sales AS (
    SELECT sii.product_id,
      sum(sii.qty) FILTER (WHERE si.type <> 'return')::numeric AS sold,
      sum(sii.qty) FILTER (WHERE si.type = 'return')::numeric AS returned
    FROM public.sales_invoice_items sii
    JOIN scoped_invoices si ON si.id = sii.invoice_id
    WHERE sii.product_id IS NOT NULL
    GROUP BY sii.product_id
  ), legacy_product_sales AS (
    SELECT si.product_id,
      sum(si.qty) FILTER (WHERE si.type <> 'return')::numeric AS sold,
      sum(si.qty) FILTER (WHERE si.type = 'return')::numeric AS returned
    FROM scoped_invoices si
    WHERE si.product_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.sales_invoice_items sii WHERE sii.invoice_id = si.id)
    GROUP BY si.product_id
  ), product_sales AS (
    SELECT product_id AS "productId", COALESCE(sum(sold), 0)::numeric AS sold,
      COALESCE(sum(returned), 0)::numeric AS returned
    FROM (
      SELECT * FROM item_product_sales UNION ALL SELECT * FROM legacy_product_sales
    ) p GROUP BY product_id
  ), monthly_orders AS (
    SELECT extract(month FROM o.occurred_at)::integer AS month,
      count(*)::bigint AS total,
      count(*) FILTER (WHERE o.confirmation_status = 'confirmed')::bigint AS confirmed,
      count(*) FILTER (WHERE o.fulfillment_status = 'delivered')::bigint AS delivered,
      count(*) FILTER (WHERE o.fulfillment_status = 'returned')::bigint AS returned
    FROM public.orders o
    WHERE o.occurred_at >= _from AND o.occurred_at <= _to
      AND o.brand_id = ANY(_brands)
    GROUP BY extract(month FROM o.occurred_at)
  ), courier_performance AS (
    SELECT c.id, c.name, c.type,
      count(o.id) FILTER (WHERE o.fulfillment_status = 'delivered')::bigint AS delivered,
      count(o.id) FILTER (WHERE o.fulfillment_status = 'returned')::bigint AS returned,
      COALESCE(sum(o.total_amount) FILTER (WHERE o.fulfillment_status = 'delivered'), 0)::numeric AS collected
    FROM public.couriers c
    LEFT JOIN public.orders o ON o.courier_id = c.id
      AND o.occurred_at >= _from AND o.occurred_at <= _to
      AND o.brand_id = ANY(_brands)
    WHERE c.id = ANY(_couriers)
    GROUP BY c.id, c.name, c.type
  ), inventory_products AS (
    SELECT im.product_id AS "productId",
      COALESCE(sum(CASE WHEN im.type IN ('production','return','adjustment') THEN im.qty ELSE -im.qty END), 0)::numeric AS stock,
      COALESCE(sum(im.qty) FILTER (WHERE im.type = 'production'), 0)::numeric AS produced
    FROM public.inventory_movements im
    JOIN public.products p ON p.id = im.product_id
    WHERE im.occurred_at >= _from AND im.occurred_at <= _to
      AND p.brand_id = ANY(_brands)
    GROUP BY im.product_id
  ), workers AS (
    SELECT im.worker_name AS name, sum(im.qty)::numeric AS produced,
      count(DISTINCT im.product_id)::bigint AS "productCount"
    FROM public.inventory_movements im
    JOIN public.products p ON p.id = im.product_id
    WHERE im.type = 'production' AND NULLIF(btrim(im.worker_name), '') IS NOT NULL
      AND im.occurred_at >= _from AND im.occurred_at <= _to
      AND p.brand_id = ANY(_brands)
    GROUP BY im.worker_name
  ), fulfillment AS (
    SELECT fe.employee_name AS name, sum(fe.orders_prepared)::numeric AS prepared,
      count(DISTINCT fe.occurred_at)::bigint AS days
    FROM public.fulfillment_entries fe
    WHERE fe.occurred_at >= _from::date AND fe.occurred_at <= _to::date
      AND fe.brand_id = ANY(_brands)
      AND NULLIF(btrim(fe.employee_name), '') IS NOT NULL
    GROUP BY fe.employee_name
  )
  SELECT jsonb_build_object(
    'monthlySales', COALESCE((SELECT jsonb_agg(to_jsonb(monthly_sales) ORDER BY month, "brandId") FROM monthly_sales), '[]'::jsonb),
    'productSales', COALESCE((SELECT jsonb_agg(to_jsonb(product_sales) ORDER BY "productId") FROM product_sales), '[]'::jsonb),
    'monthlyOrders', COALESCE((SELECT jsonb_agg(to_jsonb(monthly_orders) ORDER BY month) FROM monthly_orders), '[]'::jsonb),
    'couriers', COALESCE((SELECT jsonb_agg(to_jsonb(courier_performance) ORDER BY delivered DESC, id) FROM courier_performance), '[]'::jsonb),
    'inventoryProducts', COALESCE((SELECT jsonb_agg(to_jsonb(inventory_products) ORDER BY "productId") FROM inventory_products), '[]'::jsonb),
    'workers', COALESCE((SELECT jsonb_agg(to_jsonb(workers) ORDER BY produced DESC, name) FROM workers), '[]'::jsonb),
    'fulfillment', COALESCE((SELECT jsonb_agg(to_jsonb(fulfillment) ORDER BY prepared DESC, name) FROM fulfillment), '[]'::jsonb)
  ) INTO _result;

  RETURN _result;
END;
$function$;

CREATE INDEX IF NOT EXISTS sales_invoices_active_prep_idx
  ON public.sales_invoices (stage_updated_at)
  WHERE type = 'sale' AND stage <> 'delivered' AND stage <> 'cancelled';