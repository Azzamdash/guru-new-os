-- Expenses had no way to say which wallet (خزنة) the money left from.
-- sync_expense_to_cash creates the matching cash_transactions row without a
-- wallet_id, so cash_txn_default_wallet then silently charged every expense
-- to whichever active wallet happened to sort first — the money moved, but
-- always out of the wrong box unless you only had one.
--
-- Adds an explicit wallet_id on expense_entries and propagates it into the
-- generated cash transaction. Left nullable so existing rows (and any caller
-- that doesn't pass one) keep the previous default-wallet behaviour rather
-- than failing.
ALTER TABLE public.expense_entries
    ADD COLUMN IF NOT EXISTS wallet_id uuid;

DO $mig$ BEGIN
    ALTER TABLE ONLY public.expense_entries
        ADD CONSTRAINT expense_entries_wallet_id_fkey
        FOREIGN KEY (wallet_id) REFERENCES public.wallets(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

CREATE INDEX IF NOT EXISTS idx_expense_entries_wallet_id
    ON public.expense_entries (wallet_id);

-- Same body as the original, with wallet_id carried into every branch that
-- writes the paired cash transaction. A NULL wallet_id still falls through to
-- cash_txn_default_wallet, preserving today's behaviour for untouched rows.
CREATE OR REPLACE FUNCTION public.sync_expense_to_cash() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
    INSERT INTO public.cash_transactions(type, amount, occurred_at, brand_id, category_id, expense_entry_id, note, wallet_id)
    VALUES ('other_out', NEW.amount, occ, NEW.brand_id, NEW.category_id, NEW.id, COALESCE(NEW.note, 'مصروف'), NEW.wallet_id)
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
          note = COALESCE(NEW.note, 'مصروف'),
          wallet_id = COALESCE(NEW.wallet_id, wallet_id)
      WHERE id = NEW.cash_transaction_id;
    ELSE
      SELECT id INTO new_cash_id
      FROM public.cash_transactions
      WHERE expense_entry_id = NEW.id
      LIMIT 1;

      IF new_cash_id IS NULL THEN
        INSERT INTO public.cash_transactions(type, amount, occurred_at, brand_id, category_id, expense_entry_id, note, wallet_id)
        VALUES ('other_out', NEW.amount, occ, NEW.brand_id, NEW.category_id, NEW.id, COALESCE(NEW.note, 'مصروف'), NEW.wallet_id)
        RETURNING id INTO new_cash_id;
      ELSE
        UPDATE public.cash_transactions
        SET amount = NEW.amount,
            occurred_at = occ,
            brand_id = NEW.brand_id,
            category_id = NEW.category_id,
            note = COALESCE(NEW.note, 'مصروف'),
            wallet_id = COALESCE(NEW.wallet_id, wallet_id)
        WHERE id = new_cash_id;
      END IF;

      UPDATE public.expense_entries
      SET cash_transaction_id = new_cash_id
      WHERE id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END
$$;
