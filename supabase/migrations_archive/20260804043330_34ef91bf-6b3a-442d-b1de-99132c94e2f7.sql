DROP POLICY IF EXISTS "orders_distribution_update" ON public.orders;
CREATE POLICY "orders_distribution_update"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  public.can_write_page((SELECT auth.uid()), '/order-distribution')
  AND public.has_brand_access((SELECT auth.uid()), brand_id)
)
WITH CHECK (
  public.can_write_page((SELECT auth.uid()), '/order-distribution')
  AND public.has_brand_access((SELECT auth.uid()), brand_id)
);