-- 1) bh_tasks brand-scoped read
DROP POLICY IF EXISTS "bh_tasks read" ON public.bh_tasks;
CREATE POLICY "bh_tasks read" ON public.bh_tasks FOR SELECT TO authenticated
USING (
  public.bh_is_manager((select auth.uid()))
  OR created_by = (select auth.uid())
  OR assignee_id = (select auth.uid())
  OR (brand_id IS NOT NULL AND public.bh_can_access_brand((select auth.uid()), brand_id))
);

DROP POLICY IF EXISTS "bh_task_comments read" ON public.bh_task_comments;
CREATE POLICY "bh_task_comments read" ON public.bh_task_comments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.bh_tasks t WHERE t.id = bh_task_comments.task_id));

DROP POLICY IF EXISTS "bh_task_attachments read" ON public.bh_task_attachments;
CREATE POLICY "bh_task_attachments read" ON public.bh_task_attachments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.bh_tasks t WHERE t.id = bh_task_attachments.task_id));

-- 2) likes scoped to visible posts/comments
DROP POLICY IF EXISTS "bh_likes read" ON public.bh_creative_likes;
CREATE POLICY "bh_likes read" ON public.bh_creative_likes FOR SELECT TO authenticated
USING (
  user_id = (select auth.uid())
  OR (post_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.bh_creative_posts p WHERE p.id = bh_creative_likes.post_id))
  OR (comment_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.bh_creative_post_comments c WHERE c.id = bh_creative_likes.comment_id))
);

-- 3) wallets read restricted to finance roles / investors
DROP POLICY IF EXISTS "wallets_read" ON public.wallets;
CREATE POLICY "wallets_read" ON public.wallets FOR SELECT TO authenticated
USING (
  public.has_role((select auth.uid()), 'admin'::app_role)
  OR public.has_role((select auth.uid()), 'manager'::app_role)
  OR public.has_role((select auth.uid()), 'accountant'::app_role)
  OR public.has_role((select auth.uid()), 'investor'::app_role)
);

-- 4) employees: sensitive compensation data limited to HR/admin/manager/accountant or self
DROP POLICY IF EXISTS "employees read brand scoped" ON public.employees;
DROP POLICY IF EXISTS "employees read privileged or self" ON public.employees;
CREATE POLICY "employees read privileged or self" ON public.employees FOR SELECT TO authenticated
USING (
  user_id = (select auth.uid())
  OR (
    has_brand_access((select auth.uid()), brand_id)
    AND (
      public.has_role((select auth.uid()), 'admin'::app_role)
      OR public.has_role((select auth.uid()), 'manager'::app_role)
      OR public.has_role((select auth.uid()), 'hr'::app_role)
      OR public.has_role((select auth.uid()), 'accountant'::app_role)
    )
  )
);

-- safe directory view (no salary / hourly_rate / note)
CREATE OR REPLACE VIEW public.employee_directory AS
SELECT e.id, e.name, e.position, e.active, e.brand_id, e.user_id
FROM public.employees e
WHERE has_brand_access((select auth.uid()), e.brand_id);
GRANT SELECT ON public.employee_directory TO authenticated;

-- 5) revoke public/anon execute on internal helper functions
REVOKE ALL ON FUNCTION public.can_read_page(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_write_page(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.page_access_level(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_page(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_page(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.page_access_level(uuid, text) TO authenticated, service_role;

-- 6) revoke signed-in execute on unused privileged maintenance functions
REVOKE ALL ON FUNCTION public.archive_financial_audit_logs(timestamp with time zone, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_release_order_dispatch_claim(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_financial_audit_logs(timestamp with time zone, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_release_order_dispatch_claim(uuid, boolean) TO service_role;