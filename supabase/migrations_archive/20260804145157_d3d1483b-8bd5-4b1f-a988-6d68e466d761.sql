CREATE OR REPLACE FUNCTION public.sii_stock_in()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_return boolean;
BEGIN
  IF NEW.qty IS NULL OR NEW.qty <= 0 THEN RETURN NEW; END IF;
  SELECT (type = 'return') INTO _is_return FROM public.supplier_invoices WHERE id = NEW.invoice_id;
  IF NEW.product_id IS NOT NULL THEN
    INSERT INTO public.inventory_movements(product_id, type, qty, unit_cost, reason, source, source_id, note)
    VALUES (
      NEW.product_id,
      (CASE WHEN _is_return THEN 'supplier_return' ELSE 'production' END)::public.inventory_movement_type,
      NEW.qty, NEW.unit_cost,
      CASE WHEN _is_return THEN 'supplier_return' ELSE 'purchase' END,
      'supplier_invoice', NEW.invoice_id,
      CASE WHEN _is_return THEN 'مرتجع بضاعة لمورد' ELSE 'دخول مخزون من فاتورة مشتريات' END
    );
  ELSIF NEW.material_id IS NOT NULL THEN
    INSERT INTO public.inventory_movements(material_id, type, qty, unit_cost, reason, source, source_id, note)
    VALUES (
      NEW.material_id,
      (CASE WHEN _is_return THEN 'supplier_return' ELSE 'production' END)::public.inventory_movement_type,
      NEW.qty, NEW.unit_cost,
      CASE WHEN _is_return THEN 'supplier_return' ELSE 'purchase' END,
      'supplier_invoice', NEW.invoice_id,
      CASE WHEN _is_return THEN 'مرتجع خامات لمورد' ELSE 'دخول خامات من فاتورة مشتريات' END
    );
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sii_update_material_avg_cost()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  cur_qty  numeric;
  cur_cost numeric;
  new_cost numeric;
  _is_return boolean;
BEGIN
  IF NEW.kind <> 'material' OR NEW.material_id IS NULL OR NEW.qty <= 0 THEN
    RETURN NEW;
  END IF;
  SELECT (type = 'return') INTO _is_return FROM public.supplier_invoices WHERE id = NEW.invoice_id;
  IF _is_return THEN
    RETURN NEW;
  END IF;
  SELECT coalesce(unit_cost,0) INTO cur_cost
    FROM public.materials WHERE id = NEW.material_id FOR UPDATE;
  SELECT coalesce(sum(sii.qty),0) INTO cur_qty
    FROM public.supplier_invoice_items sii
    JOIN public.supplier_invoices si ON si.id = sii.invoice_id
    WHERE sii.material_id = NEW.material_id AND sii.id <> NEW.id AND si.type = 'purchase';
  IF cur_qty + NEW.qty > 0 THEN
    new_cost := ((cur_qty * cur_cost) + (NEW.qty * NEW.unit_cost)) / (cur_qty + NEW.qty);
    UPDATE public.materials SET unit_cost = new_cost WHERE id = NEW.material_id;
  END IF;
  RETURN NEW;
END;
$function$;

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