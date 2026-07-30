CREATE TYPE public.marketing_platform AS ENUM ('tiktok','meta','google','snapchat','whatsapp','sms','other');
CREATE TYPE public.courier_type AS ENUM ('courier_company','rep','offline_branch');
CREATE TYPE public.inventory_movement_type AS ENUM ('production','sale','return','adjustment');
CREATE TYPE public.sales_invoice_type AS ENUM ('sale','return');

CREATE TABLE public.materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'unit',
  unit_cost numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materials TO authenticated;
GRANT ALL ON public.materials TO service_role;
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read materials" ON public.materials FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write materials" ON public.materials FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER materials_updated_at BEFORE UPDATE ON public.materials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text,
  sell_price numeric NOT NULL DEFAULT 0,
  cogs_override numeric,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write products" ON public.products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.product_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
  qty_per_unit numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, material_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_materials TO authenticated;
GRANT ALL ON public.product_materials TO service_role;
ALTER TABLE public.product_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read pm" ON public.product_materials FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write pm" ON public.product_materials FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER product_materials_updated_at BEFORE UPDATE ON public.product_materials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  type public.inventory_movement_type NOT NULL,
  qty numeric NOT NULL,
  occurred_at date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_movements TO service_role;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read im" ON public.inventory_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write im" ON public.inventory_movements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER im_updated_at BEFORE UPDATE ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.couriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type public.courier_type NOT NULL DEFAULT 'courier_company',
  contact text,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.couriers TO authenticated;
GRANT ALL ON public.couriers TO service_role;
ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read couriers" ON public.couriers FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write couriers" ON public.couriers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER couriers_updated_at BEFORE UPDATE ON public.couriers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.sales_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  courier_id uuid REFERENCES public.couriers(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  type public.sales_invoice_type NOT NULL DEFAULT 'sale',
  qty numeric NOT NULL DEFAULT 1,
  total_amount numeric NOT NULL DEFAULT 0,
  collected_amount numeric NOT NULL DEFAULT 0,
  occurred_at date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_invoices TO authenticated;
GRANT ALL ON public.sales_invoices TO service_role;
ALTER TABLE public.sales_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read sales" ON public.sales_invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write sales" ON public.sales_invoices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER sales_updated_at BEFORE UPDATE ON public.sales_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.expense_entries
  ADD COLUMN platform public.marketing_platform,
  ADD COLUMN attributed_revenue numeric NOT NULL DEFAULT 0;