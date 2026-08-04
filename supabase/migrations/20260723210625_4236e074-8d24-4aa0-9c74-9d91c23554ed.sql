
-- Extend service_projects
ALTER TABLE public.service_projects
  ADD COLUMN IF NOT EXISTS deadline date,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS progress_pct int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pm_user_id uuid,
  ADD COLUMN IF NOT EXISTS description text;

-- Helper: brand access for a project
CREATE OR REPLACE FUNCTION public.can_access_service_project(_user_id uuid, _project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.service_projects p
    WHERE p.id = _project_id AND public.has_brand_access(_user_id, p.brand_id)
  );
$$;

-- Project tasks
CREATE TABLE IF NOT EXISTS public.project_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.service_projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'todo', -- todo | in_progress | review | done
  assignee_id uuid,
  due_date date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_tasks TO authenticated;
GRANT ALL ON public.project_tasks TO service_role;
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pt_read" ON public.project_tasks;
CREATE POLICY "pt_read" ON public.project_tasks FOR SELECT TO authenticated
  USING (public.can_access_service_project(auth.uid(), project_id));
DROP POLICY IF EXISTS "pt_write" ON public.project_tasks;
CREATE POLICY "pt_write" ON public.project_tasks FOR ALL TO authenticated
  USING (public.can_access_service_project(auth.uid(), project_id))
  WITH CHECK (public.can_access_service_project(auth.uid(), project_id));
CREATE TRIGGER pt_touch BEFORE UPDATE ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Project files (uploads + external/Drive links)
CREATE TABLE IF NOT EXISTS public.project_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.service_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  source text NOT NULL DEFAULT 'link', -- link | drive | upload
  mime text,
  thumbnail text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_files TO authenticated;
GRANT ALL ON public.project_files TO service_role;
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pf_read" ON public.project_files;
CREATE POLICY "pf_read" ON public.project_files FOR SELECT TO authenticated
  USING (public.can_access_service_project(auth.uid(), project_id));
DROP POLICY IF EXISTS "pf_write" ON public.project_files;
CREATE POLICY "pf_write" ON public.project_files FOR ALL TO authenticated
  USING (public.can_access_service_project(auth.uid(), project_id))
  WITH CHECK (public.can_access_service_project(auth.uid(), project_id));

-- Project comments
CREATE TABLE IF NOT EXISTS public.project_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.service_projects(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.project_comments(id) ON DELETE CASCADE,
  author_id uuid,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_comments TO authenticated;
GRANT ALL ON public.project_comments TO service_role;
ALTER TABLE public.project_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pc_read" ON public.project_comments;
CREATE POLICY "pc_read" ON public.project_comments FOR SELECT TO authenticated
  USING (public.can_access_service_project(auth.uid(), project_id));
DROP POLICY IF EXISTS "pc_write" ON public.project_comments;
CREATE POLICY "pc_write" ON public.project_comments FOR ALL TO authenticated
  USING (public.can_access_service_project(auth.uid(), project_id))
  WITH CHECK (public.can_access_service_project(auth.uid(), project_id));

-- Project revisions
CREATE TABLE IF NOT EXISTS public.project_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.service_projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  status text NOT NULL DEFAULT 'open', -- open | addressed | rejected
  requested_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_revisions TO authenticated;
GRANT ALL ON public.project_revisions TO service_role;
ALTER TABLE public.project_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pr_read" ON public.project_revisions;
CREATE POLICY "pr_read" ON public.project_revisions FOR SELECT TO authenticated
  USING (public.can_access_service_project(auth.uid(), project_id));
DROP POLICY IF EXISTS "pr_write" ON public.project_revisions;
CREATE POLICY "pr_write" ON public.project_revisions FOR ALL TO authenticated
  USING (public.can_access_service_project(auth.uid(), project_id))
  WITH CHECK (public.can_access_service_project(auth.uid(), project_id));
CREATE TRIGGER pr_touch BEFORE UPDATE ON public.project_revisions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Private PM notes: only project PM + admin/manager
CREATE TABLE IF NOT EXISTS public.project_private_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.service_projects(id) ON DELETE CASCADE,
  author_id uuid,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_private_notes TO authenticated;
GRANT ALL ON public.project_private_notes TO service_role;
ALTER TABLE public.project_private_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ppn_pm_admin_read" ON public.project_private_notes;
CREATE POLICY "ppn_pm_admin_read" ON public.project_private_notes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR EXISTS (SELECT 1 FROM public.service_projects p WHERE p.id = project_id AND p.pm_user_id = auth.uid())
  );
