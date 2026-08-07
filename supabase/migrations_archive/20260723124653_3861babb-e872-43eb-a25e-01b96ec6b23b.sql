
-- Helper: brand-scoped visibility for a customer
CREATE OR REPLACE FUNCTION public.can_access_customer(_user_id uuid, _customer_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id,'admin')
    OR public.has_role(_user_id,'manager')
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = _customer_id AND c.is_general = true)
    OR EXISTS (
      SELECT 1 FROM public.customer_brands cb
      WHERE cb.customer_id = _customer_id
        AND public.has_brand_access(_user_id, cb.brand_id)
    );
$$;

-- cash_transactions: scope write policies to authenticated
DROP POLICY IF EXISTS cash_txn_write_insert ON public.cash_transactions;
DROP POLICY IF EXISTS cash_txn_write_update ON public.cash_transactions;
DROP POLICY IF EXISTS cash_txn_write_delete ON public.cash_transactions;
DROP POLICY IF EXISTS cash_txn_write_insert ON public.cash_transactions;
CREATE POLICY cash_txn_write_insert ON public.cash_transactions FOR INSERT TO authenticated
  WITH CHECK (is_writer(auth.uid()) AND (created_by = auth.uid()) AND (((brand_id IS NOT NULL) AND has_brand_access(auth.uid(), brand_id)) OR ((brand_id IS NULL) AND has_role(auth.uid(),'admin'))));
DROP POLICY IF EXISTS cash_txn_write_update ON public.cash_transactions;
CREATE POLICY cash_txn_write_update ON public.cash_transactions FOR UPDATE TO authenticated
  USING (is_writer(auth.uid()) AND (((brand_id IS NOT NULL) AND has_brand_access(auth.uid(), brand_id)) OR ((brand_id IS NULL) AND has_role(auth.uid(),'admin'))))
  WITH CHECK (is_writer(auth.uid()) AND (((brand_id IS NOT NULL) AND has_brand_access(auth.uid(), brand_id)) OR ((brand_id IS NULL) AND has_role(auth.uid(),'admin'))));
DROP POLICY IF EXISTS cash_txn_write_delete ON public.cash_transactions;
CREATE POLICY cash_txn_write_delete ON public.cash_transactions FOR DELETE TO authenticated
  USING (is_writer(auth.uid()) AND (((brand_id IS NOT NULL) AND has_brand_access(auth.uid(), brand_id)) OR ((brand_id IS NULL) AND has_role(auth.uid(),'admin'))));

-- couriers: scope read to authenticated
DROP POLICY IF EXISTS "read couriers" ON public.couriers;
CREATE POLICY "read couriers" ON public.couriers FOR SELECT TO authenticated
  USING (((brand_id IS NOT NULL) AND has_brand_access(auth.uid(), brand_id)) OR ((brand_id IS NULL) AND has_role(auth.uid(),'admin')));

-- sales_invoices prep update: scope to authenticated
DROP POLICY IF EXISTS "prep update assigned invoices" ON public.sales_invoices;
CREATE POLICY "prep update assigned invoices" ON public.sales_invoices FOR UPDATE TO authenticated
  USING ((prep_assignee_id = auth.uid()) AND has_role(auth.uid(),'order_prep'))
  WITH CHECK ((prep_assignee_id = auth.uid()) AND has_role(auth.uid(),'order_prep'));

-- company_assets: scope write/update to authenticated
DROP POLICY IF EXISTS assets_write_admin_manager_accountant ON public.company_assets;
DROP POLICY IF EXISTS assets_update_admin_manager_accountant ON public.company_assets;
DROP POLICY IF EXISTS assets_write_admin_manager_accountant ON public.company_assets;
CREATE POLICY assets_write_admin_manager_accountant ON public.company_assets FOR INSERT TO authenticated
  WITH CHECK (((brand_id IS NOT NULL) AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'accountant')) AND has_brand_access(auth.uid(), brand_id)) OR ((brand_id IS NULL) AND has_role(auth.uid(),'admin')));
DROP POLICY IF EXISTS assets_update_admin_manager_accountant ON public.company_assets;
CREATE POLICY assets_update_admin_manager_accountant ON public.company_assets FOR UPDATE TO authenticated
  USING ((has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'accountant')) AND (((brand_id IS NOT NULL) AND has_brand_access(auth.uid(), brand_id)) OR ((brand_id IS NULL) AND has_role(auth.uid(),'admin'))))
  WITH CHECK ((has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'accountant')) AND (((brand_id IS NOT NULL) AND has_brand_access(auth.uid(), brand_id)) OR ((brand_id IS NULL) AND has_role(auth.uid(),'admin'))));

-- supplier_invoices: scope to authenticated
DROP POLICY IF EXISTS supplier_invoices_read ON public.supplier_invoices;
DROP POLICY IF EXISTS supplier_invoices_write ON public.supplier_invoices;
DROP POLICY IF EXISTS supplier_invoices_read ON public.supplier_invoices;
CREATE POLICY supplier_invoices_read ON public.supplier_invoices FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR ((brand_id IS NOT NULL) AND has_brand_access(auth.uid(), brand_id)) OR ((brand_id IS NULL) AND has_role(auth.uid(),'admin')));
DROP POLICY IF EXISTS supplier_invoices_write ON public.supplier_invoices;
CREATE POLICY supplier_invoices_write ON public.supplier_invoices FOR ALL TO authenticated
  USING (is_writer(auth.uid()) AND (((brand_id IS NOT NULL) AND has_brand_access(auth.uid(), brand_id)) OR ((brand_id IS NULL) AND has_role(auth.uid(),'admin'))))
  WITH CHECK (is_writer(auth.uid()) AND (((brand_id IS NOT NULL) AND has_brand_access(auth.uid(), brand_id)) OR ((brand_id IS NULL) AND has_role(auth.uid(),'admin'))));

