
-- cash_transactions: restrict null brand_id to admin/manager
DROP POLICY IF EXISTS cash_txn_write_insert ON public.cash_transactions;
DROP POLICY IF EXISTS cash_txn_write_update ON public.cash_transactions;
DROP POLICY IF EXISTS cash_txn_write_delete ON public.cash_transactions;

CREATE POLICY cash_txn_write_insert ON public.cash_transactions FOR INSERT TO authenticated
WITH CHECK (
  is_writer(auth.uid()) AND (
    (brand_id IS NOT NULL AND has_brand_access(auth.uid(), brand_id))
    OR (brand_id IS NULL AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')))
  )
);
CREATE POLICY cash_txn_write_update ON public.cash_transactions FOR UPDATE TO authenticated
USING (
  is_writer(auth.uid()) AND (
    (brand_id IS NOT NULL AND has_brand_access(auth.uid(), brand_id))
    OR (brand_id IS NULL AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')))
  )
)
WITH CHECK (
  is_writer(auth.uid()) AND (
    (brand_id IS NOT NULL AND has_brand_access(auth.uid(), brand_id))
    OR (brand_id IS NULL AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')))
  )
);
CREATE POLICY cash_txn_write_delete ON public.cash_transactions FOR DELETE TO authenticated
USING (
  is_writer(auth.uid()) AND (
    (brand_id IS NOT NULL AND has_brand_access(auth.uid(), brand_id))
    OR (brand_id IS NULL AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')))
  )
);

-- company_assets: restrict null brand writes/updates to admin/manager
DROP POLICY IF EXISTS assets_write_admin_manager_accountant ON public.company_assets;
DROP POLICY IF EXISTS assets_update_admin_manager_accountant ON public.company_assets;

CREATE POLICY assets_write_admin_manager_accountant ON public.company_assets FOR INSERT TO authenticated
WITH CHECK (
  (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'accountant'))
  AND (
    (brand_id IS NOT NULL AND has_brand_access(auth.uid(), brand_id))
    OR (brand_id IS NULL AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')))
  )
);
CREATE POLICY assets_update_admin_manager_accountant ON public.company_assets FOR UPDATE TO authenticated
USING (
  (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'accountant'))
  AND (
    (brand_id IS NOT NULL AND has_brand_access(auth.uid(), brand_id))
    OR (brand_id IS NULL AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')))
  )
)
WITH CHECK (
  (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'accountant'))
  AND (
    (brand_id IS NOT NULL AND has_brand_access(auth.uid(), brand_id))
    OR (brand_id IS NULL AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')))
  )
);

-- couriers: restrict null brand visibility to admin/manager
DROP POLICY IF EXISTS "read couriers" ON public.couriers;
CREATE POLICY "read couriers" ON public.couriers FOR SELECT TO authenticated
USING (
  (brand_id IS NOT NULL AND has_brand_access(auth.uid(), brand_id))
  OR (brand_id IS NULL AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')))
);

-- supplier_invoices: restrict null brand writes to admin/manager
DROP POLICY IF EXISTS "si write privileged" ON public.supplier_invoices;
CREATE POLICY "si write privileged" ON public.supplier_invoices FOR ALL TO authenticated
USING (
  is_writer(auth.uid()) AND (
    (brand_id IS NOT NULL AND has_brand_access(auth.uid(), brand_id))
    OR (brand_id IS NULL AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')))
  )
)
WITH CHECK (
  is_writer(auth.uid()) AND (
    (brand_id IS NOT NULL AND has_brand_access(auth.uid(), brand_id))
    OR (brand_id IS NULL AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')))
  )
);

-- supplier_invoice_items: restrict via parent invoice
DROP POLICY IF EXISTS "invoice items read via parent invoice brand" ON public.supplier_invoice_items;
DROP POLICY IF EXISTS "invoice items write for writers" ON public.supplier_invoice_items;
CREATE POLICY "invoice items read via parent invoice brand" ON public.supplier_invoice_items FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM supplier_invoices si
    WHERE si.id = supplier_invoice_items.invoice_id AND (
      (si.brand_id IS NOT NULL AND has_brand_access(auth.uid(), si.brand_id))
      OR (si.brand_id IS NULL AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')))
    )
  )
);
CREATE POLICY "invoice items write for writers" ON public.supplier_invoice_items FOR ALL TO authenticated
USING (
  is_writer(auth.uid()) AND EXISTS (
    SELECT 1 FROM supplier_invoices si
    WHERE si.id = supplier_invoice_items.invoice_id AND (
      (si.brand_id IS NOT NULL AND has_brand_access(auth.uid(), si.brand_id))
      OR (si.brand_id IS NULL AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')))
    )
  )
)
WITH CHECK (
  is_writer(auth.uid()) AND EXISTS (
    SELECT 1 FROM supplier_invoices si
    WHERE si.id = supplier_invoice_items.invoice_id AND (
      (si.brand_id IS NOT NULL AND has_brand_access(auth.uid(), si.brand_id))
      OR (si.brand_id IS NULL AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')))
    )
  )
);

-- supplier_payments: same treatment
DROP POLICY IF EXISTS "sp write privileged" ON public.supplier_payments;
CREATE POLICY "sp write privileged" ON public.supplier_payments FOR ALL TO authenticated
USING (
  is_writer(auth.uid()) AND EXISTS (
    SELECT 1 FROM supplier_invoices si
    WHERE si.id = supplier_payments.invoice_id AND (
      (si.brand_id IS NOT NULL AND has_brand_access(auth.uid(), si.brand_id))
      OR (si.brand_id IS NULL AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')))
    )
  )
)
WITH CHECK (
  is_writer(auth.uid()) AND EXISTS (
    SELECT 1 FROM supplier_invoices si
    WHERE si.id = supplier_payments.invoice_id AND (
      (si.brand_id IS NOT NULL AND has_brand_access(auth.uid(), si.brand_id))
      OR (si.brand_id IS NULL AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')))
    )
  )
);

-- expense_categories: intentional global lookup table, document it
COMMENT ON TABLE public.expense_categories IS 'Global lookup table shared across all brands. Intentionally not brand-scoped; write access restricted to admin, read access to admin/manager/data_entry.';
