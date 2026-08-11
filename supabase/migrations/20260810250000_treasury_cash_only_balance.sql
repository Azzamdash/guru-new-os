-- Two changes, both so the treasury means one thing: money that actually moved.
--
-- 1. Accrued expenses stop reducing the cash balance.
--
-- balance subtracted every expense_entry with no cash_transaction_id, and
-- periodOut added the same for the period. Those are expenses recorded but not
-- yet paid out of any wallet -- a liability, not a cash movement. Subtracting
-- them mixed the two, and guaranteed the headline could never agree with the
-- wallet cards, since no wallet can hold a payment that never happened.
--
-- balance and periodOut are now cash only, so they reconcile with the wallets.
-- The figures are not dropped: unpaidExpenses and periodUnpaidExpenses carry
-- them out separately, to be shown as what they are.
--
-- 2. A cash movement always lands in a wallet.
--
-- wallet_id is nullable, and upsertCashTransaction's fallback to the first
-- active wallet only covers that one path. Anything written by another path --
-- or before any wallet existed -- had none, and a movement with no wallet is
-- real money that moves the headline while appearing in no wallet card.
--
-- Default it in the database instead, where every path passes. Nulls are still
-- accepted rather than forbidden: a project with no wallets yet must still be
-- able to record cash, and NOT NULL would also demand this migration invent a
-- wallet for historical rows. Assigning those is a decision for whoever knows
-- where that money actually sat, so it is offered in the UI instead.
--
-- SECURITY DEFINER because wallets is under RLS and the lookup must not depend
-- on the writer being able to read it; it returns only an id.
CREATE OR REPLACE FUNCTION public.cash_summary_report(_from date DEFAULT NULL::date, _to date DEFAULT NULL::date, _for_user_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  WITH all_cash AS (
    SELECT COALESCE(sum(CASE WHEN type IN ('collection','deposit') THEN amount ELSE -amount END), 0)::numeric AS balance
    FROM public.cash_daily_metrics
    WHERE brand_key = '00000000-0000-0000-0000-000000000000'::uuid
      OR public.has_brand_access(auth.uid(), brand_key)
  ), wallet_opening AS (
    SELECT COALESCE(sum(opening_balance), 0)::numeric AS amount FROM public.wallets
  ), unlinked_all AS (
    SELECT COALESCE(sum(amount), 0)::numeric AS amount
    FROM public.expense_entries
    WHERE cash_transaction_id IS NULL
      AND (brand_id IS NULL OR public.has_brand_access(auth.uid(), brand_id))
  ), period_cash AS MATERIALIZED (
    SELECT * FROM public.cash_daily_metrics m
    WHERE (_from IS NULL OR m.day >= _from)
      AND (_to IS NULL OR m.day <= _to)
      AND (m.brand_key = '00000000-0000-0000-0000-000000000000'::uuid
        OR public.has_brand_access(auth.uid(), m.brand_key))
  ), period_cash_totals AS (
    SELECT
      COALESCE(sum(amount) FILTER (WHERE type IN ('collection','deposit')), 0)::numeric AS period_in,
      COALESCE(sum(amount) FILTER (WHERE type NOT IN ('collection','deposit')), 0)::numeric AS cash_out,
      COALESCE(sum(amount) FILTER (
        WHERE type = 'personal_withdrawal'
          AND (_for_user_id IS NULL OR user_key = _for_user_id)
      ), 0)::numeric AS personal_total
    FROM period_cash
  ), extra_period_expenses AS (
    SELECT COALESCE(sum(e.amount), 0)::numeric AS amount
    FROM public.expense_entries e
    WHERE (_from IS NULL OR e.effective_to >= _from)
      AND (_to IS NULL OR e.effective_from <= _to)
      AND (e.brand_id IS NULL OR public.has_brand_access(auth.uid(), e.brand_id))
      AND NOT EXISTS (
        SELECT 1 FROM public.cash_transactions ct
        WHERE ct.expense_entry_id = e.id
          AND (_from IS NULL OR ct.occurred_at >= _from::timestamptz)
          AND (_to IS NULL OR ct.occurred_at < (_to + 1)::timestamptz)
      )
  ), withdrawals_by_user AS (
    SELECT user_key AS "userId", sum(amount)::numeric AS total
    FROM period_cash
    WHERE type = 'personal_withdrawal'
      AND user_key <> '00000000-0000-0000-0000-000000000000'::uuid
    GROUP BY user_key
  ), courier_totals AS (
    SELECT courier_id, sum(owed)::numeric AS total_owed, sum(collected)::numeric AS total_collected
    FROM public.courier_financial_metrics
    WHERE public.courier_accessible_to_user(auth.uid(), courier_id)
    GROUP BY courier_id
  ), courier_debts AS (
    SELECT c.id, c.name, c.type, c.brand_id, c.active,
      COALESCE(cm.total_owed, 0)::numeric AS "totalOwed",
      COALESCE(cm.total_collected, 0)::numeric AS "totalCollected",
      (COALESCE(cm.total_owed, 0) - COALESCE(cm.total_collected, 0))::numeric AS remaining
    FROM public.couriers c LEFT JOIN courier_totals cm ON cm.courier_id = c.id
    WHERE public.courier_accessible_to_user(auth.uid(), c.id)
  )
  SELECT jsonb_build_object(
    'balance', (SELECT balance FROM all_cash) + (SELECT amount FROM wallet_opening),
    'unpaidExpenses', (SELECT amount FROM unlinked_all),
    'periodIn', (SELECT period_in FROM period_cash_totals),
    'periodOut', (SELECT cash_out FROM period_cash_totals),
    'periodNet', (SELECT period_in - cash_out FROM period_cash_totals),
    'periodUnpaidExpenses', (SELECT amount FROM extra_period_expenses),
    'personalTotal', (SELECT personal_total FROM period_cash_totals),
    'byUser', COALESCE((SELECT jsonb_agg(to_jsonb(withdrawals_by_user) ORDER BY total DESC, "userId") FROM withdrawals_by_user), '[]'::jsonb),
    'courierDebts', COALESCE((SELECT jsonb_agg(to_jsonb(courier_debts) ORDER BY remaining DESC, id) FROM courier_debts), '[]'::jsonb)
  )
  WHERE public.can_read_page(auth.uid(), '/treasury');
$$;

CREATE OR REPLACE FUNCTION public.default_cash_transaction_wallet() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $fn$
BEGIN
  IF NEW.wallet_id IS NULL THEN
    SELECT w.id INTO NEW.wallet_id
    FROM public.wallets w
    WHERE w.active
    ORDER BY w.sort_order, w.name
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS cash_transactions_default_wallet ON public.cash_transactions;

CREATE TRIGGER cash_transactions_default_wallet
    BEFORE INSERT OR UPDATE OF wallet_id ON public.cash_transactions
    FOR EACH ROW EXECUTE FUNCTION public.default_cash_transaction_wallet();
