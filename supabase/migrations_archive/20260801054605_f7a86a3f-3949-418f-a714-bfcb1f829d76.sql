-- 1. employee_requests: always attributable to caller's employee record
DROP POLICY IF EXISTS requests_owner_insert ON public.employee_requests;
CREATE POLICY requests_owner_insert ON public.employee_requests
FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND status = 'pending'::employee_request_status
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
  AND employee_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_requests.employee_id
      AND e.user_id = (SELECT auth.uid())
  )
);

-- 2. sentinel/aggregate brand rows restricted to admin/manager
DROP POLICY IF EXISTS cash_daily_metrics_read ON public.cash_daily_metrics;
CREATE POLICY cash_daily_metrics_read ON public.cash_daily_metrics
FOR SELECT TO authenticated
USING (
  (can_read_page((SELECT auth.uid()), '/treasury') OR can_read_page((SELECT auth.uid()), '/reports/cash-flow'))
  AND (
    CASE WHEN brand_key = '00000000-0000-0000-0000-000000000000'::uuid
      THEN (SELECT has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'manager'::app_role))
      ELSE has_brand_access((SELECT auth.uid()), brand_key)
    END
  )
);

DROP POLICY IF EXISTS courier_financial_metrics_read ON public.courier_financial_metrics;
CREATE POLICY courier_financial_metrics_read ON public.courier_financial_metrics
FOR SELECT TO authenticated
USING (
  can_read_page((SELECT auth.uid()), '/treasury')
  AND (
    CASE WHEN brand_key = '00000000-0000-0000-0000-000000000000'::uuid
      THEN (SELECT has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'manager'::app_role))
      ELSE has_brand_access((SELECT auth.uid()), brand_key)
    END
  )
);

-- 3. app_user_connections: service-role only for writes; remove contradictory policy
DROP POLICY IF EXISTS "Block authenticated updates" ON public.app_user_connections;
DROP POLICY IF EXISTS "Block authenticated inserts" ON public.app_user_connections;
REVOKE INSERT, UPDATE ON public.app_user_connections FROM authenticated, anon;
GRANT SELECT, DELETE ON public.app_user_connections TO authenticated;
GRANT ALL ON public.app_user_connections TO service_role;

-- 4. unused dispatch helper no longer callable by signed-in users
REVOKE EXECUTE ON FUNCTION public.finalize_generic_order_dispatch(uuid, uuid, uuid, text, boolean, text) FROM authenticated, anon, PUBLIC;
