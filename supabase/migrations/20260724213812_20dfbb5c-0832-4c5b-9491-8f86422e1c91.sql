
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS work_start_time time,
  ADD COLUMN IF NOT EXISTS work_end_time time,
  ADD COLUMN IF NOT EXISTS monthly_work_hours numeric,
  ADD COLUMN IF NOT EXISTS off_days smallint[] DEFAULT ARRAY[5]::smallint[]; -- 0=Sun..6=Sat, default Friday off

CREATE TABLE IF NOT EXISTS public.employee_time_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  check_in time,
  check_out time,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, log_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_time_logs TO authenticated;
GRANT ALL ON public.employee_time_logs TO service_role;

ALTER TABLE public.employee_time_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "HR staff read time logs" ON public.employee_time_logs;
CREATE POLICY "HR staff read time logs" ON public.employee_time_logs
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'accountant')
    OR public.has_role(auth.uid(),'data_entry')
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'hr')
  );

DROP POLICY IF EXISTS "HR staff write time logs" ON public.employee_time_logs;
CREATE POLICY "HR staff write time logs" ON public.employee_time_logs
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'accountant')
    OR public.has_role(auth.uid(),'data_entry')
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'hr')
  ) WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'accountant')
    OR public.has_role(auth.uid(),'data_entry')
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'hr')
  );

DROP TRIGGER IF EXISTS trg_employee_time_logs_updated ON public.employee_time_logs;
CREATE TRIGGER trg_employee_time_logs_updated
  BEFORE UPDATE ON public.employee_time_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
