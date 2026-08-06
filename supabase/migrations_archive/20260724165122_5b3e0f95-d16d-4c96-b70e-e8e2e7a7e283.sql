
CREATE TABLE IF NOT EXISTS public.app_user_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connector_id text NOT NULL,
  connection_key_ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, connector_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_user_connections TO authenticated;
GRANT ALL ON public.app_user_connections TO service_role;
ALTER TABLE public.app_user_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own connection status" ON public.app_user_connections;
CREATE POLICY "Users can view own connection status" ON public.app_user_connections FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own connection" ON public.app_user_connections;
CREATE POLICY "Users can delete own connection" ON public.app_user_connections FOR DELETE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Block authenticated inserts" ON public.app_user_connections;
CREATE POLICY "Block authenticated inserts" ON public.app_user_connections FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "Block authenticated updates" ON public.app_user_connections;
CREATE POLICY "Block authenticated updates" ON public.app_user_connections FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

CREATE TABLE IF NOT EXISTS public.user_sheet_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  spreadsheet_id text NOT NULL,
  spreadsheet_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sheet_config TO authenticated;
GRANT ALL ON public.user_sheet_config TO service_role;
ALTER TABLE public.user_sheet_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own sheet config" ON public.user_sheet_config;
CREATE POLICY "Users manage own sheet config" ON public.user_sheet_config FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS update_app_user_connections_updated_at ON public.app_user_connections;
CREATE TRIGGER update_app_user_connections_updated_at BEFORE UPDATE ON public.app_user_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_user_sheet_config_updated_at ON public.user_sheet_config;
CREATE TRIGGER update_user_sheet_config_updated_at BEFORE UPDATE ON public.user_sheet_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $do$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','member','manager','data_entry','viewer','education');
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

DO $do$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'invoice_status'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.invoice_status AS ENUM ('open','partial','paid');
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'brand_type'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.brand_type AS ENUM ('product','service');
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE TABLE IF NOT EXISTS public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, slug text NOT NULL UNIQUE,
  type public.brand_type NOT NULL DEFAULT 'product',
  active boolean NOT NULL DEFAULT true, sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brands TO authenticated;
GRANT ALL ON public.brands TO service_role;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "brands read authenticated" ON public.brands;
CREATE POLICY "brands read authenticated" ON public.brands FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "brands write admin" ON public.brands;
CREATE POLICY "brands write admin" ON public.brands FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP TRIGGER IF EXISTS brands_updated_at ON public.brands;
CREATE TRIGGER brands_updated_at BEFORE UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, slug text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true, sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cats read authenticated" ON public.expense_categories;
CREATE POLICY "cats read authenticated" ON public.expense_categories FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cats write admin" ON public.expense_categories;
CREATE POLICY "cats write admin" ON public.expense_categories FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP TRIGGER IF EXISTS cats_updated_at ON public.expense_categories;
CREATE TRIGGER cats_updated_at BEFORE UPDATE ON public.expense_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, contact text, notes text,
  active boolean NOT NULL DEFAULT true,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "suppliers read authenticated" ON public.suppliers;
CREATE POLICY "suppliers read authenticated" ON public.suppliers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "suppliers write admin" ON public.suppliers;
CREATE POLICY "suppliers write admin" ON public.suppliers FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP TRIGGER IF EXISTS suppliers_updated_at ON public.suppliers;
CREATE TRIGGER suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_suppliers_brand_id ON public.suppliers(brand_id);

CREATE TABLE IF NOT EXISTS public.monthly_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  year integer NOT NULL, month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  revenue numeric NOT NULL DEFAULT 0, cash_position numeric NOT NULL DEFAULT 0,
  orders_total integer NOT NULL DEFAULT 0, orders_confirmed integer NOT NULL DEFAULT 0,
  orders_delivered integer NOT NULL DEFAULT 0, orders_returned integer NOT NULL DEFAULT 0,
  service_clients integer NOT NULL DEFAULT 0, service_projects integer NOT NULL DEFAULT 0,
  note text,
  period_type text NOT NULL DEFAULT 'monthly',
  period_date date,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, year, month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_entries TO authenticated;
