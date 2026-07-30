
-- 1. Add prep assignee column to sales_invoices
ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS prep_assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sales_invoices_prep_assignee_idx
  ON public.sales_invoices(prep_assignee_id);

-- 2. Prep can SELECT invoices assigned to them (in addition to existing brand-access policy)
DROP POLICY IF EXISTS "prep read assigned invoices" ON public.sales_invoices;
CREATE POLICY "prep read assigned invoices"
  ON public.sales_invoices FOR SELECT
  TO authenticated
  USING (prep_assignee_id = auth.uid());

-- 3. Prep can UPDATE invoices assigned to them (trigger below restricts to stage only)
DROP POLICY IF EXISTS "prep update assigned invoices" ON public.sales_invoices;
CREATE POLICY "prep update assigned invoices"
  ON public.sales_invoices FOR UPDATE
  TO authenticated
  USING (prep_assignee_id = auth.uid() AND public.has_role(auth.uid(), 'order_prep'::app_role))
  WITH CHECK (prep_assignee_id = auth.uid());

-- 4. Trigger: order_prep users may only advance stage; other fields locked
CREATE OR REPLACE FUNCTION public.sales_invoices_prep_field_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Privileged roles bypass the lock
  IF public.has_role(auth.uid(),'admin')
     OR public.has_role(auth.uid(),'manager')
     OR public.has_role(auth.uid(),'data_entry')
     OR public.has_role(auth.uid(),'accountant') THEN
    RETURN NEW;
  END IF;
  -- Enforce for order_prep (only path where they can UPDATE at all)
  IF public.has_role(auth.uid(),'order_prep') THEN
    IF NEW.brand_id IS DISTINCT FROM OLD.brand_id
       OR NEW.courier_id IS DISTINCT FROM OLD.courier_id
       OR NEW.product_id IS DISTINCT FROM OLD.product_id
       OR NEW.type IS DISTINCT FROM OLD.type
       OR NEW.qty IS DISTINCT FROM OLD.qty
       OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
       OR NEW.collected_amount IS DISTINCT FROM OLD.collected_amount
       OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
       OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
       OR NEW.customer_phone IS DISTINCT FROM OLD.customer_phone
       OR NEW.customer_email IS DISTINCT FROM OLD.customer_email
       OR NEW.prep_assignee_id IS DISTINCT FROM OLD.prep_assignee_id THEN
      RAISE EXCEPTION 'Order prep may only advance stage';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_invoices_prep_field_lock ON public.sales_invoices;
CREATE TRIGGER trg_sales_invoices_prep_field_lock
BEFORE UPDATE ON public.sales_invoices
FOR EACH ROW EXECUTE FUNCTION public.sales_invoices_prep_field_lock();
