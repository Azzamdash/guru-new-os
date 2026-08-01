GRANT EXECUTE ON FUNCTION public.require_page_read(text) TO authenticated;
REVOKE ALL ON FUNCTION public.require_page_read(text) FROM anon, PUBLIC;