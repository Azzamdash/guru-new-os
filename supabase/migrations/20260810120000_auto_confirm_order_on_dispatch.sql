-- Assigning an order to a courier is itself the confirmation decision — by
-- the time a parcel is handed over, someone has already agreed with the
-- customer that the order is going out. Leaving confirmation_status on
-- 'pending' after dispatch meant every dispatched order still had to be
-- confirmed by hand, and any report keyed on confirmation (confirmation
-- rate, dashboard "confirmed" counts) under-reported the real number.
--
-- Set it in the dispatch RPCs rather than from the calling TypeScript so it
-- lands in the same locked transaction as the courier/tracking write, with
-- no window where an order is dispatched but not yet confirmed.
--
-- Only 'pending' is promoted: an order a human explicitly marked
-- 'cancelled' is never silently resurrected into 'confirmed' by a dispatch.
--
-- Side effect, and it is the intended one: trg_orders_deduct_stock fires on
-- the pending -> confirmed transition, so dispatching now also books the
-- stock movement for the order. orders_deduct_stock already guards against
-- double-deduction via its inventory_movements source/source_id check, so
-- orders confirmed manually before dispatch stay correct.

-- Manual "assign to best courier" path (couriers.functions.ts).
-- Signature matches 20260809112326 exactly — a true replace, not an overload.
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
    confirmation_status = CASE
      WHEN confirmation_status = 'pending' THEN 'confirmed'
      ELSE confirmation_status
    END,
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

-- Direct "send to Bosta" path (integrations.functions.ts → sendBostaShipment).
CREATE OR REPLACE FUNCTION public.finalize_order_dispatch(_order_id uuid, _claim_token uuid, _tracking text, _delivery_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
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
    confirmation_status = CASE
      WHEN confirmation_status = 'pending' THEN 'confirmed'
      ELSE confirmation_status
    END,
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
