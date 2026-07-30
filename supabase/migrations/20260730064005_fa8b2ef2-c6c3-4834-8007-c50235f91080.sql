REVOKE ALL ON FUNCTION public.bh_is_manager(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bh_can_access_brand(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bh_is_manager(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bh_can_access_brand(uuid, uuid) TO authenticated, service_role;