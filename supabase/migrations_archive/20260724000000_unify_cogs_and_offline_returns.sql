-- A1: Batched COGS lookup so app code can fetch product_cogs() for many products in one round-trip.
CREATE OR REPLACE FUNCTION public.products_cogs_map(_ids uuid[])
RETURNS TABLE(product_id uuid, cogs numeric)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT p.id AS product_id, public.product_cogs(p.id) AS cogs
  FROM public.products p
  WHERE p.id = ANY(_ids);
$function$;

GRANT EXECUTE ON FUNCTION public.products_cogs_map(uuid[]) TO authenticated;

-- A3: Offline-branch inventory trigger must also handle returns (increase stock) and
-- must not mislabel return-driven movements as 'sale' outflow.
CREATE OR REPLACE FUNCTION public.offline_branch_deduct_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_offline boolean;
  inv_type text;
BEGIN
  IF NEW.product_id IS NULL OR NEW.qty IS NULL OR NEW.qty <= 0 THEN
    RETURN NEW;
  END IF;
  SELECT (b.type::text = 'offline_branch'), si.type::text
    INTO is_offline, inv_type
  FROM public.sales_invoices si
  JOIN public.brands b ON b.id = si.brand_id
  WHERE si.id = NEW.invoice_id;

  IF COALESCE(is_offline, false) THEN
    IF inv_type = 'return' THEN
      -- A3: returns increase inventory back (offline branch only)
      INSERT INTO public.inventory_movements(product_id, type, qty, note)
        VALUES (NEW.product_id, 'return_in', NEW.qty, 'POS return');
    ELSE
      INSERT INTO public.inventory_movements(product_id, type, qty, note)
        VALUES (NEW.product_id, 'sale', NEW.qty, 'POS sale');
    END IF;
  END IF;
  RETURN NEW;
END $function$;
