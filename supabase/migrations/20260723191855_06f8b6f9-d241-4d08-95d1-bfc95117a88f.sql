CREATE OR REPLACE FUNCTION public.employee_requests_validate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.requested_date < (CURRENT_DATE + 2) THEN
      RAISE EXCEPTION 'Requested date must be at least 2 days from today';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status <> 'pending' AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.reviewed_by := auth.uid();
    NEW.reviewed_at := now();
  END IF;
  RETURN NEW;
END;
$function$;