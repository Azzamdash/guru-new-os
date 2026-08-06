-- Backfill historical provider payloads after the schema/functions migration commits.
-- Keep reads available while the payload archive is populated, then hold an
-- ACCESS EXCLUSIVE lock only for the trigger-suppressed metadata/raw rewrite.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';

-- Prevent a concurrent provider write between the archive snapshot and raw cleanup.
-- SHARE ROW EXCLUSIVE blocks writers but remains compatible with ordinary readers.
LOCK TABLE public.orders IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO public.order_source_payloads(order_id, brand_id, source, payload, payload_hash, payload_bytes)
SELECT o.id, o.brand_id, COALESCE(NULLIF(lower(btrim(o.source)), ''), 'system'), o.raw,
  encode(extensions.digest(o.raw::text, 'sha256'), 'hex'), octet_length(o.raw::text)
FROM public.orders o
WHERE o.raw IS NOT NULL AND o.raw <> '{}'::jsonb
ON CONFLICT (order_id, source, payload_hash) DO NOTHING;

-- This is metadata/raw-only. Suppress business/audit triggers so it cannot
-- recalculate invoices/courier charges or duplicate the archived JSON.
-- Snapshot every user trigger state so intentionally disabled/replica/always
-- triggers are restored exactly on success; rollback remains transactional.
CREATE TEMP TABLE orders_user_trigger_state ON COMMIT DROP AS
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.orders'::regclass AND NOT tgisinternal;
ALTER TABLE public.orders DISABLE TRIGGER USER;
UPDATE public.orders SET
  bosta_tracking = COALESCE(bosta_tracking, NULLIF(raw->>'bosta_tracking', '')),
  bosta_delivery_id = COALESCE(bosta_delivery_id, NULLIF(raw->>'bosta_delivery_id', '')),
  bosta_sent_at = GREATEST(bosta_sent_at, public.try_parse_source_timestamptz(raw->>'bosta_sent_at')),
  bosta_manual_attached_at = GREATEST(
    bosta_manual_attached_at,
    public.try_parse_source_timestamptz(raw->>'bosta_manual_attached_at')
  ),
  bosta_event_at = GREATEST(bosta_event_at, COALESCE(
    public.try_parse_source_timestamptz(raw->>'bosta_event_at'),
    public.try_parse_source_timestamptz(raw->>'bosta_provider_event_at'),
    public.try_parse_source_timestamptz(raw->>'bosta_last_pull_at'),
    public.try_parse_source_timestamptz(raw #>> '{bosta,provider_event_at}'),
    public.try_parse_source_timestamptz(raw #>> '{bosta,response,data,state,updatedAt}'),
    public.try_parse_source_timestamptz(raw #>> '{bosta,response,data,updatedAt}'),
    public.try_parse_source_timestamptz(raw #>> '{bosta,pulled_at}'),
    CASE WHEN lifecycle_source = 'bosta' THEN lifecycle_updated_at END
  )),
  dispatch_tracking = COALESCE(dispatch_tracking, NULLIF(raw->>'dispatch_tracking', '')),
  dispatch_claim_token = CASE
    WHEN dispatch_claim_token IS NOT NULL THEN dispatch_claim_token
    WHEN COALESCE(raw->>'dispatch_claim_token', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (raw->>'dispatch_claim_token')::uuid
    ELSE NULL
  END,
  dispatch_claimed_by = CASE
    WHEN dispatch_claim_token IS NOT NULL THEN dispatch_claimed_by
    WHEN COALESCE(raw->>'dispatch_claimed_by', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND EXISTS (
        SELECT 1 FROM auth.users u WHERE u.id = (orders.raw->>'dispatch_claimed_by')::uuid
      )
    THEN (raw->>'dispatch_claimed_by')::uuid
    ELSE NULL
  END,
  dispatch_claimed_at = CASE
    WHEN dispatch_claim_token IS NOT NULL THEN dispatch_claimed_at
    ELSE public.try_parse_source_timestamptz(raw->>'dispatch_claimed_at')
  END,
  raw = '{}'::jsonb
WHERE raw IS NOT NULL AND raw <> '{}'::jsonb;
DO $$
DECLARE trigger_state record;
BEGIN
  FOR trigger_state IN SELECT tgname, tgenabled FROM orders_user_trigger_state LOOP
    EXECUTE format(
      'ALTER TABLE public.orders %s TRIGGER %I',
      CASE trigger_state.tgenabled
        WHEN 'D' THEN 'DISABLE'
        WHEN 'R' THEN 'ENABLE REPLICA'
        WHEN 'A' THEN 'ENABLE ALWAYS'
        ELSE 'ENABLE'
      END,
      trigger_state.tgname
    );
  END LOOP;
END;
$$;
