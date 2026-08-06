
-- Allow attendance-linked salary expense entries to sync to cash_transactions
CREATE OR REPLACE FUNCTION public.sync_expense_to_cash()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE new_cash_id uuid; occ date;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
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
  ELSIF TG_OP='UPDATE' AND NEW.cash_transaction_id IS NULL THEN
    -- Legacy row without a linked cash txn (e.g. attendance salary): create one now
    INSERT INTO public.cash_transactions(type, amount, occurred_at, brand_id, category_id, expense_entry_id, note)
    VALUES ('other_out', NEW.amount, occ, NEW.brand_id, NEW.category_id, NEW.id, COALESCE(NEW.note,'مصروف'))
    RETURNING id INTO new_cash_id;
    UPDATE public.expense_entries SET cash_transaction_id = new_cash_id WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END $function$;

-- Backfill: create cash withdrawals for any expense entries that don't have one
DO $$
DECLARE r record; new_cash_id uuid; occ date;
BEGIN
  FOR r IN SELECT * FROM public.expense_entries WHERE cash_transaction_id IS NULL AND COALESCE(amount,0) > 0
  LOOP
    occ := COALESCE(r.period_date, make_date(r.year, GREATEST(1,LEAST(12,r.month)), 15));
    INSERT INTO public.cash_transactions(type, amount, occurred_at, brand_id, category_id, expense_entry_id, note)
    VALUES ('other_out', r.amount, occ, r.brand_id, r.category_id, r.id, COALESCE(r.note,'مصروف'))
    RETURNING id INTO new_cash_id;
    UPDATE public.expense_entries SET cash_transaction_id = new_cash_id WHERE id = r.id;
  END LOOP;
END $$;
