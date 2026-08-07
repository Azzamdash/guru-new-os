DROP POLICY IF EXISTS "requests_hr_read_all" ON public.employee_requests;
CREATE POLICY "requests_hr_read_all" ON public.employee_requests FOR SELECT TO authenticated
USING (
  (SELECT public.has_role(auth.uid(), 'admin'::app_role))
  OR (SELECT public.has_role(auth.uid(), 'manager'::app_role))
  OR (SELECT public.has_role(auth.uid(), 'hr'::app_role))
);

DROP POLICY IF EXISTS "requests_hr_update_all" ON public.employee_requests;
CREATE POLICY "requests_hr_update_all" ON public.employee_requests FOR UPDATE TO authenticated
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

DROP POLICY IF EXISTS "HR staff read time logs" ON public.employee_time_logs;
CREATE POLICY "HR staff read time logs" ON public.employee_time_logs FOR SELECT TO authenticated
USING (
  (SELECT public.has_role(auth.uid(), 'admin'::app_role))
  OR (SELECT public.has_role(auth.uid(), 'manager'::app_role))
  OR (SELECT public.has_role(auth.uid(), 'accountant'::app_role))
  OR (SELECT public.has_role(auth.uid(), 'data_entry'::app_role))
  OR (SELECT public.has_role(auth.uid(), 'hr'::app_role))
);

DROP POLICY IF EXISTS "HR staff write time logs" ON public.employee_time_logs;
CREATE POLICY "HR staff write time logs" ON public.employee_time_logs FOR ALL TO authenticated
USING (
  (SELECT public.has_role(auth.uid(), 'admin'::app_role))
  OR (SELECT public.has_role(auth.uid(), 'manager'::app_role))
  OR (SELECT public.has_role(auth.uid(), 'accountant'::app_role))
  OR (SELECT public.has_role(auth.uid(), 'data_entry'::app_role))
  OR (SELECT public.has_role(auth.uid(), 'hr'::app_role))
)
WITH CHECK (
  (SELECT public.has_role(auth.uid(), 'admin'::app_role))
  OR (SELECT public.has_role(auth.uid(), 'manager'::app_role))
  OR (SELECT public.has_role(auth.uid(), 'accountant'::app_role))
  OR (SELECT public.has_role(auth.uid(), 'data_entry'::app_role))
  OR (SELECT public.has_role(auth.uid(), 'hr'::app_role))
);

DROP POLICY IF EXISTS "prod_tasks_manage_all" ON public.production_tasks;
CREATE POLICY "prod_tasks_manage_all" ON public.production_tasks FOR ALL TO authenticated
USING (
  (SELECT public.has_role(auth.uid(), 'admin'::app_role))
  OR (SELECT public.has_role(auth.uid(), 'manager'::app_role))
  OR (SELECT public.has_role(auth.uid(), 'production_manager'::app_role))
)
WITH CHECK (
  (SELECT public.has_role(auth.uid(), 'admin'::app_role))
  OR (SELECT public.has_role(auth.uid(), 'manager'::app_role))
  OR (SELECT public.has_role(auth.uid(), 'production_manager'::app_role))
);