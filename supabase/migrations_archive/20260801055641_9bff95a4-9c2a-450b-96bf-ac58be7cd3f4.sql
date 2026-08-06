-- sales_invoices
DROP POLICY IF EXISTS "sales write privileged" ON public.sales_invoices;
DROP POLICY IF EXISTS "sales insert privileged" ON public.sales_invoices;
CREATE POLICY "sales insert privileged" ON public.sales_invoices FOR INSERT TO authenticated
  WITH CHECK (public.has_brand_access((SELECT auth.uid()), brand_id) AND public.is_writer((SELECT auth.uid())));
DROP POLICY IF EXISTS "sales update privileged" ON public.sales_invoices;
CREATE POLICY "sales update privileged" ON public.sales_invoices FOR UPDATE TO authenticated
  USING (public.has_brand_access((SELECT auth.uid()), brand_id) AND public.is_writer((SELECT auth.uid())))
  WITH CHECK (public.has_brand_access((SELECT auth.uid()), brand_id) AND public.is_writer((SELECT auth.uid())));
DROP POLICY IF EXISTS "sales delete privileged" ON public.sales_invoices;
CREATE POLICY "sales delete privileged" ON public.sales_invoices FOR DELETE TO authenticated
  USING (public.has_brand_access((SELECT auth.uid()), brand_id) AND public.is_writer((SELECT auth.uid())));

-- sales_invoice_items
DROP POLICY IF EXISTS "auth write sales_invoice_items" ON public.sales_invoice_items;
DROP POLICY IF EXISTS "auth insert sales_invoice_items" ON public.sales_invoice_items;
CREATE POLICY "auth insert sales_invoice_items" ON public.sales_invoice_items FOR INSERT TO authenticated
  WITH CHECK (public.is_writer((SELECT auth.uid())));
DROP POLICY IF EXISTS "auth update sales_invoice_items" ON public.sales_invoice_items;
CREATE POLICY "auth update sales_invoice_items" ON public.sales_invoice_items FOR UPDATE TO authenticated
  USING (public.is_writer((SELECT auth.uid()))) WITH CHECK (public.is_writer((SELECT auth.uid())));
DROP POLICY IF EXISTS "auth delete sales_invoice_items" ON public.sales_invoice_items;
CREATE POLICY "auth delete sales_invoice_items" ON public.sales_invoice_items FOR DELETE TO authenticated
  USING (public.is_writer((SELECT auth.uid())));

-- orders
DROP POLICY IF EXISTS "orders_writer_all" ON public.orders;
DROP POLICY IF EXISTS "orders_writer_insert" ON public.orders;
CREATE POLICY "orders_writer_insert" ON public.orders FOR INSERT TO authenticated
  WITH CHECK (public.can_write_page((SELECT auth.uid()), '/orders') AND public.has_brand_access((SELECT auth.uid()), brand_id));
DROP POLICY IF EXISTS "orders_writer_update" ON public.orders;
CREATE POLICY "orders_writer_update" ON public.orders FOR UPDATE TO authenticated
  USING (public.can_write_page((SELECT auth.uid()), '/orders') AND public.has_brand_access((SELECT auth.uid()), brand_id))
  WITH CHECK (public.can_write_page((SELECT auth.uid()), '/orders') AND public.has_brand_access((SELECT auth.uid()), brand_id));
DROP POLICY IF EXISTS "orders_writer_delete" ON public.orders;
CREATE POLICY "orders_writer_delete" ON public.orders FOR DELETE TO authenticated
  USING (public.can_write_page((SELECT auth.uid()), '/orders') AND public.has_brand_access((SELECT auth.uid()), brand_id));

-- order_items
DROP POLICY IF EXISTS "order_items_writer" ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;
CREATE POLICY "order_items_insert" ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (public.can_write_page((SELECT auth.uid()), '/orders') AND EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND public.has_brand_access((SELECT auth.uid()), o.brand_id)));
DROP POLICY IF EXISTS "order_items_update" ON public.order_items;
CREATE POLICY "order_items_update" ON public.order_items FOR UPDATE TO authenticated
  USING (public.can_write_page((SELECT auth.uid()), '/orders') AND EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND public.has_brand_access((SELECT auth.uid()), o.brand_id)))
  WITH CHECK (public.can_write_page((SELECT auth.uid()), '/orders') AND EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND public.has_brand_access((SELECT auth.uid()), o.brand_id)));
DROP POLICY IF EXISTS "order_items_delete" ON public.order_items;
CREATE POLICY "order_items_delete" ON public.order_items FOR DELETE TO authenticated
  USING (public.can_write_page((SELECT auth.uid()), '/orders') AND EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND public.has_brand_access((SELECT auth.uid()), o.brand_id)));
DROP POLICY IF EXISTS "order_items_read" ON public.order_items;
CREATE POLICY "order_items_read" ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND ((SELECT public.is_global_reader((SELECT auth.uid())))
        OR o.brand_id IN (SELECT uba.brand_id FROM public.user_brand_access uba WHERE uba.user_id = (SELECT auth.uid())))));

-- expense_entries
DROP POLICY IF EXISTS "ee write privileged" ON public.expense_entries;
DROP POLICY IF EXISTS "ee insert privileged" ON public.expense_entries;
CREATE POLICY "ee insert privileged" ON public.expense_entries FOR INSERT TO authenticated
  WITH CHECK (public.has_brand_access((SELECT auth.uid()), brand_id) AND public.is_writer((SELECT auth.uid())));
