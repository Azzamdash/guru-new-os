-- 1) Materials get stock tracking
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS on_hand_qty numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reorder_point numeric NOT NULL DEFAULT 0;

-- 2) Movements can reference materials + carry provenance
ALTER TABLE public.inventory_movements
  ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS material_id uuid REFERENCES public.materials(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS idx_im_material ON public.inventory_movements(material_id);
CREATE INDEX IF NOT EXISTS idx_im_occurred ON public.inventory_movements(occurred_at DESC);

CREATE OR REPLACE FUNCTION public.im_validate_target()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.product_id IS NULL) = (NEW.material_id IS NULL) THEN
    RAISE EXCEPTION 'inventory movement must reference exactly one of product_id / material_id';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_im_validate_target ON public.inventory_movements;
CREATE TRIGGER trg_im_validate_target
BEFORE INSERT OR UPDATE ON public.inventory_movements
FOR EACH ROW EXECUTE FUNCTION public.im_validate_target();

-- 3) Stock + weighted average cost for products AND materials
CREATE OR REPLACE FUNCTION public.im_update_moving_avg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      INTO cur_qty, cur_cost FROM public.products WHERE id = NEW.product_id;
    new_qty := coalesce(cur_qty,0) + delta;
    IF delta > 0 AND NEW.unit_cost IS NOT NULL AND new_qty > 0 THEN
      new_cost := ((greatest(cur_qty,0) * cur_cost) + (delta * NEW.unit_cost)) / new_qty;
      UPDATE public.products SET moving_avg_cost = new_cost, on_hand_qty = new_qty WHERE id = NEW.product_id;
    ELSE
      UPDATE public.products SET on_hand_qty = new_qty WHERE id = NEW.product_id;
    END IF;
  ELSIF NEW.material_id IS NOT NULL THEN
    SELECT coalesce(on_hand_qty,0), coalesce(unit_cost,0)
      INTO cur_qty, cur_cost FROM public.materials WHERE id = NEW.material_id;
    new_qty := coalesce(cur_qty,0) + delta;
    IF delta > 0 AND NEW.unit_cost IS NOT NULL AND new_qty > 0 THEN
      new_cost := ((greatest(cur_qty,0) * cur_cost) + (delta * NEW.unit_cost)) / new_qty;
      UPDATE public.materials SET unit_cost = new_cost, on_hand_qty = new_qty WHERE id = NEW.material_id;
    ELSE
      UPDATE public.materials SET on_hand_qty = new_qty WHERE id = NEW.material_id;
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- 4) Production consumes the product recipe (BOM) automatically
CREATE OR REPLACE FUNCTION public.im_consume_bom()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type::text <> 'production' OR NEW.product_id IS NULL OR NEW.source = 'bom' OR NEW.qty <= 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.inventory_movements
    (material_id, type, qty, occurred_at, reason, source, source_id, note, created_by)
  SELECT pm.material_id, 'sale', pm.qty_per_unit * NEW.qty, NEW.occurred_at,
         'production_consumption', 'bom', NEW.id,
         'استهلاك خامات من أمر إنتاج', NEW.created_by
  FROM public.product_materials pm
  WHERE pm.product_id = NEW.product_id AND pm.qty_per_unit > 0;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_im_consume_bom ON public.inventory_movements;
CREATE TRIGGER trg_im_consume_bom
AFTER INSERT ON public.inventory_movements
FOR EACH ROW EXECUTE FUNCTION public.im_consume_bom();

-- 5) Purchases increase stock
CREATE OR REPLACE FUNCTION public.sii_stock_in()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.qty IS NULL OR NEW.qty <= 0 THEN RETURN NEW; END IF;

  IF NEW.product_id IS NOT NULL THEN
    INSERT INTO public.inventory_movements(product_id, type, qty, unit_cost, reason, source, source_id, note)
    VALUES (NEW.product_id, 'production', NEW.qty, NEW.unit_cost, 'purchase', 'supplier_invoice', NEW.invoice_id, 'دخول مخزون من فاتورة مشتريات');
  ELSIF NEW.material_id IS NOT NULL THEN
    INSERT INTO public.inventory_movements(material_id, type, qty, unit_cost, reason, source, source_id, note)
    VALUES (NEW.material_id, 'production', NEW.qty, NEW.unit_cost, 'purchase', 'supplier_invoice', NEW.invoice_id, 'دخول خامات من فاتورة مشتريات');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sii_stock_in ON public.supplier_invoice_items;
CREATE TRIGGER trg_sii_stock_in
AFTER INSERT ON public.supplier_invoice_items
FOR EACH ROW EXECUTE FUNCTION public.sii_stock_in();

-- 6) Confirming a customer order deducts finished products
CREATE OR REPLACE FUNCTION public.orders_deduct_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_offline boolean;
BEGIN
  IF NEW.confirmation_status IS DISTINCT FROM 'confirmed'
     OR OLD.confirmation_status IS NOT DISTINCT FROM NEW.confirmation_status THEN
    RETURN NEW;
  END IF;

  SELECT (b.type::text = 'offline_branch') INTO is_offline
  FROM public.brands b WHERE b.id = NEW.brand_id;
  IF coalesce(is_offline, false) THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM public.inventory_movements
             WHERE source = 'order' AND source_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.inventory_movements(product_id, type, qty, occurred_at, reason, source, source_id, note)
  SELECT oi.product_id, 'sale', oi.qty, NEW.occurred_at::date, 'order_confirmed', 'order', NEW.id,
         'خصم مخزون عند تأكيد أوردر ' || coalesce(NEW.external_order_number, '')
  FROM public.order_items oi
  WHERE oi.order_id = NEW.id AND oi.product_id IS NOT NULL AND oi.qty > 0;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_orders_deduct_stock ON public.orders;
CREATE TRIGGER trg_orders_deduct_stock
AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_deduct_stock();