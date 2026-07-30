DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='monthly_entries' AND column_name='period_type') THEN
    ALTER TABLE public.monthly_entries ADD COLUMN period_type text NOT NULL DEFAULT 'monthly';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='monthly_entries' AND column_name='period_date') THEN
    ALTER TABLE public.monthly_entries ADD COLUMN period_date date;
  END IF;
END $$;

ALTER TABLE public.materials ALTER COLUMN unit SET DEFAULT 'piece';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='unit') THEN
    ALTER TABLE public.products ADD COLUMN unit text NOT NULL DEFAULT 'piece';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.sales_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.sales_invoices(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  qty numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_invoice_items TO authenticated;
GRANT ALL ON public.sales_invoice_items TO service_role;
ALTER TABLE public.sales_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read sales_invoice_items" ON public.sales_invoice_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth write sales_invoice_items" ON public.sales_invoice_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'data_entry'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'data_entry'));

CREATE INDEX IF NOT EXISTS idx_sales_items_invoice ON public.sales_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_items_product ON public.sales_invoice_items(product_id);

CREATE TABLE IF NOT EXISTS public.articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  cover_image_url text,
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  published boolean NOT NULL DEFAULT true,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.articles TO authenticated;
GRANT ALL ON public.articles TO service_role;
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read articles" ON public.articles FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth manage articles" ON public.articles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE TRIGGER trg_articles_updated BEFORE UPDATE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS reorder_point numeric NOT NULL DEFAULT 0;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS worker_name text;
CREATE INDEX IF NOT EXISTS idx_suppliers_brand_id ON public.suppliers(brand_id);
CREATE INDEX IF NOT EXISTS idx_inv_moves_worker ON public.inventory_movements(worker_name);

CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  due_date DATE,
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers manage all tasks" ON public.tasks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "Assignees view own tasks" ON public.tasks FOR SELECT TO authenticated
  USING (assignee_id = auth.uid() OR created_by = auth.uid());

CREATE POLICY "Assignees update status" ON public.tasks FOR UPDATE TO authenticated
  USING (assignee_id = auth.uid())
  WITH CHECK (assignee_id = auth.uid());

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.user_section_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, section)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_section_access TO authenticated;
GRANT ALL ON public.user_section_access TO service_role;
ALTER TABLE public.user_section_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own section access" ON public.user_section_access FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage section access" ON public.user_section_access FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.user_brand_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, brand_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_brand_access TO authenticated;
GRANT ALL ON public.user_brand_access TO service_role;
ALTER TABLE public.user_brand_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own brand access" ON public.user_brand_access FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage brand access" ON public.user_brand_access FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.has_section_access(_user_id UUID, _section TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_role(_user_id,'admin')
    OR public.has_role(_user_id,'manager')
    OR EXISTS (SELECT 1 FROM public.user_section_access WHERE user_id = _user_id AND section = _section);
$$;

CREATE OR REPLACE FUNCTION public.has_brand_access(_user_id UUID, _brand_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_role(_user_id,'admin')
    OR public.has_role(_user_id,'manager')
    OR NOT EXISTS (SELECT 1 FROM public.user_brand_access WHERE user_id = _user_id)
    OR EXISTS (SELECT 1 FROM public.user_brand_access WHERE user_id = _user_id AND brand_id = _brand_id);
$$;

CREATE TABLE public.fulfillment_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  employee_name text NOT NULL,
  orders_prepared integer NOT NULL DEFAULT 0,
  occurred_at date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fulfillment_entries TO authenticated;
GRANT ALL ON public.fulfillment_entries TO service_role;
ALTER TABLE public.fulfillment_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read fulfillment" ON public.fulfillment_entries FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_section_access(auth.uid(),'couriers') OR public.has_section_access(auth.uid(),'reports_production'));

CREATE POLICY "write fulfillment" ON public.fulfillment_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'data_entry'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'data_entry'));

CREATE TRIGGER trg_fulfillment_updated BEFORE UPDATE ON public.fulfillment_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_fulfillment_date ON public.fulfillment_entries(occurred_at DESC);
CREATE INDEX idx_fulfillment_brand ON public.fulfillment_entries(brand_id);

REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_section_access(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_brand_access(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_section_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_brand_access(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "read sales" ON public.sales_invoices;
CREATE POLICY "read sales" ON public.sales_invoices FOR SELECT TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id));

DROP POLICY IF EXISTS "auth read sales_invoice_items" ON public.sales_invoice_items;
CREATE POLICY "read sales_invoice_items" ON public.sales_invoice_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales_invoices si WHERE si.id = invoice_id AND public.has_brand_access(auth.uid(), si.brand_id)));

DROP POLICY IF EXISTS "me read authenticated" ON public.monthly_entries;
CREATE POLICY "read monthly_entries" ON public.monthly_entries FOR SELECT TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id));

DROP POLICY IF EXISTS "ee read authenticated" ON public.expense_entries;
CREATE POLICY "read expense_entries" ON public.expense_entries FOR SELECT TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id));

DROP POLICY IF EXISTS "suppliers read authenticated" ON public.suppliers;
CREATE POLICY "read suppliers" ON public.suppliers FOR SELECT TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id));

DROP POLICY IF EXISTS "si read authenticated" ON public.supplier_invoices;
CREATE POLICY "read supplier_invoices" ON public.supplier_invoices FOR SELECT TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id));

DROP POLICY IF EXISTS "sp read authenticated" ON public.supplier_payments;
CREATE POLICY "read supplier_payments" ON public.supplier_payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.supplier_invoices si WHERE si.id = invoice_id AND public.has_brand_access(auth.uid(), si.brand_id)));

DROP POLICY IF EXISTS "brands read authenticated" ON public.brands;
CREATE POLICY "read brands" ON public.brands FOR SELECT TO authenticated
  USING (public.has_brand_access(auth.uid(), id));

DROP POLICY IF EXISTS "read couriers" ON public.couriers;
CREATE POLICY "read couriers" ON public.couriers FOR SELECT TO authenticated
  USING (brand_id IS NULL OR public.has_brand_access(auth.uid(), brand_id));

DROP POLICY IF EXISTS "cats read authenticated" ON public.expense_categories;
CREATE POLICY "read expense_categories" ON public.expense_categories FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'data_entry'));

DROP POLICY IF EXISTS "read products" ON public.products;
CREATE POLICY "read products" ON public.products FOR SELECT TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id));

DROP POLICY IF EXISTS "read materials" ON public.materials;
CREATE POLICY "read materials" ON public.materials FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'data_entry'));

DROP POLICY IF EXISTS "read pm" ON public.product_materials;
CREATE POLICY "read product_materials" ON public.product_materials FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND public.has_brand_access(auth.uid(), p.brand_id)));

DROP POLICY IF EXISTS "read im" ON public.inventory_movements;
CREATE POLICY "read inventory_movements" ON public.inventory_movements FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND public.has_brand_access(auth.uid(), p.brand_id)));

CREATE OR REPLACE FUNCTION public.has_brand_access(_user_id uuid, _brand_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(_user_id,'admin')
    OR public.has_role(_user_id,'manager')
    OR EXISTS (SELECT 1 FROM public.user_brand_access WHERE user_id = _user_id AND brand_id = _brand_id);
$function$;

CREATE TABLE public.supplier_brands (
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (supplier_id, brand_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_brands TO authenticated;
GRANT ALL ON public.supplier_brands TO service_role;
ALTER TABLE public.supplier_brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read supplier_brands" ON public.supplier_brands
  FOR SELECT TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id));
CREATE POLICY "admin manage supplier_brands" ON public.supplier_brands
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));