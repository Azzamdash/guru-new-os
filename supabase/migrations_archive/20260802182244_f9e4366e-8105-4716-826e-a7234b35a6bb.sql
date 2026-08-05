DROP POLICY IF EXISTS "suppliers write privileged" ON public.suppliers;

CREATE POLICY "suppliers write privileged"
ON public.suppliers
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    (public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'data_entry'::app_role))
    AND (
      (brand_id IS NOT NULL AND public.has_brand_access(auth.uid(), brand_id))
      OR (brand_id IS NULL AND public.has_role(auth.uid(), 'manager'::app_role))
      OR EXISTS (
        SELECT 1 FROM public.supplier_brands sb
        WHERE sb.supplier_id = suppliers.id
          AND public.has_brand_access(auth.uid(), sb.brand_id)
      )
    )
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    (public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'data_entry'::app_role))
    AND (
      (brand_id IS NOT NULL AND public.has_brand_access(auth.uid(), brand_id))
      OR (brand_id IS NULL AND public.has_role(auth.uid(), 'manager'::app_role))
    )
  )
);