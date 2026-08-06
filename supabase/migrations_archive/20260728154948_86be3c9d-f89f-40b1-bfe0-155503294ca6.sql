
-- 1. New columns for two-way linking
ALTER TABLE public.expense_entries
  ADD COLUMN IF NOT EXISTS cash_transaction_id uuid REFERENCES public.cash_transactions(id) ON DELETE SET NULL;

ALTER TABLE public.cash_transactions
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.expense_categories(id),
  ADD COLUMN IF NOT EXISTS expense_entry_id uuid REFERENCES public.expense_entries(id) ON DELETE SET NULL;

ALTER TABLE public.supplier_payments
  ADD COLUMN IF NOT EXISTS cash_transaction_id uuid REFERENCES public.cash_transactions(id) ON DELETE SET NULL;

-- 2. Expense -> Cash sync
CREATE OR REPLACE FUNCTION public.sync_expense_to_cash()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_cash_id uuid;
  occ date;
BEGIN
  -- Skip salary auto-entries (already reflected via payroll flow) and rows created from cash side
  IF NEW.attendance_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.cash_transaction_id IS NOT NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.amount,0) <= 0 THEN RETURN NEW; END IF;

  occ := COALESCE(NEW.period_date, make_date(NEW.year, GREATEST(1,LEAST(12,NEW.month)), 15));

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.cash_transactions(type, amount, occurred_at, brand_id, category_id, expense_entry_id, note)
    VALUES ('other_out', NEW.amount, occ, NEW.brand_id, NEW.category_id, NEW.id,
            COALESCE(NEW.note, 'مصروف'))
    RETURNING id INTO new_cash_id;
    UPDATE public.expense_entries SET cash_transaction_id = new_cash_id WHERE id = NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.cash_transaction_id IS NOT NULL THEN
      UPDATE public.cash_transactions
        SET amount = NEW.amount, occurred_at = occ,
            brand_id = NEW.brand_id, category_id = NEW.category_id,
            note = COALESCE(NEW.note, 'مصروف')
        WHERE id = NEW.cash_transaction_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_expense_to_cash_ins ON public.expense_entries;
CREATE TRIGGER trg_sync_expense_to_cash_ins
AFTER INSERT ON public.expense_entries
FOR EACH ROW EXECUTE FUNCTION public.sync_expense_to_cash();

DROP TRIGGER IF EXISTS trg_sync_expense_to_cash_upd ON public.expense_entries;
CREATE TRIGGER trg_sync_expense_to_cash_upd
AFTER UPDATE OF amount, period_date, year, month, brand_id, category_id, note ON public.expense_entries
FOR EACH ROW EXECUTE FUNCTION public.sync_expense_to_cash();

CREATE OR REPLACE FUNCTION public.sync_expense_delete_cash()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.cash_transaction_id IS NOT NULL THEN
    DELETE FROM public.cash_transactions WHERE id = OLD.cash_transaction_id;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_sync_expense_delete_cash ON public.expense_entries;
CREATE TRIGGER trg_sync_expense_delete_cash
BEFORE DELETE ON public.expense_entries
FOR EACH ROW EXECUTE FUNCTION public.sync_expense_delete_cash();

-- 3. Cash -> Expense sync (only for type='other_out' with category_id)
CREATE OR REPLACE FUNCTION public.sync_cash_to_expense()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_exp_id uuid;
  y int; m int;
BEGIN
  IF NEW.expense_entry_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.type <> 'other_out' THEN RETURN NEW; END IF;
  IF NEW.category_id IS NULL OR NEW.brand_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.amount,0) <= 0 THEN RETURN NEW; END IF;

  y := EXTRACT(YEAR FROM NEW.occurred_at)::int;
  m := EXTRACT(MONTH FROM NEW.occurred_at)::int;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.expense_entries(brand_id, category_id, year, month, amount, note, period_type, period_date, cash_transaction_id)
    VALUES (NEW.brand_id, NEW.category_id, y, m, NEW.amount, NEW.note, 'daily', NEW.occurred_at, NEW.id)
    RETURNING id INTO new_exp_id;
    UPDATE public.cash_transactions SET expense_entry_id = new_exp_id WHERE id = NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- if linked expense exists elsewhere, update it; else create it now
    UPDATE public.expense_entries
      SET amount = NEW.amount, brand_id = NEW.brand_id, category_id = NEW.category_id,
          year = y, month = m, period_date = NEW.occurred_at, note = NEW.note
      WHERE cash_transaction_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_cash_to_expense_ins ON public.cash_transactions;
