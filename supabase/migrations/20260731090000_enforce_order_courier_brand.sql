-- Enforce courier/brand consistency at the database boundary.

CREATE OR REPLACE FUNCTION public.enforce_order_courier_brand()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.courier_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.couriers c
    WHERE c.id = NEW.courier_id
      AND (c.brand_id IS NULL OR c.brand_id = NEW.brand_id)
  ) THEN
    RAISE EXCEPTION 'Courier % is not available for order brand %', NEW.courier_id, NEW.brand_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_enforce_courier_brand ON public.orders;
CREATE TRIGGER orders_enforce_courier_brand
BEFORE INSERT OR UPDATE OF courier_id, brand_id
ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_order_courier_brand();

CREATE OR REPLACE FUNCTION public.prevent_invalid_courier_brand_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.brand_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.courier_id = NEW.id
      AND o.brand_id <> NEW.brand_id
  ) THEN
    RAISE EXCEPTION 'Courier % is already assigned to orders from another brand', NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS couriers_prevent_invalid_brand_change ON public.couriers;
CREATE TRIGGER couriers_prevent_invalid_brand_change
BEFORE UPDATE OF brand_id
ON public.couriers
FOR EACH ROW EXECUTE FUNCTION public.prevent_invalid_courier_brand_change();

REVOKE ALL ON FUNCTION public.enforce_order_courier_brand() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_invalid_courier_brand_change() FROM PUBLIC;
