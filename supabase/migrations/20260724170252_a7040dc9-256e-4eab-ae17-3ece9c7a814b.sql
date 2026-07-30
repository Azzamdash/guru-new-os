
CREATE OR REPLACE FUNCTION public.__admin_exec_sql(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  EXECUTE sql;
END;
$$;
REVOKE ALL ON FUNCTION public.__admin_exec_sql(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.__admin_exec_sql(text) TO service_role;
