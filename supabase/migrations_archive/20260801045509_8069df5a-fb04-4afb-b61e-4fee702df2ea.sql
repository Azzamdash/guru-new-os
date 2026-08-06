CREATE INDEX IF NOT EXISTS sales_invoices_stage_occurred_idx ON public.sales_invoices (stage, occurred_at DESC);
CREATE INDEX IF NOT EXISTS sales_invoices_occurred_idx ON public.sales_invoices (occurred_at DESC);
CREATE INDEX IF NOT EXISTS products_active_brand_idx ON public.products (active, brand_id) WHERE active;
ANALYZE public.sales_invoices;
ANALYZE public.products;