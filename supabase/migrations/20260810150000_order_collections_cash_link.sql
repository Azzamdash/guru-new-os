-- order_collections (what each order collected) and cash_transactions (what
-- actually reached the treasury) have always been two disconnected ledgers:
-- there is no trigger between them and no column tying one to the other. So
-- posting a courier statement recorded collections the treasury never saw,
-- and recording treasury cash never said which orders it covered.
--
-- Link them. A clearing batch — one courier transfer covering many orders —
-- writes a single cash_transactions row and stamps its id on every collection
-- it paid for. That makes the reverse direction possible too: un-marking one
-- order can reduce its batch's cash movement by exactly that amount instead
-- of silently desyncing the two ledgers.
--
-- Nullable on purpose: collections recorded before this (via the CSV
-- settlement import or recordCollection) keep a NULL link and are left alone.
-- ON DELETE SET NULL so voiding a treasury movement never cascades into
-- deleting the collection history behind it.
ALTER TABLE public.order_collections
  ADD COLUMN IF NOT EXISTS cash_transaction_id uuid;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_collections
    ADD CONSTRAINT order_collections_cash_transaction_id_fkey
    FOREIGN KEY (cash_transaction_id) REFERENCES public.cash_transactions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

CREATE INDEX IF NOT EXISTS order_collections_cash_transaction_id_idx
    ON public.order_collections USING btree (cash_transaction_id);
