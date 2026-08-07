
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sales_invoice_stage') THEN
    CREATE TYPE public.sales_invoice_stage AS ENUM ('new','processing','packing','ready_to_ship','with_courier','delivered','cancelled');
  END IF;
END $$;

ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS stage public.sales_invoice_stage NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS stage_updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS sales_invoices_stage_idx ON public.sales_invoices(stage);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS lead_time_days integer NOT NULL DEFAULT 7;

CREATE OR REPLACE FUNCTION public.touch_sales_invoice_stage()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_updated_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sales_invoices_stage_touch ON public.sales_invoices;
CREATE TRIGGER sales_invoices_stage_touch
  BEFORE UPDATE ON public.sales_invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_sales_invoice_stage();
