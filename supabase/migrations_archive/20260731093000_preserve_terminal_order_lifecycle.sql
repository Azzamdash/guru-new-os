-- Prevent stale courier events from reopening terminal order lifecycle state.

CREATE OR REPLACE FUNCTION public.preserve_terminal_order_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (OLD.shipment_outcome = 'returned' OR OLD.fulfillment_status = 'returned')
    AND NEW.shipment_outcome <> 'returned' THEN
    RETURN OLD;
  END IF;

  IF (OLD.shipment_outcome = 'delivered' OR OLD.fulfillment_status = 'delivered')
    AND NEW.shipment_outcome IN ('open', 'cancelled_before_dispatch') THEN
    RETURN OLD;
  END IF;

  IF (OLD.shipment_outcome = 'cancelled_before_dispatch' OR OLD.fulfillment_status = 'cancelled')
    AND NEW.shipment_outcome = 'open' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_preserve_terminal_lifecycle ON public.orders;
CREATE TRIGGER orders_preserve_terminal_lifecycle
BEFORE UPDATE OF shipment_outcome, fulfillment_status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.preserve_terminal_order_lifecycle();

COMMENT ON FUNCTION public.preserve_terminal_order_lifecycle() IS
  'Makes stale terminal-to-open order lifecycle updates a no-op.';
