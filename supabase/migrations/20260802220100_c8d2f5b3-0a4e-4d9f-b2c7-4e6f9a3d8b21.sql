-- Teach the moving-average trigger about transfer_in (treat like production/return —
-- an inbound movement that increases stock and can carry a weighted-average cost).
-- transfer_out needs no special-casing: it already falls into the existing
-- "not adjustment, not is_in" branch that decrements stock, same as 'sale'.
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
  is_in := NEW.type::text IN ('production', 'return', 'transfer_in', 'purchase_receipt');

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

-- Atomic stock transfer between two products (same brand or different brands —
-- offline branches are brands too, so this covers both cases the app asked for).
-- Inserts a transfer_out row on the source and a transfer_in row on the
-- destination, both tagged with the same transfer_group, in one transaction.
-- Product rows are locked in a fixed (id-ascending) order regardless of
-- transfer direction to avoid deadlocking against a concurrent reverse transfer.
CREATE OR REPLACE FUNCTION public.transfer_stock(
  _from_product_id uuid,
  _to_product_id uuid,
  _qty numeric,
  _note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _group uuid := gen_random_uuid();
  _from_qty numeric;
  _to_exists boolean;
BEGIN
  IF NOT (public.has_role(_uid, 'admin'::app_role) OR public.has_role(_uid, 'manager'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _qty IS NULL OR _qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;
  IF _from_product_id = _to_product_id THEN
    RAISE EXCEPTION 'Source and destination product cannot be the same';
  END IF;

  IF _from_product_id < _to_product_id THEN
    SELECT on_hand_qty INTO _from_qty FROM public.products WHERE id = _from_product_id FOR UPDATE;
    SELECT true INTO _to_exists FROM public.products WHERE id = _to_product_id FOR UPDATE;
  ELSE
    SELECT true INTO _to_exists FROM public.products WHERE id = _to_product_id FOR UPDATE;
    SELECT on_hand_qty INTO _from_qty FROM public.products WHERE id = _from_product_id FOR UPDATE;
  END IF;

  IF _from_qty IS NULL THEN
    RAISE EXCEPTION 'Source product not found';
  END IF;
  IF _to_exists IS NULL THEN
    RAISE EXCEPTION 'Destination product not found';
  END IF;
  IF _from_qty < _qty THEN
    RAISE EXCEPTION 'Insufficient stock: available %, requested %', _from_qty, _qty;
  END IF;

  INSERT INTO public.inventory_movements (product_id, type, qty, occurred_at, note, source, transfer_group)
  VALUES (_from_product_id, 'transfer_out', _qty, (now() AT TIME ZONE 'Africa/Cairo')::date, _note, 'transfer', _group);

  INSERT INTO public.inventory_movements (product_id, type, qty, occurred_at, note, source, transfer_group)
  VALUES (_to_product_id, 'transfer_in', _qty, (now() AT TIME ZONE 'Africa/Cairo')::date, _note, 'transfer', _group);

  RETURN _group;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_stock(uuid, uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_stock(uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_stock(uuid, uuid, numeric, text) TO service_role;
