-- Exchange orders need two sides on one order: what ships out to the
-- customer and what comes back from them. order_items gets a `direction`
-- ('out'/'in') to carry that. Everything that reads order_items needs to
-- become direction-aware:
--
--  - Stock: 'out' items deduct stock (existing behavior), 'in' items add
--    stock back. Previously ALL items on a return/exchange order deducted
--    stock as if they were a normal sale — returned goods never came back
--    into inventory. That's the bug this migration fixes.
--  - Invoice items / cost_total: for plain 'sale' and 'return' orders,
--    direction doesn't change the sign — the invoice's own `type` (sale vs
--    return, driven by fulfillment_status) already carries the revenue/COGS
--    sign flip, so items stay positive exactly as before (no behavior
--    change for existing orders). Only for `order_kind = 'exchange'` do 'in'
--    items subtract from the invoice's items/cost_total, since an exchange
--    is a single invoice that has to net both sides itself (out value minus
--    in value = the real revenue impact of the exchange).
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'out' CHECK (direction IN ('out', 'in'));

CREATE OR REPLACE FUNCTION public.order_items_sync_invoice_items() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  order_row_id uuid := coalesce(NEW.order_id, OLD.order_id);
  inv_id uuid;
  kind text;
BEGIN
  SELECT invoice_id, order_kind INTO inv_id, kind FROM public.orders WHERE id = order_row_id;
  IF inv_id IS NULL THEN RETURN coalesce(NEW, OLD); END IF;
  DELETE FROM public.sales_invoice_items WHERE invoice_id = inv_id;
  INSERT INTO public.sales_invoice_items(invoice_id, product_id, qty, unit_price, subtotal)
    SELECT inv_id, product_id,
      (CASE WHEN kind = 'exchange' AND direction = 'in' THEN -1 ELSE 1 END) * qty,
      unit_price,
      (CASE WHEN kind = 'exchange' AND direction = 'in' THEN -1 ELSE 1 END) * coalesce(subtotal, qty*unit_price)
    FROM public.order_items WHERE order_id = order_row_id;
  UPDATE public.sales_invoices
    SET qty = (SELECT coalesce(sum(qty),1) FROM public.order_items WHERE order_id = order_row_id)
    WHERE id = inv_id;
  RETURN coalesce(NEW, OLD);
END $$;

CREATE OR REPLACE FUNCTION public.orders_deduct_stock() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  is_offline boolean;
BEGIN
  IF NEW.confirmation_status IS DISTINCT FROM 'confirmed'
     OR OLD.confirmation_status IS NOT DISTINCT FROM NEW.confirmation_status THEN
    RETURN NEW;
  END IF;

  SELECT (b.type::text = 'offline_branch') INTO is_offline
  FROM public.brands b WHERE b.id = NEW.brand_id;
  IF coalesce(is_offline, false) THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM public.inventory_movements
             WHERE source = 'order' AND source_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.inventory_movements(product_id, type, qty, occurred_at, reason, source, source_id, note)
  SELECT oi.product_id, 'sale', oi.qty, NEW.occurred_at::date, 'order_confirmed', 'order', NEW.id,
         'خصم مخزون عند تأكيد أوردر ' || coalesce(NEW.external_order_number, '')
  FROM public.order_items oi
  WHERE oi.order_id = NEW.id AND oi.product_id IS NOT NULL AND oi.qty > 0
    AND oi.direction = 'out';

  INSERT INTO public.inventory_movements(product_id, type, qty, occurred_at, reason, source, source_id, note)
  SELECT oi.product_id, 'return', oi.qty, NEW.occurred_at::date, 'order_confirmed', 'order', NEW.id,
         'رجوع مخزون عند تأكيد أوردر ' || coalesce(NEW.external_order_number, '')
  FROM public.order_items oi
  WHERE oi.order_id = NEW.id AND oi.product_id IS NOT NULL AND oi.qty > 0
    AND oi.direction = 'in';

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sync_order_cost_total() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order uuid;
  v_kind text;
  v_total numeric;
BEGIN
  v_order := COALESCE(NEW.order_id, OLD.order_id);
  SELECT order_kind INTO v_kind FROM public.orders WHERE id = v_order;
  SELECT COALESCE(SUM((CASE WHEN v_kind = 'exchange' AND direction = 'in' THEN -1 ELSE 1 END) * qty * COALESCE(unit_cost, 0)), 0) INTO v_total
  FROM public.order_items WHERE order_id = v_order;
  UPDATE public.orders SET cost_total = v_total WHERE id = v_order;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_order_with_items(_order_id uuid, _order_patch jsonb, _items jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
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
    order_id, product_id, sku, title, qty, unit_price, unit_cost, subtotal, direction
  )
  SELECT
    target_order_id,
    item.product_id,
    item.sku,
    item.title,
    item.qty,
    item.unit_price,
    item.unit_cost,
    item.subtotal,
    COALESCE(item.direction, 'out')
  FROM jsonb_to_recordset(_items) AS item(
    product_id uuid,
    sku text,
    title text,
    qty numeric,
    unit_price numeric,
    unit_cost numeric,
    subtotal numeric,
    direction text
  );

  RETURN target_order_id;
END;
$$;
