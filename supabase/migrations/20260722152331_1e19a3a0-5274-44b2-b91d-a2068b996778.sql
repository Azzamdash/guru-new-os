
-- Service brand: clients & projects
CREATE TABLE public.service_clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_clients TO authenticated;
GRANT ALL ON public.service_clients TO service_role;
ALTER TABLE public.service_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_clients read by brand access" ON public.service_clients FOR SELECT TO authenticated USING (public.has_brand_access(auth.uid(), brand_id));
CREATE POLICY "service_clients write by writers" ON public.service_clients FOR ALL TO authenticated USING (public.is_writer(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id)) WITH CHECK (public.is_writer(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id));
CREATE TRIGGER trg_service_clients_updated BEFORE UPDATE ON public.service_clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_service_clients_brand ON public.service_clients(brand_id);

CREATE TABLE public.service_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.service_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('pending','in_progress','done','cancelled')),
  pricing_type TEXT NOT NULL DEFAULT 'fixed' CHECK (pricing_type IN ('fixed','commission')),
  cost NUMERIC NOT NULL DEFAULT 0,
  commission NUMERIC NOT NULL DEFAULT 0,
  started_at DATE,
  finished_at DATE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_projects TO authenticated;
GRANT ALL ON public.service_projects TO service_role;
ALTER TABLE public.service_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_projects read by brand access" ON public.service_projects FOR SELECT TO authenticated USING (public.has_brand_access(auth.uid(), brand_id));
CREATE POLICY "service_projects write by writers" ON public.service_projects FOR ALL TO authenticated USING (public.is_writer(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id)) WITH CHECK (public.is_writer(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id));
CREATE TRIGGER trg_service_projects_updated BEFORE UPDATE ON public.service_projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_service_projects_brand ON public.service_projects(brand_id);
CREATE INDEX idx_service_projects_client ON public.service_projects(client_id);
