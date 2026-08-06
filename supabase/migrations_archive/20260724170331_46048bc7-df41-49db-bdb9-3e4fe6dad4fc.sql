
-- Recreate as SECURITY DEFINER owned by supabase_admin equivalent
DROP FUNCTION IF EXISTS public.__admin_exec_sql(text);
CREATE OR REPLACE FUNCTION public.__admin_exec_sql(sql text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE r text;
BEGIN
  EXECUTE sql;
  RETURN current_user;
END;
$$;
-- Move ownership to postgres if possible, otherwise leave as-is
DO $$ BEGIN
  BEGIN
    EXECUTE 'ALTER FUNCTION public.__admin_exec_sql(text) OWNER TO postgres';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;
REVOKE ALL ON FUNCTION public.__admin_exec_sql(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.__admin_exec_sql(text) TO service_role;
SELECT pg_catalog.pg_get_userbyid(proowner) AS owner FROM pg_proc WHERE proname='__admin_exec_sql';
