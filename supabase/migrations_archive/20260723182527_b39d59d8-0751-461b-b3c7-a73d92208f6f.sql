
-- 1) Enum additions (must be committed before use → done in this migration; policies below use ::text to avoid same-tx enum literal cast)
ALTER TYPE public.brand_type ADD VALUE IF NOT EXISTS 'offline_branch';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales_man';

-- 2) New columns on sales_invoices
ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS sold_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS cash_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_amount numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS sales_invoices_sold_by_idx ON public.sales_invoices(sold_by);

-- 3) Elevate customer linker so walk-in customers can be created by POS role
ALTER FUNCTION public.link_sales_invoice_customer() SECURITY DEFINER;

-- 4) POS auto-deduct trigger: any sale from an offline_branch brand pushes an inventory 'sale' movement
CREATE OR REPLACE FUNCTION public.offline_branch_deduct_inventory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_offline boolean;
BEGIN
  IF NEW.product_id IS NULL OR NEW.qty IS NULL OR NEW.qty <= 0 THEN
    RETURN NEW;
  END IF;
  SELECT (b.type::text = 'offline_branch') INTO is_offline
  FROM public.sales_invoices si
  JOIN public.brands b ON b.id = si.brand_id
  WHERE si.id = NEW.invoice_id;
  IF COALESCE(is_offline, false) THEN
    INSERT INTO public.inventory_movements(product_id, type, qty, note)
      VALUES (NEW.product_id, 'sale', NEW.qty, 'POS sale');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_offline_branch_deduct ON public.sales_invoice_items;
CREATE TRIGGER trg_offline_branch_deduct
  AFTER INSERT ON public.sales_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.offline_branch_deduct_inventory();

-- 5) Salesman policies on sales_invoices
DROP POLICY IF EXISTS "sales_man insert offline invoices" ON public.sales_invoices;
CREATE POLICY "sales_man insert offline invoices"
  ON public.sales_invoices FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'sales_man')
    AND public.has_brand_access(auth.uid(), brand_id)
    AND EXISTS (SELECT 1 FROM public.brands b WHERE b.id = brand_id AND b.type::text = 'offline_branch')
    AND sold_by = auth.uid()
  );

DROP POLICY IF EXISTS "sales_man read own invoices" ON public.sales_invoices;
CREATE POLICY "sales_man read own invoices"
  ON public.sales_invoices FOR SELECT
  TO authenticated
  USING (
    sold_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'sales_man')
  );

-- 6) Salesman policies on sales_invoice_items
DROP POLICY IF EXISTS "sales_man insert offline invoice items" ON public.sales_invoice_items;
CREATE POLICY "sales_man insert offline invoice items"
  ON public.sales_invoice_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'sales_man')
    AND EXISTS (
      SELECT 1 FROM public.sales_invoices si
      JOIN public.brands b ON b.id = si.brand_id
      WHERE si.id = invoice_id
        AND si.sold_by = auth.uid()
        AND b.type::text = 'offline_branch'
    )
  );

DROP POLICY IF EXISTS "sales_man read own invoice items" ON public.sales_invoice_items;
CREATE POLICY "sales_man read own invoice items"
  ON public.sales_invoice_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sales_invoices si
      WHERE si.id = invoice_id AND si.sold_by = auth.uid()
    )
  );

-- 7) Salesman can read products of their branches (has_brand_access already permits, no change needed)
--    but they must also read brands and their access rows — already permitted by existing "read brands".
