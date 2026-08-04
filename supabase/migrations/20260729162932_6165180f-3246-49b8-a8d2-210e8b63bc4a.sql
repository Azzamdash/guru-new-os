-- 1) Wallets
CREATE TABLE IF NOT EXISTS public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'cash' CHECK (kind IN ('cash','bank','ewallet')),
  opening_balance numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallets_read ON public.wallets;
CREATE POLICY wallets_read ON public.wallets FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS wallets_write ON public.wallets;
CREATE POLICY wallets_write ON public.wallets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'accountant'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'accountant'));

CREATE TRIGGER wallets_updated_at BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default wallet
INSERT INTO public.wallets (name, kind, opening_balance, sort_order)
VALUES ('الخزنة الرئيسية', 'cash', 0, 0);

-- 2) cash_transactions: wallet + transfer group
ALTER TABLE public.cash_transactions
  ADD COLUMN wallet_id uuid REFERENCES public.wallets(id) ON DELETE RESTRICT,
  ADD COLUMN transfer_group uuid;

-- Backfill existing txns to default wallet
UPDATE public.cash_transactions
   SET wallet_id = (SELECT id FROM public.wallets ORDER BY sort_order LIMIT 1)
 WHERE wallet_id IS NULL;

CREATE INDEX IF NOT EXISTS cash_transactions_wallet_id_idx ON public.cash_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS cash_transactions_transfer_group_idx ON public.cash_transactions(transfer_group);

-- 3) supplier_payments: allow standalone payments
ALTER TABLE public.supplier_payments
  ALTER COLUMN invoice_id DROP NOT NULL,
  ADD COLUMN supplier_id uuid REFERENCES public.suppliers(id) ON DELETE RESTRICT;

-- Backfill supplier_id from linked invoices
UPDATE public.supplier_payments sp
   SET supplier_id = si.supplier_id
  FROM public.supplier_invoices si
 WHERE sp.invoice_id = si.id AND sp.supplier_id IS NULL;

ALTER TABLE public.supplier_payments
  ADD CONSTRAINT supplier_payments_supplier_or_invoice_ck
  CHECK (supplier_id IS NOT NULL OR invoice_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS supplier_payments_supplier_id_idx ON public.supplier_payments(supplier_id);

-- 4) Rewrite sync_supplier_payment to handle standalone payments
CREATE OR REPLACE FUNCTION public.sync_supplier_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_cash_id uuid;
  b_id uuid;
  s_name text;
  cat_id uuid;
  built_note text;
  sup_id uuid;
BEGIN
  SELECT id INTO cat_id FROM public.expense_categories WHERE slug = 'supplier_payments' LIMIT 1;

  IF NEW.invoice_id IS NOT NULL THEN
    SELECT si.brand_id, sup.name, si.supplier_id
      INTO b_id, s_name, sup_id
      FROM public.supplier_invoices si
      LEFT JOIN public.suppliers sup ON sup.id = si.supplier_id
      WHERE si.id = NEW.invoice_id;
  ELSE
    sup_id := NEW.supplier_id;
    SELECT sup.brand_id, sup.name INTO b_id, s_name FROM public.suppliers sup WHERE sup.id = sup_id;
  END IF;

  -- Keep supplier_id in sync
  IF NEW.supplier_id IS NULL AND sup_id IS NOT NULL THEN
    NEW.supplier_id := sup_id;
  END IF;

  built_note := 'دفعة مورد: ' || COALESCE(s_name,'') ||
                CASE WHEN NEW.note IS NOT NULL AND NEW.note <> '' THEN ' - ' || NEW.note ELSE '' END;

  IF TG_OP = 'INSERT' THEN
    IF NEW.cash_transaction_id IS NULL AND COALESCE(NEW.amount,0) > 0 THEN
      INSERT INTO public.cash_transactions(type, amount, occurred_at, brand_id, category_id, note, wallet_id)
      VALUES ('other_out', NEW.amount, NEW.paid_at, b_id, cat_id, built_note,
              (SELECT id FROM public.wallets WHERE active = true ORDER BY sort_order LIMIT 1))
      RETURNING id INTO new_cash_id;
      UPDATE public.supplier_payments SET cash_transaction_id = new_cash_id, supplier_id = sup_id WHERE id = NEW.id;
    END IF;
    IF NEW.invoice_id IS NOT NULL THEN
      PERFORM public.recompute_supplier_invoice_status(NEW.invoice_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.cash_transaction_id IS NOT NULL THEN
      UPDATE public.cash_transactions
        SET amount = NEW.amount,
            occurred_at = NEW.paid_at,
            brand_id = b_id,
            category_id = COALESCE(category_id, cat_id),
            note = built_note
        WHERE id = NEW.cash_transaction_id;
    END IF;
    IF NEW.invoice_id IS NOT NULL THEN
      PERFORM public.recompute_supplier_invoice_status(NEW.invoice_id);
    END IF;
    IF OLD.invoice_id IS NOT NULL AND OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
      PERFORM public.recompute_supplier_invoice_status(OLD.invoice_id);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END $function$;

REVOKE EXECUTE ON FUNCTION public.sync_supplier_payment() FROM PUBLIC, anon, authenticated;

-- 5) Also patch auto_pay_supplier_invoice to still work (unchanged behavior)
-- No change needed; it inserts a supplier_payment with invoice_id and the new trigger handles it.
