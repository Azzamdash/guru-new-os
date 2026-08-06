-- 1) Switch helper functions to SECURITY INVOKER (user_roles/user_brand_access/user_section_access/investors all allow self-reads under RLS)
ALTER FUNCTION public.has_role(uuid, app_role) SECURITY INVOKER;
ALTER FUNCTION public.has_section_access(uuid, text) SECURITY INVOKER;
ALTER FUNCTION public.has_brand_access(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.is_writer(uuid) SECURITY INVOKER;
ALTER FUNCTION public.is_investor_of_brand(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.update_updated_at_column() SECURITY INVOKER;

-- 2) company_assets: brand-scope INSERT and UPDATE writes
DROP POLICY IF EXISTS "assets_write_admin_manager_accountant" ON public.company_assets;
CREATE POLICY "assets_write_admin_manager_accountant" ON public.company_assets FOR INSERT TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'accountant'))
  AND (brand_id IS NULL OR public.has_brand_access(auth.uid(), brand_id))
);

DROP POLICY IF EXISTS "assets_update_admin_manager_accountant" ON public.company_assets;
CREATE POLICY "assets_update_admin_manager_accountant" ON public.company_assets FOR UPDATE TO authenticated
USING (
  (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'accountant'))
  AND (brand_id IS NULL OR public.has_brand_access(auth.uid(), brand_id))
)
WITH CHECK (
  (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'accountant'))
  AND (brand_id IS NULL OR public.has_brand_access(auth.uid(), brand_id))
);

-- 3) fulfillment_entries: restrict read policy to authenticated role
DROP POLICY IF EXISTS "read fulfillment" ON public.fulfillment_entries;
CREATE POLICY "read fulfillment" ON public.fulfillment_entries FOR SELECT TO authenticated
USING (
  (public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'manager')
    OR public.has_section_access(auth.uid(),'couriers')
    OR public.has_section_access(auth.uid(),'reports_production'))
  AND public.has_brand_access(auth.uid(), brand_id)
);

-- 4) tasks: enforce assignee-update field immutability via BEFORE UPDATE trigger, replace self-referential policy
CREATE OR REPLACE FUNCTION public.tasks_prevent_assignee_field_tampering()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Only enforce when the caller is neither admin nor manager (they use the manage-all policy)
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN
    IF NEW.title IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.brand_id IS DISTINCT FROM OLD.brand_id
       OR NEW.priority IS DISTINCT FROM OLD.priority
       OR NEW.due_date IS DISTINCT FROM OLD.due_date
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
      RAISE EXCEPTION 'Assignees may only update task status fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_prevent_assignee_tamper ON public.tasks;
CREATE TRIGGER trg_tasks_prevent_assignee_tamper
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.tasks_prevent_assignee_field_tampering();

DROP POLICY IF EXISTS "Assignees update status" ON public.tasks;
CREATE POLICY "Assignees update status" ON public.tasks FOR UPDATE TO authenticated
USING (assignee_id = auth.uid())
WITH CHECK (assignee_id = auth.uid());