GRANT ALL ON public.monthly_entries TO service_role;
ALTER TABLE public.monthly_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "me read authenticated" ON public.monthly_entries;
CREATE POLICY "me read authenticated" ON public.monthly_entries FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "me write admin" ON public.monthly_entries;
CREATE POLICY "me write admin" ON public.monthly_entries FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP TRIGGER IF EXISTS me_updated_at ON public.monthly_entries;
CREATE TRIGGER me_updated_at BEFORE UPDATE ON public.monthly_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS me_brand_year_month_idx ON public.monthly_entries(brand_id, year, month);

DO $do$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'marketing_platform'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.marketing_platform AS ENUM ('tiktok','meta','google','snapchat','whatsapp','sms','other');
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE TABLE IF NOT EXISTS public.expense_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.expense_categories(id) ON DELETE RESTRICT,
  year integer NOT NULL, month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount numeric NOT NULL DEFAULT 0, note text,
  platform public.marketing_platform,
  attributed_revenue numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_entries TO authenticated;
GRANT ALL ON public.expense_entries TO service_role;
ALTER TABLE public.expense_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ee read authenticated" ON public.expense_entries;
CREATE POLICY "ee read authenticated" ON public.expense_entries FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ee write admin" ON public.expense_entries;
CREATE POLICY "ee write admin" ON public.expense_entries FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP TRIGGER IF EXISTS ee_updated_at ON public.expense_entries;
CREATE TRIGGER ee_updated_at BEFORE UPDATE ON public.expense_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS ee_brand_year_month_idx ON public.expense_entries(brand_id, year, month);
CREATE INDEX IF NOT EXISTS ee_category_idx ON public.expense_entries(category_id);

CREATE TABLE IF NOT EXISTS public.supplier_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  issued_at date NOT NULL DEFAULT CURRENT_DATE, due_at date,
  status public.invoice_status NOT NULL DEFAULT 'open', note text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_invoices TO authenticated;
GRANT ALL ON public.supplier_invoices TO service_role;
ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "si read authenticated" ON public.supplier_invoices;
CREATE POLICY "si read authenticated" ON public.supplier_invoices FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "si write admin" ON public.supplier_invoices;
CREATE POLICY "si write admin" ON public.supplier_invoices FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP TRIGGER IF EXISTS si_updated_at ON public.supplier_invoices;
CREATE TRIGGER si_updated_at BEFORE UPDATE ON public.supplier_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS si_supplier_idx ON public.supplier_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS si_brand_idx ON public.supplier_invoices(brand_id);

CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  paid_at date NOT NULL DEFAULT CURRENT_DATE, note text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_payments TO authenticated;
GRANT ALL ON public.supplier_payments TO service_role;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sp read authenticated" ON public.supplier_payments;
CREATE POLICY "sp read authenticated" ON public.supplier_payments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sp write admin" ON public.supplier_payments;
CREATE POLICY "sp write admin" ON public.supplier_payments FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP TRIGGER IF EXISTS sp_updated_at ON public.supplier_payments;
CREATE TRIGGER sp_updated_at BEFORE UPDATE ON public.supplier_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS sp_invoice_idx ON public.supplier_payments(invoice_id);

INSERT INTO public.expense_categories (name, slug, sort_order) VALUES
  ('مرتبات','salaries',1),('إيجار','rent',2),('تسويق','marketing',3),
  ('شحن','shipping',4),('مشتريات','purchases',5),
  ('خدمات ومرافق','utilities',6),('أخرى','other',99);

DO $do$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'courier_type'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.courier_type AS ENUM ('courier_company','rep','offline_branch');
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'inventory_movement_type'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.inventory_movement_type AS ENUM ('production','sale','return','adjustment');
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'sales_invoice_type'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.sales_invoice_type AS ENUM ('sale','return');
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE TABLE IF NOT EXISTS public.materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, unit text NOT NULL DEFAULT 'piece',
  unit_cost numeric NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materials TO authenticated;
