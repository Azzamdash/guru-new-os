
-- 1) Tighten NULL brand_id fallbacks: admin only (not manager)

-- couriers
DROP POLICY IF EXISTS "read couriers" ON public.couriers;
CREATE POLICY "read couriers" ON public.couriers FOR SELECT
USING (
  ((brand_id IS NOT NULL) AND has_brand_access(auth.uid(), brand_id))
  OR ((brand_id IS NULL) AND has_role(auth.uid(), 'admin'::app_role))
);

-- cash_transactions
DROP POLICY IF EXISTS cash_txn_write_insert ON public.cash_transactions;
CREATE POLICY cash_txn_write_insert ON public.cash_transactions FOR INSERT
WITH CHECK (
  is_writer(auth.uid()) AND (created_by = auth.uid())
  AND (
    ((brand_id IS NOT NULL) AND has_brand_access(auth.uid(), brand_id))
    OR ((brand_id IS NULL) AND has_role(auth.uid(), 'admin'::app_role))
  )
);

DROP POLICY IF EXISTS cash_txn_write_update ON public.cash_transactions;
CREATE POLICY cash_txn_write_update ON public.cash_transactions FOR UPDATE
USING (
  is_writer(auth.uid()) AND (
    ((brand_id IS NOT NULL) AND has_brand_access(auth.uid(), brand_id))
    OR ((brand_id IS NULL) AND has_role(auth.uid(), 'admin'::app_role))
  )
)
WITH CHECK (
  is_writer(auth.uid()) AND (
    ((brand_id IS NOT NULL) AND has_brand_access(auth.uid(), brand_id))
    OR ((brand_id IS NULL) AND has_role(auth.uid(), 'admin'::app_role))
  )
);

DROP POLICY IF EXISTS cash_txn_write_delete ON public.cash_transactions;
CREATE POLICY cash_txn_write_delete ON public.cash_transactions FOR DELETE
USING (
  is_writer(auth.uid()) AND (
    ((brand_id IS NOT NULL) AND has_brand_access(auth.uid(), brand_id))
    OR ((brand_id IS NULL) AND has_role(auth.uid(), 'admin'::app_role))
  )
);

-- company_assets
DROP POLICY IF EXISTS assets_write_admin_manager_accountant ON public.company_assets;
CREATE POLICY assets_write_admin_manager_accountant ON public.company_assets FOR INSERT
WITH CHECK (
  ((brand_id IS NOT NULL)
    AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'accountant'::app_role))
    AND has_brand_access(auth.uid(), brand_id))
  OR ((brand_id IS NULL) AND has_role(auth.uid(),'admin'::app_role))
);

DROP POLICY IF EXISTS assets_update_admin_manager_accountant ON public.company_assets;
CREATE POLICY assets_update_admin_manager_accountant ON public.company_assets FOR UPDATE
USING (
  (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'accountant'::app_role))
  AND (
    ((brand_id IS NOT NULL) AND has_brand_access(auth.uid(), brand_id))
    OR ((brand_id IS NULL) AND has_role(auth.uid(),'admin'::app_role))
  )
)
WITH CHECK (
  (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'accountant'::app_role))
  AND (
    ((brand_id IS NOT NULL) AND has_brand_access(auth.uid(), brand_id))
    OR ((brand_id IS NULL) AND has_role(auth.uid(),'admin'::app_role))
  )
);

-- 2) supplier_invoices, supplier_invoice_items, supplier_payments:
-- Rewrite existing ALL policies so NULL brand_id fallback requires admin only.

