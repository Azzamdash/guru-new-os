CREATE OR REPLACE FUNCTION public.im_update_moving_avg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cur_qty  numeric;
  cur_cost numeric;
  delta    numeric;
  new_qty  numeric;
  new_cost numeric;
  is_in    boolean;
BEGIN
  is_in := NEW.type::text IN ('production', 'return');

  IF NEW.type::text = 'adjustment' THEN
    delta := NEW.qty;           -- signed
  ELSIF is_in THEN
    delta := abs(NEW.qty);
  ELSE
    delta := -abs(NEW.qty);
  END IF;

  IF NEW.product_id IS NOT NULL THEN
    SELECT coalesce(on_hand_qty,0), coalesce(moving_avg_cost,0)
      INTO cur_qty, cur_cost FROM public.products WHERE id = NEW.product_id FOR UPDATE;
    new_qty := coalesce(cur_qty,0) + delta;
    IF delta > 0 AND NEW.unit_cost IS NOT NULL AND new_qty > 0 THEN
      new_cost := ((greatest(cur_qty,0) * cur_cost) + (delta * NEW.unit_cost)) / new_qty;
      UPDATE public.products SET moving_avg_cost = new_cost, on_hand_qty = new_qty WHERE id = NEW.product_id;
    ELSE
      UPDATE public.products SET on_hand_qty = new_qty WHERE id = NEW.product_id;
    END IF;
  ELSIF NEW.material_id IS NOT NULL THEN
    SELECT coalesce(on_hand_qty,0), coalesce(unit_cost,0)
      INTO cur_qty, cur_cost FROM public.materials WHERE id = NEW.material_id FOR UPDATE;
    new_qty := coalesce(cur_qty,0) + delta;
    IF delta > 0 AND NEW.unit_cost IS NOT NULL AND new_qty > 0 THEN
      new_cost := ((greatest(cur_qty,0) * cur_cost) + (delta * NEW.unit_cost)) / new_qty;
      UPDATE public.materials SET unit_cost = new_cost, on_hand_qty = new_qty WHERE id = NEW.material_id;
    ELSE
      UPDATE public.materials SET on_hand_qty = new_qty WHERE id = NEW.material_id;
    END IF;
  END IF;

  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.sii_update_material_avg_cost()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  cur_qty  numeric;
  cur_cost numeric;
  new_cost numeric;
BEGIN
  IF NEW.kind <> 'material' OR NEW.material_id IS NULL OR NEW.qty <= 0 THEN
    RETURN NEW;
  END IF;

  -- lock the material row first so concurrent invoice lines serialize here
  SELECT coalesce(unit_cost,0) INTO cur_cost
    FROM public.materials WHERE id = NEW.material_id FOR UPDATE;

  -- naive on-hand = sum of purchased qty (materials have no movement log yet)
  SELECT coalesce(sum(qty),0) INTO cur_qty
    FROM public.supplier_invoice_items
    WHERE material_id = NEW.material_id AND id <> NEW.id;

  IF cur_qty + NEW.qty > 0 THEN
    new_cost := ((cur_qty * cur_cost) + (NEW.qty * NEW.unit_cost)) / (cur_qty + NEW.qty);
    UPDATE public.materials SET unit_cost = new_cost WHERE id = NEW.material_id;
  END IF;

  RETURN NEW;
END;
$function$;