GRANT ALL ON public.materials TO service_role;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read materials" ON public.materials;
CREATE POLICY "read materials" ON public.materials FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin write materials" ON public.materials;
CREATE POLICY "admin write materials" ON public.materials FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP TRIGGER IF EXISTS materials_updated_at ON public.materials;
CREATE TRIGGER materials_updated_at BEFORE UPDATE ON public.materials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL, sku text,
  sell_price numeric NOT NULL DEFAULT 0, cogs_override numeric,
  active boolean NOT NULL DEFAULT true,
  unit text NOT NULL DEFAULT 'piece',
  reorder_point numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read products" ON public.products;
CREATE POLICY "read products" ON public.products FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin write products" ON public.products;
CREATE POLICY "admin write products" ON public.products FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP TRIGGER IF EXISTS products_updated_at ON public.products;
CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.product_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  qty_per_unit numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, material_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_materials TO authenticated;
GRANT ALL ON public.product_materials TO service_role;
ALTER TABLE public.product_materials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read pm" ON public.product_materials;
CREATE POLICY "read pm" ON public.product_materials FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin write pm" ON public.product_materials;
CREATE POLICY "admin write pm" ON public.product_materials FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP TRIGGER IF EXISTS product_materials_updated_at ON public.product_materials;
CREATE TRIGGER product_materials_updated_at BEFORE UPDATE ON public.product_materials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  type public.inventory_movement_type NOT NULL, qty numeric NOT NULL,
  occurred_at date NOT NULL DEFAULT CURRENT_DATE, note text,
  worker_name text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_movements TO service_role;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read im" ON public.inventory_movements;
CREATE POLICY "read im" ON public.inventory_movements FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin write im" ON public.inventory_movements;
CREATE POLICY "admin write im" ON public.inventory_movements FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP TRIGGER IF EXISTS im_updated_at ON public.inventory_movements;
CREATE TRIGGER im_updated_at BEFORE UPDATE ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_inv_moves_worker ON public.inventory_movements(worker_name);

CREATE TABLE IF NOT EXISTS public.couriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, type public.courier_type NOT NULL DEFAULT 'courier_company',
  contact text, brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.couriers TO authenticated;
GRANT ALL ON public.couriers TO service_role;
ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read couriers" ON public.couriers;
CREATE POLICY "read couriers" ON public.couriers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin write couriers" ON public.couriers;
CREATE POLICY "admin write couriers" ON public.couriers FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP TRIGGER IF EXISTS couriers_updated_at ON public.couriers;
CREATE TRIGGER couriers_updated_at BEFORE UPDATE ON public.couriers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.sales_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  courier_id uuid REFERENCES public.couriers(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  type public.sales_invoice_type NOT NULL DEFAULT 'sale',
  qty numeric NOT NULL DEFAULT 1,
  total_amount numeric NOT NULL DEFAULT 0, collected_amount numeric NOT NULL DEFAULT 0,
  occurred_at date NOT NULL DEFAULT CURRENT_DATE, note text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_invoices TO authenticated;
GRANT ALL ON public.sales_invoices TO service_role;
ALTER TABLE public.sales_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read sales" ON public.sales_invoices;
CREATE POLICY "read sales" ON public.sales_invoices FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin write sales" ON public.sales_invoices;
CREATE POLICY "admin write sales" ON public.sales_invoices FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP TRIGGER IF EXISTS sales_updated_at ON public.sales_invoices;
CREATE TRIGGER sales_updated_at BEFORE UPDATE ON public.sales_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.sales_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.sales_invoices(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  qty numeric NOT NULL DEFAULT 1, unit_price numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_invoice_items TO authenticated;
GRANT ALL ON public.sales_invoice_items TO service_role;
ALTER TABLE public.sales_invoice_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read sales_invoice_items" ON public.sales_invoice_items;
CREATE POLICY "auth read sales_invoice_items" ON public.sales_invoice_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth write sales_invoice_items" ON public.sales_invoice_items;
CREATE POLICY "auth write sales_invoice_items" ON public.sales_invoice_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'data_entry'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'data_entry'));
CREATE INDEX IF NOT EXISTS idx_sales_items_invoice ON public.sales_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_items_product ON public.sales_invoice_items(product_id);

