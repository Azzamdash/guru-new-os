
-- employees: brand-scoped writes
DROP POLICY IF EXISTS "employees write writer" ON public.employees;
CREATE POLICY "employees write writer" ON public.employees
FOR ALL TO authenticated
USING (is_writer(auth.uid()) AND has_brand_access(auth.uid(), brand_id))
WITH CHECK (is_writer(auth.uid()) AND has_brand_access(auth.uid(), brand_id));

-- attendance: brand-scoped writes via employee
DROP POLICY IF EXISTS "attendance write writer" ON public.employee_attendance_entries;
CREATE POLICY "attendance write writer" ON public.employee_attendance_entries
FOR ALL TO authenticated
USING (is_writer(auth.uid()) AND EXISTS (
  SELECT 1 FROM public.employees e
  WHERE e.id = employee_attendance_entries.employee_id
    AND has_brand_access(auth.uid(), e.brand_id)
))
WITH CHECK (is_writer(auth.uid()) AND EXISTS (
  SELECT 1 FROM public.employees e
  WHERE e.id = employee_attendance_entries.employee_id
    AND has_brand_access(auth.uid(), e.brand_id)
));

-- fulfillment: brand-scoped writes
DROP POLICY IF EXISTS "write fulfillment" ON public.fulfillment_entries;
CREATE POLICY "write fulfillment" ON public.fulfillment_entries
FOR ALL TO authenticated
USING (is_writer(auth.uid()) AND has_brand_access(auth.uid(), brand_id))
WITH CHECK (is_writer(auth.uid()) AND has_brand_access(auth.uid(), brand_id));

-- sales_invoice_items: brand-scoped writes via parent invoice
DROP POLICY IF EXISTS "auth write sales_invoice_items" ON public.sales_invoice_items;
CREATE POLICY "auth write sales_invoice_items" ON public.sales_invoice_items
FOR ALL TO authenticated
USING (is_writer(auth.uid()) AND EXISTS (
  SELECT 1 FROM public.sales_invoices si
  WHERE si.id = sales_invoice_items.invoice_id
    AND has_brand_access(auth.uid(), si.brand_id)
))
WITH CHECK (is_writer(auth.uid()) AND EXISTS (
  SELECT 1 FROM public.sales_invoices si
  WHERE si.id = sales_invoice_items.invoice_id
    AND has_brand_access(auth.uid(), si.brand_id)
));

-- supplier_invoice_items: brand-scoped writes via parent invoice
DROP POLICY IF EXISTS "invoice items write for writers" ON public.supplier_invoice_items;
CREATE POLICY "invoice items write for writers" ON public.supplier_invoice_items
FOR ALL TO authenticated
USING (is_writer(auth.uid()) AND EXISTS (
  SELECT 1 FROM public.supplier_invoices si
  WHERE si.id = supplier_invoice_items.invoice_id
    AND (si.brand_id IS NULL OR has_brand_access(auth.uid(), si.brand_id))
))
WITH CHECK (is_writer(auth.uid()) AND EXISTS (
  SELECT 1 FROM public.supplier_invoices si
  WHERE si.id = supplier_invoice_items.invoice_id
    AND (si.brand_id IS NULL OR has_brand_access(auth.uid(), si.brand_id))
));

-- supplier_payments: brand-scoped writes via parent invoice
DROP POLICY IF EXISTS "sp write privileged" ON public.supplier_payments;
CREATE POLICY "sp write privileged" ON public.supplier_payments
FOR ALL TO authenticated
USING (is_writer(auth.uid()) AND EXISTS (
  SELECT 1 FROM public.supplier_invoices si
  WHERE si.id = supplier_payments.invoice_id
    AND (si.brand_id IS NULL OR has_brand_access(auth.uid(), si.brand_id))
))
WITH CHECK (is_writer(auth.uid()) AND EXISTS (
  SELECT 1 FROM public.supplier_invoices si
  WHERE si.id = supplier_payments.invoice_id
    AND (si.brand_id IS NULL OR has_brand_access(auth.uid(), si.brand_id))
));

-- articles: only published visible to regular users; admins/managers see all
DROP POLICY IF EXISTS "auth read articles" ON public.articles;
CREATE POLICY "auth read articles" ON public.articles
FOR SELECT TO authenticated
USING (
  published = true
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
);

-- Revoke EXECUTE on SECURITY DEFINER helpers from anon/public
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_section_access(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_brand_access(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_writer(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_investor_of_brand(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_section_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_brand_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_writer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_investor_of_brand(uuid, uuid) TO authenticated;
