-- Make the supplier_invoice_items stock-in trigger type-aware: a 'return'
-- invoice should decrement stock (goods leaving to the supplier), not
-- increment it. Purchase invoices (the default / all existing behavior) are
-- unchanged.
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
      CASE WHEN _is_return THEN 'supplier_return' ELSE 'production' END,
      NEW.qty, NEW.unit_cost,
      CASE WHEN _is_return THEN 'supplier_return' ELSE 'purchase' END,
      'supplier_invoice', NEW.invoice_id,
      CASE WHEN _is_return THEN 'مرتجع بضاعة لمورد' ELSE 'دخول مخزون من فاتورة مشتريات' END
    );
  ELSIF NEW.material_id IS NOT NULL THEN
    INSERT INTO public.inventory_movements(material_id, type, qty, unit_cost, reason, source, source_id, note)
    VALUES (
      NEW.material_id,
      CASE WHEN _is_return THEN 'supplier_return' ELSE 'production' END,
      NEW.qty, NEW.unit_cost,
      CASE WHEN _is_return THEN 'supplier_return' ELSE 'purchase' END,
      'supplier_invoice', NEW.invoice_id,
      CASE WHEN _is_return THEN 'مرتجع خامات لمورد' ELSE 'دخول خامات من فاتورة مشتريات' END
    );
  END IF;
  RETURN NEW;
END $$;

-- Exclude return items from the naive materials weighted-average-cost sum:
-- returned qty didn't come in at a purchase cost and shouldn't dilute it.
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

  -- lock the material row first so concurrent invoice lines serialize here
  SELECT coalesce(unit_cost,0) INTO cur_cost
    FROM public.materials WHERE id = NEW.material_id FOR UPDATE;

  -- naive on-hand = sum of purchased qty (materials have no movement log yet),
  -- excluding return invoices so they don't dilute the average cost.
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
