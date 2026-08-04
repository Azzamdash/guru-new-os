ALTER TABLE public.expense_entries
  ADD COLUMN IF NOT EXISTS period_type text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS period_date date,
  ADD COLUMN IF NOT EXISTS period_end_date date;

ALTER TABLE public.expense_entries
  DROP CONSTRAINT IF EXISTS expense_entries_period_type_check;
ALTER TABLE public.expense_entries
  ADD CONSTRAINT expense_entries_period_type_check
  CHECK (period_type IN ('daily','weekly','monthly','yearly','custom'));

CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  position text,
  active boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employees read authenticated" ON public.employees;
CREATE POLICY "employees read authenticated" ON public.employees FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "employees write writer" ON public.employees;
CREATE POLICY "employees write writer" ON public.employees FOR ALL TO authenticated
  USING (public.is_writer(auth.uid())) WITH CHECK (public.is_writer(auth.uid()));

CREATE TABLE IF NOT EXISTS public.employee_attendance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  year int NOT NULL,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  days_absent numeric NOT NULL DEFAULT 0,
  days_vacation numeric NOT NULL DEFAULT 0,
  times_late int NOT NULL DEFAULT 0,
  deductions numeric NOT NULL DEFAULT 0,
  bonuses numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, year, month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_attendance_entries TO authenticated;
GRANT ALL ON public.employee_attendance_entries TO service_role;
ALTER TABLE public.employee_attendance_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attendance read authenticated" ON public.employee_attendance_entries;
CREATE POLICY "attendance read authenticated" ON public.employee_attendance_entries FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "attendance write writer" ON public.employee_attendance_entries;
CREATE POLICY "attendance write writer" ON public.employee_attendance_entries FOR ALL TO authenticated
  USING (public.is_writer(auth.uid())) WITH CHECK (public.is_writer(auth.uid()));

CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_attendance_updated BEFORE UPDATE ON public.employee_attendance_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.supplier_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('product','material','other')),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  material_id uuid REFERENCES public.materials(id) ON DELETE SET NULL,
  description text,
  qty numeric NOT NULL DEFAULT 1,
  unit_cost numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_invoice_items TO authenticated;
GRANT ALL ON public.supplier_invoice_items TO service_role;
ALTER TABLE public.supplier_invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoice items read via parent invoice brand" ON public.supplier_invoice_items;
CREATE POLICY "invoice items read via parent invoice brand" ON public.supplier_invoice_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.supplier_invoices si WHERE si.id = invoice_id AND (si.brand_id IS NULL OR public.has_brand_access(auth.uid(), si.brand_id))));
DROP POLICY IF EXISTS "invoice items write for writers" ON public.supplier_invoice_items;
CREATE POLICY "invoice items write for writers" ON public.supplier_invoice_items FOR ALL TO authenticated
  USING (public.is_writer(auth.uid())) WITH CHECK (public.is_writer(auth.uid()));

CREATE TRIGGER trg_supplier_invoice_items_updated BEFORE UPDATE ON public.supplier_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_supplier_invoice_items_invoice ON public.supplier_invoice_items(invoice_id);

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
DROP POLICY IF EXISTS "service_clients read by brand access" ON public.service_clients;
CREATE POLICY "service_clients read by brand access" ON public.service_clients FOR SELECT TO authenticated USING (public.has_brand_access(auth.uid(), brand_id));
DROP POLICY IF EXISTS "service_clients write by writers" ON public.service_clients;
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
DROP POLICY IF EXISTS "service_projects read by brand access" ON public.service_projects;
CREATE POLICY "service_projects read by brand access" ON public.service_projects FOR SELECT TO authenticated USING (public.has_brand_access(auth.uid(), brand_id));
DROP POLICY IF EXISTS "service_projects write by writers" ON public.service_projects;
CREATE POLICY "service_projects write by writers" ON public.service_projects FOR ALL TO authenticated USING (public.is_writer(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id)) WITH CHECK (public.is_writer(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id));
CREATE TRIGGER trg_service_projects_updated BEFORE UPDATE ON public.service_projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_service_projects_brand ON public.service_projects(brand_id);
CREATE INDEX idx_service_projects_client ON public.service_projects(client_id);

DROP POLICY IF EXISTS "employees read authenticated" ON public.employees;
DROP POLICY IF EXISTS "employees read brand scoped" ON public.employees;
CREATE POLICY "employees read brand scoped" ON public.employees FOR SELECT TO authenticated
USING (public.has_brand_access(auth.uid(), brand_id));

DROP POLICY IF EXISTS "attendance read authenticated" ON public.employee_attendance_entries;
DROP POLICY IF EXISTS "attendance read brand scoped" ON public.employee_attendance_entries;
CREATE POLICY "attendance read brand scoped" ON public.employee_attendance_entries FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND public.has_brand_access(auth.uid(), e.brand_id)));

