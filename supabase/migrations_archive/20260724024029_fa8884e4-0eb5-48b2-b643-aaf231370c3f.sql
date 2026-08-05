
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'project_manager';

CREATE OR REPLACE FUNCTION public.is_project_manager(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = 'project_manager') $$;

GRANT EXECUTE ON FUNCTION public.is_project_manager(uuid) TO authenticated;

-- service_clients
DROP POLICY IF EXISTS "pm_all_service_clients" ON public.service_clients;
CREATE POLICY "pm_all_service_clients" ON public.service_clients FOR ALL TO authenticated
  USING (public.is_project_manager(auth.uid())) WITH CHECK (public.is_project_manager(auth.uid()));

-- service_projects
DROP POLICY IF EXISTS "pm_all_service_projects" ON public.service_projects;
CREATE POLICY "pm_all_service_projects" ON public.service_projects FOR ALL TO authenticated
  USING (public.is_project_manager(auth.uid())) WITH CHECK (public.is_project_manager(auth.uid()));

-- project_tasks
DROP POLICY IF EXISTS "pm_all_project_tasks" ON public.project_tasks;
CREATE POLICY "pm_all_project_tasks" ON public.project_tasks FOR ALL TO authenticated
  USING (public.is_project_manager(auth.uid())) WITH CHECK (public.is_project_manager(auth.uid()));

-- project_files
DROP POLICY IF EXISTS "pm_all_project_files" ON public.project_files;
CREATE POLICY "pm_all_project_files" ON public.project_files FOR ALL TO authenticated
  USING (public.is_project_manager(auth.uid())) WITH CHECK (public.is_project_manager(auth.uid()));

-- project_comments
DROP POLICY IF EXISTS "pm_all_project_comments" ON public.project_comments;
CREATE POLICY "pm_all_project_comments" ON public.project_comments FOR ALL TO authenticated
  USING (public.is_project_manager(auth.uid())) WITH CHECK (public.is_project_manager(auth.uid()));

-- project_revisions
DROP POLICY IF EXISTS "pm_all_project_revisions" ON public.project_revisions;
CREATE POLICY "pm_all_project_revisions" ON public.project_revisions FOR ALL TO authenticated
  USING (public.is_project_manager(auth.uid())) WITH CHECK (public.is_project_manager(auth.uid()));

-- project_private_notes
DROP POLICY IF EXISTS "pm_all_project_private_notes" ON public.project_private_notes;
CREATE POLICY "pm_all_project_private_notes" ON public.project_private_notes FOR ALL TO authenticated
  USING (public.is_project_manager(auth.uid())) WITH CHECK (public.is_project_manager(auth.uid()));

-- project_events
DROP POLICY IF EXISTS "pm_all_project_events" ON public.project_events;
CREATE POLICY "pm_all_project_events" ON public.project_events FOR ALL TO authenticated
  USING (public.is_project_manager(auth.uid())) WITH CHECK (public.is_project_manager(auth.uid()));
