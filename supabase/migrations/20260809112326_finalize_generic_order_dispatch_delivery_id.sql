-- finalize_generic_order_dispatch (the manual "assign to best courier"
-- dispatch path) never persisted Bosta's internal delivery id, unlike
-- finalize_order_dispatch (the Shopify auto-dispatch path), which already
-- accepts and stores it in bosta_delivery_id. That id is required to fetch
-- a delivery's AWB/label from Bosta, so every manually-dispatched order was
-- missing it. Add a trailing _delivery_id parameter.
--
-- A trailing parameter (even with a default) is a different function
-- identity in Postgres, not a replacement of the existing one — CREATE OR
-- REPLACE would leave the old 6-argument overload alongside the new
-- 7-argument one, and any caller that still omits _delivery_id would hit an
-- ambiguous-function error (this exact issue previously bit
-- dashboard_operational_report and accounting_profit_report — see
-- 20260807210000). Drop the stale overload first so only one remains.
DROP FUNCTION IF EXISTS public.finalize_generic_order_dispatch(uuid, uuid, uuid, text, boolean, text);

CREATE OR REPLACE FUNCTION public.finalize_generic_order_dispatch(
    _order_id uuid,
    _claim_token uuid,
    _courier_id uuid,
    _tracking text,
    _provider_tracking boolean,
    _note text,
    _delivery_id text DEFAULT NULL
) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
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
    bosta_delivery_id = CASE
      WHEN _provider_tracking THEN NULLIF(btrim(_delivery_id), '')
      ELSE bosta_delivery_id
    END,
    bosta_sent_at = CASE WHEN _provider_tracking THEN now() ELSE bosta_sent_at END,
    dispatch_tracking = CASE WHEN _provider_tracking THEN NULL ELSE btrim(_tracking) END,
    dispatch_claim_token = NULL,
    dispatch_claimed_by = NULL,
    dispatch_claimed_at = NULL
  WHERE id = _order_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_generic_order_dispatch(uuid, uuid, uuid, text, boolean, text, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finalize_generic_order_dispatch(uuid, uuid, uuid, text, boolean, text, text) TO service_role;
GRANT ALL ON FUNCTION public.finalize_generic_order_dispatch(uuid, uuid, uuid, text, boolean, text, text) TO authenticated;
