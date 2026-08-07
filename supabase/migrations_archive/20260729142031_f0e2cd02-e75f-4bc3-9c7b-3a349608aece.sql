
-- 1) Refunds category
INSERT INTO public.expense_categories(name, slug, active, sort_order)
VALUES ('مرتجعات مبيعات', 'sales_refunds', true, 900)
ON CONFLICT (slug) DO NOTHING;

-- 2) Auto-create supplier_payment when supplier_invoice marked paid
CREATE OR REPLACE FUNCTION public.auto_pay_supplier_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  already_paid numeric;
  remaining numeric;
BEGIN
  IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid') THEN
    SELECT COALESCE(SUM(amount),0) INTO already_paid FROM public.supplier_payments WHERE invoice_id = NEW.id;
    remaining := COALESCE(NEW.amount,0) - already_paid;
    IF remaining > 0 THEN
      INSERT INTO public.supplier_payments(invoice_id, amount, paid_at, note)
      VALUES (NEW.id, remaining, COALESCE(NEW.issued_at, CURRENT_DATE), 'دفعة تلقائية عند تعليم الفاتورة كمدفوعة');
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_auto_pay_supplier_invoice ON public.supplier_invoices;
CREATE TRIGGER trg_auto_pay_supplier_invoice
AFTER INSERT OR UPDATE OF status, amount ON public.supplier_invoices
FOR EACH ROW EXECUTE FUNCTION public.auto_pay_supplier_invoice();

-- 3) Fix the supplier payment note (keep the Arabic prefix on updates)
CREATE OR REPLACE FUNCTION public.sync_supplier_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_cash_id uuid;
  b_id uuid;
  s_name text;
  cat_id uuid;
  built_note text;
BEGIN
  SELECT id INTO cat_id FROM public.expense_categories WHERE slug = 'supplier_payments' LIMIT 1;
  SELECT si.brand_id, sup.name INTO b_id, s_name
    FROM public.supplier_invoices si
    LEFT JOIN public.suppliers sup ON sup.id = si.supplier_id
    WHERE si.id = NEW.invoice_id;
  built_note := 'دفعة مورد: ' || COALESCE(s_name,'') ||
                CASE WHEN NEW.note IS NOT NULL AND NEW.note <> '' THEN ' - ' || NEW.note ELSE '' END;

  IF TG_OP = 'INSERT' THEN
    IF NEW.cash_transaction_id IS NULL AND COALESCE(NEW.amount,0) > 0 THEN
      INSERT INTO public.cash_transactions(type, amount, occurred_at, brand_id, category_id, note)
      VALUES ('other_out', NEW.amount, NEW.paid_at, b_id, cat_id, built_note)
      RETURNING id INTO new_cash_id;
      UPDATE public.supplier_payments SET cash_transaction_id = new_cash_id WHERE id = NEW.id;
    END IF;
    PERFORM public.recompute_supplier_invoice_status(NEW.invoice_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.cash_transaction_id IS NOT NULL THEN
      UPDATE public.cash_transactions
        SET amount = NEW.amount,
            occurred_at = NEW.paid_at,
            brand_id = b_id,
            category_id = COALESCE(category_id, cat_id),
            note = built_note
        WHERE id = NEW.cash_transaction_id;
    END IF;
    PERFORM public.recompute_supplier_invoice_status(NEW.invoice_id);
    RETURN NEW;
  END IF;
  RETURN NEW;
END $$;

-- 4) Auto cash outflow for sales returns
CREATE OR REPLACE FUNCTION public.sync_sales_return_cash()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cat_id uuid;
  new_cash_id uuid;
  built_note text;
BEGIN
  SELECT id INTO cat_id FROM public.expense_categories WHERE slug = 'sales_refunds' LIMIT 1;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.cash_transactions
      WHERE note = 'مرتجع مبيعات #' || OLD.id::text;
    RETURN OLD;
  END IF;

  built_note := 'مرتجع مبيعات #' || NEW.id::text;

  IF NEW.type = 'return' AND COALESCE(NEW.total_amount,0) > 0 THEN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.cash_transactions(type, amount, occurred_at, brand_id, category_id, note)
      VALUES ('other_out', NEW.total_amount, NEW.occurred_at, NEW.brand_id, cat_id, built_note)
      RETURNING id INTO new_cash_id;
    ELSIF TG_OP = 'UPDATE' THEN
      UPDATE public.cash_transactions
        SET amount = NEW.total_amount,
            occurred_at = NEW.occurred_at,
            brand_id = NEW.brand_id,
            category_id = COALESCE(category_id, cat_id)
        WHERE note = built_note;
      IF NOT FOUND THEN
        INSERT INTO public.cash_transactions(type, amount, occurred_at, brand_id, category_id, note)
        VALUES ('other_out', NEW.total_amount, NEW.occurred_at, NEW.brand_id, cat_id, built_note);
      END IF;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.type = 'return' AND NEW.type <> 'return' THEN
    DELETE FROM public.cash_transactions WHERE note = 'مرتجع مبيعات #' || NEW.id::text;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_sales_return_cash_iu ON public.sales_invoices;
CREATE TRIGGER trg_sync_sales_return_cash_iu
AFTER INSERT OR UPDATE OF type, total_amount, occurred_at, brand_id ON public.sales_invoices
FOR EACH ROW EXECUTE FUNCTION public.sync_sales_return_cash();

DROP TRIGGER IF EXISTS trg_sync_sales_return_cash_del ON public.sales_invoices;
CREATE TRIGGER trg_sync_sales_return_cash_del
BEFORE DELETE ON public.sales_invoices
FOR EACH ROW EXECUTE FUNCTION public.sync_sales_return_cash();
