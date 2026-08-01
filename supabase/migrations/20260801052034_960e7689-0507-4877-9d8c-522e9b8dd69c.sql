
-- 1. Task attachments: match bh_tasks read access
DROP POLICY IF EXISTS "bh_task_attachments read" ON public.bh_task_attachments;
CREATE POLICY "bh_task_attachments read" ON public.bh_task_attachments
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.bh_tasks t
  WHERE t.id = bh_task_attachments.task_id
    AND (
      public.bh_is_manager((SELECT auth.uid()))
      OR t.created_by = (SELECT auth.uid())
      OR t.assignee_id = (SELECT auth.uid())
      OR (t.brand_id IS NOT NULL AND public.bh_can_access_brand((SELECT auth.uid()), t.brand_id))
    )
));

-- 2. Task comments: match bh_tasks read access
DROP POLICY IF EXISTS "bh_task_comments read" ON public.bh_task_comments;
CREATE POLICY "bh_task_comments read" ON public.bh_task_comments
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.bh_tasks t
  WHERE t.id = bh_task_comments.task_id
    AND (
      public.bh_is_manager((SELECT auth.uid()))
      OR t.created_by = (SELECT auth.uid())
      OR t.assignee_id = (SELECT auth.uid())
      OR (t.brand_id IS NOT NULL AND public.bh_can_access_brand((SELECT auth.uid()), t.brand_id))
    )
));

-- 3. Likes: only when the underlying post/comment is visible to the reader
DROP POLICY IF EXISTS "bh_likes read" ON public.bh_creative_likes;
CREATE POLICY "bh_likes read" ON public.bh_creative_likes
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (post_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bh_creative_posts p
    WHERE p.id = bh_creative_likes.post_id
      AND (p.hidden = false OR p.author_id = (SELECT auth.uid()) OR public.bh_is_manager((SELECT auth.uid())))
  ))
  OR (comment_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bh_creative_post_comments c
    JOIN public.bh_creative_posts p ON p.id = c.post_id
    WHERE c.id = bh_creative_likes.comment_id
      AND (c.hidden = false OR c.author_id = (SELECT auth.uid()) OR public.bh_is_manager((SELECT auth.uid())))
      AND (p.hidden = false OR p.author_id = (SELECT auth.uid()) OR public.bh_is_manager((SELECT auth.uid())))
  ))
);

-- 4. Employee requests: money-related self-service requests must be tied to the requester's employee record
DROP POLICY IF EXISTS "requests_owner_insert" ON public.employee_requests;
CREATE POLICY "requests_owner_insert" ON public.employee_requests
FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND status = 'pending'::employee_request_status
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
  AND (
    (employee_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employee_requests.employee_id AND e.user_id = (SELECT auth.uid())
    ))
    OR (employee_id IS NULL AND (amount IS NULL OR amount = 0))
  )
);

-- 5. Storage folder must be a real UUID
DROP POLICY IF EXISTS "bh files read" ON storage.objects;
CREATE POLICY "bh files read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'bh-brand-files'
  AND (
    public.bh_is_manager(auth.uid())
    OR (
      (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
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
      (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND public.bh_can_access_brand(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  )
);

-- 6. SECURITY DEFINER helpers: signed-in users may only probe their own privileges,
--    and unused helpers are no longer callable by signed-in users.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
  END
$$;

CREATE OR REPLACE FUNCTION public.is_writer(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role IN ('admin','manager','data_entry')
    )
  END
$$;

REVOKE ALL ON FUNCTION public.page_access_level(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.require_page_read(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.page_access_level(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.require_page_read(text) TO service_role;
