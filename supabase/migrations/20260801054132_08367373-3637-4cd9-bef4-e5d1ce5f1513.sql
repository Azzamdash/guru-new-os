SET LOCAL lock_timeout = '15s';

CREATE OR REPLACE FUNCTION public.is_global_reader(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','manager','accountant'))
  END
$$;
REVOKE ALL ON FUNCTION public.is_global_reader(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_global_reader(uuid) TO authenticated;

DROP POLICY IF EXISTS "read sales" ON public.sales_invoices;
CREATE POLICY "read sales" ON public.sales_invoices FOR SELECT TO authenticated
USING (
  (SELECT public.is_global_reader((SELECT auth.uid())))
  OR brand_id IN (SELECT uba.brand_id FROM public.user_brand_access uba WHERE uba.user_id = (SELECT auth.uid()))
);

DROP POLICY IF EXISTS "read products" ON public.products;
CREATE POLICY "read products" ON public.products FOR SELECT TO authenticated
USING (
  (SELECT public.is_global_reader((SELECT auth.uid())))
  OR brand_id IN (SELECT uba.brand_id FROM public.user_brand_access uba WHERE uba.user_id = (SELECT auth.uid()))
);

DROP POLICY IF EXISTS "orders_brand_read" ON public.orders;
CREATE POLICY "orders_brand_read" ON public.orders FOR SELECT TO authenticated
USING (
  (SELECT public.is_global_reader((SELECT auth.uid())))
  OR brand_id IN (SELECT uba.brand_id FROM public.user_brand_access uba WHERE uba.user_id = (SELECT auth.uid()))
);

DROP POLICY IF EXISTS "read expense_entries" ON public.expense_entries;
CREATE POLICY "read expense_entries" ON public.expense_entries FOR SELECT TO authenticated
USING (
  (SELECT public.is_global_reader((SELECT auth.uid())))
  OR brand_id IN (SELECT uba.brand_id FROM public.user_brand_access uba WHERE uba.user_id = (SELECT auth.uid()))
);

DROP POLICY IF EXISTS "read inventory_movements" ON public.inventory_movements;
CREATE POLICY "read inventory_movements" ON public.inventory_movements FOR SELECT TO authenticated
USING (
  (SELECT public.is_global_reader((SELECT auth.uid())))
  OR EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = inventory_movements.product_id
      AND p.brand_id IN (SELECT uba.brand_id FROM public.user_brand_access uba WHERE uba.user_id = (SELECT auth.uid()))
  )
);

DROP POLICY IF EXISTS "read sales_invoice_items" ON public.sales_invoice_items;
CREATE POLICY "read sales_invoice_items" ON public.sales_invoice_items FOR SELECT TO authenticated
USING (
  (SELECT public.is_global_reader((SELECT auth.uid())))
  OR EXISTS (
    SELECT 1 FROM public.sales_invoices si
    WHERE si.id = sales_invoice_items.invoice_id
      AND si.brand_id IN (SELECT uba.brand_id FROM public.user_brand_access uba WHERE uba.user_id = (SELECT auth.uid()))
  )
);

DROP POLICY IF EXISTS "cash_txn_read" ON public.cash_transactions;
CREATE POLICY "cash_txn_read" ON public.cash_transactions FOR SELECT TO authenticated
USING (
  (SELECT public.is_global_reader((SELECT auth.uid())))
  OR (brand_id IS NOT NULL AND brand_id IN (SELECT uba.brand_id FROM public.user_brand_access uba WHERE uba.user_id = (SELECT auth.uid())))
  OR created_by = (SELECT auth.uid())
  OR for_user_id = (SELECT auth.uid())
);

DROP POLICY IF EXISTS "customers read" ON public.customers;
CREATE POLICY "customers read" ON public.customers FOR SELECT TO authenticated
USING (
  (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
  OR (SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role))
  OR (
    ((SELECT public.has_role((SELECT auth.uid()), 'data_entry'::app_role)) OR (SELECT public.has_role((SELECT auth.uid()), 'accountant'::app_role)))
    AND (
      is_general = true
      OR EXISTS (
        SELECT 1 FROM public.customer_brands cb
        WHERE cb.customer_id = customers.id
          AND ((SELECT public.is_global_reader((SELECT auth.uid())))
               OR cb.brand_id IN (SELECT uba.brand_id FROM public.user_brand_access uba WHERE uba.user_id = (SELECT auth.uid())))
      )
    )
  )
);