-- supplier_invoices
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename='supplier_invoices' AND schemaname='public' LOOP
    EXECUTE format('DROP POLICY %I ON public.supplier_invoices', r.policyname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS supplier_invoices_read ON public.supplier_invoices;
CREATE POLICY supplier_invoices_read ON public.supplier_invoices FOR SELECT
USING (
  has_role(auth.uid(),'admin'::app_role)
  OR ((brand_id IS NOT NULL) AND has_brand_access(auth.uid(), brand_id))
  OR ((brand_id IS NULL) AND has_role(auth.uid(),'admin'::app_role))
);

DROP POLICY IF EXISTS supplier_invoices_write ON public.supplier_invoices;
CREATE POLICY supplier_invoices_write ON public.supplier_invoices FOR ALL
USING (
  is_writer(auth.uid()) AND (
    ((brand_id IS NOT NULL) AND has_brand_access(auth.uid(), brand_id))
    OR ((brand_id IS NULL) AND has_role(auth.uid(),'admin'::app_role))
  )
)
WITH CHECK (
  is_writer(auth.uid()) AND (
    ((brand_id IS NOT NULL) AND has_brand_access(auth.uid(), brand_id))
    OR ((brand_id IS NULL) AND has_role(auth.uid(),'admin'::app_role))
  )
);

-- supplier_invoice_items (inherit brand from parent invoice)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename='supplier_invoice_items' AND schemaname='public' LOOP
    EXECUTE format('DROP POLICY %I ON public.supplier_invoice_items', r.policyname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS sii_read ON public.supplier_invoice_items;
CREATE POLICY sii_read ON public.supplier_invoice_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.supplier_invoices si
    WHERE si.id = supplier_invoice_items.invoice_id
      AND (
        ((si.brand_id IS NOT NULL) AND has_brand_access(auth.uid(), si.brand_id))
        OR ((si.brand_id IS NULL) AND has_role(auth.uid(),'admin'::app_role))
      )
  )
);

DROP POLICY IF EXISTS sii_write ON public.supplier_invoice_items;
CREATE POLICY sii_write ON public.supplier_invoice_items FOR ALL
USING (
  is_writer(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.supplier_invoices si
    WHERE si.id = supplier_invoice_items.invoice_id
      AND (
        ((si.brand_id IS NOT NULL) AND has_brand_access(auth.uid(), si.brand_id))
        OR ((si.brand_id IS NULL) AND has_role(auth.uid(),'admin'::app_role))
      )
  )
)
WITH CHECK (
  is_writer(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.supplier_invoices si
    WHERE si.id = supplier_invoice_items.invoice_id
      AND (
        ((si.brand_id IS NOT NULL) AND has_brand_access(auth.uid(), si.brand_id))
        OR ((si.brand_id IS NULL) AND has_role(auth.uid(),'admin'::app_role))
      )
  )
);

-- supplier_payments (inherit brand from parent invoice)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename='supplier_payments' AND schemaname='public' LOOP
    EXECUTE format('DROP POLICY %I ON public.supplier_payments', r.policyname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS sp_read ON public.supplier_payments;
CREATE POLICY sp_read ON public.supplier_payments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.supplier_invoices si
    WHERE si.id = supplier_payments.invoice_id
      AND (
        ((si.brand_id IS NOT NULL) AND has_brand_access(auth.uid(), si.brand_id))
        OR ((si.brand_id IS NULL) AND has_role(auth.uid(),'admin'::app_role))
      )
  )
);

DROP POLICY IF EXISTS sp_write ON public.supplier_payments;
CREATE POLICY sp_write ON public.supplier_payments FOR ALL
USING (
  is_writer(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.supplier_invoices si
    WHERE si.id = supplier_payments.invoice_id
      AND (
        ((si.brand_id IS NOT NULL) AND has_brand_access(auth.uid(), si.brand_id))
        OR ((si.brand_id IS NULL) AND has_role(auth.uid(),'admin'::app_role))
      )
  )
)
WITH CHECK (
  is_writer(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.supplier_invoices si
    WHERE si.id = supplier_payments.invoice_id
      AND (
        ((si.brand_id IS NOT NULL) AND has_brand_access(auth.uid(), si.brand_id))
        OR ((si.brand_id IS NULL) AND has_role(auth.uid(),'admin'::app_role))
      )
  )
);

-- 3) sales_invoices: attach field-lock trigger for order_prep, and require order_prep role on write-check
DROP TRIGGER IF EXISTS trg_sales_invoices_prep_field_lock ON public.sales_invoices;
CREATE TRIGGER trg_sales_invoices_prep_field_lock
BEFORE UPDATE ON public.sales_invoices
FOR EACH ROW EXECUTE FUNCTION public.sales_invoices_prep_field_lock();

DROP POLICY IF EXISTS "prep update assigned invoices" ON public.sales_invoices;
CREATE POLICY "prep update assigned invoices" ON public.sales_invoices FOR UPDATE
USING (
  (prep_assignee_id = auth.uid()) AND has_role(auth.uid(),'order_prep'::app_role)
)
WITH CHECK (
  (prep_assignee_id = auth.uid()) AND has_role(auth.uid(),'order_prep'::app_role)
);
