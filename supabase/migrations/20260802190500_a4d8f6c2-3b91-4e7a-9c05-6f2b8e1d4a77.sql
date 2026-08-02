-- Security fix: dashboard_supplier_debt_summary was SECURITY DEFINER with no
-- brand-access check, so any authenticated user could read company-wide
-- supplier debt totals regardless of which brands they're actually allowed
-- to see. This mirrors the auth pattern already used by the sibling
-- dashboard_operational_report function (can_read_page + has_brand_access).
-- The debt-allocation math itself (standalone payment offsetting, overdue
-- calculation) is unchanged.

CREATE OR REPLACE FUNCTION public.dashboard_supplier_debt_summary(_brand_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _today date := (now() AT TIME ZONE 'Africa/Cairo')::date;
  _total numeric := 0;
  _overdue_count int := 0;
  s record;
  inv record;
  _standalone numeric;
  _opening numeric;
  _applied numeric;
  _net numeric;
  _remaining numeric;
  _out numeric;
  _ovd numeric;
  _debts jsonb := '[]'::jsonb;
  _empty jsonb := jsonb_build_object('totalOutstanding', 0, 'overdueCount', 0, 'topSuppliers', '[]'::jsonb);
BEGIN
  IF NOT public.can_read_page(_uid, '/dashboard') THEN
    RETURN _empty;
  END IF;
  IF _brand_id IS NOT NULL AND NOT public.has_brand_access(_uid, _brand_id) THEN
    RETURN _empty;
  END IF;

  FOR s IN
    SELECT id, name, brand_id, COALESCE(opening_balance, 0)::numeric AS opening_balance
    FROM public.suppliers
    WHERE brand_id IS NULL OR public.has_brand_access(_uid, brand_id)
    ORDER BY id
  LOOP
    _out := 0;
    _ovd := 0;

    SELECT COALESCE(SUM(amount), 0)::numeric INTO _standalone
    FROM public.supplier_payments
    WHERE supplier_id = s.id AND invoice_id IS NULL;

    -- opening balance (respect brand filter)
    IF _brand_id IS NULL OR s.brand_id IS NULL OR s.brand_id = _brand_id THEN
      _opening := COALESCE(s.opening_balance, 0);
    ELSE
      _opening := 0;
    END IF;

    IF _opening <> 0 THEN
      _applied := LEAST(_opening, _standalone);
      _standalone := _standalone - _applied;
      _net := _opening - _applied;
      IF _net <> 0 THEN
        _out := _out + _net;
        _total := _total + _net;
      END IF;
    ELSE
      IF _brand_id IS NOT NULL AND s.brand_id IS NOT NULL AND s.brand_id <> _brand_id THEN
        NULL;
      END IF;
    END IF;

    FOR inv IN
      SELECT i.id, i.brand_id, COALESCE(i.amount, 0)::numeric AS amount, i.due_at, i.status,
             COALESCE((SELECT SUM(p.amount) FROM public.supplier_payments p WHERE p.invoice_id = i.id), 0)::numeric AS paid
      FROM public.supplier_invoices i
      WHERE i.supplier_id = s.id
        AND (COALESCE(i.brand_id, s.brand_id) IS NULL OR public.has_brand_access(_uid, COALESCE(i.brand_id, s.brand_id)))
      ORDER BY i.due_at NULLS LAST, i.id
    LOOP
      IF _brand_id IS NOT NULL THEN
        IF COALESCE(inv.brand_id, s.brand_id) IS NOT NULL AND COALESCE(inv.brand_id, s.brand_id) <> _brand_id THEN
          CONTINUE;
        END IF;
      END IF;

      _remaining := GREATEST(0, inv.amount - inv.paid);
      IF _remaining <= 0 THEN CONTINUE; END IF;

      IF _standalone > 0 THEN
        _applied := LEAST(_standalone, _remaining);
        _remaining := _remaining - _applied;
        _standalone := _standalone - _applied;
      END IF;
      IF _remaining <= 0 THEN CONTINUE; END IF;

      _total := _total + _remaining;
      _out := _out + _remaining;
      IF inv.due_at IS NOT NULL AND inv.due_at::date < _today AND COALESCE(inv.status, '') <> 'paid' THEN
        _overdue_count := _overdue_count + 1;
        _ovd := _ovd + _remaining;
      END IF;
    END LOOP;

    IF _out <> 0 OR _ovd <> 0 THEN
      _debts := _debts || jsonb_build_object('name', s.name, 'outstanding', _out, 'overdue', _ovd);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'totalOutstanding', _total,
    'overdueCount', _overdue_count,
    'topSuppliers', COALESCE((
      SELECT jsonb_agg(d ORDER BY (d->>'outstanding')::numeric DESC)
      FROM (
        SELECT d FROM jsonb_array_elements(_debts) d
        ORDER BY (d->>'outstanding')::numeric DESC
        LIMIT 5
      ) t
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_supplier_debt_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_supplier_debt_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_supplier_debt_summary(uuid) TO service_role;
