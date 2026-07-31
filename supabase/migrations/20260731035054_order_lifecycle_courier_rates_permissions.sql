-- Local review only. Do not apply to production without approval and a backup.
-- Separates internal order workflow, courier shipment outcome, COD collection,
-- courier expense accrual, and Shopify synchronization.

CREATE OR REPLACE FUNCTION public.page_access_level(_user_id uuid, _route text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'manager') THEN
    RETURN 'write';
  END IF;
  IF public.has_section_access(_user_id, 'deny:' || _route) THEN RETURN 'hidden'; END IF;
  IF public.has_section_access(_user_id, 'write:' || _route) THEN RETURN 'write'; END IF;
  IF public.has_section_access(_user_id, 'page:' || _route) THEN RETURN 'read'; END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_read_page(_user_id uuid, _route text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.page_access_level(_user_id, _route) IN ('read', 'write'), false)
$$;

CREATE OR REPLACE FUNCTION public.can_write_page(_user_id uuid, _route text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.page_access_level(_user_id, _route) = 'write', false)
$$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_status text NOT NULL DEFAULT 'new'
    CHECK (order_status IN ('new','processing','postponed','awaiting_response','succeeded','cancelled')),
  ADD COLUMN IF NOT EXISTS collection_status text NOT NULL DEFAULT 'processing'
    CHECK (collection_status IN ('processing','unavailable','paid','unpaid')),
  ADD COLUMN IF NOT EXISTS shipment_outcome text NOT NULL DEFAULT 'open'
    CHECK (shipment_outcome IN ('open','delivered','returned','cancelled_before_dispatch')),
  ADD COLUMN IF NOT EXISTS courier_status_raw text,
  ADD COLUMN IF NOT EXISTS courier_collection_status_raw text,
  ADD COLUMN IF NOT EXISTS courier_expense numeric NOT NULL DEFAULT 0 CHECK (courier_expense >= 0),
  ADD COLUMN IF NOT EXISTS shopify_sync_status text NOT NULL DEFAULT 'not_applicable'
    CHECK (shopify_sync_status IN ('not_applicable','pending','synced','error')),
  ADD COLUMN IF NOT EXISTS shopify_sync_error text;

UPDATE public.orders
SET
  order_status = CASE
    WHEN fulfillment_status = 'delivered' THEN 'succeeded'
    WHEN fulfillment_status IN ('returned','cancelled') THEN 'cancelled'
    WHEN fulfillment_status = 'unfulfilled' THEN 'new'
    ELSE 'processing'
  END,
  collection_status = CASE
    WHEN financial_status = 'paid' THEN 'paid'
    WHEN financial_status IN ('voided','refunded') THEN 'unavailable'
    ELSE 'processing'
  END,
  shipment_outcome = CASE
    WHEN fulfillment_status = 'delivered' THEN 'delivered'
    WHEN fulfillment_status = 'returned' THEN 'returned'
    WHEN fulfillment_status = 'cancelled' THEN 'cancelled_before_dispatch'
    ELSE 'open'
  END,
  -- Historical Shopify rows cannot be proven synced from local data alone.
  shopify_sync_status = CASE WHEN source = 'shopify' THEN 'pending' ELSE 'not_applicable' END;

CREATE INDEX IF NOT EXISTS orders_order_status_idx ON public.orders(order_status);
CREATE INDEX IF NOT EXISTS orders_collection_status_idx ON public.orders(collection_status);
CREATE INDEX IF NOT EXISTS orders_shipment_outcome_idx ON public.orders(shipment_outcome);

CREATE TABLE IF NOT EXISTS public.courier_status_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  raw_status text NOT NULL,
  raw_collection_status text NOT NULL DEFAULT '',
  order_status text NOT NULL CHECK (order_status IN ('new','processing','postponed','awaiting_response','succeeded','cancelled')),
  collection_status text NOT NULL CHECK (collection_status IN ('processing','unavailable','paid','unpaid')),
  shipment_outcome text NOT NULL CHECK (shipment_outcome IN ('open','delivered','returned','cancelled_before_dispatch')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (courier_id, raw_status, raw_collection_status)
);

