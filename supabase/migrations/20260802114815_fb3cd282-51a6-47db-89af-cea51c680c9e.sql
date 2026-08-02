CREATE OR REPLACE FUNCTION public.receivables_aging_report()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH base AS (
  SELECT
    si.id,
    si.brand_id,
    COALESCE(b.name, '—') AS brand_name,
    si.customer_id,
    COALESCE(NULLIF(si.customer_name, ''), '—') AS customer_name,
    (COALESCE(si.total_amount, 0) - COALESCE(si.collected_amount, 0))::numeric AS outstanding,
    GREATEST(0, (CURRENT_DATE - (si.occurred_at AT TIME ZONE 'Africa/Cairo')::date))::int AS days
  FROM public.sales_invoices si
  LEFT JOIN public.brands b ON b.id = si.brand_id
  WHERE (COALESCE(si.total_amount, 0) - COALESCE(si.collected_amount, 0)) > 0
    AND (
      si.stage IS NULL
      OR si.stage::text NOT IN ('delivered', 'cancelled')
      OR (si.stage::text IN ('delivered', 'cancelled') AND COALESCE(si.total_amount, 0) > COALESCE(si.collected_amount, 0))
    )
),
bucketed AS (
  SELECT base.*,
    CASE
      WHEN days <= 30 THEN 'b0_30'
      WHEN days <= 60 THEN 'b31_60'
      WHEN days <= 90 THEN 'b61_90'
      ELSE 'b90_plus'
    END AS bucket
  FROM base
),
by_brand AS (
  SELECT brand_id::text AS key, MIN(brand_name) AS label,
    COALESCE(SUM(outstanding) FILTER (WHERE bucket = 'b0_30'), 0) AS b0_30,
    COALESCE(SUM(outstanding) FILTER (WHERE bucket = 'b31_60'), 0) AS b31_60,
    COALESCE(SUM(outstanding) FILTER (WHERE bucket = 'b61_90'), 0) AS b61_90,
    COALESCE(SUM(outstanding) FILTER (WHERE bucket = 'b90_plus'), 0) AS b90_plus,
    SUM(outstanding) AS total
  FROM bucketed GROUP BY brand_id
),
by_customer AS (
  SELECT COALESCE(customer_id::text, 'name:' || customer_name) AS key, MIN(customer_name) AS label,
    COALESCE(SUM(outstanding) FILTER (WHERE bucket = 'b0_30'), 0) AS b0_30,
    COALESCE(SUM(outstanding) FILTER (WHERE bucket = 'b31_60'), 0) AS b31_60,
    COALESCE(SUM(outstanding) FILTER (WHERE bucket = 'b61_90'), 0) AS b61_90,
    COALESCE(SUM(outstanding) FILTER (WHERE bucket = 'b90_plus'), 0) AS b90_plus,
    SUM(outstanding) AS total
  FROM bucketed GROUP BY COALESCE(customer_id::text, 'name:' || customer_name)
)
SELECT jsonb_build_object(
  'totals', jsonb_build_object(
    'b0_30', COALESCE((SELECT SUM(outstanding) FROM bucketed WHERE bucket = 'b0_30'), 0),
    'b31_60', COALESCE((SELECT SUM(outstanding) FROM bucketed WHERE bucket = 'b31_60'), 0),
    'b61_90', COALESCE((SELECT SUM(outstanding) FROM bucketed WHERE bucket = 'b61_90'), 0),
    'b90_plus', COALESCE((SELECT SUM(outstanding) FROM bucketed WHERE bucket = 'b90_plus'), 0)
  ),
  'grand_total', COALESCE((SELECT SUM(outstanding) FROM bucketed), 0),
  'invoice_count', (SELECT COUNT(*) FROM bucketed),
  'by_brand', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'key', key, 'label', label, 'total', total,
      'totals', jsonb_build_object('b0_30', b0_30, 'b31_60', b31_60, 'b61_90', b61_90, 'b90_plus', b90_plus)
    ) ORDER BY total DESC) FROM by_brand), '[]'::jsonb),
  'by_customer', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'key', key, 'label', label, 'total', total,
      'totals', jsonb_build_object('b0_30', b0_30, 'b31_60', b31_60, 'b61_90', b61_90, 'b90_plus', b90_plus)
    ) ORDER BY total DESC) FROM by_customer), '[]'::jsonb),
  'top_rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'brand_id', brand_id, 'brand_name', brand_name,
      'customer_id', customer_id, 'customer_name', customer_name,
      'outstanding', outstanding, 'days', days, 'bucket', bucket
    ) ORDER BY outstanding DESC) FROM (SELECT * FROM bucketed ORDER BY outstanding DESC LIMIT 200) t), '[]'::jsonb)
);
$$;

REVOKE ALL ON FUNCTION public.receivables_aging_report() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receivables_aging_report() TO authenticated;