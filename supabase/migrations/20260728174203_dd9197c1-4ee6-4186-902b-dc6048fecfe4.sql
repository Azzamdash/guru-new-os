
-- 1) customer_brands: require brand access on writes
DROP POLICY IF EXISTS customer_brands_write ON public.customer_brands;
CREATE POLICY customer_brands_write ON public.customer_brands FOR ALL TO authenticated
  USING (public.is_writer(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id))
  WITH CHECK (public.is_writer(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id));

-- 2) employees: restrict UPDATE/INSERT/DELETE of salary-bearing rows to admin/manager (already brand-scoped)
DROP POLICY IF EXISTS "employees update by writer" ON public.employees;
CREATE POLICY "employees update admin manager" ON public.employees FOR UPDATE TO authenticated
  USING ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'hr')) AND public.has_brand_access(auth.uid(), brand_id))
  WITH CHECK ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'hr')) AND public.has_brand_access(auth.uid(), brand_id));

-- 3) project_comments: writes require writer/PM role AND author must be self on insert
DROP POLICY IF EXISTS pc_write ON public.project_comments;
CREATE POLICY pc_insert_own ON public.project_comments FOR INSERT TO authenticated
  WITH CHECK (
    public.can_access_service_project(auth.uid(), project_id)
    AND author_id = auth.uid()
  );
CREATE POLICY pc_update_own ON public.project_comments FOR UPDATE TO authenticated
  USING (public.can_access_service_project(auth.uid(), project_id) AND author_id = auth.uid())
  WITH CHECK (public.can_access_service_project(auth.uid(), project_id) AND author_id = auth.uid());
CREATE POLICY pc_delete_own_or_writer ON public.project_comments FOR DELETE TO authenticated
  USING (
    public.can_access_service_project(auth.uid(), project_id)
    AND (author_id = auth.uid() OR public.is_writer(auth.uid()) OR public.is_project_manager(auth.uid()))
  );

-- 4) project_events: writes require writer or PM role
DROP POLICY IF EXISTS pe_write ON public.project_events;
CREATE POLICY pe_write ON public.project_events FOR ALL TO authenticated
  USING (
    public.has_brand_access(auth.uid(), brand_id)
    AND (public.is_writer(auth.uid()) OR public.is_project_manager(auth.uid()))
  )
  WITH CHECK (
    public.has_brand_access(auth.uid(), brand_id)
    AND (public.is_writer(auth.uid()) OR public.is_project_manager(auth.uid()))
  );

-- 5) project_files: writes require writer or PM role
DROP POLICY IF EXISTS pf_write ON public.project_files;
CREATE POLICY pf_write ON public.project_files FOR ALL TO authenticated
  USING (
    public.can_access_service_project(auth.uid(), project_id)
    AND (public.is_writer(auth.uid()) OR public.is_project_manager(auth.uid()) OR uploaded_by = auth.uid())
  )
  WITH CHECK (
    public.can_access_service_project(auth.uid(), project_id)
    AND (public.is_writer(auth.uid()) OR public.is_project_manager(auth.uid()) OR uploaded_by = auth.uid())
  );

-- 6) project_revisions: writes require writer or PM role, or requester on insert
DROP POLICY IF EXISTS pr_write ON public.project_revisions;
CREATE POLICY pr_insert ON public.project_revisions FOR INSERT TO authenticated
  WITH CHECK (
    public.can_access_service_project(auth.uid(), project_id)
    AND (requested_by = auth.uid() OR public.is_writer(auth.uid()) OR public.is_project_manager(auth.uid()))
  );
CREATE POLICY pr_update ON public.project_revisions FOR UPDATE TO authenticated
  USING (
    public.can_access_service_project(auth.uid(), project_id)
    AND (public.is_writer(auth.uid()) OR public.is_project_manager(auth.uid()))
  )
  WITH CHECK (
    public.can_access_service_project(auth.uid(), project_id)
    AND (public.is_writer(auth.uid()) OR public.is_project_manager(auth.uid()))
  );
CREATE POLICY pr_delete ON public.project_revisions FOR DELETE TO authenticated
  USING (
    public.can_access_service_project(auth.uid(), project_id)
    AND (public.is_writer(auth.uid()) OR public.is_project_manager(auth.uid()))
  );

-- 7) Lock down SECURITY DEFINER functions from anon/authenticated execution.
-- Trigger functions do NOT require EXECUTE grants to fire on triggers.
-- The dangerous __admin_exec_sql is revoked entirely.
REVOKE EXECUTE ON FUNCTION public.__admin_exec_sql(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_task_assigned() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_sales_invoice_customer() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_revision_opened() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.order_items_sync_invoice_items() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.orders_delete_invoice() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_financial_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_service_project_invoice_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.orders_sync_invoice() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.offline_branch_deduct_inventory() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_expense_delete_cash() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_cash_delete_expense() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_expense_to_cash() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_supplier_payment_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_supplier_invoice_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_cash_to_expense() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_order_item_cost() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_supplier_payment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_order_cost_total() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_service_project_invoice() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_service_client_to_customer() FROM PUBLIC, anon, authenticated;
