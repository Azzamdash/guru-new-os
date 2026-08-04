-- Orders
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'manual',
  external_id text,
  external_order_number text,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text,
  customer_phone text,
  customer_email text,
  shipping_governorate text,
  shipping_address text,
  courier_id uuid REFERENCES public.couriers(id) ON DELETE SET NULL,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.sales_invoices(id) ON DELETE SET NULL,
  financial_status text NOT NULL DEFAULT 'pending',
  fulfillment_status text NOT NULL DEFAULT 'unfulfilled',
  subtotal_amount numeric NOT NULL DEFAULT 0,
  shipping_amount numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  cost_total numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EGP',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  note text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(brand_id, source, external_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orders_brand_read ON public.orders;
CREATE POLICY orders_brand_read ON public.orders
  FOR SELECT TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id));
DROP POLICY IF EXISTS orders_writer_all ON public.orders;
CREATE POLICY orders_writer_all ON public.orders
  FOR ALL TO authenticated
  USING (public.is_writer(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id))
  WITH CHECK (public.is_writer(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id));

CREATE INDEX IF NOT EXISTS orders_brand_occurred_idx ON public.orders (brand_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS orders_customer_idx ON public.orders (customer_id);
CREATE INDEX IF NOT EXISTS orders_fulfillment_idx ON public.orders (fulfillment_status);

CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Order items
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  sku text,
  title text NOT NULL,
  qty numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_items_read ON public.order_items;
CREATE POLICY order_items_read ON public.order_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND public.has_brand_access(auth.uid(), o.brand_id)));
DROP POLICY IF EXISTS order_items_writer ON public.order_items;
CREATE POLICY order_items_writer ON public.order_items
  FOR ALL TO authenticated
  USING (public.is_writer(auth.uid()) AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND public.has_brand_access(auth.uid(), o.brand_id)))
  WITH CHECK (public.is_writer(auth.uid()) AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND public.has_brand_access(auth.uid(), o.brand_id)));

CREATE INDEX IF NOT EXISTS order_items_order_idx ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS order_items_product_idx ON public.order_items (product_id);

-- Auto-link customer
CREATE OR REPLACE FUNCTION public.link_order_customer()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  pnorm text := regexp_replace(coalesce(NEW.customer_phone,''), '\D', '', 'g');
  enorm text := lower(coalesce(NEW.customer_email,''));
  cid uuid;
BEGIN
  IF NEW.customer_id IS NULL AND (pnorm <> '' OR enorm <> '') THEN
    IF pnorm <> '' THEN SELECT id INTO cid FROM public.customers WHERE phone_norm = pnorm LIMIT 1; END IF;
    IF cid IS NULL AND enorm <> '' THEN SELECT id INTO cid FROM public.customers WHERE email_norm = enorm LIMIT 1; END IF;
    IF cid IS NULL THEN
      INSERT INTO public.customers(name, phone, email, governorate)
      VALUES (coalesce(NEW.customer_name, NEW.customer_phone, NEW.customer_email, 'Unknown'),
              NULLIF(NEW.customer_phone,''), NULLIF(NEW.customer_email,''),
              NULLIF(NEW.shipping_governorate,''))
      RETURNING id INTO cid;
    END IF;
    NEW.customer_id := cid;
  END IF;
  IF NEW.customer_id IS NOT NULL THEN
    UPDATE public.customers
      SET last_seen_at = GREATEST(coalesce(last_seen_at, '-infinity'::timestamptz), NEW.occurred_at)
      WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER orders_link_customer BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.link_order_customer();

-- COGS helper: BOM (materials × qty × unit_cost) with cogs_override fallback
CREATE OR REPLACE FUNCTION public.product_cogs(_product_id uuid)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(
    (SELECT cogs_override FROM public.products WHERE id = _product_id AND cogs_override IS NOT NULL),
    coalesce((
      SELECT sum(pm.qty_per_unit * m.unit_cost)
      FROM public.product_materials pm
      JOIN public.materials m ON m.id = pm.material_id
      WHERE pm.product_id = _product_id
    ), 0)
  );
$$;

GRANT EXECUTE ON FUNCTION public.product_cogs(uuid) TO authenticated;