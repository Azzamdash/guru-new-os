
CREATE OR REPLACE FUNCTION public.sync_service_project_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rev numeric;
  occ date;
  cname text;
  inv_id uuid;
BEGIN
  rev := COALESCE(NEW.cost,0) + COALESCE(NEW.commission,0);
  occ := COALESCE(NEW.finished_at, NEW.started_at, CURRENT_DATE);
  SELECT name INTO cname FROM public.service_clients WHERE id = NEW.client_id;

  IF NEW.status = 'cancelled' OR rev <= 0 OR NEW.brand_id IS NULL THEN
    IF NEW.invoice_id IS NOT NULL THEN
      DELETE FROM public.sales_invoices WHERE id = NEW.invoice_id;
      NEW.invoice_id := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.invoice_id IS NULL THEN
    INSERT INTO public.sales_invoices(brand_id, type, qty, total_amount, occurred_at, customer_name, note)
    VALUES (NEW.brand_id, 'sale', 1, rev, occ, cname, 'Service Project: ' || NEW.name)
    RETURNING id INTO inv_id;
    NEW.invoice_id := inv_id;
  ELSE
    UPDATE public.sales_invoices
      SET brand_id = NEW.brand_id,
          total_amount = rev,
          occurred_at = occ,
          customer_name = cname,
          note = 'Service Project: ' || NEW.name
      WHERE id = NEW.invoice_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_service_project_invoice ON public.service_projects;
CREATE TRIGGER trg_sync_service_project_invoice
BEFORE INSERT OR UPDATE OF cost, commission, status, brand_id, name, client_id, started_at, finished_at
ON public.service_projects
FOR EACH ROW EXECUTE FUNCTION public.sync_service_project_invoice();

CREATE OR REPLACE FUNCTION public.sync_service_project_invoice_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.invoice_id IS NOT NULL THEN
    DELETE FROM public.sales_invoices WHERE id = OLD.invoice_id;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_sync_service_project_invoice_del ON public.service_projects;
CREATE TRIGGER trg_sync_service_project_invoice_del
BEFORE DELETE ON public.service_projects
FOR EACH ROW EXECUTE FUNCTION public.sync_service_project_invoice_delete();

-- Backfill existing projects
DO $$
DECLARE r record; rev numeric; occ date; cname text; new_inv uuid;
BEGIN
  FOR r IN SELECT * FROM public.service_projects WHERE status <> 'cancelled' AND brand_id IS NOT NULL LOOP
    rev := COALESCE(r.cost,0) + COALESCE(r.commission,0);
    IF rev <= 0 THEN CONTINUE; END IF;
    occ := COALESCE(r.finished_at, r.started_at, CURRENT_DATE);
    SELECT name INTO cname FROM public.service_clients WHERE id = r.client_id;
    IF r.invoice_id IS NULL THEN
      INSERT INTO public.sales_invoices(brand_id, type, qty, total_amount, occurred_at, customer_name, note)
      VALUES (r.brand_id, 'sale', 1, rev, occ, cname, 'Service Project: ' || r.name)
      RETURNING id INTO new_inv;
      UPDATE public.service_projects SET invoice_id = new_inv WHERE id = r.id;
    ELSE
      UPDATE public.sales_invoices
        SET brand_id = r.brand_id, total_amount = rev, occurred_at = occ,
            customer_name = cname, note = 'Service Project: ' || r.name
        WHERE id = r.invoice_id;
    END IF;
  END LOOP;
END $$;
