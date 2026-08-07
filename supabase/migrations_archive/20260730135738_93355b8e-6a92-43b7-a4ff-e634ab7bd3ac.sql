-- 1) remove the redundant duplicate trigger
DROP TRIGGER IF EXISTS trg_sync_expense_to_cash ON public.expense_entries;

-- 2) pick the keeper txn per expense and re-point the expense to it
WITH ranked AS (
  SELECT ct.id, ct.expense_entry_id,
         ROW_NUMBER() OVER (
           PARTITION BY ct.expense_entry_id
           ORDER BY (ee.cash_transaction_id = ct.id) DESC NULLS LAST, ct.created_at ASC
         ) AS rn
  FROM public.cash_transactions ct
  JOIN public.expense_entries ee ON ee.id = ct.expense_entry_id
  WHERE ct.expense_entry_id IS NOT NULL
)
UPDATE public.expense_entries ee
SET cash_transaction_id = r.id
FROM ranked r
WHERE r.rn = 1 AND r.expense_entry_id = ee.id
  AND ee.cash_transaction_id IS DISTINCT FROM r.id;

-- 3) unlink the duplicates so the delete-sync trigger can't cascade to the expense
WITH ranked AS (
  SELECT ct.id,
         ROW_NUMBER() OVER (
           PARTITION BY ct.expense_entry_id
           ORDER BY (ee.cash_transaction_id = ct.id) DESC NULLS LAST, ct.created_at ASC
         ) AS rn
  FROM public.cash_transactions ct
  JOIN public.expense_entries ee ON ee.id = ct.expense_entry_id
  WHERE ct.expense_entry_id IS NOT NULL
)
UPDATE public.cash_transactions c
SET expense_entry_id = NULL, note = COALESCE(c.note, '') || ' [duplicate removed]'
FROM ranked r
WHERE c.id = r.id AND r.rn > 1;

-- 4) delete the now-orphaned duplicates
DELETE FROM public.cash_transactions
WHERE expense_entry_id IS NULL
  AND note LIKE '%[duplicate removed]';

-- 5) hard guard against future duplicates
SET CONSTRAINTS ALL IMMEDIATE;

CREATE UNIQUE INDEX IF NOT EXISTS cash_transactions_expense_entry_uidx
  ON public.cash_transactions (expense_entry_id)
  WHERE expense_entry_id IS NOT NULL;