DROP POLICY IF EXISTS "ppn_pm_admin_write" ON public.project_private_notes;
CREATE POLICY "ppn_pm_admin_write" ON public.project_private_notes FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR EXISTS (SELECT 1 FROM public.service_projects p WHERE p.id = project_id AND p.pm_user_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR EXISTS (SELECT 1 FROM public.service_projects p WHERE p.id = project_id AND p.pm_user_id = auth.uid())
  );
CREATE TRIGGER ppn_touch BEFORE UPDATE ON public.project_private_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Calendar events (shoots / deliveries / bookings)
CREATE TABLE IF NOT EXISTS public.project_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL,
  project_id uuid REFERENCES public.service_projects(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'shoot', -- shoot | delivery | booking | other
  title text NOT NULL,
  resource text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_events TO authenticated;
GRANT ALL ON public.project_events TO service_role;
ALTER TABLE public.project_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pe_read" ON public.project_events;
CREATE POLICY "pe_read" ON public.project_events FOR SELECT TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id));
DROP POLICY IF EXISTS "pe_write" ON public.project_events;
CREATE POLICY "pe_write" ON public.project_events FOR ALL TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id))
  WITH CHECK (public.has_brand_access(auth.uid(), brand_id));
CREATE TRIGGER pe_touch BEFORE UPDATE ON public.project_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Notifications (in-app)
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notif_owner_read" ON public.notifications;
CREATE POLICY "notif_owner_read" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "notif_owner_write" ON public.notifications;
CREATE POLICY "notif_owner_write" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "notif_admin_manager_insert" ON public.notifications;
CREATE POLICY "notif_admin_manager_insert" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
    OR user_id = auth.uid()
  );

-- Notification triggers: assign, comment, revision, deadline reminders
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.assignee_id IS NOT NULL AND NEW.assignee_id IS DISTINCT FROM COALESCE(OLD.assignee_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    INSERT INTO public.notifications(user_id, kind, title, body, link)
    VALUES (NEW.assignee_id, 'task_assigned', 'New task assigned', NEW.title,
            '/services-dashboard/projects/' || NEW.project_id::text);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER pt_notify_assign AFTER INSERT OR UPDATE OF assignee_id ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.notify_task_assigned();

CREATE OR REPLACE FUNCTION public.notify_revision_opened()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pm uuid;
BEGIN
  SELECT pm_user_id INTO pm FROM public.service_projects WHERE id = NEW.project_id;
  IF pm IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, kind, title, body, link)
    VALUES (pm, 'revision_opened', 'New revision requested', NEW.title,
            '/services-dashboard/projects/' || NEW.project_id::text);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER pr_notify_open AFTER INSERT ON public.project_revisions
  FOR EACH ROW EXECUTE FUNCTION public.notify_revision_opened();

CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON public.project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_files_project ON public.project_files(project_id);
CREATE INDEX IF NOT EXISTS idx_project_comments_project ON public.project_comments(project_id);
CREATE INDEX IF NOT EXISTS idx_project_revisions_project ON public.project_revisions(project_id);
CREATE INDEX IF NOT EXISTS idx_project_events_brand ON public.project_events(brand_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_projects_pm ON public.service_projects(pm_user_id);
CREATE INDEX IF NOT EXISTS idx_service_projects_deadline ON public.service_projects(deadline);
