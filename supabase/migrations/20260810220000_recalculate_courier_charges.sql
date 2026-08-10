-- Configuring a governorate rate does not reach the orders that needed it.
--
-- accrue_order_courier_charge and persist_order_courier_charge are triggers on
-- public.orders, firing on INSERT OR UPDATE OF (shipment_outcome, courier_id,
-- shipping_governorate, occurred_at). Nothing watches
-- courier_governorate_rates, so an order marked delivered while its governorate
-- had no rate accrues COALESCE(NULL, 0) -- zero -- and keeps that zero forever,
-- however many rates are added afterwards. That is why the clearing sheet still
-- shows 0 for governorates the user has since priced.
--
-- Re-fire the accrual for the affected orders rather than recomputing the fee
-- in a second place: assigning shipment_outcome to itself puts the column in
-- the UPDATE's SET list, which is what Postgres tests for UPDATE OF, so both
-- triggers run again and recompute from the current rate card using the one
-- implementation that already exists. No column value changes.
--
-- Only unsettled charges move. persist_order_courier_charge's upsert carries
-- WHERE settled_at IS NULL, so a closed fee is left exactly as it was, and
-- accrue_order_courier_charge returns OLD.courier_expense for settled rows
-- rather than raising, because courier_id, shipping_governorate and occurred_at
-- are untouched here.
--
-- The other triggers on the same UPDATE are harmless: audit_order_lifecycle_change
-- guards its insert on IS DISTINCT FROM, so a self-assignment writes no lifecycle
-- event, and update_updated_at_column merely bumps updated_at.
--
-- SECURITY DEFINER to run the triggers, so it checks the caller itself: write
-- access to /couriers, plus brand access on every order it would touch.
CREATE OR REPLACE FUNCTION public.recalculate_courier_charges(_courier_id uuid DEFAULT NULL::uuid)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  _updated integer := 0;
BEGIN
  IF NOT public.can_write_page(_uid, '/couriers') THEN
    RAISE EXCEPTION 'Not allowed to recalculate courier charges';
  END IF;

  WITH touched AS (
    UPDATE public.orders o
    SET shipment_outcome = o.shipment_outcome
    WHERE o.courier_id IS NOT NULL
      AND (_courier_id IS NULL OR o.courier_id = _courier_id)
      AND o.shipment_outcome IN ('delivered', 'returned', 'customer_returned', 'exchanged')
      AND public.has_brand_access(_uid, o.brand_id)
      -- Leave closed fees alone; only a charge still open can be re-priced.
      AND NOT EXISTS (
        SELECT 1 FROM public.courier_charges cc
        WHERE cc.order_id = o.id AND cc.settled_at IS NOT NULL
      )
    RETURNING o.id
  )
  SELECT count(*) INTO _updated FROM touched;

  RETURN jsonb_build_object('updated', _updated);
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_courier_charges(_courier_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.recalculate_courier_charges(_courier_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.recalculate_courier_charges(_courier_id uuid) TO service_role;
