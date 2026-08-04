-- Manual lifecycle overrides, four courier fee outcomes, audit history, and multi-brand couriers.

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_shipment_outcome_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_shipment_outcome_check
  CHECK (shipment_outcome IN (
    'open', 'delivered', 'returned', 'customer_returned', 'exchanged', 'cancelled_before_dispatch'
  ));
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS lifecycle_source text NOT NULL DEFAULT 'system'
    CHECK (lifecycle_source IN ('system', 'manual', 'bosta', 'shopify')),
  ADD COLUMN IF NOT EXISTS lifecycle_updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lifecycle_updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.courier_governorate_rates
  ADD COLUMN IF NOT EXISTS customer_return_fee numeric NOT NULL DEFAULT 0 CHECK (customer_return_fee >= 0),
  ADD COLUMN IF NOT EXISTS failed_delivery_fee numeric NOT NULL DEFAULT 0 CHECK (failed_delivery_fee >= 0),
  ADD COLUMN IF NOT EXISTS exchange_fee numeric NOT NULL DEFAULT 0 CHECK (exchange_fee >= 0);
UPDATE public.courier_governorate_rates
SET customer_return_fee = return_fee,
    failed_delivery_fee = return_fee,
    exchange_fee = delivery_fee
WHERE customer_return_fee = 0 AND failed_delivery_fee = 0 AND exchange_fee = 0;

ALTER TABLE public.courier_charges
  DROP CONSTRAINT IF EXISTS courier_charges_charge_type_check;
-- The legacy `return` value did not distinguish failed delivery from a
-- customer return after delivery. Preserve that ambiguity instead of
-- rewriting financial history to an outcome we cannot prove.
UPDATE public.courier_charges SET charge_type = 'legacy_return' WHERE charge_type = 'return';
ALTER TABLE public.courier_charges
  ADD CONSTRAINT courier_charges_charge_type_check
  CHECK (charge_type IN ('delivery', 'customer_return', 'failed_delivery', 'exchange', 'legacy_return'));

ALTER TABLE public.couriers
  ADD COLUMN IF NOT EXISTS serves_all_brands boolean NOT NULL DEFAULT false;
UPDATE public.couriers SET serves_all_brands = true WHERE brand_id IS NULL;

CREATE TABLE IF NOT EXISTS public.courier_brands (
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (courier_id, brand_id)
);
INSERT INTO public.courier_brands(courier_id, brand_id)
SELECT id, brand_id FROM public.couriers WHERE brand_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE public.courier_brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS courier_brands_read ON public.courier_brands;
CREATE POLICY courier_brands_read ON public.courier_brands
FOR SELECT TO authenticated
USING (
  public.can_read_page(auth.uid(), '/couriers')
  AND public.has_brand_access(auth.uid(), brand_id)
);
DROP POLICY IF EXISTS courier_brands_write ON public.courier_brands;
CREATE POLICY courier_brands_write ON public.courier_brands
FOR ALL TO authenticated
USING (
  public.can_write_page(auth.uid(), '/couriers')
  AND public.has_brand_access(auth.uid(), brand_id)
)
WITH CHECK (
  public.can_write_page(auth.uid(), '/couriers')
  AND public.has_brand_access(auth.uid(), brand_id)
);
GRANT SELECT ON public.courier_brands TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.courier_brands FROM authenticated;
GRANT ALL ON public.courier_brands TO service_role;