-- supplier_invoice_items: scope to authenticated
DROP POLICY IF EXISTS sii_read ON public.supplier_invoice_items;
DROP POLICY IF EXISTS sii_write ON public.supplier_invoice_items;
DROP POLICY IF EXISTS sii_read ON public.supplier_invoice_items;
CREATE POLICY sii_read ON public.supplier_invoice_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.supplier_invoices si WHERE si.id = supplier_invoice_items.invoice_id AND (((si.brand_id IS NOT NULL) AND has_brand_access(auth.uid(), si.brand_id)) OR ((si.brand_id IS NULL) AND has_role(auth.uid(),'admin')))));
DROP POLICY IF EXISTS sii_write ON public.supplier_invoice_items;
CREATE POLICY sii_write ON public.supplier_invoice_items FOR ALL TO authenticated
  USING (is_writer(auth.uid()) AND EXISTS (SELECT 1 FROM public.supplier_invoices si WHERE si.id = supplier_invoice_items.invoice_id AND (((si.brand_id IS NOT NULL) AND has_brand_access(auth.uid(), si.brand_id)) OR ((si.brand_id IS NULL) AND has_role(auth.uid(),'admin')))))
  WITH CHECK (is_writer(auth.uid()) AND EXISTS (SELECT 1 FROM public.supplier_invoices si WHERE si.id = supplier_invoice_items.invoice_id AND (((si.brand_id IS NOT NULL) AND has_brand_access(auth.uid(), si.brand_id)) OR ((si.brand_id IS NULL) AND has_role(auth.uid(),'admin')))));

-- supplier_payments: scope to authenticated
DROP POLICY IF EXISTS sp_read ON public.supplier_payments;
DROP POLICY IF EXISTS sp_write ON public.supplier_payments;
DROP POLICY IF EXISTS sp_read ON public.supplier_payments;
CREATE POLICY sp_read ON public.supplier_payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.supplier_invoices si WHERE si.id = supplier_payments.invoice_id AND (((si.brand_id IS NOT NULL) AND has_brand_access(auth.uid(), si.brand_id)) OR ((si.brand_id IS NULL) AND has_role(auth.uid(),'admin')))));
DROP POLICY IF EXISTS sp_write ON public.supplier_payments;
CREATE POLICY sp_write ON public.supplier_payments FOR ALL TO authenticated
  USING (is_writer(auth.uid()) AND EXISTS (SELECT 1 FROM public.supplier_invoices si WHERE si.id = supplier_payments.invoice_id AND (((si.brand_id IS NOT NULL) AND has_brand_access(auth.uid(), si.brand_id)) OR ((si.brand_id IS NULL) AND has_role(auth.uid(),'admin')))))
  WITH CHECK (is_writer(auth.uid()) AND EXISTS (SELECT 1 FROM public.supplier_invoices si WHERE si.id = supplier_payments.invoice_id AND (((si.brand_id IS NOT NULL) AND has_brand_access(auth.uid(), si.brand_id)) OR ((si.brand_id IS NULL) AND has_role(auth.uid(),'admin')))));

-- customers: brand-scoped read/write for data_entry & accountant; admin/manager keep full
DROP POLICY IF EXISTS "customers read" ON public.customers;
DROP POLICY IF EXISTS "customers write" ON public.customers;
DROP POLICY IF EXISTS "customers read" ON public.customers;
CREATE POLICY "customers read" ON public.customers FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin')
    OR has_role(auth.uid(),'manager')
    OR (
      (has_role(auth.uid(),'data_entry') OR has_role(auth.uid(),'accountant'))
      AND (
        is_general = true
        OR EXISTS (SELECT 1 FROM public.customer_brands cb WHERE cb.customer_id = customers.id AND has_brand_access(auth.uid(), cb.brand_id))
      )
    )
  );
DROP POLICY IF EXISTS "customers write" ON public.customers;
CREATE POLICY "customers write" ON public.customers FOR ALL TO authenticated
  USING (
    has_role(auth.uid(),'admin')
    OR has_role(auth.uid(),'manager')
    OR (
      is_writer(auth.uid()) AND (
        is_general = true
        OR EXISTS (SELECT 1 FROM public.customer_brands cb WHERE cb.customer_id = customers.id AND has_brand_access(auth.uid(), cb.brand_id))
      )
    )
  )
  WITH CHECK (
    has_role(auth.uid(),'admin')
    OR has_role(auth.uid(),'manager')
    OR (
      is_writer(auth.uid()) AND (
        is_general = true
        OR EXISTS (SELECT 1 FROM public.customer_brands cb WHERE cb.customer_id = customers.id AND has_brand_access(auth.uid(), cb.brand_id))
      )
    )
  );

-- customer_notes: brand-scoped via parent customer
DROP POLICY IF EXISTS "notes read" ON public.customer_notes;
DROP POLICY IF EXISTS "notes write" ON public.customer_notes;
DROP POLICY IF EXISTS "notes read" ON public.customer_notes;
CREATE POLICY "notes read" ON public.customer_notes FOR SELECT TO authenticated
  USING (
    (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'data_entry') OR has_role(auth.uid(),'accountant'))
    AND public.can_access_customer(auth.uid(), customer_id)
  );
DROP POLICY IF EXISTS "notes write" ON public.customer_notes;
CREATE POLICY "notes write" ON public.customer_notes FOR ALL TO authenticated
  USING (is_writer(auth.uid()) AND public.can_access_customer(auth.uid(), customer_id))
  WITH CHECK (is_writer(auth.uid()) AND public.can_access_customer(auth.uid(), customer_id));
