
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cogs_percent numeric;
ALTER TABLE public.brands   ADD COLUMN IF NOT EXISTS cogs_percent_default numeric;

CREATE OR REPLACE FUNCTION public.product_cogs(_product_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(
    (SELECT cogs_override FROM public.products WHERE id = _product_id AND cogs_override IS NOT NULL),
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
$function$;
