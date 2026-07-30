-- Helper: brand access check
CREATE TABLE public.bh_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  tagline text NOT NULL DEFAULT '',
  accent text NOT NULL DEFAULT '#3FDBB1',
  bg text NOT NULL DEFAULT '#0E7C7B',
  logo_path text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bh_brands TO authenticated;
GRANT ALL ON public.bh_brands TO service_role;
ALTER TABLE public.bh_brands ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.bh_brand_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  brand_id uuid NOT NULL REFERENCES public.bh_brands(id) ON DELETE CASCADE,
  sections text[],
  hidden_resource_ids uuid[] NOT NULL DEFAULT '{}',
  hidden_wiki_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, brand_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bh_brand_access TO authenticated;
GRANT ALL ON public.bh_brand_access TO service_role;
ALTER TABLE public.bh_brand_access ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.bh_is_manager(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','manager')
  )
$$;

CREATE OR REPLACE FUNCTION public.bh_can_access_brand(_user_id uuid, _brand_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.bh_is_manager(_user_id)
     OR EXISTS (
       SELECT 1 FROM public.bh_brand_access
       WHERE user_id = _user_id AND brand_id = _brand_id
     )
$$;

CREATE POLICY "bh_brands read" ON public.bh_brands FOR SELECT TO authenticated
  USING (public.bh_can_access_brand(auth.uid(), id));
CREATE POLICY "bh_brands manage" ON public.bh_brands FOR ALL TO authenticated
  USING (public.bh_is_manager(auth.uid())) WITH CHECK (public.bh_is_manager(auth.uid()));

CREATE POLICY "bh_brand_access self read" ON public.bh_brand_access FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.bh_is_manager(auth.uid()));
CREATE POLICY "bh_brand_access manage" ON public.bh_brand_access FOR ALL TO authenticated
  USING (public.bh_is_manager(auth.uid())) WITH CHECK (public.bh_is_manager(auth.uid()));

CREATE TABLE public.bh_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.bh_brands(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  file_type text NOT NULL DEFAULT 'html',
  html_content text,
  storage_path text,
  url text,
  mime_type text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bh_resources_brand_idx ON public.bh_resources(brand_id, kind, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bh_resources TO authenticated;
GRANT ALL ON public.bh_resources TO service_role;
ALTER TABLE public.bh_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bh_resources read" ON public.bh_resources FOR SELECT TO authenticated
  USING (public.bh_can_access_brand(auth.uid(), brand_id));
CREATE POLICY "bh_resources manage" ON public.bh_resources FOR ALL TO authenticated
  USING (public.bh_is_manager(auth.uid())) WITH CHECK (public.bh_is_manager(auth.uid()));

CREATE TABLE public.bh_wiki_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.bh_brands(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bh_wiki_brand_idx ON public.bh_wiki_entries(brand_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bh_wiki_entries TO authenticated;
GRANT ALL ON public.bh_wiki_entries TO service_role;
ALTER TABLE public.bh_wiki_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bh_wiki read" ON public.bh_wiki_entries FOR SELECT TO authenticated
  USING (public.bh_can_access_brand(auth.uid(), brand_id));
CREATE POLICY "bh_wiki manage" ON public.bh_wiki_entries FOR ALL TO authenticated
  USING (public.bh_is_manager(auth.uid())) WITH CHECK (public.bh_is_manager(auth.uid()));

CREATE TABLE public.bh_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'todo',
  priority text NOT NULL DEFAULT 'medium',
  cadence text NOT NULL DEFAULT 'once',
  due_date date,
  completed_at timestamptz,
  assignee_id uuid,
  brand_id uuid REFERENCES public.bh_brands(id) ON DELETE SET NULL,
  created_by uuid,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bh_tasks TO authenticated;
GRANT ALL ON public.bh_tasks TO service_role;
ALTER TABLE public.bh_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bh_tasks read" ON public.bh_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "bh_tasks insert" ON public.bh_tasks FOR INSERT TO authenticated
  WITH CHECK (public.bh_is_manager(auth.uid()) OR created_by = auth.uid());
CREATE POLICY "bh_tasks update" ON public.bh_tasks FOR UPDATE TO authenticated
  USING (public.bh_is_manager(auth.uid()) OR assignee_id = auth.uid() OR created_by = auth.uid());
CREATE POLICY "bh_tasks delete" ON public.bh_tasks FOR DELETE TO authenticated
  USING (public.bh_is_manager(auth.uid()) OR created_by = auth.uid());

CREATE TABLE public.bh_task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.bh_tasks(id) ON DELETE CASCADE,
  author_id uuid,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bh_task_comments TO authenticated;
GRANT ALL ON public.bh_task_comments TO service_role;
ALTER TABLE public.bh_task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bh_task_comments read" ON public.bh_task_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "bh_task_comments insert" ON public.bh_task_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());
CREATE POLICY "bh_task_comments modify" ON public.bh_task_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.bh_is_manager(auth.uid()));
CREATE POLICY "bh_task_comments remove" ON public.bh_task_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.bh_is_manager(auth.uid()));

CREATE TABLE public.bh_task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.bh_tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  storage_path text,
  url text,
  mime_type text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bh_task_attachments TO authenticated;
GRANT ALL ON public.bh_task_attachments TO service_role;
ALTER TABLE public.bh_task_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bh_task_attachments read" ON public.bh_task_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "bh_task_attachments insert" ON public.bh_task_attachments FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "bh_task_attachments remove" ON public.bh_task_attachments FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.bh_is_manager(auth.uid()));

CREATE TABLE public.bh_creative_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid,
  brand_id uuid REFERENCES public.bh_brands(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'post',
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  image_path text,
  file_path text,
  file_name text,
  link_url text,
  mime_type text,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bh_creative_posts TO authenticated;
GRANT ALL ON public.bh_creative_posts TO service_role;
ALTER TABLE public.bh_creative_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bh_posts read" ON public.bh_creative_posts FOR SELECT TO authenticated
  USING (hidden = false OR author_id = auth.uid() OR public.bh_is_manager(auth.uid()));
CREATE POLICY "bh_posts insert" ON public.bh_creative_posts FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());
CREATE POLICY "bh_posts update" ON public.bh_creative_posts FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.bh_is_manager(auth.uid()));
CREATE POLICY "bh_posts delete" ON public.bh_creative_posts FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.bh_is_manager(auth.uid()));

