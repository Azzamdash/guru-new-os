
DO $$ BEGIN
  CREATE TYPE public.cash_txn_type AS ENUM ('collection','personal_withdrawal','deposit','other_out');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.cash_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.cash_txn_type NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  occurred_at date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  courier_id uuid REFERENCES public.couriers(id) ON DELETE SET NULL,
  for_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_txn_date ON public.cash_transactions (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_txn_type ON public.cash_transactions (type);
CREATE INDEX IF NOT EXISTS idx_cash_txn_courier ON public.cash_transactions (courier_id);
CREATE INDEX IF NOT EXISTS idx_cash_txn_brand ON public.cash_transactions (brand_id);
CREATE INDEX IF NOT EXISTS idx_cash_txn_for_user ON public.cash_transactions (for_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_transactions TO authenticated;
GRANT ALL ON public.cash_transactions TO service_role;

ALTER TABLE public.cash_transactions ENABLE ROW LEVEL SECURITY;

-- Read: admins/managers see all; others need brand access when brand_id set, or be the creator/for_user
DROP POLICY IF EXISTS "cash_txn_read" ON public.cash_transactions;
CREATE POLICY "cash_txn_read"
ON public.cash_transactions FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'manager')
  OR public.has_role(auth.uid(),'accountant')
  OR (brand_id IS NOT NULL AND public.has_brand_access(auth.uid(), brand_id))
  OR created_by = auth.uid()
  OR for_user_id = auth.uid()
);

-- Write: writers only; when brand_id present, must have brand access (admin/manager bypass via has_brand_access)
DROP POLICY IF EXISTS "cash_txn_write_insert" ON public.cash_transactions;
CREATE POLICY "cash_txn_write_insert"
ON public.cash_transactions FOR INSERT
TO authenticated
WITH CHECK (
  public.is_writer(auth.uid())
  AND (brand_id IS NULL OR public.has_brand_access(auth.uid(), brand_id))
);

DROP POLICY IF EXISTS "cash_txn_write_update" ON public.cash_transactions;
CREATE POLICY "cash_txn_write_update"
ON public.cash_transactions FOR UPDATE
TO authenticated
USING (
  public.is_writer(auth.uid())
  AND (brand_id IS NULL OR public.has_brand_access(auth.uid(), brand_id))
)
WITH CHECK (
  public.is_writer(auth.uid())
  AND (brand_id IS NULL OR public.has_brand_access(auth.uid(), brand_id))
);

DROP POLICY IF EXISTS "cash_txn_write_delete" ON public.cash_transactions;
CREATE POLICY "cash_txn_write_delete"
ON public.cash_transactions FOR DELETE
TO authenticated
USING (
  public.is_writer(auth.uid())
  AND (brand_id IS NULL OR public.has_brand_access(auth.uid(), brand_id))
);

DROP TRIGGER IF EXISTS trg_cash_txn_updated_at ON public.cash_transactions;
CREATE TRIGGER trg_cash_txn_updated_at
BEFORE UPDATE ON public.cash_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
