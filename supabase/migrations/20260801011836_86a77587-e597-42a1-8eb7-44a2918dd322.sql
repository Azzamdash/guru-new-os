CREATE OR REPLACE FUNCTION public.__tmp_apply_migration(sql text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN EXECUTE sql; END $$;