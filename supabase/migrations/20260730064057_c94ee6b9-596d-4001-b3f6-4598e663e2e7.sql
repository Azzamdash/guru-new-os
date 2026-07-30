CREATE POLICY "bh files read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'bh-brand-files');
CREATE POLICY "bh files insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bh-brand-files');
CREATE POLICY "bh files update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'bh-brand-files' AND public.bh_is_manager(auth.uid()));
CREATE POLICY "bh files delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'bh-brand-files' AND public.bh_is_manager(auth.uid()));