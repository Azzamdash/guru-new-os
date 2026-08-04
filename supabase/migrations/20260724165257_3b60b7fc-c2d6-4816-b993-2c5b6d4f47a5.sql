
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_section_access(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_brand_access(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_section_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_brand_access(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "read sales" ON public.sales_invoices;
CREATE POLICY "read sales" ON public.sales_invoices FOR SELECT TO authenticated USING (public.has_brand_access(auth.uid(), brand_id));
DROP POLICY IF EXISTS "auth read sales_invoice_items" ON public.sales_invoice_items;
DROP POLICY IF EXISTS "read sales_invoice_items" ON public.sales_invoice_items;
CREATE POLICY "read sales_invoice_items" ON public.sales_invoice_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales_invoices si WHERE si.id = invoice_id AND public.has_brand_access(auth.uid(), si.brand_id)));
DROP POLICY IF EXISTS "me read authenticated" ON public.monthly_entries;
DROP POLICY IF EXISTS "read monthly_entries" ON public.monthly_entries;
CREATE POLICY "read monthly_entries" ON public.monthly_entries FOR SELECT TO authenticated USING (public.has_brand_access(auth.uid(), brand_id));
DROP POLICY IF EXISTS "ee read authenticated" ON public.expense_entries;
DROP POLICY IF EXISTS "read expense_entries" ON public.expense_entries;
CREATE POLICY "read expense_entries" ON public.expense_entries FOR SELECT TO authenticated USING (public.has_brand_access(auth.uid(), brand_id));
DROP POLICY IF EXISTS "suppliers read authenticated" ON public.suppliers;
DROP POLICY IF EXISTS "read suppliers" ON public.suppliers;
CREATE POLICY "read suppliers" ON public.suppliers FOR SELECT TO authenticated USING (public.has_brand_access(auth.uid(), brand_id));
DROP POLICY IF EXISTS "si read authenticated" ON public.supplier_invoices;
DROP POLICY IF EXISTS "read supplier_invoices" ON public.supplier_invoices;
CREATE POLICY "read supplier_invoices" ON public.supplier_invoices FOR SELECT TO authenticated USING (public.has_brand_access(auth.uid(), brand_id));
DROP POLICY IF EXISTS "sp read authenticated" ON public.supplier_payments;
DROP POLICY IF EXISTS "read supplier_payments" ON public.supplier_payments;
CREATE POLICY "read supplier_payments" ON public.supplier_payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.supplier_invoices si WHERE si.id = invoice_id AND public.has_brand_access(auth.uid(), si.brand_id)));
DROP POLICY IF EXISTS "brands read authenticated" ON public.brands;
DROP POLICY IF EXISTS "read brands" ON public.brands;
CREATE POLICY "read brands" ON public.brands FOR SELECT TO authenticated USING (public.has_brand_access(auth.uid(), id));
DROP POLICY IF EXISTS "read couriers" ON public.couriers;
CREATE POLICY "read couriers" ON public.couriers FOR SELECT TO authenticated USING (brand_id IS NULL OR public.has_brand_access(auth.uid(), brand_id));
DROP POLICY IF EXISTS "cats read authenticated" ON public.expense_categories;
DROP POLICY IF EXISTS "read expense_categories" ON public.expense_categories;
CREATE POLICY "read expense_categories" ON public.expense_categories FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'data_entry'));
DROP POLICY IF EXISTS "read products" ON public.products;
CREATE POLICY "read products" ON public.products FOR SELECT TO authenticated USING (public.has_brand_access(auth.uid(), brand_id));
DROP POLICY IF EXISTS "read materials" ON public.materials;
CREATE POLICY "read materials" ON public.materials FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'data_entry'));
DROP POLICY IF EXISTS "read pm" ON public.product_materials;
DROP POLICY IF EXISTS "read product_materials" ON public.product_materials;
CREATE POLICY "read product_materials" ON public.product_materials FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND public.has_brand_access(auth.uid(), p.brand_id)));
DROP POLICY IF EXISTS "read im" ON public.inventory_movements;
DROP POLICY IF EXISTS "read inventory_movements" ON public.inventory_movements;
CREATE POLICY "read inventory_movements" ON public.inventory_movements FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND public.has_brand_access(auth.uid(), p.brand_id)));

