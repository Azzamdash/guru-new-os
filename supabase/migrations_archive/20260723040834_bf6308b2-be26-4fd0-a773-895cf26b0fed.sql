-- 1) brand_integrations: explicit DELETE policy (admin/manager with brand access)
DROP POLICY IF EXISTS "integrations delete brand scoped" ON public.brand_integrations;
CREATE POLICY "integrations delete brand scoped" ON public.brand_integrations
FOR DELETE TO authenticated
USING ((has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')) AND has_brand_access(auth.uid(), brand_id));

-- 2) cash_transactions: enforce created_by = auth.uid() on insert
DROP POLICY IF EXISTS cash_txn_write_insert ON public.cash_transactions;
CREATE POLICY cash_txn_write_insert ON public.cash_transactions
FOR INSERT TO authenticated
WITH CHECK (
  is_writer(auth.uid())
  AND created_by = auth.uid()
  AND (
    (brand_id IS NOT NULL AND has_brand_access(auth.uid(), brand_id))
    OR (brand_id IS NULL AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')))
  )
);

-- 3) company_assets: tighten INSERT so accountants cannot create null-brand assets
DROP POLICY IF EXISTS assets_write_admin_manager_accountant ON public.company_assets;
CREATE POLICY assets_write_admin_manager_accountant ON public.company_assets
FOR INSERT TO authenticated
WITH CHECK (
  (
    brand_id IS NOT NULL
    AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'accountant'))
    AND has_brand_access(auth.uid(), brand_id)
  )
  OR (
    brand_id IS NULL
    AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
  )
);