-- A fee the courier keeps out of the transfer was being counted as money they
-- still owe us.
--
-- courier_financial_metrics.owed is built from order totals -- the gross the
-- customer pays. collected is fed by apply_cash_metric_delta from the cash
-- transaction, and postOrderClearing books that transaction NET, because the
-- courier transfers the COD minus their fee and the treasury must match the
-- bank. So owed counts gross while collected counts net, and the difference --
-- the courier's own fee, which they were entitled to keep -- sits in their
-- balance forever as an unpaid debt.
--
-- Withholding a fee settles the same debt as handing the money over: the
-- courier collected the full amount from the customer either way. Credit the
-- withheld portion to collected so the courier's remaining balance shows only
-- what is genuinely still out.
--
-- Deliberately not booked as a cash movement. No cash moved -- that is the
-- entire point of a fee deducted at source -- so a cash row would put money in
-- the treasury that never arrived. This adjusts the courier ledger alone.
--
-- Signed, so reversing a clearing batch passes a negative and puts the debt
-- back exactly as it was.
--
-- SECURITY DEFINER to write the metrics table, so it authorises the caller
-- itself rather than trusting the code path that reached it.
CREATE OR REPLACE FUNCTION public.credit_courier_withheld_fee(_courier_id uuid, _brand_id uuid, _amount numeric)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  zero_uuid constant uuid := '00000000-0000-0000-0000-000000000000'::uuid;
BEGIN
  IF _courier_id IS NULL OR COALESCE(_amount, 0) = 0 THEN
    RETURN;
  END IF;
  IF NOT public.can_write_page(auth.uid(), '/orders') THEN
    RAISE EXCEPTION 'Not allowed to adjust courier balances';
  END IF;
  IF NOT public.courier_accessible_to_user(auth.uid(), _courier_id) THEN
    RAISE EXCEPTION 'No access to this courier';
  END IF;

  INSERT INTO public.courier_financial_metrics(courier_id, brand_key, owed, collected)
  VALUES (_courier_id, COALESCE(_brand_id, zero_uuid), 0, _amount)
  ON CONFLICT (courier_id, brand_key) DO UPDATE
    SET collected = public.courier_financial_metrics.collected + EXCLUDED.collected;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_courier_withheld_fee(_courier_id uuid, _brand_id uuid, _amount numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.credit_courier_withheld_fee(_courier_id uuid, _brand_id uuid, _amount numeric) TO authenticated;
GRANT ALL ON FUNCTION public.credit_courier_withheld_fee(_courier_id uuid, _brand_id uuid, _amount numeric) TO service_role;
