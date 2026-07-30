CREATE OR REPLACE FUNCTION public.cash_txn_default_wallet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.wallet_id IS NULL THEN
    SELECT id INTO NEW.wallet_id FROM public.wallets WHERE active = true ORDER BY sort_order, created_at LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cash_txn_default_wallet ON public.cash_transactions;
CREATE TRIGGER trg_cash_txn_default_wallet
BEFORE INSERT OR UPDATE ON public.cash_transactions
FOR EACH ROW EXECUTE FUNCTION public.cash_txn_default_wallet();