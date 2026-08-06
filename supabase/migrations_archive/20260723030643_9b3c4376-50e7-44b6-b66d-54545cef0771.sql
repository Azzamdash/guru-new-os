ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'accountant';

ALTER TABLE public.user_sheet_config ADD COLUMN IF NOT EXISTS attendance_range TEXT;

CREATE OR REPLACE FUNCTION public.is_writer(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('admin','manager','data_entry','accountant')
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_writer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_writer(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "ee write privileged" ON public.expense_entries;
CREATE POLICY "ee write privileged" ON public.expense_entries FOR ALL
  USING (public.has_brand_access(auth.uid(), brand_id) AND public.is_writer(auth.uid()))
  WITH CHECK (public.has_brand_access(auth.uid(), brand_id) AND public.is_writer(auth.uid()));

DROP POLICY IF EXISTS "me write privileged" ON public.monthly_entries;
CREATE POLICY "me write privileged" ON public.monthly_entries FOR ALL
  USING (public.has_brand_access(auth.uid(), brand_id) AND public.is_writer(auth.uid()))
  WITH CHECK (public.has_brand_access(auth.uid(), brand_id) AND public.is_writer(auth.uid()));

DROP POLICY IF EXISTS "sales write privileged" ON public.sales_invoices;
CREATE POLICY "sales write privileged" ON public.sales_invoices FOR ALL
  USING (public.has_brand_access(auth.uid(), brand_id) AND public.is_writer(auth.uid()))
  WITH CHECK (public.has_brand_access(auth.uid(), brand_id) AND public.is_writer(auth.uid()));

DROP POLICY IF EXISTS "si write privileged" ON public.supplier_invoices;
CREATE POLICY "si write privileged" ON public.supplier_invoices FOR ALL
  USING (((brand_id IS NULL) OR public.has_brand_access(auth.uid(), brand_id)) AND public.is_writer(auth.uid()))
  WITH CHECK (((brand_id IS NULL) OR public.has_brand_access(auth.uid(), brand_id)) AND public.is_writer(auth.uid()));

DROP POLICY IF EXISTS "sp write privileged" ON public.supplier_payments;
CREATE POLICY "sp write privileged" ON public.supplier_payments FOR ALL
  USING (public.is_writer(auth.uid())) WITH CHECK (public.is_writer(auth.uid()));

DROP POLICY IF EXISTS "auth write sales_invoice_items" ON public.sales_invoice_items;
CREATE POLICY "auth write sales_invoice_items" ON public.sales_invoice_items FOR ALL
  USING (public.is_writer(auth.uid())) WITH CHECK (public.is_writer(auth.uid()));

DROP POLICY IF EXISTS "write fulfillment" ON public.fulfillment_entries;
CREATE POLICY "write fulfillment" ON public.fulfillment_entries FOR ALL
  USING (public.is_writer(auth.uid())) WITH CHECK (public.is_writer(auth.uid()));