
CREATE TABLE IF NOT EXISTS public.financial_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID,
  operation TEXT NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  actor_id UUID,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.financial_audit_log TO authenticated;
GRANT ALL ON public.financial_audit_log TO service_role;

ALTER TABLE public.financial_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and managers can view audit log" ON public.financial_audit_log;
CREATE POLICY "Admins and managers can view audit log"
  ON public.financial_audit_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE INDEX IF NOT EXISTS idx_fin_audit_table_record ON public.financial_audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_fin_audit_created_at ON public.financial_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_audit_actor ON public.financial_audit_log(actor_id);

CREATE OR REPLACE FUNCTION public.log_financial_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    rec_id := (to_jsonb(OLD)->>'id')::uuid;
    INSERT INTO public.financial_audit_log(table_name, record_id, operation, actor_id, old_data, new_data)
    VALUES (TG_TABLE_NAME, rec_id, 'DELETE', auth.uid(), to_jsonb(OLD), NULL);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    rec_id := (to_jsonb(NEW)->>'id')::uuid;
    INSERT INTO public.financial_audit_log(table_name, record_id, operation, actor_id, old_data, new_data)
    VALUES (TG_TABLE_NAME, rec_id, 'UPDATE', auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSE
    rec_id := (to_jsonb(NEW)->>'id')::uuid;
    INSERT INTO public.financial_audit_log(table_name, record_id, operation, actor_id, old_data, new_data)
    VALUES (TG_TABLE_NAME, rec_id, 'INSERT', auth.uid(), NULL, to_jsonb(NEW));
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS audit_expense_entries ON public.expense_entries;
CREATE TRIGGER audit_expense_entries
  AFTER INSERT OR UPDATE OR DELETE ON public.expense_entries
  FOR EACH ROW EXECUTE FUNCTION public.log_financial_change();

DROP TRIGGER IF EXISTS audit_sales_invoices ON public.sales_invoices;
CREATE TRIGGER audit_sales_invoices
  AFTER INSERT OR UPDATE OR DELETE ON public.sales_invoices
  FOR EACH ROW EXECUTE FUNCTION public.log_financial_change();

DROP TRIGGER IF EXISTS audit_cash_transactions ON public.cash_transactions;
CREATE TRIGGER audit_cash_transactions
  AFTER INSERT OR UPDATE OR DELETE ON public.cash_transactions
  FOR EACH ROW EXECUTE FUNCTION public.log_financial_change();

DROP TRIGGER IF EXISTS audit_supplier_invoices ON public.supplier_invoices;
CREATE TRIGGER audit_supplier_invoices
  AFTER INSERT OR UPDATE OR DELETE ON public.supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION public.log_financial_change();

DROP TRIGGER IF EXISTS audit_supplier_payments ON public.supplier_payments;
CREATE TRIGGER audit_supplier_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.log_financial_change();

DROP TRIGGER IF EXISTS audit_orders ON public.orders;
CREATE TRIGGER audit_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_financial_change();
