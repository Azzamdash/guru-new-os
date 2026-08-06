REVOKE ALL ON FUNCTION public.enforce_brand_share_total() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_brand_share_total() TO service_role;