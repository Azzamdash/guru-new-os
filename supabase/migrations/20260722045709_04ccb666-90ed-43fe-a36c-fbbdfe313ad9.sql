
-- 2) monthly_entries: period_type + period_date
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='monthly_entries' AND column_name='period_type') THEN
    ALTER TABLE public.monthly_entries ADD COLUMN period_type text NOT NULL DEFAULT 'monthly';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='monthly_entries' AND column_name='period_date') THEN
    ALTER TABLE public.monthly_entries ADD COLUMN period_date date;
  END IF;
END $$;

-- 3) materials + products: unit
ALTER TABLE public.materials ALTER COLUMN unit SET DEFAULT 'piece';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='unit') THEN
    ALTER TABLE public.products ADD COLUMN unit text NOT NULL DEFAULT 'piece';
  END IF;
END $$;

-- 4) sales_invoice_items
CREATE TABLE IF NOT EXISTS public.sales_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.sales_invoices(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  qty numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_invoice_items TO authenticated;
GRANT ALL ON public.sales_invoice_items TO service_role;
ALTER TABLE public.sales_invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read sales_invoice_items" ON public.sales_invoice_items;
CREATE POLICY "auth read sales_invoice_items" ON public.sales_invoice_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth write sales_invoice_items" ON public.sales_invoice_items;
CREATE POLICY "auth write sales_invoice_items" ON public.sales_invoice_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'data_entry'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'data_entry'));

CREATE INDEX IF NOT EXISTS idx_sales_items_invoice ON public.sales_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_items_product ON public.sales_invoice_items(product_id);

-- 5) articles
CREATE TABLE IF NOT EXISTS public.articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  cover_image_url text,
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  published boolean NOT NULL DEFAULT true,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.articles TO authenticated;
GRANT ALL ON public.articles TO service_role;
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read articles" ON public.articles;
CREATE POLICY "auth read articles" ON public.articles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth manage articles" ON public.articles;
CREATE POLICY "auth manage articles" ON public.articles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_articles_updated ON public.articles;
CREATE TRIGGER trg_articles_updated BEFORE UPDATE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
