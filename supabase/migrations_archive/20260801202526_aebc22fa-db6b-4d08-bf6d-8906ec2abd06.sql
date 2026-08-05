
-- =============== 1) Courier settlements (COD reconciliation) ===============
CREATE TABLE IF NOT EXISTS public.courier_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE RESTRICT,
  courier_id uuid REFERENCES public.couriers(id) ON DELETE SET NULL,
  reference text,
  period_from date,
  period_to date,
  declared_total numeric NOT NULL DEFAULT 0,
  matched_total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS courier_settlements_brand_idx ON public.courier_settlements(brand_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courier_settlements TO authenticated;
GRANT ALL ON public.courier_settlements TO service_role;
ALTER TABLE public.courier_settlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "courier_settlements_read" ON public.courier_settlements;
CREATE POLICY "courier_settlements_read" ON public.courier_settlements FOR SELECT TO authenticated
  USING ((SELECT public.can_read_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));
DROP POLICY IF EXISTS "courier_settlements_insert" ON public.courier_settlements;
CREATE POLICY "courier_settlements_insert" ON public.courier_settlements FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));
DROP POLICY IF EXISTS "courier_settlements_update" ON public.courier_settlements;
CREATE POLICY "courier_settlements_update" ON public.courier_settlements FOR UPDATE TO authenticated
  USING ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)))
  WITH CHECK ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));
DROP POLICY IF EXISTS "courier_settlements_delete" ON public.courier_settlements;
CREATE POLICY "courier_settlements_delete" ON public.courier_settlements FOR DELETE TO authenticated
  USING ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));
DROP TRIGGER IF EXISTS courier_settlements_updated_at ON public.courier_settlements;
CREATE TRIGGER courier_settlements_updated_at BEFORE UPDATE ON public.courier_settlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.courier_settlement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES public.courier_settlements(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  tracking text,
  order_number text,
  declared_amount numeric NOT NULL DEFAULT 0,
  shipping_fee numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  system_amount numeric NOT NULL DEFAULT 0,
  match_status text NOT NULL DEFAULT 'unmatched',
  diff_reason text,
  posted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS courier_settlement_lines_settlement_idx ON public.courier_settlement_lines(settlement_id);
CREATE INDEX IF NOT EXISTS courier_settlement_lines_tracking_idx ON public.courier_settlement_lines(tracking);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courier_settlement_lines TO authenticated;
GRANT ALL ON public.courier_settlement_lines TO service_role;
ALTER TABLE public.courier_settlement_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "courier_settlement_lines_read" ON public.courier_settlement_lines;
CREATE POLICY "courier_settlement_lines_read" ON public.courier_settlement_lines FOR SELECT TO authenticated
  USING ((SELECT public.can_read_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));
DROP POLICY IF EXISTS "courier_settlement_lines_insert" ON public.courier_settlement_lines;
CREATE POLICY "courier_settlement_lines_insert" ON public.courier_settlement_lines FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));
DROP POLICY IF EXISTS "courier_settlement_lines_update" ON public.courier_settlement_lines;
CREATE POLICY "courier_settlement_lines_update" ON public.courier_settlement_lines FOR UPDATE TO authenticated
  USING ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)))
  WITH CHECK ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));
DROP POLICY IF EXISTS "courier_settlement_lines_delete" ON public.courier_settlement_lines;
CREATE POLICY "courier_settlement_lines_delete" ON public.courier_settlement_lines FOR DELETE TO authenticated
  USING ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));
DROP TRIGGER IF EXISTS courier_settlement_lines_updated_at ON public.courier_settlement_lines;
CREATE TRIGGER courier_settlement_lines_updated_at BEFORE UPDATE ON public.courier_settlement_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============== 2) Returns / exchanges ===============
CREATE TABLE IF NOT EXISTS public.order_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE RESTRICT,
  kind text NOT NULL DEFAULT 'return',
  reason text,
  status text NOT NULL DEFAULT 'requested',
  requested_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz,
  restocked boolean NOT NULL DEFAULT false,
  restocked_at timestamptz,
  refund_amount numeric NOT NULL DEFAULT 0,
  refunded_at timestamptz,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_returns_order_idx ON public.order_returns(order_id);
CREATE INDEX IF NOT EXISTS order_returns_brand_idx ON public.order_returns(brand_id, requested_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_returns TO authenticated;
GRANT ALL ON public.order_returns TO service_role;
ALTER TABLE public.order_returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_returns_read" ON public.order_returns;
CREATE POLICY "order_returns_read" ON public.order_returns FOR SELECT TO authenticated
  USING ((SELECT public.can_read_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));
DROP POLICY IF EXISTS "order_returns_insert" ON public.order_returns;
CREATE POLICY "order_returns_insert" ON public.order_returns FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));
DROP POLICY IF EXISTS "order_returns_update" ON public.order_returns;
CREATE POLICY "order_returns_update" ON public.order_returns FOR UPDATE TO authenticated
  USING ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)))
  WITH CHECK ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));
DROP POLICY IF EXISTS "order_returns_delete" ON public.order_returns;
CREATE POLICY "order_returns_delete" ON public.order_returns FOR DELETE TO authenticated
  USING ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));