DROP POLICY IF EXISTS "ee update privileged" ON public.expense_entries;
CREATE POLICY "ee update privileged" ON public.expense_entries FOR UPDATE TO authenticated
  USING (public.has_brand_access((SELECT auth.uid()), brand_id) AND public.is_writer((SELECT auth.uid())))
  WITH CHECK (public.has_brand_access((SELECT auth.uid()), brand_id) AND public.is_writer((SELECT auth.uid())));
DROP POLICY IF EXISTS "ee delete privileged" ON public.expense_entries;
CREATE POLICY "ee delete privileged" ON public.expense_entries FOR DELETE TO authenticated
  USING (public.has_brand_access((SELECT auth.uid()), brand_id) AND public.is_writer((SELECT auth.uid())));

-- monthly_entries
DROP POLICY IF EXISTS "me write privileged" ON public.monthly_entries;
DROP POLICY IF EXISTS "me insert privileged" ON public.monthly_entries;
CREATE POLICY "me insert privileged" ON public.monthly_entries FOR INSERT TO authenticated
  WITH CHECK (public.has_brand_access((SELECT auth.uid()), brand_id) AND public.is_writer((SELECT auth.uid())));
DROP POLICY IF EXISTS "me update privileged" ON public.monthly_entries;
CREATE POLICY "me update privileged" ON public.monthly_entries FOR UPDATE TO authenticated
  USING (public.has_brand_access((SELECT auth.uid()), brand_id) AND public.is_writer((SELECT auth.uid())))
  WITH CHECK (public.has_brand_access((SELECT auth.uid()), brand_id) AND public.is_writer((SELECT auth.uid())));
DROP POLICY IF EXISTS "me delete privileged" ON public.monthly_entries;
CREATE POLICY "me delete privileged" ON public.monthly_entries FOR DELETE TO authenticated
  USING (public.has_brand_access((SELECT auth.uid()), brand_id) AND public.is_writer((SELECT auth.uid())));
DROP POLICY IF EXISTS "read monthly_entries" ON public.monthly_entries;
CREATE POLICY "read monthly_entries" ON public.monthly_entries FOR SELECT TO authenticated
  USING ((SELECT public.is_global_reader((SELECT auth.uid())))
    OR brand_id IN (SELECT uba.brand_id FROM public.user_brand_access uba WHERE uba.user_id = (SELECT auth.uid())));

-- fulfillment_entries
DROP POLICY IF EXISTS "write fulfillment" ON public.fulfillment_entries;
DROP POLICY IF EXISTS "insert fulfillment" ON public.fulfillment_entries;
CREATE POLICY "insert fulfillment" ON public.fulfillment_entries FOR INSERT TO authenticated
  WITH CHECK (public.is_writer((SELECT auth.uid())));
DROP POLICY IF EXISTS "update fulfillment" ON public.fulfillment_entries;
CREATE POLICY "update fulfillment" ON public.fulfillment_entries FOR UPDATE TO authenticated
  USING (public.is_writer((SELECT auth.uid()))) WITH CHECK (public.is_writer((SELECT auth.uid())));
DROP POLICY IF EXISTS "delete fulfillment" ON public.fulfillment_entries;
CREATE POLICY "delete fulfillment" ON public.fulfillment_entries FOR DELETE TO authenticated
  USING (public.is_writer((SELECT auth.uid())));
DROP POLICY IF EXISTS "read fulfillment" ON public.fulfillment_entries;
CREATE POLICY "read fulfillment" ON public.fulfillment_entries FOR SELECT TO authenticated
  USING (
    ((SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
      OR (SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role))
      OR (SELECT public.has_section_access((SELECT auth.uid()), 'couriers'))
      OR (SELECT public.has_section_access((SELECT auth.uid()), 'reports_production')))
    AND ((SELECT public.is_global_reader((SELECT auth.uid())))
      OR brand_id IN (SELECT uba.brand_id FROM public.user_brand_access uba WHERE uba.user_id = (SELECT auth.uid()))));

-- customers
DROP POLICY IF EXISTS "customers write" ON public.customers;
DROP POLICY IF EXISTS "customers insert" ON public.customers;
CREATE POLICY "customers insert" ON public.customers FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role))
    OR (public.is_writer((SELECT auth.uid())) AND (is_general = true OR EXISTS (
      SELECT 1 FROM public.customer_brands cb WHERE cb.customer_id = customers.id
        AND public.has_brand_access((SELECT auth.uid()), cb.brand_id)))));
DROP POLICY IF EXISTS "customers update" ON public.customers;
CREATE POLICY "customers update" ON public.customers FOR UPDATE TO authenticated
  USING ((SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role))
    OR (public.is_writer((SELECT auth.uid())) AND (is_general = true OR EXISTS (
      SELECT 1 FROM public.customer_brands cb WHERE cb.customer_id = customers.id
        AND public.has_brand_access((SELECT auth.uid()), cb.brand_id)))))
  WITH CHECK ((SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role))
    OR (public.is_writer((SELECT auth.uid())) AND (is_general = true OR EXISTS (
      SELECT 1 FROM public.customer_brands cb WHERE cb.customer_id = customers.id
        AND public.has_brand_access((SELECT auth.uid()), cb.brand_id)))));
DROP POLICY IF EXISTS "customers delete" ON public.customers;
CREATE POLICY "customers delete" ON public.customers FOR DELETE TO authenticated
  USING ((SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role))
    OR (SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role))
    OR (public.is_writer((SELECT auth.uid())) AND (is_general = true OR EXISTS (
      SELECT 1 FROM public.customer_brands cb WHERE cb.customer_id = customers.id
        AND public.has_brand_access((SELECT auth.uid()), cb.brand_id)))));