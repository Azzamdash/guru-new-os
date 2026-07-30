
-- 1) Employees: mandatory brand + salary
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS salary numeric NOT NULL DEFAULT 0;
ALTER TABLE public.employees ALTER COLUMN brand_id SET NOT NULL;

-- 2) Attendance approval flag
ALTER TABLE public.employee_attendance_entries
  ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false;

-- 3) Link auto-generated salary expense entries to attendance
ALTER TABLE public.expense_entries
  ADD COLUMN IF NOT EXISTS attendance_id uuid REFERENCES public.employee_attendance_entries(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS ee_attendance_uidx
  ON public.expense_entries(attendance_id) WHERE attendance_id IS NOT NULL;

-- 4) Link fulfillment + inventory movements to employee (optional)
ALTER TABLE public.fulfillment_entries
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

-- 5) Salary auto-post trigger
CREATE OR REPLACE FUNCTION public.sync_salary_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp_brand uuid;
  emp_salary numeric;
  cat_id uuid;
  net_amount numeric;
BEGIN
  SELECT brand_id, salary INTO emp_brand, emp_salary
    FROM public.employees WHERE id = NEW.employee_id;
  IF emp_brand IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO cat_id FROM public.expense_categories WHERE slug = 'salaries' LIMIT 1;
  IF cat_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.approved THEN
    net_amount := COALESCE(emp_salary,0) - COALESCE(NEW.deductions,0) + COALESCE(NEW.bonuses,0);
    UPDATE public.expense_entries
      SET amount = net_amount, brand_id = emp_brand, year = NEW.year, month = NEW.month,
          category_id = cat_id, period_type = 'monthly'
      WHERE attendance_id = NEW.id;
    IF NOT FOUND THEN
      INSERT INTO public.expense_entries(brand_id, category_id, year, month, amount, note, period_type, attendance_id)
        VALUES (emp_brand, cat_id, NEW.year, NEW.month, net_amount,
                'مرتب موظف (تلقائي)', 'monthly', NEW.id);
    END IF;
  ELSE
    DELETE FROM public.expense_entries WHERE attendance_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_salary_expense() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_salary_expense() TO authenticated;

DROP TRIGGER IF EXISTS trg_sync_salary_expense ON public.employee_attendance_entries;
CREATE TRIGGER trg_sync_salary_expense
AFTER INSERT OR UPDATE ON public.employee_attendance_entries
FOR EACH ROW EXECUTE FUNCTION public.sync_salary_expense();
