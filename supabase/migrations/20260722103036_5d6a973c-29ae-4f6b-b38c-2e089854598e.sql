
CREATE TABLE IF NOT EXISTS public.supplier_brands (
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (supplier_id, brand_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_brands TO authenticated;
GRANT ALL ON public.supplier_brands TO service_role;

ALTER TABLE public.supplier_brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read supplier_brands" ON public.supplier_brands;
CREATE POLICY "read supplier_brands" ON public.supplier_brands
  FOR SELECT TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id));

DROP POLICY IF EXISTS "write supplier_brands admin/manager" ON public.supplier_brands;
CREATE POLICY "write supplier_brands admin/manager" ON public.supplier_brands
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

-- Backfill from suppliers.brand_id
INSERT INTO public.supplier_brands (supplier_id, brand_id)
SELECT id, brand_id FROM public.suppliers WHERE brand_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Extend suppliers read policy: allow if user has access to primary brand OR any linked brand
DROP POLICY IF EXISTS "read suppliers" ON public.suppliers;
CREATE POLICY "read suppliers" ON public.suppliers
  FOR SELECT TO authenticated
  USING (
    public.has_brand_access(auth.uid(), brand_id)
    OR EXISTS (
      SELECT 1 FROM public.supplier_brands sb
      WHERE sb.supplier_id = suppliers.id
        AND public.has_brand_access(auth.uid(), sb.brand_id)
    )
  );
