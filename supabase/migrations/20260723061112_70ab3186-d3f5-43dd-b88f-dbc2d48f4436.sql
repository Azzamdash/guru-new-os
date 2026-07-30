
-- Allow sales_invoice_items to reference free items (for mirrored order items without a product)
ALTER TABLE public.sales_invoice_items ALTER COLUMN product_id DROP NOT NULL;

-- Map an orders.fulfillment_status to a sales_invoices.stage value
CREATE OR REPLACE FUNCTION public.map_order_to_invoice_stage(_ff text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _ff
    WHEN 'unfulfilled' THEN 'new'
    WHEN 'processing'  THEN 'processing'
    WHEN 'shipped'     THEN 'with_courier'
    WHEN 'delivered'   THEN 'delivered'
    WHEN 'returned'    THEN 'cancelled'
    WHEN 'cancelled'   THEN 'cancelled'
    ELSE 'new'
  END
$$;

-- BEFORE trigger on orders: upsert a mirrored sales_invoice and link via orders.invoice_id
CREATE OR REPLACE FUNCTION public.orders_sync_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv_id uuid;
  qty_sum numeric;
  stage_val text := public.map_order_to_invoice_stage(NEW.fulfillment_status);
  is_return boolean := (NEW.fulfillment_status = 'returned');
BEGIN
  SELECT coalesce(sum(qty), 1) INTO qty_sum FROM public.order_items WHERE order_id = NEW.id;
  IF NEW.invoice_id IS NULL THEN
    INSERT INTO public.sales_invoices(
      brand_id, courier_id, type, qty, total_amount, occurred_at,
      customer_id, customer_name, customer_phone, customer_email,
      stage, stage_updated_at, note
    ) VALUES (
      NEW.brand_id, NEW.courier_id,
      CASE WHEN is_return THEN 'return'::sales_invoice_type ELSE 'sale'::sales_invoice_type END,
      qty_sum, NEW.total_amount, NEW.occurred_at::date,
      NEW.customer_id, NEW.customer_name, NEW.customer_phone, NEW.customer_email,
      stage_val::sales_invoice_stage, now(),
      'Order ' || coalesce(NEW.external_order_number, NEW.id::text)
    ) RETURNING id INTO inv_id;
    NEW.invoice_id := inv_id;
  ELSE
    UPDATE public.sales_invoices SET
      brand_id       = NEW.brand_id,
      courier_id     = NEW.courier_id,
      type           = CASE WHEN is_return THEN 'return'::sales_invoice_type ELSE 'sale'::sales_invoice_type END,
      qty            = qty_sum,
      total_amount   = NEW.total_amount,
      occurred_at    = NEW.occurred_at::date,
      customer_id    = NEW.customer_id,
      customer_name  = NEW.customer_name,
      customer_phone = NEW.customer_phone,
      customer_email = NEW.customer_email,
      stage          = stage_val::sales_invoice_stage
    WHERE id = NEW.invoice_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_orders_sync_invoice ON public.orders;
CREATE TRIGGER trg_orders_sync_invoice
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_sync_invoice();

-- Sync order_items into sales_invoice_items (wipe & rebuild per invoice on any change)
CREATE OR REPLACE FUNCTION public.order_items_sync_invoice_items()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  order_row_id uuid := coalesce(NEW.order_id, OLD.order_id);
  inv_id uuid;
BEGIN
  SELECT invoice_id INTO inv_id FROM public.orders WHERE id = order_row_id;
  IF inv_id IS NULL THEN RETURN coalesce(NEW, OLD); END IF;
  DELETE FROM public.sales_invoice_items WHERE invoice_id = inv_id;
  INSERT INTO public.sales_invoice_items(invoice_id, product_id, qty, unit_price, subtotal)
    SELECT inv_id, product_id, qty, unit_price, coalesce(subtotal, qty*unit_price)
    FROM public.order_items WHERE order_id = order_row_id;
  UPDATE public.sales_invoices
    SET qty = (SELECT coalesce(sum(qty),1) FROM public.order_items WHERE order_id = order_row_id)
    WHERE id = inv_id;
  RETURN coalesce(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_order_items_sync ON public.order_items;
CREATE TRIGGER trg_order_items_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.order_items_sync_invoice_items();

-- Delete the mirrored invoice when an order is deleted
CREATE OR REPLACE FUNCTION public.orders_delete_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.invoice_id IS NOT NULL THEN
    DELETE FROM public.sales_invoices WHERE id = OLD.invoice_id;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_orders_delete_invoice ON public.orders;
CREATE TRIGGER trg_orders_delete_invoice
  BEFORE DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_delete_invoice();

-- Backfill invoices for existing orders that don't yet have one
DO $$
DECLARE r record; iid uuid;
BEGIN
  FOR r IN SELECT * FROM public.orders WHERE invoice_id IS NULL LOOP
    INSERT INTO public.sales_invoices(
      brand_id, courier_id, type, qty, total_amount, occurred_at,
      customer_id, customer_name, customer_phone, customer_email,
      stage, stage_updated_at, note
    ) VALUES (
      r.brand_id, r.courier_id,
      CASE WHEN r.fulfillment_status='returned' THEN 'return'::sales_invoice_type ELSE 'sale'::sales_invoice_type END,
      coalesce((SELECT sum(qty) FROM public.order_items WHERE order_id=r.id), 1),
      r.total_amount, r.occurred_at::date,
      r.customer_id, r.customer_name, r.customer_phone, r.customer_email,
      public.map_order_to_invoice_stage(r.fulfillment_status)::sales_invoice_stage, now(),
      'Order ' || coalesce(r.external_order_number, r.id::text)
    ) RETURNING id INTO iid;
    UPDATE public.orders SET invoice_id = iid WHERE id = r.id;
    INSERT INTO public.sales_invoice_items(invoice_id, product_id, qty, unit_price, subtotal)
      SELECT iid, product_id, qty, unit_price, coalesce(subtotal, qty*unit_price)
      FROM public.order_items WHERE order_id = r.id;
  END LOOP;
END $$;