DROP POLICY IF EXISTS "Assignees update status" ON public.tasks;
CREATE POLICY "Assignees update status" ON public.tasks FOR UPDATE TO authenticated
USING (assignee_id = auth.uid())
WITH CHECK (
  assignee_id = auth.uid()
  AND assignee_id = (SELECT t.assignee_id FROM public.tasks t WHERE t.id = tasks.id)
  AND brand_id IS NOT DISTINCT FROM (SELECT t.brand_id FROM public.tasks t WHERE t.id = tasks.id)
  AND created_by IS NOT DISTINCT FROM (SELECT t.created_by FROM public.tasks t WHERE t.id = tasks.id)
  AND priority IS NOT DISTINCT FROM (SELECT t.priority FROM public.tasks t WHERE t.id = tasks.id)
  AND title IS NOT DISTINCT FROM (SELECT t.title FROM public.tasks t WHERE t.id = tasks.id)
  AND description IS NOT DISTINCT FROM (SELECT t.description FROM public.tasks t WHERE t.id = tasks.id)
  AND due_date IS NOT DISTINCT FROM (SELECT t.due_date FROM public.tasks t WHERE t.id = tasks.id)
);

CREATE TABLE public.brand_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  credentials_ciphertext text,
  last_sync_at timestamptz,
  last_sync_summary jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, provider)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_integrations TO authenticated;
GRANT ALL ON public.brand_integrations TO service_role;
ALTER TABLE public.brand_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "integrations read brand scoped" ON public.brand_integrations;
CREATE POLICY "integrations read brand scoped" ON public.brand_integrations FOR SELECT TO authenticated
USING ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND public.has_brand_access(auth.uid(), brand_id));

DROP POLICY IF EXISTS "integrations write brand scoped" ON public.brand_integrations;
CREATE POLICY "integrations write brand scoped" ON public.brand_integrations FOR ALL TO authenticated
USING ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND public.has_brand_access(auth.uid(), brand_id))
WITH CHECK ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) AND public.has_brand_access(auth.uid(), brand_id));

CREATE TRIGGER trg_brand_integrations_updated BEFORE UPDATE ON public.brand_integrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY "ee write privileged" ON public.expense_entries;
DROP POLICY IF EXISTS "ee write privileged" ON public.expense_entries;
CREATE POLICY "ee write privileged" ON public.expense_entries FOR ALL TO authenticated USING (has_brand_access(auth.uid(), brand_id) AND is_writer(auth.uid())) WITH CHECK (has_brand_access(auth.uid(), brand_id) AND is_writer(auth.uid()));

DROP POLICY "write fulfillment" ON public.fulfillment_entries;
DROP POLICY IF EXISTS "write fulfillment" ON public.fulfillment_entries;
CREATE POLICY "write fulfillment" ON public.fulfillment_entries FOR ALL TO authenticated USING (is_writer(auth.uid())) WITH CHECK (is_writer(auth.uid()));

DROP POLICY "me write privileged" ON public.monthly_entries;
DROP POLICY IF EXISTS "me write privileged" ON public.monthly_entries;
CREATE POLICY "me write privileged" ON public.monthly_entries FOR ALL TO authenticated USING (has_brand_access(auth.uid(), brand_id) AND is_writer(auth.uid())) WITH CHECK (has_brand_access(auth.uid(), brand_id) AND is_writer(auth.uid()));

DROP POLICY "auth write sales_invoice_items" ON public.sales_invoice_items;
DROP POLICY IF EXISTS "auth write sales_invoice_items" ON public.sales_invoice_items;
CREATE POLICY "auth write sales_invoice_items" ON public.sales_invoice_items FOR ALL TO authenticated USING (is_writer(auth.uid())) WITH CHECK (is_writer(auth.uid()));

DROP POLICY "sales write privileged" ON public.sales_invoices;
DROP POLICY IF EXISTS "sales write privileged" ON public.sales_invoices;
CREATE POLICY "sales write privileged" ON public.sales_invoices FOR ALL TO authenticated USING (has_brand_access(auth.uid(), brand_id) AND is_writer(auth.uid())) WITH CHECK (has_brand_access(auth.uid(), brand_id) AND is_writer(auth.uid()));

DROP POLICY "si write privileged" ON public.supplier_invoices;
DROP POLICY IF EXISTS "si write privileged" ON public.supplier_invoices;
CREATE POLICY "si write privileged" ON public.supplier_invoices FOR ALL TO authenticated USING (((brand_id IS NULL) OR has_brand_access(auth.uid(), brand_id)) AND is_writer(auth.uid())) WITH CHECK (((brand_id IS NULL) OR has_brand_access(auth.uid(), brand_id)) AND is_writer(auth.uid()));

DROP POLICY "sp write privileged" ON public.supplier_payments;
DROP POLICY IF EXISTS "sp write privileged" ON public.supplier_payments;
CREATE POLICY "sp write privileged" ON public.supplier_payments FOR ALL TO authenticated USING (is_writer(auth.uid())) WITH CHECK (is_writer(auth.uid()));