-- 1) Wallets: remove blanket investor read access
DROP POLICY IF EXISTS wallets_read ON public.wallets;
CREATE POLICY wallets_read ON public.wallets
FOR SELECT TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'admin'::app_role)
  OR public.has_role((SELECT auth.uid()), 'manager'::app_role)
  OR public.has_role((SELECT auth.uid()), 'accountant'::app_role)
);

-- 2) Employees: enforce one employee record per auth user
CREATE UNIQUE INDEX IF NOT EXISTS employees_user_id_unique
  ON public.employees (user_id) WHERE user_id IS NOT NULL;

-- 3) Employees: prevent non-admin/manager from re-pointing user_id
CREATE OR REPLACE FUNCTION public.employees_guard_user_id_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
            OR public.has_role(auth.uid(), 'manager'::app_role)) THEN
      RAISE EXCEPTION 'Only admins or managers can change the linked account of an employee record';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employees_guard_user_id_change ON public.employees;
CREATE TRIGGER employees_guard_user_id_change
BEFORE UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.employees_guard_user_id_change();