CREATE TRIGGER trg_sync_cash_to_expense_ins
AFTER INSERT ON public.cash_transactions
FOR EACH ROW EXECUTE FUNCTION public.sync_cash_to_expense();

DROP TRIGGER IF EXISTS trg_sync_cash_to_expense_upd ON public.cash_transactions;
CREATE TRIGGER trg_sync_cash_to_expense_upd
AFTER UPDATE OF amount, occurred_at, brand_id, category_id, note, type ON public.cash_transactions
FOR EACH ROW EXECUTE FUNCTION public.sync_cash_to_expense();

CREATE OR REPLACE FUNCTION public.sync_cash_delete_expense()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.expense_entry_id IS NOT NULL THEN
    DELETE FROM public.expense_entries WHERE id = OLD.expense_entry_id;
  ELSE
    -- expense might link back but cash has no expense_entry_id yet (created-from-cash path saved only one side)
    DELETE FROM public.expense_entries WHERE cash_transaction_id = OLD.id;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_sync_cash_delete_expense ON public.cash_transactions;
CREATE TRIGGER trg_sync_cash_delete_expense
BEFORE DELETE ON public.cash_transactions
FOR EACH ROW EXECUTE FUNCTION public.sync_cash_delete_expense();

-- 4. Supplier payments -> cash + invoice status recompute
CREATE OR REPLACE FUNCTION public.recompute_supplier_invoice_status(_invoice_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv_amt numeric; paid numeric; new_status invoice_status;
BEGIN
  SELECT amount INTO inv_amt FROM public.supplier_invoices WHERE id = _invoice_id;
  IF inv_amt IS NULL THEN RETURN; END IF;
  SELECT COALESCE(SUM(amount),0) INTO paid FROM public.supplier_payments WHERE invoice_id = _invoice_id;
  IF paid <= 0 THEN new_status := 'open';
  ELSIF paid < inv_amt THEN new_status := 'partial';
  ELSE new_status := 'paid';
  END IF;
  UPDATE public.supplier_invoices SET status = new_status WHERE id = _invoice_id;
END $$;

CREATE OR REPLACE FUNCTION public.sync_supplier_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_cash_id uuid;
  b_id uuid;
  s_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.cash_transaction_id IS NULL AND COALESCE(NEW.amount,0) > 0 THEN
      SELECT si.brand_id, sup.name INTO b_id, s_name
        FROM public.supplier_invoices si
        LEFT JOIN public.suppliers sup ON sup.id = si.supplier_id
        WHERE si.id = NEW.invoice_id;
      INSERT INTO public.cash_transactions(type, amount, occurred_at, brand_id, note)
      VALUES ('other_out', NEW.amount, NEW.paid_at, b_id,
              'دفعة مورد: ' || COALESCE(s_name,'') || CASE WHEN NEW.note IS NOT NULL THEN ' - ' || NEW.note ELSE '' END)
      RETURNING id INTO new_cash_id;
      UPDATE public.supplier_payments SET cash_transaction_id = new_cash_id WHERE id = NEW.id;
    END IF;
    PERFORM public.recompute_supplier_invoice_status(NEW.invoice_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.cash_transaction_id IS NOT NULL THEN
      UPDATE public.cash_transactions
        SET amount = NEW.amount, occurred_at = NEW.paid_at, note = COALESCE(NEW.note,'دفعة مورد')
        WHERE id = NEW.cash_transaction_id;
    END IF;
    PERFORM public.recompute_supplier_invoice_status(NEW.invoice_id);
    RETURN NEW;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_supplier_payment ON public.supplier_payments;
CREATE TRIGGER trg_sync_supplier_payment
AFTER INSERT OR UPDATE ON public.supplier_payments
FOR EACH ROW EXECUTE FUNCTION public.sync_supplier_payment();

CREATE OR REPLACE FUNCTION public.sync_supplier_payment_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.cash_transaction_id IS NOT NULL THEN
    DELETE FROM public.cash_transactions WHERE id = OLD.cash_transaction_id;
  END IF;
  PERFORM public.recompute_supplier_invoice_status(OLD.invoice_id);
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_sync_supplier_payment_del ON public.supplier_payments;
CREATE TRIGGER trg_sync_supplier_payment_del
BEFORE DELETE ON public.supplier_payments
FOR EACH ROW EXECUTE FUNCTION public.sync_supplier_payment_delete();
