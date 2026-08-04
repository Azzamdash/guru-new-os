-- complete_purchase_order was inserting an explicit 'purchase_receipt'
-- inventory_movements row for every item AND inserting into
-- supplier_invoice_items, which itself fires the (already-live) trg_sii_stock_in
-- trigger that inserts its own inbound movement for the same item. That double-
-- counted on_hand_qty for every completed purchase order. Since sii_stock_in
-- already handles stock-in for both products and materials, the explicit
-- insert here is redundant and is removed.
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
  IF NOT (public.has_brand_access(_uid, po.brand_id) AND public.is_writer(_uid)) THEN
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
    -- Inserting into supplier_invoice_items fires trg_sii_stock_in, which
    -- creates the inventory_movements row (both products and materials) and
    -- trg_sii_update_material_avg_cost, which updates materials.unit_cost.
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
