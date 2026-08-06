CREATE OR REPLACE FUNCTION public.sync_service_client_to_customer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cust_id uuid;
  looks_email boolean := NEW.contact ILIKE '%@%';
  looks_phone boolean := NEW.contact ~ '^[0-9+\-\s()]{6,}$';
  pnorm text := CASE WHEN looks_phone THEN regexp_replace(coalesce(NEW.contact,''), '\D', '', 'g') ELSE NULL END;
  enorm text := CASE WHEN looks_email THEN lower(NEW.contact) ELSE NULL END;
BEGIN
  IF pnorm IS NOT NULL AND pnorm <> '' THEN
    SELECT id INTO cust_id FROM public.customers WHERE phone_norm = pnorm LIMIT 1;
  END IF;
  IF cust_id IS NULL AND enorm IS NOT NULL THEN
    SELECT id INTO cust_id FROM public.customers WHERE email_norm = enorm LIMIT 1;
  END IF;
  IF cust_id IS NULL THEN
    INSERT INTO public.customers(name, phone, email)
    VALUES (NEW.name,
            CASE WHEN looks_phone THEN NEW.contact ELSE NULL END,
            CASE WHEN looks_email THEN NEW.contact ELSE NULL END)
    RETURNING id INTO cust_id;
  END IF;
  INSERT INTO public.customer_brands(customer_id, brand_id)
    VALUES (cust_id, NEW.brand_id)
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_service_client_to_customer ON public.service_clients;
CREATE TRIGGER trg_sync_service_client_to_customer
AFTER INSERT ON public.service_clients
FOR EACH ROW EXECUTE FUNCTION public.sync_service_client_to_customer();

-- Backfill existing service clients
INSERT INTO public.customers(name, phone, email)
SELECT sc.name,
       CASE WHEN sc.contact ~ '^[0-9+\-\s()]{6,}$' THEN sc.contact END,
       CASE WHEN sc.contact ILIKE '%@%' THEN sc.contact END
FROM public.service_clients sc
WHERE NOT EXISTS (
  SELECT 1 FROM public.customers c
  WHERE (sc.contact ~ '^[0-9+\-\s()]{6,}$' AND c.phone_norm = regexp_replace(sc.contact,'\D','','g'))
     OR (sc.contact ILIKE '%@%' AND c.email_norm = lower(sc.contact))
     OR (sc.contact IS NULL AND c.name = sc.name)
);

INSERT INTO public.customer_brands(customer_id, brand_id)
SELECT DISTINCT c.id, sc.brand_id
FROM public.service_clients sc
JOIN public.customers c ON (
  (sc.contact ~ '^[0-9+\-\s()]{6,}$' AND c.phone_norm = regexp_replace(sc.contact,'\D','','g'))
  OR (sc.contact ILIKE '%@%' AND c.email_norm = lower(sc.contact))
  OR (sc.contact IS NULL AND c.name = sc.name)
)
ON CONFLICT DO NOTHING;