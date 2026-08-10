-- A courier fee can now be closed out two different ways, and reversing a
-- clearing batch has to tell them apart:
--   1. paid separately  — settleCourierCharges books a cash movement OUT.
--   2. deducted at source — the courier keeps the fee out of the COD and
--      transfers the remainder, so the clearing batch books one NET receipt
--      and no separate outflow ever exists.
--
-- settled_at alone cannot distinguish those, which matters when un-marking an
-- order: a fee deducted inside a batch has to be re-opened and added back to
-- that batch's net figure, while a fee paid separately must be left alone.
-- Record which cash movement did the settling so the reversal is exact
-- instead of guessed.
--
-- Nullable: charges settled before this, and any settled by a path that books
-- no cash at all (a zero-value close-out), simply carry NULL.
-- ON DELETE SET NULL so voiding a treasury movement never deletes fee history.
ALTER TABLE public.courier_charges
  ADD COLUMN IF NOT EXISTS settled_cash_transaction_id uuid;

DO $mig$ BEGIN
ALTER TABLE ONLY public.courier_charges
    ADD CONSTRAINT courier_charges_settled_cash_transaction_id_fkey
    FOREIGN KEY (settled_cash_transaction_id) REFERENCES public.cash_transactions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

CREATE INDEX IF NOT EXISTS courier_charges_settled_cash_transaction_id_idx
    ON public.courier_charges USING btree (settled_cash_transaction_id);

-- Column-level, matching the settled_at grant from 20260810130000: settling
-- may stamp who paid it, never rewrite the amount owed.
GRANT UPDATE(settled_cash_transaction_id) ON TABLE public.courier_charges TO authenticated;