CREATE TABLE public.bh_creative_post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.bh_creative_posts(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.bh_creative_post_comments(id) ON DELETE CASCADE,
  author_id uuid,
  body text NOT NULL,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bh_creative_post_comments TO authenticated;
GRANT ALL ON public.bh_creative_post_comments TO service_role;
ALTER TABLE public.bh_creative_post_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bh_post_comments read" ON public.bh_creative_post_comments FOR SELECT TO authenticated
  USING (hidden = false OR author_id = auth.uid() OR public.bh_is_manager(auth.uid()));
CREATE POLICY "bh_post_comments insert" ON public.bh_creative_post_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());
CREATE POLICY "bh_post_comments update" ON public.bh_creative_post_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.bh_is_manager(auth.uid()));
CREATE POLICY "bh_post_comments delete" ON public.bh_creative_post_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.bh_is_manager(auth.uid()));

CREATE TABLE public.bh_creative_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  post_id uuid REFERENCES public.bh_creative_posts(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES public.bh_creative_post_comments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX bh_likes_post_uniq ON public.bh_creative_likes(user_id, post_id) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX bh_likes_comment_uniq ON public.bh_creative_likes(user_id, comment_id) WHERE comment_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bh_creative_likes TO authenticated;
GRANT ALL ON public.bh_creative_likes TO service_role;
ALTER TABLE public.bh_creative_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bh_likes read" ON public.bh_creative_likes FOR SELECT TO authenticated USING (true);
CREATE POLICY "bh_likes insert" ON public.bh_creative_likes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "bh_likes delete" ON public.bh_creative_likes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE public.bh_creative_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid,
  post_id uuid REFERENCES public.bh_creative_posts(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES public.bh_creative_post_comments(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bh_creative_reports TO authenticated;
GRANT ALL ON public.bh_creative_reports TO service_role;
ALTER TABLE public.bh_creative_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bh_reports read" ON public.bh_creative_reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.bh_is_manager(auth.uid()));
CREATE POLICY "bh_reports insert" ON public.bh_creative_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "bh_reports manage" ON public.bh_creative_reports FOR UPDATE TO authenticated
  USING (public.bh_is_manager(auth.uid()));
CREATE POLICY "bh_reports remove" ON public.bh_creative_reports FOR DELETE TO authenticated
  USING (public.bh_is_manager(auth.uid()));

CREATE TRIGGER bh_brands_touch BEFORE UPDATE ON public.bh_brands FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER bh_resources_touch BEFORE UPDATE ON public.bh_resources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER bh_wiki_touch BEFORE UPDATE ON public.bh_wiki_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER bh_tasks_touch BEFORE UPDATE ON public.bh_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER bh_task_comments_touch BEFORE UPDATE ON public.bh_task_comments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER bh_posts_touch BEFORE UPDATE ON public.bh_creative_posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER bh_post_comments_touch BEFORE UPDATE ON public.bh_creative_post_comments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER bh_reports_touch BEFORE UPDATE ON public.bh_creative_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();