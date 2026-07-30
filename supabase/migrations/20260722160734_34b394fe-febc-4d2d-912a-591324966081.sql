
-- Employees: brand-scoped read
DROP POLICY IF EXISTS "employees read authenticated" ON public.employees;
CREATE POLICY "employees read brand scoped" ON public.employees
FOR SELECT TO authenticated
USING (public.has_brand_access(auth.uid(), brand_id));

-- Employee attendance: brand-scoped read via employees.brand_id
DROP POLICY IF EXISTS "attendance read authenticated" ON public.employee_attendance_entries;
CREATE POLICY "attendance read brand scoped" ON public.employee_attendance_entries
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_id
      AND public.has_brand_access(auth.uid(), e.brand_id)
  )
);

-- Tasks: restrict assignee update to prevent privilege escalation
DROP POLICY IF EXISTS "Assignees update status" ON public.tasks;
CREATE POLICY "Assignees update status" ON public.tasks
FOR UPDATE TO authenticated
USING (assignee_id = auth.uid())
WITH CHECK (
  assignee_id = auth.uid()
  AND assignee_id = (SELECT t.assignee_id FROM public.tasks t WHERE t.id = tasks.id)
  AND brand_id IS NOT DISTINCT FROM (SELECT t.brand_id FROM public.tasks t WHERE t.id = tasks.id)
  AND created_by IS NOT DISTINCT FROM (SELECT t.created_by FROM public.tasks t WHERE t.id = tasks.id)
  AND priority IS NOT DISTINCT FROM (SELECT t.priority FROM public.tasks t WHERE t.id = tasks.id)
  AND title IS NOT DISTINCT FROM (SELECT t.title FROM public.tasks t WHERE t.id = tasks.id)
  AND description IS NOT DISTINCT FROM (SELECT t.description FROM public.tasks t WHERE t.id = tasks.id)
  AND due_date IS NOT DISTINCT FROM (SELECT t.due_date FROM public.tasks t WHERE t.id = tasks.id)
);