CREATE TABLE IF NOT EXISTS public.courier_governorate_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  governorate text NOT NULL CHECK (btrim(governorate) <> ''),
  delivery_fee numeric NOT NULL CHECK (delivery_fee >= 0),
  return_fee numeric NOT NULL CHECK (return_fee >= 0),
  active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  UNIQUE (courier_id, governorate, effective_from)
);

CREATE INDEX IF NOT EXISTS courier_rates_lookup_idx
  ON public.courier_governorate_rates(courier_id, lower(btrim(governorate)), effective_from DESC)
  WHERE active;

CREATE TABLE IF NOT EXISTS public.courier_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE RESTRICT,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE RESTRICT,
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE RESTRICT,
  rate_id uuid REFERENCES public.courier_governorate_rates(id) ON DELETE SET NULL,
  charge_type text NOT NULL CHECK (charge_type IN ('delivery','return')),
  amount numeric NOT NULL CHECK (amount >= 0),
  rate_missing boolean NOT NULL DEFAULT false,
  accrued_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.courier_status_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courier_governorate_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courier_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY courier_mappings_read ON public.courier_status_mappings
  FOR SELECT TO authenticated USING (public.can_read_page(auth.uid(), '/couriers'));
CREATE POLICY courier_mappings_write ON public.courier_status_mappings
  FOR ALL TO authenticated
  USING (public.can_write_page(auth.uid(), '/couriers'))
  WITH CHECK (public.can_write_page(auth.uid(), '/couriers'));

CREATE POLICY courier_rates_read ON public.courier_governorate_rates
  FOR SELECT TO authenticated USING (public.can_read_page(auth.uid(), '/couriers'));
CREATE POLICY courier_rates_write ON public.courier_governorate_rates
  FOR ALL TO authenticated
  USING (public.can_write_page(auth.uid(), '/couriers'))
  WITH CHECK (public.can_write_page(auth.uid(), '/couriers'));

CREATE POLICY courier_charges_read ON public.courier_charges
  FOR SELECT TO authenticated
  USING (public.can_read_page(auth.uid(), '/couriers') AND public.has_brand_access(auth.uid(), brand_id));
CREATE POLICY courier_charges_write ON public.courier_charges
  FOR ALL TO authenticated
  USING (public.can_write_page(auth.uid(), '/couriers') AND public.has_brand_access(auth.uid(), brand_id))
  WITH CHECK (public.can_write_page(auth.uid(), '/couriers') AND public.has_brand_access(auth.uid(), brand_id));

CREATE OR REPLACE FUNCTION public.accrue_order_courier_charge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_rate public.courier_governorate_rates%ROWTYPE;
  charge_amount numeric := 0;
  charge_kind text;
  existing_settled_at timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT settled_at INTO existing_settled_at
    FROM public.courier_charges
    WHERE order_id = NEW.id;

    IF existing_settled_at IS NOT NULL AND (
      NEW.shipment_outcome IS DISTINCT FROM OLD.shipment_outcome OR
      NEW.courier_id IS DISTINCT FROM OLD.courier_id OR
      NEW.shipping_governorate IS DISTINCT FROM OLD.shipping_governorate OR
      NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
    ) THEN
      RAISE EXCEPTION 'Cannot change a settled courier charge for order %', NEW.id;
    END IF;
  END IF;

  IF NEW.shipment_outcome NOT IN ('delivered','returned') THEN
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
  ORDER BY effective_from DESC
  LIMIT 1;

  charge_kind := CASE WHEN NEW.shipment_outcome = 'delivered' THEN 'delivery' ELSE 'return' END;
  charge_amount := CASE
    WHEN selected_rate.id IS NULL THEN 0
    WHEN charge_kind = 'delivery' THEN selected_rate.delivery_fee
    ELSE selected_rate.return_fee
  END;

  NEW.courier_expense := charge_amount;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.persist_order_courier_charge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_rate_id uuid;
  charge_kind text;
