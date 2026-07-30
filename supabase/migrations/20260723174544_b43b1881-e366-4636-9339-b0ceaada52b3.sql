
-- 1) New roles
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'production_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'hr';

-- 2) Production tasks
CREATE TABLE public.production_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  due_date DATE,
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_tasks TO authenticated;
GRANT ALL ON public.production_tasks TO service_role;
ALTER TABLE public.production_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prod_tasks_manage_all" ON public.production_tasks
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'manager')
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'production_manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'manager')
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'production_manager')
  );

CREATE POLICY "prod_tasks_assignee_read" ON public.production_tasks
  FOR SELECT TO authenticated USING (assignee_id = auth.uid());

CREATE POLICY "prod_tasks_assignee_update" ON public.production_tasks
  FOR UPDATE TO authenticated
  USING (assignee_id = auth.uid())
  WITH CHECK (assignee_id = auth.uid());

CREATE TRIGGER trg_production_tasks_updated_at
  BEFORE UPDATE ON public.production_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.production_tasks_prevent_field_tampering()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'manager')
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'production_manager')
  ) THEN
    IF NEW.title IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.brand_id IS DISTINCT FROM OLD.brand_id
       OR NEW.priority IS DISTINCT FROM OLD.priority
       OR NEW.due_date IS DISTINCT FROM OLD.due_date
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
       OR NEW.notes IS DISTINCT FROM OLD.notes THEN
      RAISE EXCEPTION 'Assignees may only update the status field';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_production_tasks_field_lock
  BEFORE UPDATE ON public.production_tasks
  FOR EACH ROW EXECUTE FUNCTION public.production_tasks_prevent_field_tampering();

-- 3) Employee requests
CREATE TYPE public.employee_request_type AS ENUM ('leave','advance');
CREATE TYPE public.employee_request_status AS ENUM ('pending','approved','rejected');

CREATE TABLE public.employee_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  type public.employee_request_type NOT NULL,
  requested_date DATE NOT NULL,
  amount NUMERIC,
  note TEXT,
  proof_url TEXT,
  status public.employee_request_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_requests TO authenticated;
GRANT ALL ON public.employee_requests TO service_role;
ALTER TABLE public.employee_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "requests_owner_read" ON public.employee_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "requests_owner_insert" ON public.employee_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
  );

CREATE POLICY "requests_owner_delete_pending" ON public.employee_requests
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending');

CREATE POLICY "requests_hr_read_all" ON public.employee_requests
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'manager')
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'hr')
  );

CREATE POLICY "requests_hr_update_all" ON public.employee_requests
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'manager')
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'hr')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'manager')
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'hr')
  );

CREATE TRIGGER trg_employee_requests_updated_at
  BEFORE UPDATE ON public.employee_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.employee_requests_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.requested_date < (CURRENT_DATE + 2) THEN
      RAISE EXCEPTION 'Requested date must be at least 2 days from today';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status <> 'pending' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'approved' AND (NEW.proof_url IS NULL OR length(btrim(NEW.proof_url)) = 0) THEN
      RAISE EXCEPTION 'A proof link is required to approve a request';
    END IF;
    NEW.reviewed_by := auth.uid();
    NEW.reviewed_at := now();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_employee_requests_validate
  BEFORE INSERT OR UPDATE ON public.employee_requests
  FOR EACH ROW EXECUTE FUNCTION public.employee_requests_validate();
