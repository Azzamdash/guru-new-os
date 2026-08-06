CREATE OR REPLACE FUNCTION public.enforce_brand_share_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _brand_id uuid;
  _total numeric;
BEGIN
  _brand_id := COALESCE(NEW.brand_id, OLD.brand_id);
  IF _brand_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(sum(share_percentage), 0) INTO _total
    FROM public.investor_brand_shares
    WHERE brand_id = _brand_id;

  IF _total > 100.0001 THEN
    RAISE EXCEPTION 'إجمالي حصص هذا البراند سيتجاوز 100%% (الإجمالي: %)', round(_total, 2);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_brand_share_total ON public.investor_brand_shares;

CREATE CONSTRAINT TRIGGER trg_enforce_brand_share_total
AFTER INSERT OR UPDATE ON public.investor_brand_shares
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.enforce_brand_share_total();