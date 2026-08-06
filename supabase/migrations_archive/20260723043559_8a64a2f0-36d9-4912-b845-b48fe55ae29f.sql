
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS governorate text,
  ADD COLUMN IF NOT EXISTS is_general boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.customer_brands (
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, brand_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_brands TO authenticated;
GRANT ALL ON public.customer_brands TO service_role;

ALTER TABLE public.customer_brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_brands_read" ON public.customer_brands;
CREATE POLICY "customer_brands_read" ON public.customer_brands FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "customer_brands_write" ON public.customer_brands;
CREATE POLICY "customer_brands_write" ON public.customer_brands FOR ALL TO authenticated
  USING (public.is_writer(auth.uid()))
  WITH CHECK (public.is_writer(auth.uid()));
