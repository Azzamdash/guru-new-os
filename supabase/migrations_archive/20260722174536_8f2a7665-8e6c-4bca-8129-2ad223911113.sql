
-- add investor role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'investor';

-- investors table
CREATE TABLE IF NOT EXISTS public.investors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  notes text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.investors TO authenticated;
GRANT ALL ON public.investors TO service_role;
ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "investors admin all" ON public.investors;
CREATE POLICY "investors admin all" ON public.investors
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "investors self read" ON public.investors;
CREATE POLICY "investors self read" ON public.investors
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS investors_updated ON public.investors;
CREATE TRIGGER investors_updated
  BEFORE UPDATE ON public.investors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- shares table
CREATE TABLE IF NOT EXISTS public.investor_brand_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id uuid NOT NULL REFERENCES public.investors(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  share_percentage numeric(6,3) NOT NULL CHECK (share_percentage > 0 AND share_percentage <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (investor_id, brand_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.investor_brand_shares TO authenticated;
GRANT ALL ON public.investor_brand_shares TO service_role;
ALTER TABLE public.investor_brand_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shares admin all" ON public.investor_brand_shares;
CREATE POLICY "shares admin all" ON public.investor_brand_shares
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "shares self read" ON public.investor_brand_shares;
CREATE POLICY "shares self read" ON public.investor_brand_shares
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.investors i
    WHERE i.id = investor_brand_shares.investor_id AND i.user_id = auth.uid()
  ));

DROP TRIGGER IF EXISTS investor_shares_updated ON public.investor_brand_shares;
CREATE TRIGGER investor_shares_updated
  BEFORE UPDATE ON public.investor_brand_shares
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- helper: is user an investor in brand (for future use)
CREATE OR REPLACE FUNCTION public.is_investor_of_brand(_user_id uuid, _brand_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.investor_brand_shares s
    JOIN public.investors i ON i.id = s.investor_id
    WHERE i.user_id = _user_id AND s.brand_id = _brand_id
  );
$$;
