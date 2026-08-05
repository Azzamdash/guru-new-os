CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','awaiting_delivery','completed','cancelled')),
  expected_delivery_at date,
  note text,
  invoice_id uuid REFERENCES public.supplier_invoices(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read purchase_orders" ON public.purchase_orders;
CREATE POLICY "read purchase_orders" ON public.purchase_orders FOR SELECT TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id));

DROP POLICY IF EXISTS "write purchase_orders privileged" ON public.purchase_orders;
CREATE POLICY "write purchase_orders privileged" ON public.purchase_orders FOR ALL TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id) AND public.is_writer(auth.uid()))
  WITH CHECK (public.has_brand_access(auth.uid(), brand_id) AND public.is_writer(auth.uid()));

DROP TRIGGER IF EXISTS purchase_orders_updated_at ON public.purchase_orders;
CREATE TRIGGER purchase_orders_updated_at BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS po_supplier_idx ON public.purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS po_brand_idx ON public.purchase_orders(brand_id);
CREATE INDEX IF NOT EXISTS po_status_idx ON public.purchase_orders(status);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  material_id uuid REFERENCES public.materials(id) ON DELETE SET NULL,
  qty numeric NOT NULL CHECK (qty > 0),
  unit_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((product_id IS NOT NULL) OR (material_id IS NOT NULL))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_items TO authenticated;
GRANT ALL ON public.purchase_order_items TO service_role;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read purchase_order_items" ON public.purchase_order_items;
CREATE POLICY "read purchase_order_items" ON public.purchase_order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = purchase_order_id AND public.has_brand_access(auth.uid(), po.brand_id)));

DROP POLICY IF EXISTS "write purchase_order_items privileged" ON public.purchase_order_items;
CREATE POLICY "write purchase_order_items privileged" ON public.purchase_order_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = purchase_order_id AND public.has_brand_access(auth.uid(), po.brand_id) AND public.is_writer(auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.id = purchase_order_id AND public.has_brand_access(auth.uid(), po.brand_id) AND public.is_writer(auth.uid())));

DROP TRIGGER IF EXISTS purchase_order_items_updated_at ON public.purchase_order_items;
CREATE TRIGGER purchase_order_items_updated_at BEFORE UPDATE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS poi_po_idx ON public.purchase_order_items(purchase_order_id);

CREATE OR REPLACE FUNCTION public.complete_purchase_order(_po_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  po record;
  _invoice_id uuid;
  _total numeric := 0;
  item record;
BEGIN
  SELECT * INTO po FROM public.purchase_orders WHERE id = _po_id FOR UPDATE;
  IF po.id IS NULL THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;
  IF _uid IS NULL OR NOT (public.has_brand_access(_uid, po.brand_id) AND public.is_writer(_uid)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF po.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Purchase order is already %', po.status;
  END IF;

  SELECT COALESCE(SUM(qty * unit_cost), 0) INTO _total
  FROM public.purchase_order_items WHERE purchase_order_id = _po_id;
  IF _total <= 0 THEN
    RAISE EXCEPTION 'Purchase order has no items to complete';
  END IF;

  INSERT INTO public.supplier_invoices (supplier_id, brand_id, amount, issued_at, status, note)
  VALUES (po.supplier_id, po.brand_id, _total, (now() AT TIME ZONE 'Africa/Cairo')::date, 'open',
          'أمر شراء #' || substr(_po_id::text, 1, 8))
  RETURNING id INTO _invoice_id;

  FOR item IN SELECT * FROM public.purchase_order_items WHERE purchase_order_id = _po_id LOOP
    -- stock intake is handled automatically by trg_sii_stock_in on this insert
    INSERT INTO public.supplier_invoice_items (invoice_id, product_id, material_id, kind, qty, unit_cost, subtotal)
    VALUES (
      _invoice_id, item.product_id, item.material_id,
      CASE WHEN item.product_id IS NOT NULL THEN 'product' ELSE 'material' END,
      item.qty, item.unit_cost, item.qty * item.unit_cost
    );
  END LOOP;

  UPDATE public.purchase_orders SET status = 'completed', invoice_id = _invoice_id WHERE id = _po_id;
  RETURN _invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_purchase_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_purchase_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_purchase_order(uuid) TO service_role;