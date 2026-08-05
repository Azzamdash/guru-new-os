-- 1) Ensure a dedicated expense category exists
INSERT INTO public.expense_categories (name, slug, active, sort_order)
SELECT 'دفعات الموردين', 'supplier_payments', true, 100
WHERE NOT EXISTS (SELECT 1 FROM public.expense_categories WHERE slug = 'supplier_payments');

-- 2) Recreate sync trigger to tag cash txn with category + keep date/amount in sync on update
CREATE OR REPLACE FUNCTION public.sync_supplier_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_cash_id uuid;
  b_id uuid;
  s_name text;
  cat_id uuid;
BEGIN
  SELECT id INTO cat_id FROM public.expense_categories WHERE slug = 'supplier_payments' LIMIT 1;

  IF TG_OP = 'INSERT' THEN
    IF NEW.cash_transaction_id IS NULL AND COALESCE(NEW.amount,0) > 0 THEN
      SELECT si.brand_id, sup.name INTO b_id, s_name
        FROM public.supplier_invoices si
        LEFT JOIN public.suppliers sup ON sup.id = si.supplier_id
        WHERE si.id = NEW.invoice_id;
      INSERT INTO public.cash_transactions(type, amount, occurred_at, brand_id, category_id, note)
      VALUES ('other_out', NEW.amount, NEW.paid_at, b_id, cat_id,
              'دفعة مورد: ' || COALESCE(s_name,'') || CASE WHEN NEW.note IS NOT NULL THEN ' - ' || NEW.note ELSE '' END)
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
            category_id = COALESCE(category_id, cat_id),
            note = COALESCE(NEW.note,'دفعة مورد')
        WHERE id = NEW.cash_transaction_id;
    END IF;
    PERFORM public.recompute_supplier_invoice_status(NEW.invoice_id);
    RETURN NEW;
  END IF;
  RETURN NEW;
END $function$;

-- 3) Backfill existing supplier-payment cash transactions with the category
UPDATE public.cash_transactions ct
SET category_id = ec.id
FROM public.expense_categories ec, public.supplier_payments sp
WHERE ec.slug = 'supplier_payments'
  AND sp.cash_transaction_id = ct.id
  AND ct.category_id IS NULL;