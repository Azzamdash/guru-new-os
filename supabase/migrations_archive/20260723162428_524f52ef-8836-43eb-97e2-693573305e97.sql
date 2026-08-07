
-- 1) Tighten prep update policy on sales_invoices with brand-access check
DROP POLICY IF EXISTS "prep update assigned invoices" ON public.sales_invoices;
CREATE POLICY "prep update assigned invoices"
ON public.sales_invoices
FOR UPDATE
USING (
  prep_assignee_id = auth.uid()
  AND public.has_role(auth.uid(), 'order_prep'::app_role)
  AND public.has_brand_access(auth.uid(), brand_id)
)
WITH CHECK (
  prep_assignee_id = auth.uid()
  AND public.has_role(auth.uid(), 'order_prep'::app_role)
  AND public.has_brand_access(auth.uid(), brand_id)
);

-- 2) Admin-only management policies on user_roles
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;

CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Admins can insert roles"
ON public.user_roles FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles"
ON public.user_roles FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete roles"
ON public.user_roles FOR DELETE
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3) Narrow is_writer to admin/manager/accountant only (remove data_entry from broad financial write)
CREATE OR REPLACE FUNCTION public.is_writer(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('admin','manager','accountant')
  );
$$;
