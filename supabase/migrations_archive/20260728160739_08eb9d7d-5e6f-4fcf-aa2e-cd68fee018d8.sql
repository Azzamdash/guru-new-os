CREATE OR REPLACE FUNCTION public.sync_expense_to_cash()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE new_cash_id uuid; occ date;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.attendance_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.cash_transaction_id IS NOT NULL AND TG_OP='INSERT' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.amount,0) <= 0 THEN RETURN NEW; END IF;

  occ := COALESCE(NEW.period_date, make_date(NEW.year, GREATEST(1,LEAST(12,NEW.month)), 15));

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.cash_transactions(type, amount, occurred_at, brand_id, category_id, expense_entry_id, note)
    VALUES ('other_out', NEW.amount, occ, NEW.brand_id, NEW.category_id, NEW.id, COALESCE(NEW.note,'مصروف'))
    RETURNING id INTO new_cash_id;
    UPDATE public.expense_entries SET cash_transaction_id = new_cash_id WHERE id = NEW.id;
  ELSIF TG_OP='UPDATE' AND NEW.cash_transaction_id IS NOT NULL THEN
    UPDATE public.cash_transactions
      SET amount=NEW.amount, occurred_at=occ, brand_id=NEW.brand_id,
          category_id=NEW.category_id, note=COALESCE(NEW.note,'مصروف')
      WHERE id = NEW.cash_transaction_id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sync_cash_to_expense()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE new_exp_id uuid; y int; m int;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.expense_entry_id IS NOT NULL AND TG_OP='INSERT' THEN RETURN NEW; END IF;
  IF NEW.type <> 'other_out' THEN RETURN NEW; END IF;
  IF NEW.category_id IS NULL OR NEW.brand_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.amount,0) <= 0 THEN RETURN NEW; END IF;

  y := EXTRACT(YEAR FROM NEW.occurred_at)::int;
  m := EXTRACT(MONTH FROM NEW.occurred_at)::int;

  IF TG_OP='INSERT' THEN
    INSERT INTO public.expense_entries(brand_id, category_id, year, month, amount, note, period_type, period_date, cash_transaction_id)
    VALUES (NEW.brand_id, NEW.category_id, y, m, NEW.amount, NEW.note, 'daily', NEW.occurred_at, NEW.id)
    RETURNING id INTO new_exp_id;
    UPDATE public.cash_transactions SET expense_entry_id = new_exp_id WHERE id = NEW.id;
  ELSIF TG_OP='UPDATE' THEN
    UPDATE public.expense_entries
      SET amount=NEW.amount, brand_id=NEW.brand_id, category_id=NEW.category_id,
          year=y, month=m, period_date=NEW.occurred_at, note=NEW.note
      WHERE cash_transaction_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;