CREATE OR REPLACE FUNCTION public.has_brand_access(_user_id uuid, _brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(_user_id,'admin')
    OR public.has_role(_user_id,'manager')
    OR EXISTS (SELECT 1 FROM public.user_brand_access WHERE user_id = _user_id AND brand_id = _brand_id);
$function$;