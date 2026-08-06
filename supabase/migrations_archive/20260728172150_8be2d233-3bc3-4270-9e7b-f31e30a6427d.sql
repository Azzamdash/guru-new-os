-- 1) Trigger to keep order_items.unit_cost + orders.cost_total in sync with product_cogs()
CREATE OR REPLACE FUNCTION public.sync_order_item_cost()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost numeric;
BEGIN
  IF NEW.product_id IS NOT NULL AND (NEW.unit_cost IS NULL OR NEW.unit_cost = 0) THEN
    v_cost := public.product_cogs(NEW.product_id);
    NEW.unit_cost := coalesce(v_cost, 0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_order_item_cost ON public.order_items;
CREATE TRIGGER trg_sync_order_item_cost
BEFORE INSERT OR UPDATE OF product_id, unit_cost ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.sync_order_item_cost();

-- 2) Trigger to roll order_items into orders.cost_total
CREATE OR REPLACE FUNCTION public.sync_order_cost_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order uuid;
  v_total numeric;
BEGIN
  v_order := COALESCE(NEW.order_id, OLD.order_id);
  SELECT COALESCE(SUM(qty * COALESCE(unit_cost, 0)), 0) INTO v_total
  FROM public.order_items WHERE order_id = v_order;
  UPDATE public.orders SET cost_total = v_total WHERE id = v_order;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_order_cost_total ON public.order_items;
CREATE TRIGGER trg_sync_order_cost_total
AFTER INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.sync_order_cost_total();

-- 3) Backfill existing rows: recompute unit_cost for items with 0/NULL, then roll into orders
UPDATE public.order_items oi
SET unit_cost = public.product_cogs(oi.product_id)
WHERE oi.product_id IS NOT NULL
  AND (oi.unit_cost IS NULL OR oi.unit_cost = 0)
  AND COALESCE(public.product_cogs(oi.product_id), 0) > 0;

UPDATE public.orders o
SET cost_total = sub.total
FROM (
  SELECT order_id, COALESCE(SUM(qty * COALESCE(unit_cost, 0)), 0) AS total
  FROM public.order_items GROUP BY order_id
) sub
WHERE sub.order_id = o.id AND o.cost_total IS DISTINCT FROM sub.total;