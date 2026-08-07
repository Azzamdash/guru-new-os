-- Make permission helpers SECURITY DEFINER so they bypass nested RLS on
-- user_roles / user_brand_access (huge per-row cost on large lists).
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_writer(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text IN ('admin','manager','accountant')
  )
$$;

CREATE OR REPLACE FUNCTION public.has_brand_access(_user_id uuid, _brand_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT
    public.has_role(_user_id,'admin')
    OR public.has_role(_user_id,'manager')
    OR public.has_role(_user_id,'accountant')
    OR EXISTS (SELECT 1 FROM public.user_brand_access WHERE user_id = _user_id AND brand_id = _brand_id)
$$;

-- Wrap auth.uid() in a scalar subquery so Postgres evaluates the check once
-- per query (InitPlan) instead of once per row.
DROP POLICY IF EXISTS "read sales" ON public.sales_invoices;
CREATE POLICY "read sales" ON public.sales_invoices FOR SELECT
  USING (public.has_brand_access((SELECT auth.uid()), brand_id));

DROP POLICY IF EXISTS "sales write privileged" ON public.sales_invoices;
CREATE POLICY "sales write privileged" ON public.sales_invoices FOR ALL
  USING (public.has_brand_access((SELECT auth.uid()), brand_id) AND public.is_writer((SELECT auth.uid())))
  WITH CHECK (public.has_brand_access((SELECT auth.uid()), brand_id) AND public.is_writer((SELECT auth.uid())));

DROP POLICY IF EXISTS "prep read assigned invoices" ON public.sales_invoices;
CREATE POLICY "prep read assigned invoices" ON public.sales_invoices FOR SELECT
  USING (prep_assignee_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "sales_man read own invoices" ON public.sales_invoices;
CREATE POLICY "sales_man read own invoices" ON public.sales_invoices FOR SELECT
  USING (sold_by = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid()) AND ur.role::text = 'sales_man'));

DROP POLICY IF EXISTS "read sales_invoice_items" ON public.sales_invoice_items;
CREATE POLICY "read sales_invoice_items" ON public.sales_invoice_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.sales_invoices si
    WHERE si.id = sales_invoice_items.invoice_id
      AND public.has_brand_access((SELECT auth.uid()), si.brand_id)));

DROP POLICY IF EXISTS "sales_man read own invoice items" ON public.sales_invoice_items;
CREATE POLICY "sales_man read own invoice items" ON public.sales_invoice_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.sales_invoices si
    WHERE si.id = sales_invoice_items.invoice_id AND si.sold_by = (SELECT auth.uid())));

DROP POLICY IF EXISTS "auth write sales_invoice_items" ON public.sales_invoice_items;
CREATE POLICY "auth write sales_invoice_items" ON public.sales_invoice_items FOR ALL
  USING (public.is_writer((SELECT auth.uid())))
  WITH CHECK (public.is_writer((SELECT auth.uid())));

DROP POLICY IF EXISTS "orders_brand_read" ON public.orders;
CREATE POLICY "orders_brand_read" ON public.orders FOR SELECT
  USING (public.has_brand_access((SELECT auth.uid()), brand_id));

DROP POLICY IF EXISTS "orders_writer_all" ON public.orders;
CREATE POLICY "orders_writer_all" ON public.orders FOR ALL
  USING (public.can_write_page((SELECT auth.uid()), '/orders') AND public.has_brand_access((SELECT auth.uid()), brand_id))
  WITH CHECK (public.can_write_page((SELECT auth.uid()), '/orders') AND public.has_brand_access((SELECT auth.uid()), brand_id));

DROP POLICY IF EXISTS "read products" ON public.products;
CREATE POLICY "read products" ON public.products FOR SELECT
  USING (public.has_brand_access((SELECT auth.uid()), brand_id));

DROP POLICY IF EXISTS "admin write products" ON public.products;
CREATE POLICY "admin write products" ON public.products FOR ALL
  USING (public.has_role((SELECT auth.uid()), 'admin'))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'));

ANALYZE public.sales_invoices;
ANALYZE public.sales_invoice_items;
ANALYZE public.orders;
ANALYZE public.products;