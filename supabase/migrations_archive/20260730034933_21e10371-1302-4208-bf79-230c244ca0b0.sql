CREATE OR REPLACE FUNCTION public.__tmp_apply_migration(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  EXECUTE sql;
END;
$fn$;

REVOKE ALL ON FUNCTION public.__tmp_apply_migration(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.__tmp_apply_migration(text) TO sandbox_exec;