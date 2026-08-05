ALTER TABLE public.monthly_entries ADD COLUMN IF NOT EXISTS period_end_date date;
ALTER TABLE public.monthly_entries DROP CONSTRAINT IF EXISTS monthly_entries_brand_id_year_month_key;

DROP POLICY IF EXISTS "me write admin" ON public.monthly_entries;
DROP POLICY IF EXISTS "me write privileged" ON public.monthly_entries;
CREATE POLICY "me write privileged" ON public.monthly_entries FOR ALL TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id) AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role) OR public.has_role(auth.uid(),'data_entry'::app_role)))
  WITH CHECK (public.has_brand_access(auth.uid(), brand_id) AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role) OR public.has_role(auth.uid(),'data_entry'::app_role)));

DROP POLICY IF EXISTS "ee write admin" ON public.expense_entries;
DROP POLICY IF EXISTS "ee write privileged" ON public.expense_entries;
CREATE POLICY "ee write privileged" ON public.expense_entries FOR ALL TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id) AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role) OR public.has_role(auth.uid(),'data_entry'::app_role)))
  WITH CHECK (public.has_brand_access(auth.uid(), brand_id) AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role) OR public.has_role(auth.uid(),'data_entry'::app_role)));

DROP POLICY IF EXISTS "admin write sales" ON public.sales_invoices;
DROP POLICY IF EXISTS "sales write privileged" ON public.sales_invoices;
CREATE POLICY "sales write privileged" ON public.sales_invoices FOR ALL TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id) AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role) OR public.has_role(auth.uid(),'data_entry'::app_role)))
  WITH CHECK (public.has_brand_access(auth.uid(), brand_id) AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role) OR public.has_role(auth.uid(),'data_entry'::app_role)));

DROP POLICY IF EXISTS "si write admin" ON public.supplier_invoices;
DROP POLICY IF EXISTS "si write privileged" ON public.supplier_invoices;
CREATE POLICY "si write privileged" ON public.supplier_invoices FOR ALL TO authenticated
  USING ((brand_id IS NULL OR public.has_brand_access(auth.uid(), brand_id)) AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role) OR public.has_role(auth.uid(),'data_entry'::app_role)))
  WITH CHECK ((brand_id IS NULL OR public.has_brand_access(auth.uid(), brand_id)) AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role) OR public.has_role(auth.uid(),'data_entry'::app_role)));

DROP POLICY IF EXISTS "sp write admin" ON public.supplier_payments;
DROP POLICY IF EXISTS "sp write privileged" ON public.supplier_payments;
CREATE POLICY "sp write privileged" ON public.supplier_payments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role) OR public.has_role(auth.uid(),'data_entry'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role) OR public.has_role(auth.uid(),'data_entry'::app_role));

DROP POLICY IF EXISTS "suppliers write admin" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers write privileged" ON public.suppliers;
CREATE POLICY "suppliers write privileged" ON public.suppliers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role) OR public.has_role(auth.uid(),'data_entry'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role) OR public.has_role(auth.uid(),'data_entry'::app_role));