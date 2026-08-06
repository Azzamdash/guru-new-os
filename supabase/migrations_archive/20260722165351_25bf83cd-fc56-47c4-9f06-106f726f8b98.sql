
DROP POLICY "ee write privileged" ON public.expense_entries;
DROP POLICY IF EXISTS "ee write privileged" ON public.expense_entries;
CREATE POLICY "ee write privileged" ON public.expense_entries FOR ALL TO authenticated USING (has_brand_access(auth.uid(), brand_id) AND is_writer(auth.uid())) WITH CHECK (has_brand_access(auth.uid(), brand_id) AND is_writer(auth.uid()));

DROP POLICY "write fulfillment" ON public.fulfillment_entries;
DROP POLICY IF EXISTS "write fulfillment" ON public.fulfillment_entries;
CREATE POLICY "write fulfillment" ON public.fulfillment_entries FOR ALL TO authenticated USING (is_writer(auth.uid())) WITH CHECK (is_writer(auth.uid()));

DROP POLICY "me write privileged" ON public.monthly_entries;
DROP POLICY IF EXISTS "me write privileged" ON public.monthly_entries;
CREATE POLICY "me write privileged" ON public.monthly_entries FOR ALL TO authenticated USING (has_brand_access(auth.uid(), brand_id) AND is_writer(auth.uid())) WITH CHECK (has_brand_access(auth.uid(), brand_id) AND is_writer(auth.uid()));

DROP POLICY "auth write sales_invoice_items" ON public.sales_invoice_items;
DROP POLICY IF EXISTS "auth write sales_invoice_items" ON public.sales_invoice_items;
CREATE POLICY "auth write sales_invoice_items" ON public.sales_invoice_items FOR ALL TO authenticated USING (is_writer(auth.uid())) WITH CHECK (is_writer(auth.uid()));

DROP POLICY "sales write privileged" ON public.sales_invoices;
DROP POLICY IF EXISTS "sales write privileged" ON public.sales_invoices;
CREATE POLICY "sales write privileged" ON public.sales_invoices FOR ALL TO authenticated USING (has_brand_access(auth.uid(), brand_id) AND is_writer(auth.uid())) WITH CHECK (has_brand_access(auth.uid(), brand_id) AND is_writer(auth.uid()));

DROP POLICY "si write privileged" ON public.supplier_invoices;
DROP POLICY IF EXISTS "si write privileged" ON public.supplier_invoices;
CREATE POLICY "si write privileged" ON public.supplier_invoices FOR ALL TO authenticated USING (((brand_id IS NULL) OR has_brand_access(auth.uid(), brand_id)) AND is_writer(auth.uid())) WITH CHECK (((brand_id IS NULL) OR has_brand_access(auth.uid(), brand_id)) AND is_writer(auth.uid()));

DROP POLICY "sp write privileged" ON public.supplier_payments;
DROP POLICY IF EXISTS "sp write privileged" ON public.supplier_payments;
CREATE POLICY "sp write privileged" ON public.supplier_payments FOR ALL TO authenticated USING (is_writer(auth.uid())) WITH CHECK (is_writer(auth.uid()));
