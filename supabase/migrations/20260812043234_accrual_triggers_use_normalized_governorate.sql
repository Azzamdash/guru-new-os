-- Split out from normalize_governorate_function: re-point the accrual
-- triggers at the normalized governorate match so rate lookups actually
-- resolve for orders synced with English province names against
-- Arabic-keyed courier rates.
CREATE OR REPLACE FUNCTION public.accrue_order_courier_charge() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
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
    AND public.normalize_governorate(governorate) = public.normalize_governorate(NEW.shipping_governorate)
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

CREATE OR REPLACE FUNCTION public.persist_order_courier_charge() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
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
    AND public.normalize_governorate(governorate) = public.normalize_governorate(NEW.shipping_governorate)
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
