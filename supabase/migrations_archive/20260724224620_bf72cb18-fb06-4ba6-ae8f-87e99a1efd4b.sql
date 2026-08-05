
-- 1) employees: add optional link to auth user, and tighten INSERT/DELETE to admin/manager only
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS employees_user_id_key ON public.employees(user_id) WHERE user_id IS NOT NULL;

DROP POLICY IF EXISTS "employees write writer" ON public.employees;
DROP POLICY IF EXISTS "employees update by writer" ON public.employees;
CREATE POLICY "employees update by writer" ON public.employees
  FOR UPDATE TO authenticated
  USING (public.is_writer(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id))
  WITH CHECK (public.is_writer(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id));
DROP POLICY IF EXISTS "employees insert admin manager" ON public.employees;
CREATE POLICY "employees insert admin manager" ON public.employees
  FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
              AND public.has_brand_access(auth.uid(), brand_id));
DROP POLICY IF EXISTS "employees delete admin manager" ON public.employees;
CREATE POLICY "employees delete admin manager" ON public.employees
  FOR DELETE TO authenticated
  USING ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
         AND public.has_brand_access(auth.uid(), brand_id));

-- 2) employee_requests: verify employee_id belongs to the requesting user (or is NULL)
DROP POLICY IF EXISTS "requests_owner_insert" ON public.employee_requests;
CREATE POLICY "requests_owner_insert" ON public.employee_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'::employee_request_status
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND (
      employee_id IS NULL
      OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
    )
  );

-- 3) Scope is_project_manager overrides to brand access, not unrestricted
DROP POLICY IF EXISTS pm_all_service_projects ON public.service_projects;
CREATE POLICY pm_all_service_projects ON public.service_projects
  FOR ALL TO authenticated
  USING (public.is_project_manager(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id))
  WITH CHECK (public.is_project_manager(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id));

DROP POLICY IF EXISTS pm_all_service_clients ON public.service_clients;
CREATE POLICY pm_all_service_clients ON public.service_clients
  FOR ALL TO authenticated
  USING (public.is_project_manager(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id))
  WITH CHECK (public.is_project_manager(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id));

DROP POLICY IF EXISTS pm_all_project_events ON public.project_events;
CREATE POLICY pm_all_project_events ON public.project_events
  FOR ALL TO authenticated
  USING (public.is_project_manager(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id))
  WITH CHECK (public.is_project_manager(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id));

DROP POLICY IF EXISTS pm_all_project_files ON public.project_files;
CREATE POLICY pm_all_project_files ON public.project_files
  FOR ALL TO authenticated
  USING (public.is_project_manager(auth.uid()) AND public.can_access_service_project(auth.uid(), project_id))
  WITH CHECK (public.is_project_manager(auth.uid()) AND public.can_access_service_project(auth.uid(), project_id));

DROP POLICY IF EXISTS pm_all_project_tasks ON public.project_tasks;
CREATE POLICY pm_all_project_tasks ON public.project_tasks
  FOR ALL TO authenticated
  USING (public.is_project_manager(auth.uid()) AND public.can_access_service_project(auth.uid(), project_id))
  WITH CHECK (public.is_project_manager(auth.uid()) AND public.can_access_service_project(auth.uid(), project_id));

DROP POLICY IF EXISTS pm_all_project_revisions ON public.project_revisions;
CREATE POLICY pm_all_project_revisions ON public.project_revisions
  FOR ALL TO authenticated
  USING (public.is_project_manager(auth.uid()) AND public.can_access_service_project(auth.uid(), project_id))
  WITH CHECK (public.is_project_manager(auth.uid()) AND public.can_access_service_project(auth.uid(), project_id));

DROP POLICY IF EXISTS pm_all_project_comments ON public.project_comments;
CREATE POLICY pm_all_project_comments ON public.project_comments
  FOR ALL TO authenticated
  USING (public.is_project_manager(auth.uid()) AND public.can_access_service_project(auth.uid(), project_id))
  WITH CHECK (public.is_project_manager(auth.uid()) AND public.can_access_service_project(auth.uid(), project_id));

DROP POLICY IF EXISTS pm_all_project_private_notes ON public.project_private_notes;
CREATE POLICY pm_all_project_private_notes ON public.project_private_notes
  FOR ALL TO authenticated
  USING (public.is_project_manager(auth.uid()) AND public.can_access_service_project(auth.uid(), project_id))
  WITH CHECK (public.is_project_manager(auth.uid()) AND public.can_access_service_project(auth.uid(), project_id));
