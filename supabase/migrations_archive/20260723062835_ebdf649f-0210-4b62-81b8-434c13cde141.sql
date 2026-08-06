
-- customers: restrict SELECT to writers only
DROP POLICY IF EXISTS "customers read" ON public.customers;
CREATE POLICY "customers read" ON public.customers FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'data_entry')
    OR public.has_role(auth.uid(),'accountant')
  );

-- customer_notes: restrict SELECT to writers only
DROP POLICY IF EXISTS "notes read" ON public.customer_notes;
CREATE POLICY "notes read" ON public.customer_notes FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'data_entry')
    OR public.has_role(auth.uid(),'accountant')
  );

-- customer_brands: restrict SELECT to writers or brand-access users
DROP POLICY IF EXISTS "customer_brands_read" ON public.customer_brands;
CREATE POLICY "customer_brands_read" ON public.customer_brands FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'manager')
    OR public.has_role(auth.uid(),'data_entry')
    OR public.has_role(auth.uid(),'accountant')
    OR public.has_brand_access(auth.uid(), brand_id)
  );

-- employees: revoke SELECT privilege on sensitive columns from authenticated.
-- Row-level policy (has_brand_access) still applies for non-sensitive columns.
-- Reading salary/note now requires service_role via a role-checked server function.
REVOKE SELECT ON public.employees FROM authenticated;
GRANT SELECT (id, name, brand_id, position, active, created_at, updated_at)
  ON public.employees TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.employees TO authenticated;
