DROP POLICY IF EXISTS "read fulfillment" ON public.fulfillment_entries;
CREATE POLICY "read fulfillment" ON public.fulfillment_entries FOR SELECT
USING (
  (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_section_access(auth.uid(), 'couriers'::text)
    OR has_section_access(auth.uid(), 'reports_production'::text)
  )
  AND has_brand_access(auth.uid(), brand_id)
);