CREATE OR REPLACE FUNCTION public.sync_expense_to_cash()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_cash_id uuid;
  occ date;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.cash_transaction_id IS NOT NULL THEN
      DELETE FROM public.cash_transactions
      WHERE id = OLD.cash_transaction_id;
    ELSE
      DELETE FROM public.cash_transactions
      WHERE expense_entry_id = OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.cash_transaction_id IS NOT NULL AND TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.amount, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  occ := COALESCE(NEW.period_date, make_date(NEW.year, GREATEST(1, LEAST(12, NEW.month)), 15));

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.cash_transactions(type, amount, occurred_at, brand_id, category_id, expense_entry_id, note)
    VALUES ('other_out', NEW.amount, occ, NEW.brand_id, NEW.category_id, NEW.id, COALESCE(NEW.note, 'مصروف'))
    RETURNING id INTO new_cash_id;

    UPDATE public.expense_entries
    SET cash_transaction_id = new_cash_id
    WHERE id = NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.cash_transaction_id IS NOT NULL THEN
      UPDATE public.cash_transactions
      SET amount = NEW.amount,
          occurred_at = occ,
          brand_id = NEW.brand_id,
          category_id = NEW.category_id,
          note = COALESCE(NEW.note, 'مصروف')
      WHERE id = NEW.cash_transaction_id;
    ELSE
      SELECT id INTO new_cash_id
      FROM public.cash_transactions
      WHERE expense_entry_id = NEW.id
      LIMIT 1;

      IF new_cash_id IS NULL THEN
        INSERT INTO public.cash_transactions(type, amount, occurred_at, brand_id, category_id, expense_entry_id, note)
        VALUES ('other_out', NEW.amount, occ, NEW.brand_id, NEW.category_id, NEW.id, COALESCE(NEW.note, 'مصروف'))
        RETURNING id INTO new_cash_id;
      ELSE
        UPDATE public.cash_transactions
        SET amount = NEW.amount,
            occurred_at = occ,
            brand_id = NEW.brand_id,
            category_id = NEW.category_id,
            note = COALESCE(NEW.note, 'مصروف')
        WHERE id = new_cash_id;
      END IF;

      UPDATE public.expense_entries
      SET cash_transaction_id = new_cash_id
      WHERE id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_sync_expense_to_cash ON public.expense_entries;
CREATE TRIGGER trg_sync_expense_to_cash
AFTER INSERT OR UPDATE OR DELETE ON public.expense_entries
FOR EACH ROW
EXECUTE FUNCTION public.sync_expense_to_cash();