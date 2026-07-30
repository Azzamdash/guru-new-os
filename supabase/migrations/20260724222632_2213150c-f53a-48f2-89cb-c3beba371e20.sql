ALTER TABLE public.service_projects
  DROP CONSTRAINT IF EXISTS service_projects_status_check;

ALTER TABLE public.service_projects
  ADD CONSTRAINT service_projects_status_check
  CHECK (status IN ('pending', 'in_progress', 'review', 'done', 'cancelled'));
