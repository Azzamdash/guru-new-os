GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_brand_access(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_access_customer(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_access_service_project(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_section_access(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_project_manager(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_writer(uuid) TO service_role;