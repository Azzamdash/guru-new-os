-- Move large source payloads and operational dispatch metadata out of the hot orders row.
-- Full payloads remain preserved in order_source_payloads; no source data is discarded.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS bosta_tracking text,
  ADD COLUMN IF NOT EXISTS bosta_delivery_id text,
  ADD COLUMN IF NOT EXISTS bosta_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS bosta_manual_attached_at timestamptz,
  ADD COLUMN IF NOT EXISTS bosta_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_tracking text,
  ADD COLUMN IF NOT EXISTS dispatch_claim_token uuid,
  ADD COLUMN IF NOT EXISTS dispatch_claimed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dispatch_claimed_at timestamptz;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE COALESCE(bosta_tracking, NULLIF(raw->>'bosta_tracking', '')) IS NOT NULL
    GROUP BY COALESCE(bosta_tracking, NULLIF(raw->>'bosta_tracking', ''))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate Bosta tracking values must be reconciled before this migration';
  END IF;
END;
$$;
CREATE UNIQUE INDEX IF NOT EXISTS orders_bosta_tracking_unique_idx
  ON public.orders (bosta_tracking) WHERE bosta_tracking IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_open_bosta_recall_idx
  ON public.orders (brand_id, occurred_at DESC, id)
  WHERE bosta_tracking IS NOT NULL
    AND fulfillment_status NOT IN ('delivered', 'returned', 'cancelled');
