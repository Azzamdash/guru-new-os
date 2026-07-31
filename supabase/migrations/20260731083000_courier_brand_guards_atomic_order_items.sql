-- Correct authorization and accounting-integrity gaps found during pre-deployment review.

DROP POLICY IF EXISTS courier_mappings_read ON public.courier_status_mappings;
DROP POLICY IF EXISTS courier_mappings_write ON public.courier_status_mappings;
DROP POLICY IF EXISTS courier_rates_read ON public.courier_governorate_rates;
DROP POLICY IF EXISTS courier_rates_write ON public.courier_governorate_rates;

CREATE POLICY courier_mappings_read ON public.courier_status_mappings
  FOR SELECT TO authenticated
  USING (
    public.can_read_page(auth.uid(), '/couriers')
    AND EXISTS (
      SELECT 1
      FROM public.couriers c
      WHERE c.id = courier_status_mappings.courier_id
        AND public.has_brand_access(auth.uid(), c.brand_id)
    )
  );

CREATE POLICY courier_mappings_write ON public.courier_status_mappings
  FOR ALL TO authenticated
  USING (
    public.can_write_page(auth.uid(), '/couriers')
    AND EXISTS (
      SELECT 1
      FROM public.couriers c
      WHERE c.id = courier_status_mappings.courier_id
        AND public.has_brand_access(auth.uid(), c.brand_id)
    )
  )
  WITH CHECK (
    public.can_write_page(auth.uid(), '/couriers')
    AND EXISTS (
      SELECT 1
      FROM public.couriers c
      WHERE c.id = courier_status_mappings.courier_id
        AND public.has_brand_access(auth.uid(), c.brand_id)
    )
  );

CREATE POLICY courier_rates_read ON public.courier_governorate_rates
  FOR SELECT TO authenticated
  USING (
    public.can_read_page(auth.uid(), '/couriers')
    AND EXISTS (
      SELECT 1
      FROM public.couriers c
      WHERE c.id = courier_governorate_rates.courier_id
        AND public.has_brand_access(auth.uid(), c.brand_id)
    )
  );

CREATE POLICY courier_rates_write ON public.courier_governorate_rates
  FOR ALL TO authenticated
  USING (
    public.can_write_page(auth.uid(), '/couriers')
    AND EXISTS (
      SELECT 1
      FROM public.couriers c
      WHERE c.id = courier_governorate_rates.courier_id
        AND public.has_brand_access(auth.uid(), c.brand_id)
    )
  )
  WITH CHECK (
    public.can_write_page(auth.uid(), '/couriers')
    AND EXISTS (
      SELECT 1
      FROM public.couriers c
      WHERE c.id = courier_governorate_rates.courier_id
        AND public.has_brand_access(auth.uid(), c.brand_id)
    )
  );

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
    DELETE FROM public.courier_charges
    WHERE order_id = NEW.id
      AND settled_at IS NULL;
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

CREATE OR REPLACE FUNCTION public.refresh_courier_charges_for_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  courier_brand_id uuid;
BEGIN
  SELECT brand_id INTO courier_brand_id
  FROM public.couriers
  WHERE id = NEW.courier_id;

  IF courier_brand_id IS NULL THEN
    RAISE EXCEPTION 'Courier % has no brand', NEW.courier_id;
  END IF;

  UPDATE public.orders o
  SET courier_expense = CASE
    WHEN o.shipment_outcome = 'delivered' THEN NEW.delivery_fee
    WHEN o.shipment_outcome = 'returned' THEN NEW.return_fee
    ELSE o.courier_expense
  END
  WHERE o.courier_id = NEW.courier_id
    AND o.brand_id = courier_brand_id
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
    AND o.brand_id = courier_brand_id
    AND lower(btrim(o.shipping_governorate)) = lower(btrim(NEW.governorate))
    AND o.shipment_outcome IN ('delivered', 'returned')
    AND NEW.active
    AND NEW.effective_from <= o.occurred_at::date
    AND (NEW.effective_to IS NULL OR NEW.effective_to >= o.occurred_at::date);
  RETURN NEW;
END;
$$;

-- Atomically insert/update an order header and replace its line items. RLS remains
-- active because this function intentionally uses SECURITY INVOKER.
CREATE OR REPLACE FUNCTION public.upsert_order_with_items(
  _order_id uuid,
  _order_patch jsonb,
  _items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_order_id uuid;
  column_names text;
  selected_columns text;
BEGIN
  IF _order_patch IS NULL OR jsonb_typeof(_order_patch) <> 'object' THEN
    RAISE EXCEPTION 'order patch must be a JSON object';
  END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' THEN
    RAISE EXCEPTION 'items must be a JSON array';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(_order_patch) AS requested(name)
    LEFT JOIN pg_attribute a
      ON a.attrelid = 'public.orders'::regclass
     AND a.attname = requested.name
     AND a.attnum > 0
     AND NOT a.attisdropped
    WHERE a.attname IS NULL OR requested.name IN ('id', 'created_at')
  ) THEN
    RAISE EXCEPTION 'order patch contains an invalid or immutable column';
  END IF;

  SELECT
    string_agg(format('%I', requested.name), ', ' ORDER BY requested.name),
    string_agg(format('x.%I', requested.name), ', ' ORDER BY requested.name)
  INTO column_names, selected_columns
  FROM jsonb_object_keys(_order_patch) AS requested(name);

  IF column_names IS NULL THEN
    RAISE EXCEPTION 'order patch cannot be empty';
  END IF;

  IF _order_id IS NULL THEN
    EXECUTE format(
      'INSERT INTO public.orders (%s) SELECT %s FROM jsonb_populate_record(NULL::public.orders, $1) AS x RETURNING id',
      column_names,
      selected_columns
    )
    USING _order_patch
    INTO target_order_id;
  ELSE
    EXECUTE format(
      'UPDATE public.orders AS o SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.orders, $1) AS x) WHERE o.id = $2 RETURNING o.id',
      column_names,
      selected_columns
    )
    USING _order_patch, _order_id
    INTO target_order_id;
  END IF;

  IF target_order_id IS NULL THEN
    RAISE EXCEPTION 'order not found or not writable';
  END IF;

  DELETE FROM public.order_items WHERE order_id = target_order_id;

  INSERT INTO public.order_items (
    order_id, product_id, sku, title, qty, unit_price, unit_cost, subtotal
  )
  SELECT
    target_order_id,
    item.product_id,
    item.sku,
    item.title,
    item.qty,
    item.unit_price,
    item.unit_cost,
    item.subtotal
  FROM jsonb_to_recordset(_items) AS item(
    product_id uuid,
    sku text,
    title text,
    qty numeric,
    unit_price numeric,
    unit_cost numeric,
    subtotal numeric
  );

  RETURN target_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_order_with_items(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_order_with_items(uuid, jsonb, jsonb) TO authenticated, service_role;