CREATE OR REPLACE FUNCTION public.has_brand_access(_user_id uuid, _brand_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(_user_id,'admin') OR public.has_role(_user_id,'manager')
    OR EXISTS (SELECT 1 FROM public.user_brand_access WHERE user_id = _user_id AND brand_id = _brand_id);
$$;

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
CREATE POLICY "read supplier_brands" ON public.supplier_brands FOR SELECT TO authenticated USING (public.has_brand_access(auth.uid(), brand_id));
DROP POLICY IF EXISTS "write supplier_brands admin/manager" ON public.supplier_brands;
CREATE POLICY "write supplier_brands admin/manager" ON public.supplier_brands FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
INSERT INTO public.supplier_brands (supplier_id, brand_id) SELECT id, brand_id FROM public.suppliers WHERE brand_id IS NOT NULL ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS "read suppliers" ON public.suppliers;
CREATE POLICY "read suppliers" ON public.suppliers FOR SELECT TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id) OR EXISTS (SELECT 1 FROM public.supplier_brands sb WHERE sb.supplier_id = suppliers.id AND public.has_brand_access(auth.uid(), sb.brand_id)));

ALTER TABLE public.monthly_entries ADD COLUMN IF NOT EXISTS period_end_date date;
ALTER TABLE public.monthly_entries DROP CONSTRAINT IF EXISTS monthly_entries_brand_id_year_month_key;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'accountant';
ALTER TABLE public.user_sheet_config ADD COLUMN IF NOT EXISTS attendance_range TEXT;

CREATE OR REPLACE FUNCTION public.is_writer(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text IN ('admin','manager','data_entry','accountant'));
$$;
REVOKE EXECUTE ON FUNCTION public.is_writer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_writer(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "ee write admin" ON public.expense_entries;
DROP POLICY IF EXISTS "ee write privileged" ON public.expense_entries;
CREATE POLICY "ee write privileged" ON public.expense_entries FOR ALL
  USING (public.has_brand_access(auth.uid(), brand_id) AND public.is_writer(auth.uid()))
  WITH CHECK (public.has_brand_access(auth.uid(), brand_id) AND public.is_writer(auth.uid()));

DROP POLICY IF EXISTS "me write admin" ON public.monthly_entries;
DROP POLICY IF EXISTS "me write privileged" ON public.monthly_entries;
CREATE POLICY "me write privileged" ON public.monthly_entries FOR ALL
  USING (public.has_brand_access(auth.uid(), brand_id) AND public.is_writer(auth.uid()))
  WITH CHECK (public.has_brand_access(auth.uid(), brand_id) AND public.is_writer(auth.uid()));

DROP POLICY IF EXISTS "admin write sales" ON public.sales_invoices;
DROP POLICY IF EXISTS "sales write privileged" ON public.sales_invoices;
CREATE POLICY "sales write privileged" ON public.sales_invoices FOR ALL
  USING (public.has_brand_access(auth.uid(), brand_id) AND public.is_writer(auth.uid()))
  WITH CHECK (public.has_brand_access(auth.uid(), brand_id) AND public.is_writer(auth.uid()));

DROP POLICY IF EXISTS "si write admin" ON public.supplier_invoices;
DROP POLICY IF EXISTS "si write privileged" ON public.supplier_invoices;
CREATE POLICY "si write privileged" ON public.supplier_invoices FOR ALL
  USING (((brand_id IS NULL) OR public.has_brand_access(auth.uid(), brand_id)) AND public.is_writer(auth.uid()))
  WITH CHECK (((brand_id IS NULL) OR public.has_brand_access(auth.uid(), brand_id)) AND public.is_writer(auth.uid()));

DROP POLICY IF EXISTS "sp write admin" ON public.supplier_payments;
DROP POLICY IF EXISTS "sp write privileged" ON public.supplier_payments;
CREATE POLICY "sp write privileged" ON public.supplier_payments FOR ALL USING (public.is_writer(auth.uid())) WITH CHECK (public.is_writer(auth.uid()));

DROP POLICY IF EXISTS "suppliers write admin" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers write privileged" ON public.suppliers;
CREATE POLICY "suppliers write privileged" ON public.suppliers FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'data_entry'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'data_entry'));

DROP POLICY IF EXISTS "auth write sales_invoice_items" ON public.sales_invoice_items;
CREATE POLICY "auth write sales_invoice_items" ON public.sales_invoice_items FOR ALL USING (public.is_writer(auth.uid())) WITH CHECK (public.is_writer(auth.uid()));

DROP POLICY IF EXISTS "write fulfillment" ON public.fulfillment_entries;
CREATE POLICY "write fulfillment" ON public.fulfillment_entries FOR ALL USING (public.is_writer(auth.uid())) WITH CHECK (public.is_writer(auth.uid()));

ALTER TABLE public.expense_entries
  ADD COLUMN IF NOT EXISTS period_type text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS period_date date,
  ADD COLUMN IF NOT EXISTS period_end_date date;
ALTER TABLE public.expense_entries DROP CONSTRAINT IF EXISTS expense_entries_period_type_check;
ALTER TABLE public.expense_entries ADD CONSTRAINT expense_entries_period_type_check CHECK (period_type IN ('daily','weekly','monthly','yearly','custom'));

CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  position text, active boolean NOT NULL DEFAULT true, note text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "employees read brand scoped" ON public.employees;
CREATE POLICY "employees read brand scoped" ON public.employees FOR SELECT TO authenticated USING (public.has_brand_access(auth.uid(), brand_id));
DROP POLICY IF EXISTS "employees write writer" ON public.employees;
CREATE POLICY "employees write writer" ON public.employees FOR ALL TO authenticated USING (public.is_writer(auth.uid())) WITH CHECK (public.is_writer(auth.uid()));
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.employee_attendance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  year int NOT NULL, month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  days_absent numeric NOT NULL DEFAULT 0, days_vacation numeric NOT NULL DEFAULT 0,
  times_late int NOT NULL DEFAULT 0, deductions numeric NOT NULL DEFAULT 0,
  bonuses numeric NOT NULL DEFAULT 0, note text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, year, month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_attendance_entries TO authenticated;
GRANT ALL ON public.employee_attendance_entries TO service_role;
ALTER TABLE public.employee_attendance_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attendance read brand scoped" ON public.employee_attendance_entries;
CREATE POLICY "attendance read brand scoped" ON public.employee_attendance_entries FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND public.has_brand_access(auth.uid(), e.brand_id)));
DROP POLICY IF EXISTS "attendance write writer" ON public.employee_attendance_entries;
CREATE POLICY "attendance write writer" ON public.employee_attendance_entries FOR ALL TO authenticated USING (public.is_writer(auth.uid())) WITH CHECK (public.is_writer(auth.uid()));
CREATE TRIGGER trg_attendance_updated BEFORE UPDATE ON public.employee_attendance_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.supplier_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('product','material','other')),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  material_id uuid REFERENCES public.materials(id) ON DELETE SET NULL,
  description text, qty numeric NOT NULL DEFAULT 1,
  unit_cost numeric NOT NULL DEFAULT 0, subtotal numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_invoice_items TO authenticated;
GRANT ALL ON public.supplier_invoice_items TO service_role;
ALTER TABLE public.supplier_invoice_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoice items read via parent invoice brand" ON public.supplier_invoice_items;
CREATE POLICY "invoice items read via parent invoice brand" ON public.supplier_invoice_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.supplier_invoices si WHERE si.id = invoice_id AND (si.brand_id IS NULL OR public.has_brand_access(auth.uid(), si.brand_id))));
DROP POLICY IF EXISTS "invoice items write for writers" ON public.supplier_invoice_items;
CREATE POLICY "invoice items write for writers" ON public.supplier_invoice_items FOR ALL TO authenticated USING (public.is_writer(auth.uid())) WITH CHECK (public.is_writer(auth.uid()));
CREATE TRIGGER trg_supplier_invoice_items_updated BEFORE UPDATE ON public.supplier_invoice_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_supplier_invoice_items_invoice ON public.supplier_invoice_items(invoice_id);

CREATE TABLE IF NOT EXISTS public.service_clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL, contact TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_clients TO authenticated;
GRANT ALL ON public.service_clients TO service_role;
ALTER TABLE public.service_clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_clients read by brand access" ON public.service_clients;
CREATE POLICY "service_clients read by brand access" ON public.service_clients FOR SELECT TO authenticated USING (public.has_brand_access(auth.uid(), brand_id));
DROP POLICY IF EXISTS "service_clients write by writers" ON public.service_clients;
CREATE POLICY "service_clients write by writers" ON public.service_clients FOR ALL TO authenticated USING (public.is_writer(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id)) WITH CHECK (public.is_writer(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id));
CREATE TRIGGER trg_service_clients_updated BEFORE UPDATE ON public.service_clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_service_clients_brand ON public.service_clients(brand_id);

CREATE TABLE IF NOT EXISTS public.service_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.service_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('pending','in_progress','done','cancelled')),
  pricing_type TEXT NOT NULL DEFAULT 'fixed' CHECK (pricing_type IN ('fixed','commission')),
  cost NUMERIC NOT NULL DEFAULT 0, commission NUMERIC NOT NULL DEFAULT 0,
  started_at DATE, finished_at DATE, note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_projects TO authenticated;
GRANT ALL ON public.service_projects TO service_role;
ALTER TABLE public.service_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_projects read by brand access" ON public.service_projects;
CREATE POLICY "service_projects read by brand access" ON public.service_projects FOR SELECT TO authenticated USING (public.has_brand_access(auth.uid(), brand_id));
DROP POLICY IF EXISTS "service_projects write by writers" ON public.service_projects;
CREATE POLICY "service_projects write by writers" ON public.service_projects FOR ALL TO authenticated USING (public.is_writer(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id)) WITH CHECK (public.is_writer(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id));
CREATE TRIGGER trg_service_projects_updated BEFORE UPDATE ON public.service_projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_service_projects_brand ON public.service_projects(brand_id);
CREATE INDEX IF NOT EXISTS idx_service_projects_client ON public.service_projects(client_id);

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
