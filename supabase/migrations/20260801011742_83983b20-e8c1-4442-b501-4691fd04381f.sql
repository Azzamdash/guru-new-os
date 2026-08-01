DROP POLICY IF EXISTS "pt_write" ON public.project_tasks;
CREATE POLICY "pt_write" ON public.project_tasks
FOR ALL TO authenticated
USING (
  public.can_access_service_project(auth.uid(), project_id)
  AND (public.is_writer(auth.uid()) OR public.is_project_manager(auth.uid()))
)
WITH CHECK (
  public.can_access_service_project(auth.uid(), project_id)
  AND (public.is_writer(auth.uid()) OR public.is_project_manager(auth.uid()))
);

DROP POLICY IF EXISTS "bh files read" ON storage.objects;
CREATE POLICY "bh files read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'bh-brand-files'
  AND (
    public.bh_is_manager(auth.uid())
    OR (
      (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
      AND public.bh_can_access_brand(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  )
);

DROP POLICY IF EXISTS "bh files insert" ON storage.objects;
CREATE POLICY "bh files insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'bh-brand-files'
  AND (
    public.bh_is_manager(auth.uid())
    OR (
      (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
      AND public.bh_can_access_brand(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  )
);