
-- 1) Customers unified across brands
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  phone_norm text GENERATED ALWAYS AS (regexp_replace(coalesce(phone,''), '\D', '', 'g')) STORED,
  email_norm text GENERATED ALWAYS AS (lower(coalesce(email,''))) STORED,
  tags text[] NOT NULL DEFAULT '{}',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_uidx ON public.customers(phone_norm) WHERE phone_norm <> '';
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_uidx ON public.customers(email_norm) WHERE email_norm <> '';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customers read" ON public.customers;
CREATE POLICY "customers read" ON public.customers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "customers write" ON public.customers;
CREATE POLICY "customers write" ON public.customers FOR ALL TO authenticated
  USING (public.is_writer(auth.uid())) WITH CHECK (public.is_writer(auth.uid()));

DROP TRIGGER IF EXISTS customers_updated_at ON public.customers;
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Notes on customers
CREATE TABLE IF NOT EXISTS public.customer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  author_id uuid,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_notes TO authenticated;
GRANT ALL ON public.customer_notes TO service_role;
ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notes read" ON public.customer_notes;
CREATE POLICY "notes read" ON public.customer_notes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "notes write" ON public.customer_notes;
CREATE POLICY "notes write" ON public.customer_notes FOR ALL TO authenticated
  USING (public.is_writer(auth.uid())) WITH CHECK (public.is_writer(auth.uid()));
DROP TRIGGER IF EXISTS cnotes_updated_at ON public.customer_notes;
CREATE TRIGGER cnotes_updated_at BEFORE UPDATE ON public.customer_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Extend sales_invoices with customer contact + link
ALTER TABLE public.sales_invoices
  ADD COLUMN customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN customer_name text,
  ADD COLUMN customer_phone text,
  ADD COLUMN customer_email text;
CREATE INDEX IF NOT EXISTS sales_invoices_customer_idx ON public.sales_invoices(customer_id);

-- 4) Trigger: on insert/update of a sales invoice, upsert/link a customer by phone or email
CREATE OR REPLACE FUNCTION public.link_sales_invoice_customer()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  pnorm text := regexp_replace(coalesce(NEW.customer_phone,''), '\D', '', 'g');
  enorm text := lower(coalesce(NEW.customer_email,''));
  cid uuid;
BEGIN
  IF NEW.customer_id IS NULL AND (pnorm <> '' OR enorm <> '') THEN
    IF pnorm <> '' THEN
      SELECT id INTO cid FROM public.customers WHERE phone_norm = pnorm LIMIT 1;
    END IF;
    IF cid IS NULL AND enorm <> '' THEN
      SELECT id INTO cid FROM public.customers WHERE email_norm = enorm LIMIT 1;
    END IF;
    IF cid IS NULL THEN
      INSERT INTO public.customers(name, phone, email)
      VALUES (coalesce(NEW.customer_name, coalesce(NEW.customer_phone, NEW.customer_email, 'Unknown')),
              NULLIF(NEW.customer_phone,''), NULLIF(NEW.customer_email,''))
      RETURNING id INTO cid;
    END IF;
    NEW.customer_id := cid;
  END IF;
  IF NEW.customer_id IS NOT NULL THEN
    UPDATE public.customers
    SET last_seen_at = GREATEST(coalesce(last_seen_at,'-infinity'::timestamptz), NEW.created_at)
    WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sales_invoices_link_customer ON public.sales_invoices;
CREATE TRIGGER sales_invoices_link_customer
BEFORE INSERT OR UPDATE OF customer_phone, customer_email, customer_name
ON public.sales_invoices
FOR EACH ROW EXECUTE FUNCTION public.link_sales_invoice_customer();
