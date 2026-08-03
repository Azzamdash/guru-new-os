-- 1) courier_charges: explicit scoped write policies
DROP POLICY IF EXISTS courier_charges_write ON public.courier_charges;
CREATE POLICY courier_charges_write ON public.courier_charges
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    public.can_write_page(auth.uid(), '/couriers')
    AND public.has_brand_access(auth.uid(), brand_id)
  )
  WITH CHECK (
    public.can_write_page(auth.uid(), '/couriers')
    AND public.has_brand_access(auth.uid(), brand_id)
  );

-- 2) employee_time_logs: brand-scoped read/write
DROP POLICY IF EXISTS "HR staff read time logs" ON public.employee_time_logs;
DROP POLICY IF EXISTS "HR staff write time logs" ON public.employee_time_logs;

CREATE POLICY "HR staff read time logs" ON public.employee_time_logs
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (
      (SELECT public.has_role(auth.uid(), 'admin'::app_role))
      OR (SELECT public.has_role(auth.uid(), 'manager'::app_role))
      OR (SELECT public.has_role(auth.uid(), 'accountant'::app_role))
      OR (SELECT public.has_role(auth.uid(), 'data_entry'::app_role))
      OR (SELECT public.has_role(auth.uid(), 'hr'::app_role))
    )
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employee_time_logs.employee_id
        AND public.has_brand_access(auth.uid(), e.brand_id)
    )
  );

CREATE POLICY "HR staff write time logs" ON public.employee_time_logs
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    (
      (SELECT public.has_role(auth.uid(), 'admin'::app_role))
      OR (SELECT public.has_role(auth.uid(), 'manager'::app_role))
      OR (SELECT public.has_role(auth.uid(), 'accountant'::app_role))
      OR (SELECT public.has_role(auth.uid(), 'data_entry'::app_role))
      OR (SELECT public.has_role(auth.uid(), 'hr'::app_role))
    )
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employee_time_logs.employee_id
        AND public.has_brand_access(auth.uid(), e.brand_id)
    )
  )
  WITH CHECK (
    (
      (SELECT public.has_role(auth.uid(), 'admin'::app_role))
      OR (SELECT public.has_role(auth.uid(), 'manager'::app_role))
      OR (SELECT public.has_role(auth.uid(), 'accountant'::app_role))
      OR (SELECT public.has_role(auth.uid(), 'data_entry'::app_role))
      OR (SELECT public.has_role(auth.uid(), 'hr'::app_role))
    )
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employee_time_logs.employee_id
        AND public.has_brand_access(auth.uid(), e.brand_id)
    )
  );

-- 3) role helpers: deny when there is no authenticated user, unless a trusted
--    privileged backend role (service_role/postgres) is executing.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL
         AND coalesce(current_setting('role', true), '') NOT IN ('service_role','postgres','supabase_admin')
      THEN false
    WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
  END
$$;

CREATE OR REPLACE FUNCTION public.is_writer(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL
         AND coalesce(current_setting('role', true), '') NOT IN ('service_role','postgres','supabase_admin')
      THEN false
    WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role IN ('admin','manager','data_entry')
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.is_global_reader(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL
         AND coalesce(current_setting('role', true), '') NOT IN ('service_role','postgres','supabase_admin')
      THEN false
    WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','manager','accountant'))
  END
$$;