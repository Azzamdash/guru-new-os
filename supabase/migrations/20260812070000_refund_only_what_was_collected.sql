-- A return only pays money back if money came in.
--
-- sync_sales_return_cash books an 'other_out' cash movement for the full
-- invoice total the moment an invoice turns into a return, on the assumption
-- that a return is a refund. In a COD business that assumption only holds once
-- the customer has actually paid.
--
-- orders_sync_invoice flips an order's invoice to type = 'return' whenever the
-- order ends as a return -- including an order cancelled before it was ever
-- dispatched, and one that turned back mid-transit. Nobody paid for those. The
-- trigger still booked the whole order value as cash leaving the treasury, so
-- the balance dropped by a refund that was never handed to anyone.
--
-- Refund what was collected, and no more:
--
--   * order collected nothing  -> no cash movement, and any earlier one is
--                                 removed on the next update
--   * order collected in part  -> refund the part (you cannot hand back cash
--                                 you never took)
--   * invoice has no order     -> unchanged. An offline counter sale has no
--                                 order row and its return really is a refund;
--                                 there is nothing here that says otherwise,
--                                 and silently dropping it would hide a real
--                                 payout.
--
-- order_collections is the right source: a row lands there when a collection is
-- actually posted, so it is the record of money reaching us rather than of an
-- order's status.
--
-- Note this corrects the trigger only. Cash rows already written for
-- uncollected returns stay until their invoice next updates; see
-- supabase/maintenance/remove-uncollected-refunds.sql to clear them.
CREATE OR REPLACE FUNCTION public.sync_sales_return_cash() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  cat_id uuid;
  built_note text;
  has_order boolean;
  collected numeric;
  refundable numeric;
BEGIN
  SELECT id INTO cat_id FROM public.expense_categories WHERE slug = 'sales_refunds' LIMIT 1;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.cash_transactions
      WHERE note = 'مرتجع مبيعات #' || OLD.id::text;
    RETURN OLD;
  END IF;

  built_note := 'مرتجع مبيعات #' || NEW.id::text;

  SELECT EXISTS (SELECT 1 FROM public.orders o WHERE o.invoice_id = NEW.id)
    INTO has_order;

  IF has_order THEN
    SELECT COALESCE(sum(oc.amount), 0)
      INTO collected
      FROM public.orders o
      JOIN public.order_collections oc ON oc.order_id = o.id
      WHERE o.invoice_id = NEW.id;
    refundable := LEAST(COALESCE(NEW.total_amount, 0), COALESCE(collected, 0));
  ELSE
    refundable := COALESCE(NEW.total_amount, 0);
  END IF;

  IF NEW.type = 'return' AND refundable > 0 THEN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.cash_transactions(type, amount, occurred_at, brand_id, category_id, note)
      VALUES ('other_out', refundable, NEW.occurred_at, NEW.brand_id, cat_id, built_note);
    ELSIF TG_OP = 'UPDATE' THEN
      UPDATE public.cash_transactions
        SET amount = refundable,
            occurred_at = NEW.occurred_at,
            brand_id = NEW.brand_id,
            category_id = COALESCE(category_id, cat_id)
        WHERE note = built_note;
      IF NOT FOUND THEN
        INSERT INTO public.cash_transactions(type, amount, occurred_at, brand_id, category_id, note)
        VALUES ('other_out', refundable, NEW.occurred_at, NEW.brand_id, cat_id, built_note);
      END IF;
    END IF;
  ELSE
    -- Covers both "no longer a return" and "a return that took no money".
    DELETE FROM public.cash_transactions WHERE note = built_note;
  END IF;

  RETURN NEW;
END;
$$;
