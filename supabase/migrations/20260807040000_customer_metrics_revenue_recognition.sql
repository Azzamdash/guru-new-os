-- customer_metrics (ltv, orders_count) is maintained by triggers that fire
-- off sales_invoices, which is itself updated from inside orders_sync_invoice
-- — a BEFORE UPDATE trigger on orders. At that point in the transaction the
-- orders row's own update hasn't landed in the heap yet, so a plain join
-- from the metrics trigger to orders.fulfillment_status would read stale
-- (pre-update) data for the very order being updated.
--
-- Instead, add a `settled` column directly on sales_invoices, computed from
-- NEW.fulfillment_status inside orders_sync_invoice (which already has NEW
-- in hand, no query needed) at the exact moment the invoice row is written.
-- The metrics trigger then reads that column off the row it's already
-- looking at — no cross-table join, no timing issue. Same delivered/returned
-- rule as everywhere else; existing rows default to true (no backfill) so
-- historical figures don't move until their order is next updated.
ALTER TABLE public.sales_invoices ADD COLUMN IF NOT EXISTS settled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.orders_sync_invoice() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  inv_id uuid;
  qty_sum numeric;
  stage_val text := public.map_order_to_invoice_stage(NEW.fulfillment_status);
  is_return boolean := (NEW.fulfillment_status = 'returned');
  is_settled boolean := (NEW.fulfillment_status IN ('delivered', 'returned'));
  collected numeric := CASE
    WHEN NEW.financial_status IN ('paid','partially_refunded') THEN NEW.total_amount
    WHEN NEW.financial_status = 'partially_paid' THEN NEW.total_amount / 2
    ELSE 0
  END;
BEGIN
  SELECT coalesce(sum(qty), 1) INTO qty_sum FROM public.order_items WHERE order_id = NEW.id;
  IF NEW.invoice_id IS NULL THEN
    INSERT INTO public.sales_invoices(
      brand_id, courier_id, type, qty, total_amount, collected_amount, occurred_at,
      customer_id, customer_name, customer_phone, customer_email,
      stage, stage_updated_at, note, settled
    ) VALUES (
      NEW.brand_id, NEW.courier_id,
      CASE WHEN is_return THEN 'return'::sales_invoice_type ELSE 'sale'::sales_invoice_type END,
      qty_sum, NEW.total_amount, collected, NEW.occurred_at::date,
      NEW.customer_id, NEW.customer_name, NEW.customer_phone, NEW.customer_email,
      stage_val::sales_invoice_stage, now(),
      'Order ' || coalesce(NEW.external_order_number, NEW.id::text),
      is_settled
    ) RETURNING id INTO inv_id;
    NEW.invoice_id := inv_id;
  ELSE
    UPDATE public.sales_invoices SET
      brand_id         = NEW.brand_id,
      courier_id       = NEW.courier_id,
      type             = CASE WHEN is_return THEN 'return'::sales_invoice_type ELSE 'sale'::sales_invoice_type END,
      qty              = qty_sum,
      total_amount     = NEW.total_amount,
      collected_amount = collected,
      occurred_at      = NEW.occurred_at::date,
      customer_id      = NEW.customer_id,
      customer_name    = NEW.customer_name,
      customer_phone   = NEW.customer_phone,
      customer_email   = NEW.customer_email,
      stage            = stage_val::sales_invoice_stage,
      settled          = is_settled
    WHERE id = NEW.invoice_id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.refresh_customer_brand_metrics(_customer_id uuid, _brand_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF _customer_id IS NULL OR _brand_id IS NULL THEN RETURN; END IF;
  PERFORM public.lock_customer_brand_metrics(_customer_id, _brand_id);
  DELETE FROM public.customer_metrics
  WHERE customer_id = _customer_id AND brand_id = _brand_id;
  INSERT INTO public.customer_metrics(
    customer_id, brand_id, ltv, orders_count, first_order_at, last_order_at, updated_at
  )
  SELECT
    _customer_id,
    _brand_id,
    sum(CASE WHEN si.type = 'return' THEN -si.total_amount ELSE si.total_amount END),
    count(*) FILTER (WHERE si.type = 'sale'),
    min(si.occurred_at),
    max(si.occurred_at),
    now()
  FROM public.sales_invoices si
  WHERE si.customer_id = _customer_id AND si.brand_id = _brand_id AND si.settled
  HAVING count(*) > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_customer_metrics_trigger() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  old_key text;
  new_key text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.lock_customer_brand_metrics(NEW.customer_id, NEW.brand_id);
    IF NEW.customer_id IS NOT NULL AND NEW.brand_id IS NOT NULL THEN
      IF NEW.settled THEN
        INSERT INTO public.customer_metrics(
          customer_id, brand_id, ltv, orders_count, first_order_at, last_order_at, updated_at
        ) VALUES (
          NEW.customer_id,
          NEW.brand_id,
          CASE WHEN NEW.type = 'return' THEN -NEW.total_amount ELSE NEW.total_amount END,
          CASE WHEN NEW.type = 'sale' THEN 1 ELSE 0 END,
          NEW.occurred_at,
          NEW.occurred_at,
          now()
        )
        ON CONFLICT (customer_id, brand_id) DO UPDATE SET
          ltv = public.customer_metrics.ltv + EXCLUDED.ltv,
          orders_count = public.customer_metrics.orders_count + EXCLUDED.orders_count,
          first_order_at = LEAST(public.customer_metrics.first_order_at, EXCLUDED.first_order_at),
          last_order_at = GREATEST(public.customer_metrics.last_order_at, EXCLUDED.last_order_at),
          updated_at = now();
      END IF;
      UPDATE public.customers
      SET last_seen_at = GREATEST(COALESCE(last_seen_at, NEW.occurred_at), NEW.occurred_at)
      WHERE id = NEW.customer_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_customer_brand_metrics(OLD.customer_id, OLD.brand_id);
  ELSE
    old_key := COALESCE(OLD.customer_id::text, '') || ':' || COALESCE(OLD.brand_id::text, '');
    new_key := COALESCE(NEW.customer_id::text, '') || ':' || COALESCE(NEW.brand_id::text, '');
    IF old_key <= new_key THEN
      PERFORM public.lock_customer_brand_metrics(OLD.customer_id, OLD.brand_id);
      IF old_key <> new_key THEN PERFORM public.lock_customer_brand_metrics(NEW.customer_id, NEW.brand_id); END IF;
    ELSE
      PERFORM public.lock_customer_brand_metrics(NEW.customer_id, NEW.brand_id);
      PERFORM public.lock_customer_brand_metrics(OLD.customer_id, OLD.brand_id);
    END IF;
    PERFORM public.refresh_customer_brand_metrics(OLD.customer_id, OLD.brand_id);
    IF old_key <> new_key THEN
      PERFORM public.refresh_customer_brand_metrics(NEW.customer_id, NEW.brand_id);
    END IF;
    IF NEW.customer_id IS NOT NULL THEN
      UPDATE public.customers
      SET last_seen_at = GREATEST(COALESCE(last_seen_at, NEW.occurred_at), NEW.occurred_at)
      WHERE id = NEW.customer_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sales_invoices_refresh_customer_metrics ON public.sales_invoices;
CREATE TRIGGER sales_invoices_refresh_customer_metrics AFTER INSERT OR DELETE OR UPDATE OF customer_id, type, total_amount, occurred_at, brand_id, settled ON public.sales_invoices FOR EACH ROW EXECUTE FUNCTION public.refresh_customer_metrics_trigger();
