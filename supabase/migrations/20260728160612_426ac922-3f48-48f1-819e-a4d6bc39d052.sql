CREATE OR REPLACE FUNCTION public.sync_expense_delete_cash()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  IF OLD.cash_transaction_id IS NOT NULL THEN
    DELETE FROM public.cash_transactions WHERE id = OLD.cash_transaction_id;
  END IF;
  RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION public.sync_cash_delete_expense()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  IF OLD.expense_entry_id IS NOT NULL THEN
    DELETE FROM public.expense_entries WHERE id = OLD.expense_entry_id;
  ELSE
    DELETE FROM public.expense_entries WHERE cash_transaction_id = OLD.id;
  END IF;
  RETURN OLD;
END $$;