BEGIN
  IF NEW.shipment_outcome NOT IN ('delivered','returned') OR NEW.courier_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO selected_rate_id
  FROM public.courier_governorate_rates
  WHERE courier_id = NEW.courier_id
    AND lower(btrim(governorate)) = lower(btrim(NEW.shipping_governorate))
    AND active
    AND effective_from <= NEW.occurred_at::date
    AND (effective_to IS NULL OR effective_to >= NEW.occurred_at::date)
  ORDER BY effective_from DESC
  LIMIT 1;

  charge_kind := CASE WHEN NEW.shipment_outcome = 'delivered' THEN 'delivery' ELSE 'return' END;
  INSERT INTO public.courier_charges(
    order_id, brand_id, courier_id, rate_id, charge_type, amount, rate_missing, note, updated_at
  ) VALUES (
    NEW.id, NEW.brand_id, NEW.courier_id, selected_rate_id, charge_kind,
    NEW.courier_expense, selected_rate_id IS NULL,
    CASE WHEN selected_rate_id IS NULL THEN 'Missing courier rate for ' || COALESCE(NEW.shipping_governorate, 'unknown governorate') ELSE NULL END,
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
  WHERE public.courier_charges.settled_at IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_accrue_courier_charge_before ON public.orders;
CREATE TRIGGER orders_accrue_courier_charge_before
BEFORE INSERT OR UPDATE OF shipment_outcome, courier_id, shipping_governorate, occurred_at
ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.accrue_order_courier_charge();

DROP TRIGGER IF EXISTS orders_accrue_courier_charge_after ON public.orders;
CREATE TRIGGER orders_accrue_courier_charge_after
AFTER INSERT OR UPDATE OF shipment_outcome, courier_id, shipping_governorate, occurred_at, courier_expense
ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.persist_order_courier_charge();

-- Preserve terminal historical orders as explicit exceptions until their rates are entered.
INSERT INTO public.courier_charges (
  brand_id, order_id, courier_id, charge_type, amount, rate_missing, accrued_at
)
SELECT
  o.brand_id,
  o.id,
  o.courier_id,
  CASE WHEN o.shipment_outcome = 'delivered' THEN 'delivery' ELSE 'return' END,
  o.courier_expense,
  TRUE,
  COALESCE(o.updated_at, o.occurred_at, now())
FROM public.orders o
WHERE o.courier_id IS NOT NULL
  AND o.shipment_outcome IN ('delivered', 'returned')
ON CONFLICT (order_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.refresh_courier_charges_for_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.orders o
  SET courier_expense = CASE
    WHEN o.shipment_outcome = 'delivered' THEN NEW.delivery_fee
    WHEN o.shipment_outcome = 'returned' THEN NEW.return_fee
    ELSE o.courier_expense
  END
  WHERE o.courier_id = NEW.courier_id
    AND lower(btrim(o.shipping_governorate)) = lower(btrim(NEW.governorate))
    AND o.shipment_outcome IN ('delivered', 'returned')
    AND NEW.active
    AND NEW.effective_from <= o.occurred_at::date
    AND (NEW.effective_to IS NULL OR NEW.effective_to >= o.occurred_at::date)
    AND NOT EXISTS (
      SELECT 1 FROM public.courier_charges c
      WHERE c.order_id = o.id AND c.settled_at IS NOT NULL
    );

  UPDATE public.courier_charges c
  SET rate_id = NEW.id,
      amount = CASE WHEN o.shipment_outcome = 'delivered' THEN NEW.delivery_fee ELSE NEW.return_fee END,
      charge_type = CASE WHEN o.shipment_outcome = 'delivered' THEN 'delivery' ELSE 'return' END,
      rate_missing = FALSE,
      note = NULL,
      updated_at = now()
  FROM public.orders o
  WHERE c.order_id = o.id
    AND c.settled_at IS NULL
    AND o.courier_id = NEW.courier_id
    AND lower(btrim(o.shipping_governorate)) = lower(btrim(NEW.governorate))
    AND o.shipment_outcome IN ('delivered', 'returned')
    AND NEW.active
    AND NEW.effective_from <= o.occurred_at::date
    AND (NEW.effective_to IS NULL OR NEW.effective_to >= o.occurred_at::date);
  RETURN NEW;
END;
$$;

CREATE TRIGGER refresh_courier_charges_after_rate
AFTER INSERT OR UPDATE OF delivery_fee, return_fee, active, effective_from, effective_to
ON public.courier_governorate_rates
FOR EACH ROW EXECUTE FUNCTION public.refresh_courier_charges_for_rate();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.courier_status_mappings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courier_governorate_rates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courier_charges TO authenticated;
GRANT ALL ON public.courier_status_mappings, public.courier_governorate_rates, public.courier_charges TO service_role;
