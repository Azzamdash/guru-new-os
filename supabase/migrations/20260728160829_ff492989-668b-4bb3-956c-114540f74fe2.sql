ALTER TABLE public.expense_entries DROP CONSTRAINT IF EXISTS expense_entries_cash_transaction_id_fkey;
ALTER TABLE public.expense_entries
  ADD CONSTRAINT expense_entries_cash_transaction_id_fkey
  FOREIGN KEY (cash_transaction_id) REFERENCES public.cash_transactions(id)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.cash_transactions DROP CONSTRAINT IF EXISTS cash_transactions_expense_entry_id_fkey;
ALTER TABLE public.cash_transactions
  ADD CONSTRAINT cash_transactions_expense_entry_id_fkey
  FOREIGN KEY (expense_entry_id) REFERENCES public.expense_entries(id)
  DEFERRABLE INITIALLY DEFERRED;