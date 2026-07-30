
CREATE TABLE public.material_brands (
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (material_id, brand_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_brands TO authenticated;
GRANT ALL ON public.material_brands TO service_role;
ALTER TABLE public.material_brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Catalog roles read material_brands" ON public.material_brands
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'production_manager')
    OR public.has_brand_access(auth.uid(), brand_id)
  );
CREATE POLICY "Catalog roles write material_brands" ON public.material_brands
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
  ) WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
  );
