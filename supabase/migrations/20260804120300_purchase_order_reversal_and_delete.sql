-- Reverses a completed purchase order's accounting/inventory side effects
-- (the supplier invoice, its items, and the inventory movements they created)
-- and puts the PO back into 'awaiting_delivery' so its items become editable
-- again and it can be completed once more. Blocked if the invoice already has
-- payments recorded against it — those must be removed first via the
-- Payables page, same as any other invoice.
CREATE OR REPLACE FUNCTION public.reverse_purchase_order_completion(_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  po record;
  mv record;
  _payment_count int;
BEGIN
  SELECT * INTO po FROM public.purchase_orders WHERE id = _po_id FOR UPDATE;
  IF po.id IS NULL THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;
  IF NOT (public.has_brand_access(_uid, po.brand_id) AND public.is_writer(_uid)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF po.status <> 'completed' THEN
    RAISE EXCEPTION 'Purchase order is not completed';
  END IF;

  IF po.invoice_id IS NOT NULL THEN
    SELECT count(*) INTO _payment_count FROM public.supplier_payments WHERE invoice_id = po.invoice_id;
    IF _payment_count > 0 THEN
      RAISE EXCEPTION 'Cannot reverse: supplier payments already recorded against this order''s invoice. Remove them first.';
    END IF;

    FOR mv IN
      SELECT * FROM public.inventory_movements
      WHERE source = 'supplier_invoice' AND source_id = po.invoice_id
    LOOP
      INSERT INTO public.inventory_movements (product_id, material_id, type, qty, occurred_at, note, source, source_id)
      VALUES (mv.product_id, mv.material_id, 'adjustment', -abs(mv.qty), (now() AT TIME ZONE 'Africa/Cairo')::date,
              'تراجع عن إكمال أمر شراء', 'purchase_order_reversal', _po_id);
    END LOOP;

    DELETE FROM public.supplier_invoice_items WHERE invoice_id = po.invoice_id;
    DELETE FROM public.supplier_invoices WHERE id = po.invoice_id;
  END IF;

  UPDATE public.purchase_orders SET status = 'awaiting_delivery', invoice_id = NULL WHERE id = _po_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_purchase_order_completion(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_purchase_order_completion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_purchase_order_completion(uuid) TO service_role;

-- Deletes a purchase order regardless of status. If it's completed, first
-- reverses its invoice/inventory effects (same rules/blocks as reopening it).
CREATE OR REPLACE FUNCTION public.delete_purchase_order(_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  po record;
BEGIN
  SELECT * INTO po FROM public.purchase_orders WHERE id = _po_id FOR UPDATE;
  IF po.id IS NULL THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;
  IF NOT (public.has_brand_access(_uid, po.brand_id) AND public.is_writer(_uid)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF po.status = 'completed' THEN
    PERFORM public.reverse_purchase_order_completion(_po_id);
  END IF;

  DELETE FROM public.purchase_orders WHERE id = _po_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_purchase_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_purchase_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_purchase_order(uuid) TO service_role;
