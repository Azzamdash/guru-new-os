
-- Tighten SECURITY DEFINER function EXECUTE grants
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_section_access(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_brand_access(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_section_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_brand_access(uuid, uuid) TO authenticated;

-- Replace overly permissive SELECT policies with brand/role-scoped ones

DROP POLICY IF EXISTS "read sales" ON public.sales_invoices;
CREATE POLICY "read sales" ON public.sales_invoices FOR SELECT TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id));

DROP POLICY IF EXISTS "auth read sales_invoice_items" ON public.sales_invoice_items;
DROP POLICY IF EXISTS "read sales_invoice_items" ON public.sales_invoice_items;
CREATE POLICY "read sales_invoice_items" ON public.sales_invoice_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales_invoices si WHERE si.id = invoice_id AND public.has_brand_access(auth.uid(), si.brand_id)));

DROP POLICY IF EXISTS "me read authenticated" ON public.monthly_entries;
DROP POLICY IF EXISTS "read monthly_entries" ON public.monthly_entries;
CREATE POLICY "read monthly_entries" ON public.monthly_entries FOR SELECT TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id));

DROP POLICY IF EXISTS "ee read authenticated" ON public.expense_entries;
DROP POLICY IF EXISTS "read expense_entries" ON public.expense_entries;
CREATE POLICY "read expense_entries" ON public.expense_entries FOR SELECT TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id));

DROP POLICY IF EXISTS "suppliers read authenticated" ON public.suppliers;
DROP POLICY IF EXISTS "read suppliers" ON public.suppliers;
CREATE POLICY "read suppliers" ON public.suppliers FOR SELECT TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id));

DROP POLICY IF EXISTS "si read authenticated" ON public.supplier_invoices;
DROP POLICY IF EXISTS "read supplier_invoices" ON public.supplier_invoices;
CREATE POLICY "read supplier_invoices" ON public.supplier_invoices FOR SELECT TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id));

DROP POLICY IF EXISTS "sp read authenticated" ON public.supplier_payments;
DROP POLICY IF EXISTS "read supplier_payments" ON public.supplier_payments;
CREATE POLICY "read supplier_payments" ON public.supplier_payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.supplier_invoices si WHERE si.id = invoice_id AND public.has_brand_access(auth.uid(), si.brand_id)));

DROP POLICY IF EXISTS "brands read authenticated" ON public.brands;
DROP POLICY IF EXISTS "read brands" ON public.brands;
CREATE POLICY "read brands" ON public.brands FOR SELECT TO authenticated
  USING (public.has_brand_access(auth.uid(), id));

DROP POLICY IF EXISTS "read couriers" ON public.couriers;
CREATE POLICY "read couriers" ON public.couriers FOR SELECT TO authenticated
  USING (brand_id IS NULL OR public.has_brand_access(auth.uid(), brand_id));

DROP POLICY IF EXISTS "cats read authenticated" ON public.expense_categories;
DROP POLICY IF EXISTS "read expense_categories" ON public.expense_categories;
CREATE POLICY "read expense_categories" ON public.expense_categories FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'data_entry'));

DROP POLICY IF EXISTS "read products" ON public.products;
CREATE POLICY "read products" ON public.products FOR SELECT TO authenticated
  USING (public.has_brand_access(auth.uid(), brand_id));

DROP POLICY IF EXISTS "read materials" ON public.materials;
CREATE POLICY "read materials" ON public.materials FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'data_entry'));

DROP POLICY IF EXISTS "read pm" ON public.product_materials;
DROP POLICY IF EXISTS "read product_materials" ON public.product_materials;
CREATE POLICY "read product_materials" ON public.product_materials FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND public.has_brand_access(auth.uid(), p.brand_id)));

DROP POLICY IF EXISTS "read im" ON public.inventory_movements;
DROP POLICY IF EXISTS "read inventory_movements" ON public.inventory_movements;
CREATE POLICY "read inventory_movements" ON public.inventory_movements FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND public.has_brand_access(auth.uid(), p.brand_id)));
