-- sales_invoices.occurred_at and inventory_movements.occurred_at are plain
-- `date` columns, and orders_sync_invoice()/orders_deduct_stock() populated
-- them with a bare `NEW.occurred_at::date` cast. Casting a timestamptz to
-- date uses the DATABASE SESSION's timezone (UTC on Supabase) to decide
-- which calendar day the instant falls on — not the business timezone
-- (Africa/Cairo). For an order placed in Cairo's first ~3 early-morning
-- hours (00:00-03:00 local, DST-dependent), that lands the invoice/movement
-- on the PREVIOUS UTC day instead of the correct Cairo day.
--
-- dashboard_operational_report's monthlySales revenue then compares
-- sales_invoices.occurred_at (a date, implicitly cast to timestamptz at
-- midnight in session/UTC timezone) against correctly Cairo-aware _from/_to
-- bounds — so every invoice mis-dated this way falls outside "today"'s
-- window and is silently excluded from the revenue total, while
-- orders.occurred_at (a real timestamptz, unaffected by this bug) still
-- counts the same order correctly for the order-count KPI. On a day where
-- every order-so-far happens to be from that early window, revenue reads
-- as a clean zero despite a correct, non-zero order count.
--
-- Fix: compute the calendar date in the business timezone, matching
-- src/lib/timezone.ts's formatBusinessDate on the application side.
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
  occurred_date date := (NEW.occurred_at AT TIME ZONE 'Africa/Cairo')::date;
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
      qty_sum, NEW.total_amount, collected, occurred_date,
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
      occurred_at      = occurred_date,
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

CREATE OR REPLACE FUNCTION public.orders_deduct_stock() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  is_offline boolean;
  occurred_date date := (NEW.occurred_at AT TIME ZONE 'Africa/Cairo')::date;
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
  SELECT oi.product_id, 'sale', oi.qty, occurred_date, 'order_confirmed', 'order', NEW.id,
         'خصم مخزون عند تأكيد أوردر ' || coalesce(NEW.external_order_number, '')
  FROM public.order_items oi
  WHERE oi.order_id = NEW.id AND oi.product_id IS NOT NULL AND oi.qty > 0
    AND oi.direction = 'out';

  INSERT INTO public.inventory_movements(product_id, type, qty, occurred_at, reason, source, source_id, note)
  SELECT oi.product_id, 'return', oi.qty, occurred_date, 'order_confirmed', 'order', NEW.id,
         'رجوع مخزون عند تأكيد أوردر ' || coalesce(NEW.external_order_number, '')
  FROM public.order_items oi
  WHERE oi.order_id = NEW.id AND oi.product_id IS NOT NULL AND oi.qty > 0
    AND oi.direction = 'in';

  RETURN NEW;
END;
$$;
