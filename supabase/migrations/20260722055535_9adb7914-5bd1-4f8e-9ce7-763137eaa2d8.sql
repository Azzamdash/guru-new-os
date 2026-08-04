
-- =========================================
-- TASKS TABLE
-- =========================================
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  due_date DATE,
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers manage all tasks" ON public.tasks;
CREATE POLICY "Managers manage all tasks" ON public.tasks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

DROP POLICY IF EXISTS "Assignees view own tasks" ON public.tasks;
CREATE POLICY "Assignees view own tasks" ON public.tasks FOR SELECT TO authenticated
  USING (assignee_id = auth.uid() OR created_by = auth.uid());

DROP POLICY IF EXISTS "Assignees update status" ON public.tasks;
CREATE POLICY "Assignees update status" ON public.tasks FOR UPDATE TO authenticated
  USING (assignee_id = auth.uid())
  WITH CHECK (assignee_id = auth.uid());

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- USER SECTION ACCESS
-- =========================================
CREATE TABLE IF NOT EXISTS public.user_section_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, section)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_section_access TO authenticated;
GRANT ALL ON public.user_section_access TO service_role;
ALTER TABLE public.user_section_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own section access" ON public.user_section_access;
CREATE POLICY "Users read own section access" ON public.user_section_access FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Admins manage section access" ON public.user_section_access;
CREATE POLICY "Admins manage section access" ON public.user_section_access FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========================================
-- USER BRAND ACCESS
-- =========================================
CREATE TABLE IF NOT EXISTS public.user_brand_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, brand_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_brand_access TO authenticated;
GRANT ALL ON public.user_brand_access TO service_role;
ALTER TABLE public.user_brand_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own brand access" ON public.user_brand_access;
CREATE POLICY "Users read own brand access" ON public.user_brand_access FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Admins manage brand access" ON public.user_brand_access;
CREATE POLICY "Admins manage brand access" ON public.user_brand_access FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========================================
-- HELPERS
-- =========================================
CREATE OR REPLACE FUNCTION public.has_section_access(_user_id UUID, _section TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_role(_user_id,'admin')
    OR public.has_role(_user_id,'manager')
    OR EXISTS (SELECT 1 FROM public.user_section_access WHERE user_id = _user_id AND section = _section);
$$;

CREATE OR REPLACE FUNCTION public.has_brand_access(_user_id UUID, _brand_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_role(_user_id,'admin')
    OR public.has_role(_user_id,'manager')
    OR NOT EXISTS (SELECT 1 FROM public.user_brand_access WHERE user_id = _user_id)
    OR EXISTS (SELECT 1 FROM public.user_brand_access WHERE user_id = _user_id AND brand_id = _brand_id);
$$;
