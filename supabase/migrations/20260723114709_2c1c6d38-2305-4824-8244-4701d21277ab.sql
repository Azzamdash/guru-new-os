-- 1) Add unit_cost to inventory_movements (nullable; only meaningful for stock-in)
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS unit_cost numeric;

-- 2) Add moving average cost + on-hand qty on products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS moving_avg_cost numeric,
  ADD COLUMN IF NOT EXISTS on_hand_qty numeric NOT NULL DEFAULT 0;

-- 3) Trigger to maintain product moving-avg cost and on-hand qty
CREATE OR REPLACE FUNCTION public.im_update_moving_avg()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cur_qty  numeric;
  cur_cost numeric;
  new_qty  numeric;
  new_cost numeric;
  is_in    boolean;
BEGIN
  SELECT coalesce(on_hand_qty,0), coalesce(moving_avg_cost,0)
    INTO cur_qty, cur_cost
    FROM public.products WHERE id = NEW.product_id;

  is_in := NEW.type::text IN ('production','purchase','stock_in','adjustment_in','return_in');

  IF is_in AND NEW.unit_cost IS NOT NULL AND NEW.qty > 0 THEN
    -- weighted average
    new_qty  := cur_qty + NEW.qty;
    new_cost := CASE WHEN new_qty > 0
                     THEN ((cur_qty * cur_cost) + (NEW.qty * NEW.unit_cost)) / new_qty
                     ELSE NEW.unit_cost END;
    UPDATE public.products
      SET moving_avg_cost = new_cost,
          on_hand_qty     = new_qty
      WHERE id = NEW.product_id;
  ELSIF is_in THEN
    UPDATE public.products SET on_hand_qty = cur_qty + NEW.qty WHERE id = NEW.product_id;
  ELSE
    -- outflow (sale/return_out/adjustment_out/etc): cost unchanged, qty decreases
    UPDATE public.products SET on_hand_qty = cur_qty - NEW.qty WHERE id = NEW.product_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_im_update_moving_avg ON public.inventory_movements;
CREATE TRIGGER trg_im_update_moving_avg
  AFTER INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.im_update_moving_avg();

-- 4) Trigger to maintain material weighted-avg unit_cost from supplier invoice items
CREATE OR REPLACE FUNCTION public.sii_update_material_avg_cost()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cur_qty  numeric;
  cur_cost numeric;
  new_cost numeric;
BEGIN
  IF NEW.kind <> 'material' OR NEW.material_id IS NULL OR NEW.qty <= 0 THEN
    RETURN NEW;
  END IF;

  -- naive on-hand = sum of purchased qty (materials have no movement log yet)
  SELECT coalesce(sum(qty),0) INTO cur_qty
    FROM public.supplier_invoice_items
    WHERE material_id = NEW.material_id AND id <> NEW.id;

  SELECT coalesce(unit_cost,0) INTO cur_cost
    FROM public.materials WHERE id = NEW.material_id;

  IF cur_qty + NEW.qty > 0 THEN
    new_cost := ((cur_qty * cur_cost) + (NEW.qty * NEW.unit_cost)) / (cur_qty + NEW.qty);
    UPDATE public.materials SET unit_cost = new_cost WHERE id = NEW.material_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sii_update_material_avg_cost ON public.supplier_invoice_items;
CREATE TRIGGER trg_sii_update_material_avg_cost
  AFTER INSERT ON public.supplier_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.sii_update_material_avg_cost();

-- 5) Update product_cogs to prefer moving_avg_cost when present
CREATE OR REPLACE FUNCTION public.product_cogs(_product_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT cogs_override FROM public.products WHERE id = _product_id AND cogs_override IS NOT NULL),
    (SELECT moving_avg_cost FROM public.products WHERE id = _product_id AND moving_avg_cost IS NOT NULL AND moving_avg_cost > 0),
    (SELECT p.sell_price * (p.cogs_percent/100.0)
       FROM public.products p
      WHERE p.id = _product_id AND p.cogs_percent IS NOT NULL),
    (SELECT p.sell_price * (b.cogs_percent_default/100.0)
       FROM public.products p JOIN public.brands b ON b.id = p.brand_id
      WHERE p.id = _product_id AND b.cogs_percent_default IS NOT NULL),
    coalesce((
      SELECT sum(pm.qty_per_unit * m.unit_cost)
      FROM public.product_materials pm
      JOIN public.materials m ON m.id = pm.material_id
      WHERE pm.product_id = _product_id
    ), 0)
  );
$$;

-- 6) Backfill on_hand_qty from existing movements (best-effort; treat inflow types as in)
UPDATE public.products p SET on_hand_qty = coalesce(x.on_hand,0)
FROM (
  SELECT product_id,
    sum(CASE WHEN type::text IN ('production','purchase','stock_in','adjustment_in','return_in')
             THEN qty ELSE -qty END) AS on_hand
  FROM public.inventory_movements
  GROUP BY product_id
) x
WHERE x.product_id = p.id;