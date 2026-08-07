-- 1) app_user_connections: writes are service-role only (explicit fail-closed)
REVOKE INSERT, UPDATE ON public.app_user_connections FROM authenticated;
REVOKE INSERT, UPDATE ON public.app_user_connections FROM anon;
GRANT ALL ON public.app_user_connections TO service_role;

DROP POLICY IF EXISTS "auc_block_client_insert" ON public.app_user_connections;
CREATE POLICY "auc_block_client_insert" ON public.app_user_connections
  AS RESTRICTIVE FOR INSERT TO authenticated, anon WITH CHECK (false);

DROP POLICY IF EXISTS "auc_block_client_update" ON public.app_user_connections;
CREATE POLICY "auc_block_client_update" ON public.app_user_connections
  AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);

-- 2) employee_requests: sole update gate = admin/manager/hr (no self-approval)
DROP POLICY IF EXISTS "requests_owner_no_update" ON public.employee_requests;
CREATE POLICY "requests_owner_no_update" ON public.employee_requests
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    (SELECT public.has_role(auth.uid(), 'admin'::app_role))
    OR (SELECT public.has_role(auth.uid(), 'manager'::app_role))
    OR (SELECT public.has_role(auth.uid(), 'hr'::app_role))
  )
  WITH CHECK (
    (SELECT public.has_role(auth.uid(), 'admin'::app_role))
    OR (SELECT public.has_role(auth.uid(), 'manager'::app_role))
    OR (SELECT public.has_role(auth.uid(), 'hr'::app_role))
  );

-- 3) orders: dispatch claim columns are not directly writable by clients.
--    Only the SECURITY DEFINER dispatch functions (owned by postgres) may set them.
DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO cols
  FROM pg_attribute
  WHERE attrelid = 'public.orders'::regclass
    AND attnum > 0
    AND NOT attisdropped
    AND attname NOT IN ('dispatch_claim_token', 'dispatch_claimed_by', 'dispatch_claimed_at');

  EXECUTE 'REVOKE UPDATE ON public.orders FROM authenticated';
  EXECUTE 'REVOKE UPDATE ON public.orders FROM anon';
  EXECUTE format('GRANT UPDATE (%s) ON public.orders TO authenticated', cols);
END
$$;

GRANT ALL ON public.orders TO service_role;