DROP POLICY IF EXISTS "read couriers" ON public.couriers;
DROP POLICY IF EXISTS "admin write couriers" ON public.couriers;
DROP POLICY IF EXISTS "read couriers" ON public.couriers;
CREATE POLICY "read couriers" ON public.couriers
FOR SELECT TO authenticated
USING (
  public.can_read_page(auth.uid(), '/couriers')
  AND (
    serves_all_brands
    OR (brand_id IS NOT NULL AND public.has_brand_access(auth.uid(), brand_id))
    OR EXISTS (
      SELECT 1 FROM public.courier_brands cb
      WHERE cb.courier_id = couriers.id
        AND public.has_brand_access(auth.uid(), cb.brand_id)
    )
  )
);
CREATE OR REPLACE FUNCTION public.courier_serves_brand(_courier_id uuid, _brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.couriers c
    WHERE c.id = _courier_id
      AND (
        c.serves_all_brands
        OR c.brand_id = _brand_id
        OR EXISTS (
          SELECT 1 FROM public.courier_brands cb
          WHERE cb.courier_id = c.id AND cb.brand_id = _brand_id
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.courier_accessible_to_user(_user_id uuid, _courier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.couriers c
    WHERE c.id = _courier_id
      AND (
        c.serves_all_brands
        OR (c.brand_id IS NOT NULL AND public.has_brand_access(_user_id, c.brand_id))
        OR EXISTS (
          SELECT 1 FROM public.courier_brands cb
          WHERE cb.courier_id = c.id AND public.has_brand_access(_user_id, cb.brand_id)
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.courier_manageable_by_user(_user_id uuid, _courier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.couriers c
    WHERE c.id = _courier_id
      AND (
        (c.serves_all_brands AND public.has_role(_user_id, 'admin'))
        OR (
          NOT c.serves_all_brands
          AND (c.brand_id IS NULL OR public.has_brand_access(_user_id, c.brand_id))
          AND NOT EXISTS (
            SELECT 1 FROM public.courier_brands cb
            WHERE cb.courier_id = c.id
              AND NOT public.has_brand_access(_user_id, cb.brand_id)
          )
        )
      )
  )
$$;

DROP POLICY IF EXISTS "admin write couriers" ON public.couriers;
CREATE POLICY "admin write couriers" ON public.couriers
FOR ALL TO authenticated
USING (
  public.can_write_page(auth.uid(), '/couriers')
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  AND public.courier_manageable_by_user(auth.uid(), id)
)
WITH CHECK (
  public.can_write_page(auth.uid(), '/couriers')
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
);

CREATE OR REPLACE FUNCTION public.enforce_order_courier_brand()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.courier_id IS NOT NULL
     AND NOT public.courier_serves_brand(NEW.courier_id, NEW.brand_id) THEN
    RAISE EXCEPTION 'Courier % is not available for order brand %', NEW.courier_id, NEW.brand_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS couriers_prevent_invalid_brand_change ON public.couriers;

DROP POLICY IF EXISTS courier_mappings_read ON public.courier_status_mappings;
DROP POLICY IF EXISTS courier_mappings_write ON public.courier_status_mappings;
DROP POLICY IF EXISTS courier_rates_read ON public.courier_governorate_rates;
DROP POLICY IF EXISTS courier_rates_write ON public.courier_governorate_rates;
DROP POLICY IF EXISTS courier_mappings_read ON public.courier_status_mappings;
CREATE POLICY courier_mappings_read ON public.courier_status_mappings
FOR SELECT TO authenticated
USING (
  public.can_read_page(auth.uid(), '/couriers')
  AND public.courier_accessible_to_user(auth.uid(), courier_id)
);
DROP POLICY IF EXISTS courier_mappings_write ON public.courier_status_mappings;
CREATE POLICY courier_mappings_write ON public.courier_status_mappings
FOR ALL TO authenticated
USING (
  public.can_write_page(auth.uid(), '/couriers')
  AND public.courier_manageable_by_user(auth.uid(), courier_id)
)
WITH CHECK (
  public.can_write_page(auth.uid(), '/couriers')
  AND public.courier_manageable_by_user(auth.uid(), courier_id)
);
DROP POLICY IF EXISTS courier_rates_read ON public.courier_governorate_rates;
CREATE POLICY courier_rates_read ON public.courier_governorate_rates
FOR SELECT TO authenticated
USING (
  public.can_read_page(auth.uid(), '/couriers')
  AND public.courier_accessible_to_user(auth.uid(), courier_id)
);
DROP POLICY IF EXISTS courier_rates_write ON public.courier_governorate_rates;
CREATE POLICY courier_rates_write ON public.courier_governorate_rates
FOR ALL TO authenticated
USING (
  public.can_write_page(auth.uid(), '/couriers')
  AND public.courier_manageable_by_user(auth.uid(), courier_id)
)
WITH CHECK (
  public.can_write_page(auth.uid(), '/couriers')
  AND public.courier_manageable_by_user(auth.uid(), courier_id)
);

CREATE OR REPLACE FUNCTION public.upsert_courier_with_brands(
  _courier_id uuid,
  _name text,
  _type text,
  _contact text,
  _active boolean,
  _opening_balance numeric,
  _serves_all_brands boolean,
  _brand_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  saved_id uuid;
  legacy_brand_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') AND NOT public.has_role(auth.uid(), 'manager') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF NOT public.can_write_page(auth.uid(), '/couriers') THEN
    RAISE EXCEPTION 'Forbidden: courier write access denied';
  END IF;
  IF _courier_id IS NOT NULL AND NOT public.courier_manageable_by_user(auth.uid(), _courier_id) THEN
    RAISE EXCEPTION 'Forbidden: existing courier brand access denied';
  END IF;
  IF _serves_all_brands AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can manage all-brand couriers';
  END IF;
  IF NOT _serves_all_brands AND COALESCE(array_length(_brand_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Choose at least one brand or all brands';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(COALESCE(_brand_ids, ARRAY[]::uuid[])) b
    WHERE NOT public.has_brand_access(auth.uid(), b)
  ) THEN
    RAISE EXCEPTION 'Forbidden: brand access denied';
  END IF;
  legacy_brand_id := CASE
    WHEN NOT _serves_all_brands AND array_length(_brand_ids, 1) = 1 THEN _brand_ids[1]
    ELSE NULL
  END;
  INSERT INTO public.couriers(id, name, type, contact, brand_id, active, opening_balance, serves_all_brands)
  VALUES (COALESCE(_courier_id, gen_random_uuid()), btrim(_name), _type::public.courier_type, NULLIF(btrim(_contact), ''),
          legacy_brand_id, _active, COALESCE(_opening_balance, 0), _serves_all_brands)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    contact = EXCLUDED.contact,
    brand_id = EXCLUDED.brand_id,
    active = EXCLUDED.active,
    opening_balance = EXCLUDED.opening_balance,
    serves_all_brands = EXCLUDED.serves_all_brands
  RETURNING id INTO saved_id;
  DELETE FROM public.courier_brands WHERE courier_id = saved_id;
  IF NOT _serves_all_brands THEN
    INSERT INTO public.courier_brands(courier_id, brand_id)
    SELECT saved_id, b FROM unnest(_brand_ids) b
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN saved_id;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_courier_with_brands(uuid,text,text,text,boolean,numeric,boolean,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_courier_with_brands(uuid,text,text,text,boolean,numeric,boolean,uuid[]) TO authenticated;
REVOKE INSERT, UPDATE ON public.couriers FROM authenticated;

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
     OR NOT (
       public.can_write_page(auth.uid(), '/orders') OR
       public.can_write_page(auth.uid(), '/couriers')
     ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF current_order.shipment_outcome IN (
    'delivered', 'returned', 'customer_returned', 'exchanged', 'cancelled_before_dispatch'
  ) THEN
    RAISE EXCEPTION 'Cannot dispatch a terminal order';
  END IF;
  IF COALESCE(current_order.raw, '{}'::jsonb) ?| ARRAY[
    'bosta_tracking', 'dispatch_tracking', 'dispatch_claim_token'
  ] THEN
    RAISE EXCEPTION 'Order is already dispatched or dispatch is in progress';
  END IF;
  UPDATE public.orders
  SET raw = COALESCE(raw, '{}'::jsonb) || jsonb_build_object(
    'dispatch_claim_token', _claim_token::text,
    'dispatch_claimed_by', auth.uid()::text,
    'dispatch_claimed_at', now()::text
  )
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
  UPDATE public.orders
  SET raw = COALESCE(raw, '{}'::jsonb)
    - 'dispatch_claim_token' - 'dispatch_claimed_by' - 'dispatch_claimed_at'
  WHERE id = _order_id
    AND raw->>'dispatch_claim_token' = _claim_token::text
    AND raw->>'dispatch_claimed_by' = auth.uid()::text;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_order_dispatch(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_order_dispatch(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.release_order_dispatch_claim(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_order_dispatch_claim(uuid, uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.order_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (source IN ('system', 'manual', 'bosta', 'shopify')),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  from_order_status text,
  to_order_status text NOT NULL,
  from_collection_status text,
  to_collection_status text NOT NULL,
  from_shipment_outcome text,
  to_shipment_outcome text NOT NULL,
  raw_status text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_lifecycle_events_order_idx
  ON public.order_lifecycle_events(order_id, created_at DESC);
ALTER TABLE public.order_lifecycle_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_lifecycle_events_read ON public.order_lifecycle_events;
CREATE POLICY order_lifecycle_events_read ON public.order_lifecycle_events
FOR SELECT TO authenticated
USING (
  public.can_read_page(auth.uid(), '/orders')
  AND public.has_brand_access(auth.uid(), brand_id)
);
GRANT SELECT ON public.order_lifecycle_events TO authenticated;
GRANT ALL ON public.order_lifecycle_events TO service_role;

CREATE OR REPLACE FUNCTION public.audit_order_lifecycle_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.order_status IS DISTINCT FROM OLD.order_status
     OR NEW.collection_status IS DISTINCT FROM OLD.collection_status
     OR NEW.shipment_outcome IS DISTINCT FROM OLD.shipment_outcome THEN
    INSERT INTO public.order_lifecycle_events(
      order_id, brand_id, source, actor_id,
      from_order_status, to_order_status,
      from_collection_status, to_collection_status,
      from_shipment_outcome, to_shipment_outcome,
      raw_status, note
    ) VALUES (
      NEW.id, NEW.brand_id, NEW.lifecycle_source, NEW.lifecycle_updated_by,
      OLD.order_status, NEW.order_status,
      OLD.collection_status, NEW.collection_status,
      OLD.shipment_outcome, NEW.shipment_outcome,
      NEW.courier_status_raw,
      CASE WHEN NEW.lifecycle_source = 'manual' THEN 'Manual lifecycle override' ELSE NULL END
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS orders_audit_lifecycle_after ON public.orders;
CREATE TRIGGER orders_audit_lifecycle_after
AFTER UPDATE OF order_status, collection_status, shipment_outcome
ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.audit_order_lifecycle_change();

CREATE OR REPLACE FUNCTION public.preserve_terminal_order_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  trusted_manual_actor text := current_setting('app.manual_lifecycle_actor', true);
BEGIN
  IF NEW.lifecycle_source = 'manual'
     AND NEW.lifecycle_updated_by IS NOT NULL
     AND NEW.lifecycle_updated_by = auth.uid()
     AND trusted_manual_actor = auth.uid()::text THEN
    IF NEW.shipment_outcome = 'delivered' THEN
      NEW.order_status := 'succeeded';
      NEW.fulfillment_status := 'delivered';
    ELSIF NEW.shipment_outcome = 'exchanged' THEN
      NEW.order_status := 'succeeded';
      NEW.fulfillment_status := 'delivered';
    ELSIF NEW.shipment_outcome IN ('returned', 'customer_returned') THEN
      NEW.order_status := 'cancelled';
      NEW.fulfillment_status := 'returned';
    ELSIF NEW.shipment_outcome = 'cancelled_before_dispatch' THEN
      NEW.order_status := 'cancelled';
      NEW.fulfillment_status := 'cancelled';
    ELSIF NEW.order_status NOT IN ('new', 'processing', 'postponed', 'awaiting_response') THEN
      NEW.order_status := 'processing';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.lifecycle_source = 'manual'
     AND trusted_manual_actor IS DISTINCT FROM auth.uid()::text
     AND (
       NEW.order_status IS DISTINCT FROM OLD.order_status OR
       NEW.collection_status IS DISTINCT FROM OLD.collection_status OR
       NEW.shipment_outcome IS DISTINCT FROM OLD.shipment_outcome OR
       NEW.fulfillment_status IS DISTINCT FROM OLD.fulfillment_status
     ) THEN
    RAISE EXCEPTION 'Manual lifecycle changes must use update_order_lifecycle_manually';
  END IF;
  IF OLD.shipment_outcome = 'delivered'
     AND NEW.shipment_outcome = 'returned'
     AND NEW.lifecycle_source = 'bosta' THEN
    NEW.shipment_outcome := 'customer_returned';
    NEW.order_status := 'cancelled';
    NEW.fulfillment_status := 'returned';
    RETURN NEW;
  END IF;
  IF (
    OLD.shipment_outcome IN ('returned', 'customer_returned', 'exchanged')
    AND NEW.shipment_outcome IS DISTINCT FROM OLD.shipment_outcome
  ) OR (
    OLD.shipment_outcome = 'delivered'
    AND NEW.shipment_outcome IN ('open', 'cancelled_before_dispatch')
  ) OR (
    OLD.shipment_outcome = 'cancelled_before_dispatch'
    AND NEW.shipment_outcome = 'open'
  ) THEN
    NEW.order_status := OLD.order_status;
    NEW.collection_status := OLD.collection_status;
    NEW.shipment_outcome := OLD.shipment_outcome;
    NEW.fulfillment_status := OLD.fulfillment_status;
    NEW.courier_status_raw := OLD.courier_status_raw;
    NEW.courier_collection_status_raw := OLD.courier_collection_status_raw;
    NEW.lifecycle_source := OLD.lifecycle_source;
    NEW.lifecycle_updated_by := OLD.lifecycle_updated_by;
    NEW.lifecycle_updated_at := OLD.lifecycle_updated_at;
    RETURN NEW;
  END IF;
  IF NEW.shipment_outcome IS NOT DISTINCT FROM OLD.shipment_outcome THEN
    NEW.fulfillment_status := CASE OLD.shipment_outcome
      WHEN 'delivered' THEN 'delivered'
      WHEN 'exchanged' THEN 'delivered'
      WHEN 'returned' THEN 'returned'
      WHEN 'customer_returned' THEN 'returned'
      WHEN 'cancelled_before_dispatch' THEN 'cancelled'
      ELSE NEW.fulfillment_status
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_preserve_terminal_lifecycle ON public.orders;
DROP TRIGGER IF EXISTS orders_00_preserve_terminal_lifecycle ON public.orders;
CREATE TRIGGER orders_00_preserve_terminal_lifecycle
BEFORE UPDATE OF shipment_outcome, fulfillment_status, lifecycle_source
ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.preserve_terminal_order_lifecycle();

CREATE OR REPLACE FUNCTION public.update_order_lifecycle_manually(
  _order_id uuid,
  _order_status text,
  _collection_status text,
  _shipment_outcome text,
  _fulfillment_status text,
  _confirmation_status text,
  _financial_status text,
  _shopify_sync_status text,
  _shopify_sync_error text,
  _raw jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  order_brand_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_write_page(auth.uid(), '/orders') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT brand_id INTO order_brand_id FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.has_brand_access(auth.uid(), order_brand_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  PERFORM set_config('app.manual_lifecycle_actor', auth.uid()::text, true);
  UPDATE public.orders SET
    order_status = _order_status,
    collection_status = _collection_status,
    shipment_outcome = _shipment_outcome,
    fulfillment_status = _fulfillment_status,
    confirmation_status = _confirmation_status,
    financial_status = _financial_status,
    lifecycle_source = 'manual',
    lifecycle_updated_by = auth.uid(),
    lifecycle_updated_at = now(),
    shopify_sync_status = _shopify_sync_status,
    shopify_sync_error = _shopify_sync_error,
    raw = _raw
  WHERE id = _order_id;
  RETURN _order_id;
END;
$$;
REVOKE ALL ON FUNCTION public.update_order_lifecycle_manually(uuid,text,text,text,text,text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_order_lifecycle_manually(uuid,text,text,text,text,text,text,text,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.accrue_order_courier_charge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  selected_rate public.courier_governorate_rates%ROWTYPE;
  charge_amount numeric := 0;
  existing_settled_at timestamptz;
  existing_charge_type text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT settled_at, charge_type INTO existing_settled_at, existing_charge_type
    FROM public.courier_charges WHERE order_id = NEW.id;
    IF existing_charge_type = 'legacy_return' THEN
      NEW.courier_expense := OLD.courier_expense;
      RETURN NEW;
    END IF;
    IF existing_settled_at IS NOT NULL AND (
      NEW.courier_id IS DISTINCT FROM OLD.courier_id OR
      NEW.shipping_governorate IS DISTINCT FROM OLD.shipping_governorate OR
      NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
    ) THEN
      RAISE EXCEPTION 'Cannot change a settled courier charge for order %', NEW.id;
    END IF;
    IF existing_settled_at IS NOT NULL
       AND NEW.shipment_outcome IS DISTINCT FROM OLD.shipment_outcome THEN
      NEW.courier_expense := OLD.courier_expense;
      RETURN NEW;
    END IF;
  END IF;
  IF NEW.shipment_outcome NOT IN ('delivered','returned','customer_returned','exchanged') THEN
    NEW.courier_expense := 0;
    RETURN NEW;
  END IF;
  IF NEW.courier_id IS NULL OR NULLIF(btrim(NEW.shipping_governorate), '') IS NULL THEN
    NEW.courier_expense := 0;
    RETURN NEW;
  END IF;
  SELECT * INTO selected_rate
  FROM public.courier_governorate_rates
  WHERE courier_id = NEW.courier_id
    AND lower(btrim(governorate)) = lower(btrim(NEW.shipping_governorate))
    AND active
    AND effective_from <= NEW.occurred_at::date
    AND (effective_to IS NULL OR effective_to >= NEW.occurred_at::date)
  ORDER BY effective_from DESC LIMIT 1;
  charge_amount := CASE NEW.shipment_outcome
    WHEN 'delivered' THEN selected_rate.delivery_fee
    WHEN 'returned' THEN selected_rate.failed_delivery_fee
    WHEN 'customer_returned' THEN selected_rate.customer_return_fee
    WHEN 'exchanged' THEN selected_rate.exchange_fee
    ELSE 0
  END;
  NEW.courier_expense := COALESCE(charge_amount, 0);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.persist_order_courier_charge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE selected_rate_id uuid; charge_kind text;
BEGIN
  IF NEW.shipment_outcome NOT IN ('delivered','returned','customer_returned','exchanged')
     OR NEW.courier_id IS NULL THEN
    DELETE FROM public.courier_charges
    WHERE order_id = NEW.id AND settled_at IS NULL AND charge_type <> 'legacy_return';
    RETURN NEW;
  END IF;
  SELECT id INTO selected_rate_id
  FROM public.courier_governorate_rates
  WHERE courier_id = NEW.courier_id
    AND lower(btrim(governorate)) = lower(btrim(NEW.shipping_governorate))
    AND active
    AND effective_from <= NEW.occurred_at::date
    AND (effective_to IS NULL OR effective_to >= NEW.occurred_at::date)
  ORDER BY effective_from DESC LIMIT 1;
  charge_kind := CASE NEW.shipment_outcome
    WHEN 'delivered' THEN 'delivery'
    WHEN 'returned' THEN 'failed_delivery'
    WHEN 'customer_returned' THEN 'customer_return'
    ELSE 'exchange'
  END;
  INSERT INTO public.courier_charges(
    order_id, brand_id, courier_id, rate_id, charge_type, amount, rate_missing, note, updated_at
  ) VALUES (
    NEW.id, NEW.brand_id, NEW.courier_id, selected_rate_id, charge_kind,
    NEW.courier_expense, selected_rate_id IS NULL,
    CASE WHEN selected_rate_id IS NULL THEN 'Missing courier rate for ' || COALESCE(NEW.shipping_governorate, 'unknown governorate') END,
    now()
  )
  ON CONFLICT (order_id) DO UPDATE SET
    courier_id = EXCLUDED.courier_id,
    rate_id = EXCLUDED.rate_id,
    charge_type = EXCLUDED.charge_type,
    amount = EXCLUDED.amount,
    rate_missing = EXCLUDED.rate_missing,
    note = EXCLUDED.note,
    updated_at = now()
  WHERE public.courier_charges.settled_at IS NULL
    AND public.courier_charges.charge_type <> 'legacy_return';
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_courier_charges_for_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
    AND lower(btrim(o.shipping_governorate)) = lower(btrim(rate_governorate))
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

DROP TRIGGER IF EXISTS refresh_courier_charges_after_rate ON public.courier_governorate_rates;
CREATE TRIGGER refresh_courier_charges_after_rate
AFTER INSERT OR DELETE OR UPDATE OF delivery_fee, customer_return_fee, failed_delivery_fee, exchange_fee,
  active, effective_from, effective_to, courier_id, governorate
ON public.courier_governorate_rates
FOR EACH ROW EXECUTE FUNCTION public.refresh_courier_charges_for_rate();

REVOKE ALL ON FUNCTION public.courier_serves_brand(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.courier_accessible_to_user(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.courier_manageable_by_user(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.courier_serves_brand(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.courier_accessible_to_user(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.courier_manageable_by_user(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.audit_order_lifecycle_change() FROM PUBLIC;