CREATE TABLE IF NOT EXISTS public.articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL, content text NOT NULL DEFAULT '',
  cover_image_url text,
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  published boolean NOT NULL DEFAULT true,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.articles TO authenticated;
GRANT ALL ON public.articles TO service_role;
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read articles" ON public.articles;
CREATE POLICY "auth read articles" ON public.articles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth manage articles" ON public.articles;
CREATE POLICY "auth manage articles" ON public.articles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
DROP TRIGGER IF EXISTS trg_articles_updated ON public.articles;
CREATE TRIGGER trg_articles_updated BEFORE UPDATE ON public.articles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL, description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  due_date DATE,
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Managers manage all tasks" ON public.tasks;
CREATE POLICY "Managers manage all tasks" ON public.tasks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
DROP POLICY IF EXISTS "Assignees view own tasks" ON public.tasks;
CREATE POLICY "Assignees view own tasks" ON public.tasks FOR SELECT TO authenticated USING (assignee_id = auth.uid() OR created_by = auth.uid());
DROP POLICY IF EXISTS "Assignees update status" ON public.tasks;
CREATE POLICY "Assignees update status" ON public.tasks FOR UPDATE TO authenticated USING (assignee_id = auth.uid()) WITH CHECK (assignee_id = auth.uid());
DROP TRIGGER IF EXISTS update_tasks_updated_at ON public.tasks;
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.user_section_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, section)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_section_access TO authenticated;
GRANT ALL ON public.user_section_access TO service_role;
ALTER TABLE public.user_section_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own section access" ON public.user_section_access;
CREATE POLICY "Users read own section access" ON public.user_section_access FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Admins manage section access" ON public.user_section_access;
CREATE POLICY "Admins manage section access" ON public.user_section_access FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.user_brand_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, brand_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_brand_access TO authenticated;
GRANT ALL ON public.user_brand_access TO service_role;
ALTER TABLE public.user_brand_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own brand access" ON public.user_brand_access;
CREATE POLICY "Users read own brand access" ON public.user_brand_access FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Admins manage brand access" ON public.user_brand_access;
CREATE POLICY "Admins manage brand access" ON public.user_brand_access FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.has_section_access(_user_id UUID, _section TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id,'admin') OR public.has_role(_user_id,'manager')
    OR EXISTS (SELECT 1 FROM public.user_section_access WHERE user_id = _user_id AND section = _section);
$$;

CREATE OR REPLACE FUNCTION public.has_brand_access(_user_id UUID, _brand_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id,'admin') OR public.has_role(_user_id,'manager')
    OR NOT EXISTS (SELECT 1 FROM public.user_brand_access WHERE user_id = _user_id)
    OR EXISTS (SELECT 1 FROM public.user_brand_access WHERE user_id = _user_id AND brand_id = _brand_id);
$$;

CREATE TABLE IF NOT EXISTS public.fulfillment_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  employee_name text NOT NULL,
  orders_prepared integer NOT NULL DEFAULT 0,
  occurred_at date NOT NULL DEFAULT CURRENT_DATE, note text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fulfillment_entries TO authenticated;
GRANT ALL ON public.fulfillment_entries TO service_role;
ALTER TABLE public.fulfillment_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read fulfillment" ON public.fulfillment_entries;
CREATE POLICY "read fulfillment" ON public.fulfillment_entries FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR public.has_section_access(auth.uid(),'couriers') OR public.has_section_access(auth.uid(),'reports_production'));
DROP POLICY IF EXISTS "write fulfillment" ON public.fulfillment_entries;
CREATE POLICY "write fulfillment" ON public.fulfillment_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'data_entry'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'data_entry'));
DROP TRIGGER IF EXISTS trg_fulfillment_updated ON public.fulfillment_entries;
CREATE TRIGGER trg_fulfillment_updated BEFORE UPDATE ON public.fulfillment_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_fulfillment_date ON public.fulfillment_entries(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_fulfillment_brand ON public.fulfillment_entries(brand_id);
