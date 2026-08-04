
-- Enum for supplier invoice status
CREATE TYPE public.invoice_status AS ENUM ('open', 'partial', 'paid');
CREATE TYPE public.brand_type AS ENUM ('product', 'service');

-- ============ brands ============
CREATE TABLE public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  type public.brand_type NOT NULL DEFAULT 'product',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brands TO authenticated;
GRANT ALL ON public.brands TO service_role;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "brands read authenticated" ON public.brands;
CREATE POLICY "brands read authenticated" ON public.brands FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "brands write admin" ON public.brands;
CREATE POLICY "brands write admin" ON public.brands FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER brands_updated_at BEFORE UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ expense categories ============
CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cats read authenticated" ON public.expense_categories;
CREATE POLICY "cats read authenticated" ON public.expense_categories FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cats write admin" ON public.expense_categories;
CREATE POLICY "cats write admin" ON public.expense_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER cats_updated_at BEFORE UPDATE ON public.expense_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ suppliers ============
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "suppliers read authenticated" ON public.suppliers;
CREATE POLICY "suppliers read authenticated" ON public.suppliers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "suppliers write admin" ON public.suppliers;
CREATE POLICY "suppliers write admin" ON public.suppliers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ monthly entries ============
CREATE TABLE public.monthly_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  revenue numeric NOT NULL DEFAULT 0,
  cash_position numeric NOT NULL DEFAULT 0,
  orders_total integer NOT NULL DEFAULT 0,
  orders_confirmed integer NOT NULL DEFAULT 0,
  orders_delivered integer NOT NULL DEFAULT 0,
  orders_returned integer NOT NULL DEFAULT 0,
  service_clients integer NOT NULL DEFAULT 0,
  service_projects integer NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, year, month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_entries TO authenticated;
GRANT ALL ON public.monthly_entries TO service_role;
ALTER TABLE public.monthly_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "me read authenticated" ON public.monthly_entries;
CREATE POLICY "me read authenticated" ON public.monthly_entries FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "me write admin" ON public.monthly_entries;
CREATE POLICY "me write admin" ON public.monthly_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER me_updated_at BEFORE UPDATE ON public.monthly_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX me_brand_year_month_idx ON public.monthly_entries(brand_id, year, month);

-- ============ expense entries ============
CREATE TABLE public.expense_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.expense_categories(id) ON DELETE RESTRICT,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_entries TO authenticated;
GRANT ALL ON public.expense_entries TO service_role;
ALTER TABLE public.expense_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ee read authenticated" ON public.expense_entries;
CREATE POLICY "ee read authenticated" ON public.expense_entries FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ee write admin" ON public.expense_entries;
CREATE POLICY "ee write admin" ON public.expense_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER ee_updated_at BEFORE UPDATE ON public.expense_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX ee_brand_year_month_idx ON public.expense_entries(brand_id, year, month);
CREATE INDEX ee_category_idx ON public.expense_entries(category_id);

-- ============ supplier invoices ============
CREATE TABLE public.supplier_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  issued_at date NOT NULL DEFAULT CURRENT_DATE,
  due_at date,
  status public.invoice_status NOT NULL DEFAULT 'open',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_invoices TO authenticated;
GRANT ALL ON public.supplier_invoices TO service_role;
ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "si read authenticated" ON public.supplier_invoices;
CREATE POLICY "si read authenticated" ON public.supplier_invoices FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "si write admin" ON public.supplier_invoices;
CREATE POLICY "si write admin" ON public.supplier_invoices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER si_updated_at BEFORE UPDATE ON public.supplier_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX si_supplier_idx ON public.supplier_invoices(supplier_id);
CREATE INDEX si_brand_idx ON public.supplier_invoices(brand_id);

-- ============ supplier payments ============
CREATE TABLE public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  paid_at date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_payments TO authenticated;
GRANT ALL ON public.supplier_payments TO service_role;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sp read authenticated" ON public.supplier_payments;
CREATE POLICY "sp read authenticated" ON public.supplier_payments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sp write admin" ON public.supplier_payments;
CREATE POLICY "sp write admin" ON public.supplier_payments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER sp_updated_at BEFORE UPDATE ON public.supplier_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX sp_invoice_idx ON public.supplier_payments(invoice_id);

-- Seed default expense categories
INSERT INTO public.expense_categories (name, slug, sort_order) VALUES
  ('مرتبات', 'salaries', 1),
  ('إيجار', 'rent', 2),
  ('تسويق', 'marketing', 3),
  ('شحن', 'shipping', 4),
  ('مشتريات', 'purchases', 5),
  ('خدمات ومرافق', 'utilities', 6),
  ('أخرى', 'other', 99);
