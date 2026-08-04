
-- Expense entry periods
ALTER TABLE public.expense_entries
  ADD COLUMN IF NOT EXISTS period_type text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS period_date date,
  ADD COLUMN IF NOT EXISTS period_end_date date;

ALTER TABLE public.expense_entries
  DROP CONSTRAINT IF EXISTS expense_entries_period_type_check;
ALTER TABLE public.expense_entries
  ADD CONSTRAINT expense_entries_period_type_check
  CHECK (period_type IN ('daily','weekly','monthly','yearly','custom'));

-- Employees table (freeform HR list)
CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  position text,
  active boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employees read authenticated" ON public.employees;
CREATE POLICY "employees read authenticated" ON public.employees FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "employees write writer" ON public.employees;
CREATE POLICY "employees write writer" ON public.employees FOR ALL TO authenticated
  USING (public.is_writer(auth.uid())) WITH CHECK (public.is_writer(auth.uid()));

-- Employee attendance monthly records
CREATE TABLE IF NOT EXISTS public.employee_attendance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  year int NOT NULL,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  days_absent numeric NOT NULL DEFAULT 0,
  days_vacation numeric NOT NULL DEFAULT 0,
  times_late int NOT NULL DEFAULT 0,
  deductions numeric NOT NULL DEFAULT 0,
  bonuses numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, year, month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_attendance_entries TO authenticated;
GRANT ALL ON public.employee_attendance_entries TO service_role;
ALTER TABLE public.employee_attendance_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attendance read authenticated" ON public.employee_attendance_entries;
CREATE POLICY "attendance read authenticated" ON public.employee_attendance_entries FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "attendance write writer" ON public.employee_attendance_entries;
CREATE POLICY "attendance write writer" ON public.employee_attendance_entries FOR ALL TO authenticated
  USING (public.is_writer(auth.uid())) WITH CHECK (public.is_writer(auth.uid()));

DROP TRIGGER IF EXISTS trg_employees_updated ON public.employees;
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_attendance_updated ON public.employee_attendance_entries;
CREATE TRIGGER trg_attendance_updated BEFORE UPDATE ON public.employee_attendance_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
