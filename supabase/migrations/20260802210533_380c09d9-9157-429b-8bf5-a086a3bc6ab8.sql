DROP POLICY IF EXISTS "admin write products" ON public.products;
CREATE POLICY "admin write products" ON public.products FOR ALL TO authenticated
USING (public.has_role((SELECT auth.uid()), 'admin'::app_role))
WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "prep read assigned invoices" ON public.sales_invoices;
CREATE POLICY "prep read assigned invoices" ON public.sales_invoices FOR SELECT TO authenticated
USING (prep_assignee_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "prep update assigned invoices" ON public.sales_invoices;
CREATE POLICY "prep update assigned invoices" ON public.sales_invoices FOR UPDATE TO authenticated
USING (prep_assignee_id = (SELECT auth.uid()) AND public.has_role((SELECT auth.uid()), 'order_prep'::app_role) AND public.has_brand_access((SELECT auth.uid()), brand_id))
WITH CHECK (prep_assignee_id = (SELECT auth.uid()) AND public.has_role((SELECT auth.uid()), 'order_prep'::app_role) AND public.has_brand_access((SELECT auth.uid()), brand_id));

DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT TO authenticated
USING (public.has_role((SELECT auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE TO authenticated
USING (public.has_role((SELECT auth.uid()), 'admin'::app_role))
WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated
USING (public.has_role((SELECT auth.uid()), 'admin'::app_role));