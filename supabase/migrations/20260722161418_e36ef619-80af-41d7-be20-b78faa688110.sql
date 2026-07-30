
CREATE TABLE public.brand_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  credentials_ciphertext text,
  last_sync_at timestamptz,
  last_sync_summary jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, provider)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_integrations TO authenticated;
GRANT ALL ON public.brand_integrations TO service_role;

ALTER TABLE public.brand_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integrations read brand scoped" ON public.brand_integrations
FOR SELECT TO authenticated
USING (
  (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  AND public.has_brand_access(auth.uid(), brand_id)
);

CREATE POLICY "integrations write brand scoped" ON public.brand_integrations
FOR ALL TO authenticated
USING (
  (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  AND public.has_brand_access(auth.uid(), brand_id)
)
WITH CHECK (
  (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  AND public.has_brand_access(auth.uid(), brand_id)
);

CREATE TRIGGER trg_brand_integrations_updated
BEFORE UPDATE ON public.brand_integrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
