
CREATE OR REPLACE FUNCTION public.orders_sync_invoice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inv_id uuid;
  qty_sum numeric;
  stage_val text := public.map_order_to_invoice_stage(NEW.fulfillment_status);
  is_return boolean := (NEW.fulfillment_status = 'returned');
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
      stage, stage_updated_at, note
    ) VALUES (
      NEW.brand_id, NEW.courier_id,
      CASE WHEN is_return THEN 'return'::sales_invoice_type ELSE 'sale'::sales_invoice_type END,
      qty_sum, NEW.total_amount, collected, NEW.occurred_at::date,
      NEW.customer_id, NEW.customer_name, NEW.customer_phone, NEW.customer_email,
      stage_val::sales_invoice_stage, now(),
      'Order ' || coalesce(NEW.external_order_number, NEW.id::text)
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
      stage            = stage_val::sales_invoice_stage
    WHERE id = NEW.invoice_id;
  END IF;
  RETURN NEW;
END $function$;

-- Backfill existing invoices from currently paid orders
UPDATE public.sales_invoices si
SET collected_amount = o.total_amount
FROM public.orders o
WHERE o.invoice_id = si.id
  AND o.financial_status = 'paid'
  AND si.collected_amount < o.total_amount;
