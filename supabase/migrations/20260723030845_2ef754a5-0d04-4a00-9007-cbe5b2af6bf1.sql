CREATE TABLE IF NOT EXISTS public.company_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NULL REFERENCES public.brands(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  annual_depreciation_rate NUMERIC(6,2) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_assets TO authenticated;
GRANT ALL ON public.company_assets TO service_role;
ALTER TABLE public.company_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assets_read_scoped" ON public.company_assets;
CREATE POLICY "assets_read_scoped" ON public.company_assets FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR (brand_id IS NOT NULL AND public.has_brand_access(auth.uid(), brand_id)));

DROP POLICY IF EXISTS "assets_write_admin_manager_accountant" ON public.company_assets;
CREATE POLICY "assets_write_admin_manager_accountant" ON public.company_assets FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'accountant'));

DROP POLICY IF EXISTS "assets_update_admin_manager_accountant" ON public.company_assets;
CREATE POLICY "assets_update_admin_manager_accountant" ON public.company_assets FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'accountant'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'accountant'));

DROP POLICY IF EXISTS "assets_delete_admin_manager" ON public.company_assets;
CREATE POLICY "assets_delete_admin_manager" ON public.company_assets FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

DROP TRIGGER IF EXISTS update_company_assets_updated_at ON public.company_assets;
CREATE TRIGGER update_company_assets_updated_at BEFORE UPDATE ON public.company_assets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_company_assets_brand ON public.company_assets(brand_id);

DROP POLICY IF EXISTS "read fulfillment" ON public.fulfillment_entries;
CREATE POLICY "read fulfillment" ON public.fulfillment_entries FOR SELECT
USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_section_access(auth.uid(), 'couriers'::text) OR has_section_access(auth.uid(), 'reports_production'::text)) AND has_brand_access(auth.uid(), brand_id));

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

DROP POLICY IF EXISTS "cash_txn_read" ON public.cash_transactions;
CREATE POLICY "cash_txn_read" ON public.cash_transactions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'accountant') OR (brand_id IS NOT NULL AND public.has_brand_access(auth.uid(), brand_id)) OR created_by = auth.uid() OR for_user_id = auth.uid());

DROP POLICY IF EXISTS "cash_txn_write_insert" ON public.cash_transactions;
CREATE POLICY "cash_txn_write_insert" ON public.cash_transactions FOR INSERT TO authenticated
WITH CHECK (public.is_writer(auth.uid()) AND (brand_id IS NULL OR public.has_brand_access(auth.uid(), brand_id)));

DROP POLICY IF EXISTS "cash_txn_write_update" ON public.cash_transactions;
CREATE POLICY "cash_txn_write_update" ON public.cash_transactions FOR UPDATE TO authenticated
USING (public.is_writer(auth.uid()) AND (brand_id IS NULL OR public.has_brand_access(auth.uid(), brand_id)))
WITH CHECK (public.is_writer(auth.uid()) AND (brand_id IS NULL OR public.has_brand_access(auth.uid(), brand_id)));

DROP POLICY IF EXISTS "cash_txn_write_delete" ON public.cash_transactions;
CREATE POLICY "cash_txn_write_delete" ON public.cash_transactions FOR DELETE TO authenticated
USING (public.is_writer(auth.uid()) AND (brand_id IS NULL OR public.has_brand_access(auth.uid(), brand_id)));

DROP TRIGGER IF EXISTS trg_cash_txn_updated_at ON public.cash_transactions;
CREATE TRIGGER trg_cash_txn_updated_at BEFORE UPDATE ON public.cash_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "employees write writer" ON public.employees;
CREATE POLICY "employees write writer" ON public.employees FOR ALL TO authenticated
USING (is_writer(auth.uid()) AND has_brand_access(auth.uid(), brand_id))
WITH CHECK (is_writer(auth.uid()) AND has_brand_access(auth.uid(), brand_id));

DROP POLICY IF EXISTS "attendance write writer" ON public.employee_attendance_entries;
CREATE POLICY "attendance write writer" ON public.employee_attendance_entries FOR ALL TO authenticated
USING (is_writer(auth.uid()) AND EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_attendance_entries.employee_id AND has_brand_access(auth.uid(), e.brand_id)))
WITH CHECK (is_writer(auth.uid()) AND EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_attendance_entries.employee_id AND has_brand_access(auth.uid(), e.brand_id)));

DROP POLICY IF EXISTS "write fulfillment" ON public.fulfillment_entries;
CREATE POLICY "write fulfillment" ON public.fulfillment_entries FOR ALL TO authenticated
USING (is_writer(auth.uid()) AND has_brand_access(auth.uid(), brand_id))
WITH CHECK (is_writer(auth.uid()) AND has_brand_access(auth.uid(), brand_id));

DROP POLICY IF EXISTS "auth write sales_invoice_items" ON public.sales_invoice_items;
CREATE POLICY "auth write sales_invoice_items" ON public.sales_invoice_items FOR ALL TO authenticated
USING (is_writer(auth.uid()) AND EXISTS (SELECT 1 FROM public.sales_invoices si WHERE si.id = sales_invoice_items.invoice_id AND has_brand_access(auth.uid(), si.brand_id)))
WITH CHECK (is_writer(auth.uid()) AND EXISTS (SELECT 1 FROM public.sales_invoices si WHERE si.id = sales_invoice_items.invoice_id AND has_brand_access(auth.uid(), si.brand_id)));

DROP POLICY IF EXISTS "invoice items write for writers" ON public.supplier_invoice_items;
CREATE POLICY "invoice items write for writers" ON public.supplier_invoice_items FOR ALL TO authenticated
USING (is_writer(auth.uid()) AND EXISTS (SELECT 1 FROM public.supplier_invoices si WHERE si.id = supplier_invoice_items.invoice_id AND (si.brand_id IS NULL OR has_brand_access(auth.uid(), si.brand_id))))
WITH CHECK (is_writer(auth.uid()) AND EXISTS (SELECT 1 FROM public.supplier_invoices si WHERE si.id = supplier_invoice_items.invoice_id AND (si.brand_id IS NULL OR has_brand_access(auth.uid(), si.brand_id))));

DROP POLICY IF EXISTS "sp write privileged" ON public.supplier_payments;
CREATE POLICY "sp write privileged" ON public.supplier_payments FOR ALL TO authenticated
USING (is_writer(auth.uid()) AND EXISTS (SELECT 1 FROM public.supplier_invoices si WHERE si.id = supplier_payments.invoice_id AND (si.brand_id IS NULL OR has_brand_access(auth.uid(), si.brand_id))))
WITH CHECK (is_writer(auth.uid()) AND EXISTS (SELECT 1 FROM public.supplier_invoices si WHERE si.id = supplier_payments.invoice_id AND (si.brand_id IS NULL OR has_brand_access(auth.uid(), si.brand_id))));

DROP POLICY IF EXISTS "auth read articles" ON public.articles;
CREATE POLICY "auth read articles" ON public.articles FOR SELECT TO authenticated
USING (published = true OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_section_access(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_brand_access(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_writer(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_investor_of_brand(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_section_access(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_brand_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_writer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_investor_of_brand(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_brand_access(_user_id uuid, _brand_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(_user_id,'admin')
    OR public.has_role(_user_id,'manager')
    OR public.has_role(_user_id,'accountant')
    OR EXISTS (SELECT 1 FROM public.user_brand_access WHERE user_id = _user_id AND brand_id = _brand_id);
$function$;