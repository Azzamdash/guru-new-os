
CREATE TABLE public.company_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NULL REFERENCES public.brands(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  annual_depreciation_rate NUMERIC(6,2) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_assets TO authenticated;
GRANT ALL ON public.company_assets TO service_role;

ALTER TABLE public.company_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assets_read_scoped" ON public.company_assets
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'manager')
  OR (brand_id IS NOT NULL AND public.has_brand_access(auth.uid(), brand_id))
);

CREATE POLICY "assets_write_admin_manager_accountant" ON public.company_assets
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'manager')
  OR public.has_role(auth.uid(),'accountant')
);

CREATE POLICY "assets_update_admin_manager_accountant" ON public.company_assets
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'manager')
  OR public.has_role(auth.uid(),'accountant')
)
WITH CHECK (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'manager')
  OR public.has_role(auth.uid(),'accountant')
);

CREATE POLICY "assets_delete_admin_manager" ON public.company_assets
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'manager')
);

CREATE TRIGGER update_company_assets_updated_at
BEFORE UPDATE ON public.company_assets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_company_assets_brand ON public.company_assets(brand_id);
