REVOKE ALL ON FUNCTION public.employees_guard_user_id_change() FROM PUBLIC, anon, authenticated;

-- app_user_connections: writes are service-role only (encrypted keys handled server-side)
REVOKE INSERT, UPDATE ON public.app_user_connections FROM anon, authenticated;
GRANT ALL ON public.app_user_connections TO service_role;

-- employee_requests: explicitly deny owner updates after submission
DROP POLICY IF EXISTS requests_owner_no_update ON public.employee_requests;
CREATE POLICY requests_owner_no_update
ON public.employee_requests
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'hr'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
  OR public.has_role(auth.uid(), 'hr'::app_role)
);