DROP TRIGGER IF EXISTS order_returns_updated_at ON public.order_returns;
CREATE TRIGGER order_returns_updated_at BEFORE UPDATE ON public.order_returns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============== 3) Confirmation attempts ===============
CREATE TABLE IF NOT EXISTS public.order_confirmation_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE RESTRICT,
  channel text NOT NULL DEFAULT 'call',
  outcome text NOT NULL,
  reason text,
  note text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_confirmation_attempts_order_idx ON public.order_confirmation_attempts(order_id, attempted_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_confirmation_attempts TO authenticated;
GRANT ALL ON public.order_confirmation_attempts TO service_role;
ALTER TABLE public.order_confirmation_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_conf_attempts_read" ON public.order_confirmation_attempts;
CREATE POLICY "order_conf_attempts_read" ON public.order_confirmation_attempts FOR SELECT TO authenticated
  USING ((SELECT public.can_read_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));
DROP POLICY IF EXISTS "order_conf_attempts_insert" ON public.order_confirmation_attempts;
CREATE POLICY "order_conf_attempts_insert" ON public.order_confirmation_attempts FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));
DROP POLICY IF EXISTS "order_conf_attempts_update" ON public.order_confirmation_attempts;
CREATE POLICY "order_conf_attempts_update" ON public.order_confirmation_attempts FOR UPDATE TO authenticated
  USING ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)))
  WITH CHECK ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));
DROP POLICY IF EXISTS "order_conf_attempts_delete" ON public.order_confirmation_attempts;
CREATE POLICY "order_conf_attempts_delete" ON public.order_confirmation_attempts FOR DELETE TO authenticated
  USING ((SELECT public.can_write_page(auth.uid(), '/orders')) AND (SELECT public.has_brand_access(auth.uid(), brand_id)));

-- =============== 4) WhatsApp templates ===============
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  event_key text NOT NULL,
  body text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  auto_send boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_templates_event_idx ON public.whatsapp_templates(event_key, active);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_templates TO authenticated;
GRANT ALL ON public.whatsapp_templates TO service_role;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "whatsapp_templates_read" ON public.whatsapp_templates;
CREATE POLICY "whatsapp_templates_read" ON public.whatsapp_templates FOR SELECT TO authenticated
  USING ((SELECT public.can_read_page(auth.uid(), '/orders'))
         AND (brand_id IS NULL OR (SELECT public.has_brand_access(auth.uid(), brand_id))));
DROP POLICY IF EXISTS "whatsapp_templates_insert" ON public.whatsapp_templates;
CREATE POLICY "whatsapp_templates_insert" ON public.whatsapp_templates FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_write_page(auth.uid(), '/orders'))
         AND (brand_id IS NULL OR (SELECT public.has_brand_access(auth.uid(), brand_id))));
DROP POLICY IF EXISTS "whatsapp_templates_update" ON public.whatsapp_templates;
CREATE POLICY "whatsapp_templates_update" ON public.whatsapp_templates FOR UPDATE TO authenticated
  USING ((SELECT public.can_write_page(auth.uid(), '/orders'))
         AND (brand_id IS NULL OR (SELECT public.has_brand_access(auth.uid(), brand_id))))
  WITH CHECK ((SELECT public.can_write_page(auth.uid(), '/orders'))
         AND (brand_id IS NULL OR (SELECT public.has_brand_access(auth.uid(), brand_id))));
DROP POLICY IF EXISTS "whatsapp_templates_delete" ON public.whatsapp_templates;
CREATE POLICY "whatsapp_templates_delete" ON public.whatsapp_templates FOR DELETE TO authenticated
  USING ((SELECT public.can_write_page(auth.uid(), '/orders'))
         AND (brand_id IS NULL OR (SELECT public.has_brand_access(auth.uid(), brand_id))));
DROP TRIGGER IF EXISTS whatsapp_templates_updated_at ON public.whatsapp_templates;
CREATE TRIGGER whatsapp_templates_updated_at BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============== 5) SLA rules ===============
CREATE TABLE IF NOT EXISTS public.order_sla_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage text NOT NULL UNIQUE,
  max_hours integer NOT NULL DEFAULT 24,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_sla_rules TO authenticated;
GRANT ALL ON public.order_sla_rules TO service_role;
ALTER TABLE public.order_sla_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_sla_rules_read" ON public.order_sla_rules;
CREATE POLICY "order_sla_rules_read" ON public.order_sla_rules FOR SELECT TO authenticated
  USING ((SELECT public.can_read_page(auth.uid(), '/orders')));
DROP POLICY IF EXISTS "order_sla_rules_write" ON public.order_sla_rules;
CREATE POLICY "order_sla_rules_write" ON public.order_sla_rules FOR ALL TO authenticated
  USING ((SELECT public.can_write_page(auth.uid(), '/orders')))
  WITH CHECK ((SELECT public.can_write_page(auth.uid(), '/orders')));
DROP TRIGGER IF EXISTS order_sla_rules_updated_at ON public.order_sla_rules;
CREATE TRIGGER order_sla_rules_updated_at BEFORE UPDATE ON public.order_sla_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.order_sla_rules (stage, max_hours) VALUES
  ('new', 12), ('confirmed', 24), ('shipped', 72), ('out_for_delivery', 24)
ON CONFLICT (stage) DO NOTHING;

-- =============== 6) Bosta auto-tracking cron ===============
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
SELECT cron.unschedule('bosta-recall-15min') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bosta-recall-15min');
SELECT cron.schedule(
  'bosta-recall-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--d944a9f4-51ff-41a9-b533-bd734294c13b.lovable.app/api/public/hooks/bosta-recall',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_3yJ7RDrAbwi8q8G9Hv0vXA_759Mwag2"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
