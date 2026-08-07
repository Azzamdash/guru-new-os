DROP POLICY IF EXISTS sp_read ON public.supplier_payments;
DROP POLICY IF EXISTS sp_write ON public.supplier_payments;
DROP POLICY IF EXISTS "sp write privileged" ON public.supplier_payments;

DROP POLICY IF EXISTS sp_read ON public.supplier_payments;
CREATE POLICY sp_read ON public.supplier_payments FOR SELECT TO authenticated
USING (
  (invoice_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.supplier_invoices si
    WHERE si.id = supplier_payments.invoice_id
      AND (((si.brand_id IS NOT NULL) AND has_brand_access(auth.uid(), si.brand_id))
        OR ((si.brand_id IS NULL) AND has_role(auth.uid(),'admin')))
  ))
  OR (invoice_id IS NULL AND supplier_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.suppliers s
    WHERE s.id = supplier_payments.supplier_id
      AND (((s.brand_id IS NOT NULL) AND has_brand_access(auth.uid(), s.brand_id))
        OR ((s.brand_id IS NULL) AND has_role(auth.uid(),'admin')))
  ))
  OR has_role(auth.uid(),'admin')
);

DROP POLICY IF EXISTS sp_write ON public.supplier_payments;
CREATE POLICY sp_write ON public.supplier_payments FOR ALL TO authenticated
USING (
  is_writer(auth.uid()) AND (
    (invoice_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.supplier_invoices si
      WHERE si.id = supplier_payments.invoice_id
        AND (((si.brand_id IS NOT NULL) AND has_brand_access(auth.uid(), si.brand_id))
          OR ((si.brand_id IS NULL) AND has_role(auth.uid(),'admin')))
    ))
    OR (invoice_id IS NULL AND supplier_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE s.id = supplier_payments.supplier_id
        AND (((s.brand_id IS NOT NULL) AND has_brand_access(auth.uid(), s.brand_id))
          OR ((s.brand_id IS NULL) AND has_role(auth.uid(),'admin')))
    ))
    OR has_role(auth.uid(),'admin')
  )
)
WITH CHECK (
  is_writer(auth.uid()) AND (
    (invoice_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.supplier_invoices si
      WHERE si.id = supplier_payments.invoice_id
        AND (((si.brand_id IS NOT NULL) AND has_brand_access(auth.uid(), si.brand_id))
          OR ((si.brand_id IS NULL) AND has_role(auth.uid(),'admin')))
    ))
    OR (invoice_id IS NULL AND supplier_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE s.id = supplier_payments.supplier_id
        AND (((s.brand_id IS NOT NULL) AND has_brand_access(auth.uid(), s.brand_id))
          OR ((s.brand_id IS NULL) AND has_role(auth.uid(),'admin')))
    ))
    OR has_role(auth.uid(),'admin')
  )
);