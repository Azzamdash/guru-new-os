-- refresh_courier_charges_for_rate already re-prices orders when a rate changes:
-- an AFTER INSERT/DELETE/UPDATE trigger on courier_governorate_rates that
-- re-fires the accrual with UPDATE orders SET shipment_outcome =
-- o.shipment_outcome. Saving a rate was therefore always meant to reach the
-- orders that needed it.
--
-- It never did, for the same reason everything else failed: it matches with
-- lower(btrim(o.shipping_governorate)) = lower(btrim(rate_governorate)), and
-- orders synced from Shopify carry English province names while rates are
-- entered in Arabic. 20260810230000 normalised that comparison in
-- accrue_order_courier_charge and persist_order_courier_charge but not here, so
-- this trigger kept selecting no rows and the whole mechanism stayed invisible.
--
-- Normalise it too. The UPDATE's guards are unchanged: settled charges and
-- legacy_return rows are excluded, and no column value actually changes, so
-- audit_order_lifecycle_change stays silent.
--
-- The UPDATE-move guard keeps lower(btrim(...)): it exists to reject renaming a
-- rate's governorate in place, and under a normalised comparison a rename from
-- "Cairo" to "القاهرة" would no longer be seen as a move. Comparing raw there is
-- the stricter and intended behaviour.
CREATE OR REPLACE FUNCTION public.refresh_courier_charges_for_rate() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  rate_courier_id uuid;
  rate_governorate text;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.courier_id IS DISTINCT FROM OLD.courier_id OR
    lower(btrim(NEW.governorate)) IS DISTINCT FROM lower(btrim(OLD.governorate))
  ) THEN
    RAISE EXCEPTION 'Move a courier rate by creating a new dated rate instead';
  END IF;
  IF TG_OP = 'DELETE' THEN
    rate_courier_id := OLD.courier_id;
    rate_governorate := OLD.governorate;
  ELSE
    rate_courier_id := NEW.courier_id;
    rate_governorate := NEW.governorate;
  END IF;
  UPDATE public.orders o
  SET shipment_outcome = o.shipment_outcome
  WHERE o.courier_id = rate_courier_id
    AND public.normalize_governorate(o.shipping_governorate) = public.normalize_governorate(rate_governorate)
    AND o.shipment_outcome IN ('delivered','returned','customer_returned','exchanged')
    AND NOT EXISTS (
      SELECT 1 FROM public.courier_charges c
      WHERE c.order_id = o.id AND c.settled_at IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.courier_charges c
      WHERE c.order_id = o.id AND c.charge_type = 'legacy_return'
    );
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