CREATE INDEX IF NOT EXISTS orders_dispatch_claim_idx
  ON public.orders (dispatch_claim_token) WHERE dispatch_claim_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.order_source_payloads (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  source text NOT NULL,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  payload_bytes integer NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_source_payloads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_source_payloads_read ON public.order_source_payloads;
CREATE POLICY order_source_payloads_read ON public.order_source_payloads
FOR SELECT TO authenticated USING (
  public.can_read_page(auth.uid(), '/orders')
  AND public.has_brand_access(auth.uid(), brand_id)
);
GRANT SELECT ON public.order_source_payloads TO authenticated;
REVOKE ALL ON public.order_source_payloads FROM service_role;
GRANT SELECT, INSERT ON public.order_source_payloads TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.order_source_payloads_id_seq TO service_role;
CREATE INDEX IF NOT EXISTS order_source_payloads_brand_updated_idx
  ON public.order_source_payloads (brand_id, archived_at DESC);
CREATE INDEX IF NOT EXISTS order_source_payloads_hash_idx
  ON public.order_source_payloads (payload_hash);
CREATE UNIQUE INDEX IF NOT EXISTS order_source_payloads_event_unique_idx
  ON public.order_source_payloads (order_id, source, payload_hash);
CREATE INDEX IF NOT EXISTS order_source_payloads_order_latest_idx
  ON public.order_source_payloads (order_id, source, archived_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.archive_order_source_payload(
  _order_id uuid,
  _source text,
  _payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_brand_id uuid;
  next_hash text;
BEGIN
  IF _payload IS NULL THEN RETURN; END IF;
  SELECT brand_id INTO target_brand_id FROM public.orders WHERE id = _order_id;
  IF target_brand_id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF auth.uid() IS NOT NULL AND (
    NOT public.has_brand_access(auth.uid(), target_brand_id)
    OR NOT (
      public.can_write_page(auth.uid(), '/orders')
      OR public.can_write_page(auth.uid(), '/couriers')
      OR public.can_write_page(auth.uid(), '/integrations')
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  next_hash := encode(extensions.digest(_payload::text, 'sha256'), 'hex');
  INSERT INTO public.order_source_payloads(
    order_id, brand_id, source, payload, payload_hash, payload_bytes, archived_at
  ) VALUES (
    _order_id, target_brand_id, lower(btrim(_source)), _payload, next_hash,
    octet_length(_payload::text), now()
  )
  ON CONFLICT (order_id, source, payload_hash) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.archive_order_source_payload(uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_order_source_payload(uuid,text,jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.upsert_shopify_order_with_archive(
  _order_id uuid,
  _order_patch jsonb,
  _items jsonb,
  _payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_order_id uuid;
  identity_order_id uuid;
  identity_brand_id uuid;
  identity_source text;
  identity_external_id text;
BEGIN
  IF _payload IS NULL OR jsonb_typeof(_payload) <> 'object' THEN
    RAISE EXCEPTION 'Shopify payload must be a JSON object';
  END IF;
  BEGIN
    identity_brand_id := NULLIF(_order_patch->>'brand_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Valid Shopify brand identity is required';
  END;
  identity_source := lower(NULLIF(btrim(_order_patch->>'source'), ''));
  identity_external_id := NULLIF(btrim(_order_patch->>'external_id'), '');
  IF identity_brand_id IS NULL OR identity_source <> 'shopify' OR identity_external_id IS NULL THEN
    RAISE EXCEPTION 'Complete Shopify order identity is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    identity_brand_id::text || E'\x1f' || identity_source || E'\x1f' || identity_external_id,
    0
  ));
  SELECT id INTO identity_order_id
  FROM public.orders
  WHERE brand_id = identity_brand_id
    AND source = identity_source
    AND external_id = identity_external_id
  FOR UPDATE;
  IF identity_order_id IS NOT NULL AND _order_id IS NOT NULL AND identity_order_id <> _order_id THEN
    RAISE EXCEPTION 'Shopify order identity conflicts with supplied order id';
  END IF;
  IF identity_order_id IS NULL AND _order_id IS NOT NULL THEN
    SELECT id INTO identity_order_id
    FROM public.orders
    WHERE id = _order_id
      AND brand_id = identity_brand_id
      AND source = identity_source
      AND external_id = identity_external_id
    FOR UPDATE;
    IF identity_order_id IS NULL THEN
      RAISE EXCEPTION 'Supplied order id does not match the Shopify identity';
    END IF;
  END IF;
  target_order_id := COALESCE(identity_order_id, _order_id);
  target_order_id := public.upsert_order_with_items(
    target_order_id,
    jsonb_set(_order_patch, '{raw}', '{}'::jsonb, true),
    _items
  );
  PERFORM public.archive_order_source_payload(target_order_id, 'shopify', _payload);
  RETURN target_order_id;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_shopify_order_with_archive(uuid,jsonb,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_shopify_order_with_archive(uuid,jsonb,jsonb,jsonb)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_bosta_lifecycle(
  _order_id uuid,
  _provider_event_at timestamptz,
  _tracking text,
  _state text,
  _collection_state text,
  _order_status text,
  _collection_status text,
  _shipment_outcome text,
  _fulfillment_status text,
  _shopify_sync_status text,
  _shopify_sync_error text,
  _payload jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_order public.orders%ROWTYPE;
  current_rank integer;
  incoming_rank integer;
  current_collection_rank integer;
  incoming_collection_rank integer;
  current_tiebreak text;
  incoming_tiebreak text;
  apply_shipment boolean := true;
  apply_collection boolean := true;
BEGIN
  SELECT * INTO current_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF auth.uid() IS NOT NULL AND (
    NOT public.has_brand_access(auth.uid(), current_order.brand_id)
    OR NOT (public.can_write_page(auth.uid(), '/orders') OR public.can_write_page(auth.uid(), '/couriers'))
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Audit every distinct provider payload, including stale events rejected below.
  PERFORM public.archive_order_source_payload(_order_id, 'bosta', _payload);

  current_rank := CASE
    WHEN lower(COALESCE(current_order.courier_status_raw, '')) ~ 'returned|returning|rtb' THEN 110
    WHEN lower(COALESCE(current_order.courier_status_raw, '')) ~ 'delivered' THEN 100
    WHEN lower(COALESCE(current_order.courier_status_raw, '')) ~ 'cancel|terminated' THEN 90
    WHEN lower(COALESCE(current_order.courier_status_raw, '')) ~ 'out for delivery' THEN 50
    WHEN lower(COALESCE(current_order.courier_status_raw, '')) ~ 'transit' THEN 40
    WHEN lower(COALESCE(current_order.courier_status_raw, '')) ~ 'picked|received' THEN 30
    WHEN lower(COALESCE(current_order.courier_status_raw, '')) ~ 'new|created' THEN 10
    ELSE 20
  END;
  incoming_rank := CASE
    WHEN lower(COALESCE(_state, '')) ~ 'returned|returning|rtb' THEN 110
    WHEN lower(COALESCE(_state, '')) ~ 'delivered' THEN 100
    WHEN lower(COALESCE(_state, '')) ~ 'cancel|terminated' THEN 90
    WHEN lower(COALESCE(_state, '')) ~ 'out for delivery' THEN 50
    WHEN lower(COALESCE(_state, '')) ~ 'transit' THEN 40
    WHEN lower(COALESCE(_state, '')) ~ 'picked|received' THEN 30
    WHEN lower(COALESCE(_state, '')) ~ 'new|created' THEN 10
    ELSE 20
  END;
  current_collection_rank := CASE
    WHEN lower(btrim(COALESCE(current_order.collection_status, ''))) = 'paid' THEN 30
    WHEN lower(btrim(COALESCE(current_order.collection_status, ''))) = 'processing' THEN 20
    ELSE 10
  END;
  incoming_collection_rank := CASE
    WHEN lower(btrim(COALESCE(_collection_status, ''))) = 'paid' THEN 30
    WHEN lower(btrim(COALESCE(_collection_status, ''))) = 'processing' THEN 20
    ELSE 10
  END;
  current_tiebreak := concat_ws(E'\x1f',
    lower(COALESCE(current_order.courier_status_raw, '')),
    lower(COALESCE(current_order.courier_collection_status_raw, '')),
    COALESCE(current_order.order_status, ''),
    COALESCE(current_order.collection_status, ''),
    COALESCE(current_order.shipment_outcome, ''),
    COALESCE(current_order.fulfillment_status, '')
  );
  incoming_tiebreak := concat_ws(E'\x1f',
    lower(COALESCE(_state, '')),
    lower(COALESCE(_collection_state, '')),
    COALESCE(_order_status, ''),
    COALESCE(_collection_status, ''),
    COALESCE(_shipment_outcome, ''),
    COALESCE(_fulfillment_status, '')
  );

  IF current_order.bosta_event_at IS NOT NULL AND (
    _provider_event_at IS NULL OR _provider_event_at < current_order.bosta_event_at
  ) THEN
    RETURN false;
  END IF;
  IF current_order.bosta_event_at IS NOT NULL
     AND _provider_event_at = current_order.bosta_event_at THEN
    IF incoming_rank = current_rank AND incoming_collection_rank = current_collection_rank THEN
      IF incoming_tiebreak <= current_tiebreak THEN RETURN false; END IF;
    ELSE
      apply_shipment := incoming_rank > current_rank;
      apply_collection := incoming_collection_rank > current_collection_rank;
      IF NOT apply_shipment AND NOT apply_collection THEN RETURN false; END IF;
    END IF;
  END IF;

  IF _provider_event_at IS NULL AND current_order.bosta_event_at IS NULL THEN
    IF incoming_rank = current_rank AND incoming_collection_rank = current_collection_rank THEN
      IF incoming_tiebreak <= current_tiebreak THEN RETURN false; END IF;
    ELSE
      apply_shipment := incoming_rank > current_rank;
      apply_collection := incoming_collection_rank > current_collection_rank;
      IF NOT apply_shipment AND NOT apply_collection THEN RETURN false; END IF;
    END IF;
  END IF;

  -- Collection settlement is independently monotone, including for newer provider events.
  IF incoming_collection_rank < current_collection_rank THEN apply_collection := false; END IF;

  IF apply_shipment
     AND current_order.shipment_outcome IN ('returned', 'customer_returned', 'exchanged')
     AND _shipment_outcome IS DISTINCT FROM current_order.shipment_outcome THEN
    RETURN false;
  END IF;
  IF apply_shipment
     AND current_order.shipment_outcome = 'delivered'
     AND _shipment_outcome NOT IN ('delivered', 'returned', 'customer_returned', 'exchanged') THEN
    RETURN false;
  END IF;
  IF apply_shipment
     AND current_order.shipment_outcome = 'cancelled_before_dispatch'
     AND _shipment_outcome = 'open' THEN
    RETURN false;
  END IF;

  UPDATE public.orders SET
    order_status = CASE WHEN apply_shipment THEN _order_status ELSE order_status END,
    collection_status = CASE WHEN apply_collection THEN _collection_status ELSE collection_status END,
    shipment_outcome = CASE WHEN apply_shipment THEN _shipment_outcome ELSE shipment_outcome END,
    fulfillment_status = CASE WHEN apply_shipment
      THEN COALESCE(NULLIF(_fulfillment_status, ''), fulfillment_status)
      ELSE fulfillment_status END,
    courier_status_raw = CASE WHEN apply_shipment THEN _state ELSE courier_status_raw END,
    courier_collection_status_raw = CASE WHEN apply_collection
      THEN _collection_state ELSE courier_collection_status_raw END,
    lifecycle_source = 'bosta',
    lifecycle_updated_by = NULL,
    lifecycle_updated_at = now(),
    bosta_event_at = COALESCE(_provider_event_at, bosta_event_at),
    bosta_tracking = COALESCE(NULLIF(btrim(_tracking), ''), bosta_tracking),
    shopify_sync_status = CASE WHEN apply_shipment THEN _shopify_sync_status ELSE shopify_sync_status END,
    shopify_sync_error = CASE WHEN apply_shipment THEN _shopify_sync_error ELSE shopify_sync_error END
  WHERE id = _order_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_bosta_lifecycle(uuid,timestamptz,text,text,text,text,text,text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_bosta_lifecycle(uuid,timestamptz,text,text,text,text,text,text,text,text,text,jsonb) TO authenticated, service_role;

-- Install the compact audit function before the bulk raw cleanup so the old
-- payload is not copied into financial_audit_log a second time.
CREATE OR REPLACE FUNCTION public.log_financial_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  rec_id uuid;
  old_snapshot jsonb;
  new_snapshot jsonb;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_snapshot := to_jsonb(OLD);
    IF TG_TABLE_NAME = 'orders' THEN old_snapshot := old_snapshot - 'raw'; END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_snapshot := to_jsonb(NEW);
    IF TG_TABLE_NAME = 'orders' THEN new_snapshot := new_snapshot - 'raw'; END IF;
  END IF;
  rec_id := COALESCE((new_snapshot->>'id')::uuid, (old_snapshot->>'id')::uuid);
  INSERT INTO public.financial_audit_log(table_name, record_id, operation, actor_id, old_data, new_data)
  VALUES (TG_TABLE_NAME, rec_id, TG_OP, auth.uid(), old_snapshot, new_snapshot);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.try_parse_source_timestamptz(_value text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NULLIF(btrim(_value), '') IS NULL THEN RETURN NULL; END IF;
  RETURN _value::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.try_parse_source_timestamptz(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.claim_order_dispatch(_order_id uuid, _claim_token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_order public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO current_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.has_brand_access(auth.uid(), current_order.brand_id)
     OR NOT (public.can_write_page(auth.uid(), '/orders') OR public.can_write_page(auth.uid(), '/couriers')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF current_order.shipment_outcome IN (
    'delivered', 'returned', 'customer_returned', 'exchanged', 'cancelled_before_dispatch'
  ) THEN
    RAISE EXCEPTION 'Cannot dispatch a terminal order';
  END IF;
  IF current_order.bosta_tracking IS NOT NULL
     OR current_order.dispatch_tracking IS NOT NULL
     OR current_order.dispatch_claim_token IS NOT NULL THEN
    RAISE EXCEPTION 'Order is already dispatched or dispatch is in progress';
  END IF;
  UPDATE public.orders SET
    dispatch_claim_token = _claim_token,
    dispatch_claimed_by = auth.uid(),
    dispatch_claimed_at = now()
  WHERE id = _order_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_order_dispatch_claim(_order_id uuid, _claim_token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.orders SET
    dispatch_claim_token = NULL,
    dispatch_claimed_by = NULL,
    dispatch_claimed_at = NULL
  WHERE id = _order_id
    AND dispatch_claim_token = _claim_token
    AND dispatch_claimed_by = auth.uid();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_order_dispatch(
  _order_id uuid,
  _claim_token uuid,
  _tracking text,
  _delivery_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_order public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NULLIF(btrim(_tracking), '') IS NULL THEN RAISE EXCEPTION 'Tracking is required'; END IF;
  SELECT * INTO current_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.has_brand_access(auth.uid(), current_order.brand_id)
     OR NOT (public.can_write_page(auth.uid(), '/orders') OR public.can_write_page(auth.uid(), '/couriers')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF current_order.dispatch_claim_token IS DISTINCT FROM _claim_token
     OR current_order.dispatch_claimed_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Dispatch claim is no longer owned by this request';
  END IF;
  IF current_order.bosta_tracking IS NOT NULL OR current_order.dispatch_tracking IS NOT NULL THEN
    RAISE EXCEPTION 'Order already has tracking';
  END IF;
  IF current_order.shipment_outcome IN (
    'delivered', 'returned', 'customer_returned', 'exchanged', 'cancelled_before_dispatch'
  ) THEN
    RAISE EXCEPTION 'Cannot finalize dispatch for a terminal order';
  END IF;
  UPDATE public.orders SET
    fulfillment_status = 'shipped',
    order_status = 'processing',
    collection_status = 'processing',
    shipment_outcome = 'open',
    courier_status_raw = 'created',
    courier_collection_status_raw = 'pending',
    lifecycle_source = 'bosta',
    lifecycle_updated_by = NULL,
    lifecycle_updated_at = now(),
    bosta_tracking = btrim(_tracking),
    bosta_delivery_id = NULLIF(btrim(_delivery_id), ''),
    bosta_sent_at = now(),
    dispatch_claim_token = NULL,
    dispatch_claimed_by = NULL,
    dispatch_claimed_at = NULL
  WHERE id = _order_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_release_order_dispatch_claim(
  _order_id uuid,
  _confirmed_absent_on_bosta boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_order public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
     OR NOT public.can_write_page(auth.uid(), '/couriers') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF NOT COALESCE(_confirmed_absent_on_bosta, false) THEN
    RAISE EXCEPTION 'Confirm that no Bosta delivery exists before releasing the claim';
  END IF;
  SELECT * INTO current_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.has_brand_access(auth.uid(), current_order.brand_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.orders SET
    dispatch_claim_token = NULL,
    dispatch_claimed_by = NULL,
    dispatch_claimed_at = NULL
  WHERE id = _order_id
    AND dispatch_claim_token IS NOT NULL
    AND dispatch_claimed_at < now() - interval '15 minutes'
    AND bosta_tracking IS NULL
    AND dispatch_tracking IS NULL;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_generic_order_dispatch(
  _order_id uuid,
  _claim_token uuid,
  _courier_id uuid,
  _tracking text,
  _provider_tracking boolean,
  _note text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE current_order public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NULLIF(btrim(_tracking), '') IS NULL THEN RAISE EXCEPTION 'Tracking is required'; END IF;
  SELECT * INTO current_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.has_brand_access(auth.uid(), current_order.brand_id)
     OR NOT public.can_write_page(auth.uid(), '/couriers')
     OR NOT public.courier_serves_brand(_courier_id, current_order.brand_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF current_order.dispatch_claim_token IS DISTINCT FROM _claim_token
     OR current_order.dispatch_claimed_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Dispatch claim is no longer owned by this request';
  END IF;
  IF current_order.bosta_tracking IS NOT NULL OR current_order.dispatch_tracking IS NOT NULL THEN
    RAISE EXCEPTION 'Order already has tracking';
  END IF;
  IF current_order.shipment_outcome IN (
    'delivered', 'returned', 'customer_returned', 'exchanged', 'cancelled_before_dispatch'
  ) THEN
    RAISE EXCEPTION 'Cannot finalize dispatch for a terminal order';
  END IF;
  UPDATE public.orders SET
    courier_id = _courier_id,
    fulfillment_status = 'processing',
    lifecycle_source = CASE WHEN _provider_tracking THEN 'bosta' ELSE 'system' END,
    lifecycle_updated_by = NULL,
    lifecycle_updated_at = now(),
    note = _note,
    bosta_tracking = CASE WHEN _provider_tracking THEN btrim(_tracking) ELSE NULL END,
    bosta_sent_at = CASE WHEN _provider_tracking THEN now() ELSE bosta_sent_at END,
    dispatch_tracking = CASE WHEN _provider_tracking THEN NULL ELSE btrim(_tracking) END,
    dispatch_claim_token = NULL,
    dispatch_claimed_by = NULL,
    dispatch_claimed_at = NULL
  WHERE id = _order_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_order_dispatch(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_order_dispatch_claim(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_order_dispatch(uuid,uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_release_order_dispatch_claim(uuid,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_generic_order_dispatch(uuid,uuid,uuid,text,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_order_dispatch(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_order_dispatch_claim(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_order_dispatch(uuid,uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_release_order_dispatch_claim(uuid,boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_generic_order_dispatch(uuid,uuid,uuid,text,boolean,text) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.financial_audit_log_archive
(LIKE public.financial_audit_log INCLUDING ALL);
ALTER TABLE public.financial_audit_log_archive ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_audit_log_archive_read ON public.financial_audit_log_archive;
CREATE POLICY financial_audit_log_archive_read ON public.financial_audit_log_archive
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
);
GRANT SELECT ON public.financial_audit_log_archive TO authenticated;
GRANT ALL ON public.financial_audit_log_archive TO service_role;
CREATE INDEX IF NOT EXISTS financial_audit_archive_created_idx
  ON public.financial_audit_log_archive (created_at DESC);

CREATE OR REPLACE FUNCTION public.archive_financial_audit_logs(
  _before timestamptz DEFAULT now() - interval '180 days',
  _limit integer DEFAULT 10000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  moved integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  WITH picked AS MATERIALIZED (
    SELECT id FROM public.financial_audit_log
    WHERE created_at < _before ORDER BY created_at LIMIT LEAST(GREATEST(_limit, 1), 50000)
    FOR UPDATE SKIP LOCKED
  ), archived AS (
    INSERT INTO public.financial_audit_log_archive
    SELECT l.* FROM public.financial_audit_log l JOIN picked p ON p.id = l.id
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  ), removed AS (
    DELETE FROM public.financial_audit_log l
    USING picked p
    WHERE l.id = p.id
      AND EXISTS (SELECT 1 FROM public.financial_audit_log_archive a WHERE a.id = l.id)
    RETURNING l.id
  )
  SELECT count(*) INTO moved FROM removed;
  RETURN moved;
END;
$$;
REVOKE ALL ON FUNCTION public.archive_financial_audit_logs(timestamptz,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_financial_audit_logs(timestamptz,integer) TO authenticated, service_role;
