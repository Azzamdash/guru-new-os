-- Two new lifecycle values needed for the Shopify/Bosta rework:
--   order_status 'shipped'            — courier is en route to the customer
--                                        ("في الطريق للعميل"), distinct from the
--                                        generic 'processing' used while the
--                                        courier still just has the parcel.
--   shipment_outcome 'return_in_transit' — Bosta reports the parcel is coming
--                                        back to us ("في الطريق إليك"), but we
--                                        haven't physically received it yet.
--                                        Only a manual "confirm receipt" action
--                                        (confirm_return_received below) moves
--                                        it to the final 'returned' outcome —
--                                        Bosta's own "returned" events never
--                                        auto-finalize a return anymore.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_order_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_order_status_check
  CHECK (order_status IN (
    'new', 'processing', 'shipped', 'postponed', 'awaiting_response', 'succeeded', 'cancelled'
  ));

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_shipment_outcome_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_shipment_outcome_check
  CHECK (shipment_outcome IN (
    'open', 'delivered', 'returned', 'customer_returned', 'exchanged',
    'return_in_transit', 'cancelled_before_dispatch'
  ));

-- Confirms a returned parcel was physically received back into the warehouse.
-- Only valid from shipment_outcome = 'return_in_transit'. Finalizes the order
-- as cancelled/returned; the caller (JS) then fires the Shopify "cancel"
-- action the same way transitionOrderLifecycle does for manual overrides.
CREATE OR REPLACE FUNCTION public.confirm_return_received(_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  current_order public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_write_page(auth.uid(), '/orders') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT * INTO current_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.has_brand_access(auth.uid(), current_order.brand_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF current_order.shipment_outcome <> 'return_in_transit' THEN
    RAISE EXCEPTION 'Order is not a return in transit';
  END IF;

  UPDATE public.orders SET
    order_status = 'cancelled',
    shipment_outcome = 'returned',
    fulfillment_status = 'returned',
    lifecycle_source = 'manual',
    lifecycle_updated_by = auth.uid(),
    lifecycle_updated_at = now(),
    shopify_sync_status = CASE WHEN source = 'shopify' THEN 'pending' ELSE shopify_sync_status END
  WHERE id = _order_id;

  RETURN _order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_return_received(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_return_received(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_return_received(uuid) TO service_role;
