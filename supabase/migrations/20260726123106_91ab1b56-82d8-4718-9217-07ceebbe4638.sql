
CREATE TABLE IF NOT EXISTS public.integration_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider TEXT NOT NULL,
  brand_id UUID NULL REFERENCES public.brands(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('outgoing','incoming','webhook','internal')),
  operation TEXT NOT NULL,
  order_number TEXT NULL,
  order_id UUID NULL,
  tracking_number TEXT NULL,
  status TEXT NOT NULL CHECK (status IN ('success','error','info','warning')),
  http_status INT NULL,
  reason TEXT NULL,
  request JSONB NULL,
  response JSONB NULL,
  metadata JSONB NULL,
  actor_id UUID NULL
);

CREATE INDEX IF NOT EXISTS idx_integration_logs_created_at ON public.integration_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_integration_logs_provider ON public.integration_logs (provider);
CREATE INDEX IF NOT EXISTS idx_integration_logs_brand ON public.integration_logs (brand_id);
CREATE INDEX IF NOT EXISTS idx_integration_logs_order_number ON public.integration_logs (order_number);
CREATE INDEX IF NOT EXISTS idx_integration_logs_status ON public.integration_logs (status);
CREATE INDEX IF NOT EXISTS idx_integration_logs_op ON public.integration_logs (operation);

GRANT SELECT ON public.integration_logs TO authenticated;
GRANT ALL ON public.integration_logs TO service_role;

ALTER TABLE public.integration_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin/manager read integration logs" ON public.integration_logs;
CREATE POLICY "admin/manager read integration logs"
  ON public.integration_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
