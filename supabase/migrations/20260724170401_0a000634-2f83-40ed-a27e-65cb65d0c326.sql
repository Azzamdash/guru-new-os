
CREATE OR REPLACE FUNCTION public.__admin_exec_sql(sql text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
AS $f$ BEGIN EXECUTE sql; RETURN 'ok'; END; $f$;
REVOKE ALL ON FUNCTION public.__admin_exec_sql(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.__admin_exec_sql(text) TO service_role;
DO $$ BEGIN
  BEGIN EXECUTE 'ALTER FUNCTION public.__admin_exec_sql(text) OWNER TO postgres'; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;
