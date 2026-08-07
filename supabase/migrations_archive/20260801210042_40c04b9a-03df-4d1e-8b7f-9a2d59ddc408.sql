-- 1. Articles default to unpublished
ALTER TABLE public.articles ALTER COLUMN published SET DEFAULT false;

-- 2. Restrict order assignment log reads
DROP POLICY IF EXISTS "oal_read" ON public.order_assignment_log;
CREATE POLICY "oal_read" ON public.order_assignment_log
FOR SELECT TO authenticated
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role)
  OR has_role((SELECT auth.uid()), 'manager'::app_role)
  OR is_global_reader((SELECT auth.uid()))
  OR performed_by = (SELECT auth.uid())
  OR assigned_user_id = (SELECT auth.uid())
  OR previous_assigned_user_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_assignment_log.order_id
      AND has_brand_access((SELECT auth.uid()), o.brand_id)
  )
);

-- 3. Standardize sales_man role checks on has_role()
DROP POLICY IF EXISTS "sales_man read own invoices" ON public.sales_invoices;
CREATE POLICY "sales_man read own invoices" ON public.sales_invoices
FOR SELECT TO authenticated
USING (
  sold_by = (SELECT auth.uid())
  AND has_role((SELECT auth.uid()), 'sales_man'::app_role)
);

DROP POLICY IF EXISTS "sales_man insert offline invoices" ON public.sales_invoices;
CREATE POLICY "sales_man insert offline invoices" ON public.sales_invoices
FOR INSERT TO authenticated
WITH CHECK (
  has_role((SELECT auth.uid()), 'sales_man'::app_role)
  AND has_brand_access((SELECT auth.uid()), brand_id)
  AND sold_by = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.brands b
    WHERE b.id = sales_invoices.brand_id AND (b.type)::text = 'offline_branch'
  )
);

DROP POLICY IF EXISTS "sales_man read own invoice items" ON public.sales_invoice_items;
CREATE POLICY "sales_man read own invoice items" ON public.sales_invoice_items
FOR SELECT TO authenticated
USING (
  has_role((SELECT auth.uid()), 'sales_man'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.sales_invoices si
    WHERE si.id = sales_invoice_items.invoice_id
      AND si.sold_by = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "sales_man insert offline invoice items" ON public.sales_invoice_items;
CREATE POLICY "sales_man insert offline invoice items" ON public.sales_invoice_items
FOR INSERT TO authenticated
WITH CHECK (
  has_role((SELECT auth.uid()), 'sales_man'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.sales_invoices si
    JOIN public.brands b ON b.id = si.brand_id
    WHERE si.id = sales_invoice_items.invoice_id
      AND si.sold_by = (SELECT auth.uid())
      AND (b.type)::text = 'offline_branch'
  )
);
