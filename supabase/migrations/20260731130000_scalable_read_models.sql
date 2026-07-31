-- Scalable read APIs for orders/customers and indexes for million-row workloads.
-- Read RPCs are SECURITY INVOKER so existing RLS and page/brand permissions remain authoritative.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS bosta_tracking text;

CREATE INDEX IF NOT EXISTS orders_occurred_at_desc_idx
  ON public.orders (occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS orders_status_occurred_idx
  ON public.orders (order_status, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS orders_brand_status_occurred_idx
  ON public.orders (brand_id, order_status, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS orders_brand_occurred_idx
  ON public.orders (brand_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS orders_external_number_trgm_idx
  ON public.orders USING gin (external_order_number extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS orders_customer_name_trgm_idx
  ON public.orders USING gin (customer_name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS orders_customer_phone_trgm_idx
  ON public.orders USING gin (customer_phone extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_last_seen_desc_idx
  ON public.customers (last_seen_at DESC NULLS LAST, id DESC);
CREATE INDEX IF NOT EXISTS customers_name_trgm_idx
  ON public.customers USING gin (name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_phone_trgm_idx
  ON public.customers USING gin (phone extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_email_trgm_idx
  ON public.customers USING gin (email extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS sales_invoices_customer_occurred_idx
  ON public.sales_invoices (customer_id, occurred_at DESC)
  WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_invoices_occurred_brand_idx
  ON public.sales_invoices (occurred_at DESC, brand_id);
CREATE INDEX IF NOT EXISTS sales_invoices_brand_occurred_idx
  ON public.sales_invoices (brand_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS cash_transactions_occurred_brand_type_idx
  ON public.cash_transactions (occurred_at, brand_id, type)
  WHERE transfer_group IS NULL;
CREATE INDEX IF NOT EXISTS cash_transactions_brand_occurred_type_idx
  ON public.cash_transactions (brand_id, occurred_at, type)
  WHERE transfer_group IS NULL;
CREATE INDEX IF NOT EXISTS cash_transactions_courier_type_idx
  ON public.cash_transactions (courier_id, type) WHERE courier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_invoices_courier_type_idx
  ON public.sales_invoices (courier_id, type) WHERE courier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS expense_entries_cash_transaction_idx
  ON public.expense_entries (cash_transaction_id) WHERE cash_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cash_transactions_expense_occurred_idx
  ON public.cash_transactions (expense_entry_id, occurred_at)
  WHERE expense_entry_id IS NOT NULL;

ALTER TABLE public.expense_entries
  ADD COLUMN IF NOT EXISTS posting_date date GENERATED ALWAYS AS (
    COALESCE(period_date, make_date(year, month, 15))
  ) STORED,
  ADD COLUMN IF NOT EXISTS effective_from date GENERATED ALWAYS AS (
    COALESCE(period_date, make_date(year, month, 1))
  ) STORED,
  ADD COLUMN IF NOT EXISTS effective_to date GENERATED ALWAYS AS (
    COALESCE(
      period_end_date,
      CASE
        WHEN period_type = 'weekly' AND period_date IS NOT NULL THEN period_date + 6
        WHEN period_type = 'yearly' THEN make_date(year, 12, 31)
        WHEN period_date IS NOT NULL THEN period_date
        ELSE (make_date(year, month, 1) + interval '1 month - 1 day')::date
      END
    )
  ) STORED;
CREATE INDEX IF NOT EXISTS expense_entries_brand_effective_period_idx
  ON public.expense_entries (brand_id, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS expense_entries_brand_posting_date_idx
  ON public.expense_entries (brand_id, posting_date);
CREATE INDEX IF NOT EXISTS expense_entries_effective_period_gist_idx
  ON public.expense_entries USING gist (daterange(effective_from, effective_to, '[]'));

CREATE TABLE IF NOT EXISTS public.customer_metrics (
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  ltv numeric NOT NULL DEFAULT 0,
  orders_count bigint NOT NULL DEFAULT 0,
  first_order_at timestamptz,
  last_order_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, brand_id)
);
ALTER TABLE public.customer_metrics ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS customer_metrics_brand_customer_idx
  ON public.customer_metrics (brand_id, customer_id);
DROP POLICY IF EXISTS customer_metrics_read ON public.customer_metrics;
CREATE POLICY customer_metrics_read ON public.customer_metrics
FOR SELECT TO authenticated
USING (
  public.can_read_page(auth.uid(), '/customers')
  AND public.has_brand_access(auth.uid(), brand_id)
  AND public.can_access_customer(auth.uid(), customer_id)
);
GRANT SELECT ON public.customer_metrics TO authenticated;
GRANT ALL ON public.customer_metrics TO service_role;

CREATE OR REPLACE FUNCTION public.lock_customer_brand_metrics(_customer_id uuid, _brand_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT pg_advisory_xact_lock(hashtextextended(_customer_id::text || ':' || _brand_id::text, 0));
$$;

CREATE OR REPLACE FUNCTION public.refresh_customer_brand_metrics(_customer_id uuid, _brand_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF _customer_id IS NULL OR _brand_id IS NULL THEN RETURN; END IF;
  PERFORM public.lock_customer_brand_metrics(_customer_id, _brand_id);
  DELETE FROM public.customer_metrics
  WHERE customer_id = _customer_id AND brand_id = _brand_id;
  INSERT INTO public.customer_metrics(
    customer_id, brand_id, ltv, orders_count, first_order_at, last_order_at, updated_at
  )
  SELECT
    _customer_id,
    _brand_id,
    sum(CASE WHEN si.type = 'return' THEN -si.total_amount ELSE si.total_amount END),
    count(*) FILTER (WHERE si.type = 'sale'),
    min(si.occurred_at),
    max(si.occurred_at),
    now()
  FROM public.sales_invoices si
  WHERE si.customer_id = _customer_id AND si.brand_id = _brand_id
  HAVING count(*) > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_customer_metrics_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  old_key text;
  new_key text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.lock_customer_brand_metrics(NEW.customer_id, NEW.brand_id);
    IF NEW.customer_id IS NOT NULL AND NEW.brand_id IS NOT NULL THEN
      INSERT INTO public.customer_metrics(
        customer_id, brand_id, ltv, orders_count, first_order_at, last_order_at, updated_at
      ) VALUES (
        NEW.customer_id,
        NEW.brand_id,
        CASE WHEN NEW.type = 'return' THEN -NEW.total_amount ELSE NEW.total_amount END,
        CASE WHEN NEW.type = 'sale' THEN 1 ELSE 0 END,
        NEW.occurred_at,
        NEW.occurred_at,
        now()
      )
      ON CONFLICT (customer_id, brand_id) DO UPDATE SET
        ltv = public.customer_metrics.ltv + EXCLUDED.ltv,
        orders_count = public.customer_metrics.orders_count + EXCLUDED.orders_count,
        first_order_at = LEAST(public.customer_metrics.first_order_at, EXCLUDED.first_order_at),
        last_order_at = GREATEST(public.customer_metrics.last_order_at, EXCLUDED.last_order_at),
        updated_at = now();
      UPDATE public.customers
      SET last_seen_at = GREATEST(COALESCE(last_seen_at, NEW.occurred_at), NEW.occurred_at)
      WHERE id = NEW.customer_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_customer_brand_metrics(OLD.customer_id, OLD.brand_id);
  ELSE
    old_key := COALESCE(OLD.customer_id::text, '') || ':' || COALESCE(OLD.brand_id::text, '');
    new_key := COALESCE(NEW.customer_id::text, '') || ':' || COALESCE(NEW.brand_id::text, '');
    IF old_key <= new_key THEN
      PERFORM public.lock_customer_brand_metrics(OLD.customer_id, OLD.brand_id);
      IF old_key <> new_key THEN PERFORM public.lock_customer_brand_metrics(NEW.customer_id, NEW.brand_id); END IF;
    ELSE
      PERFORM public.lock_customer_brand_metrics(NEW.customer_id, NEW.brand_id);
      PERFORM public.lock_customer_brand_metrics(OLD.customer_id, OLD.brand_id);
    END IF;
    PERFORM public.refresh_customer_brand_metrics(OLD.customer_id, OLD.brand_id);
    IF old_key <> new_key THEN
      PERFORM public.refresh_customer_brand_metrics(NEW.customer_id, NEW.brand_id);
    END IF;
    IF NEW.customer_id IS NOT NULL THEN
      UPDATE public.customers
      SET last_seen_at = GREATEST(COALESCE(last_seen_at, NEW.occurred_at), NEW.occurred_at)
      WHERE id = NEW.customer_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS sales_invoices_refresh_customer_metrics ON public.sales_invoices;
CREATE TRIGGER sales_invoices_refresh_customer_metrics
AFTER INSERT OR UPDATE OF customer_id, type, total_amount, occurred_at, brand_id OR DELETE
ON public.sales_invoices
FOR EACH ROW EXECUTE FUNCTION public.refresh_customer_metrics_trigger();
REVOKE ALL ON FUNCTION public.lock_customer_brand_metrics(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_customer_brand_metrics(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_customer_metrics_trigger() FROM PUBLIC;

-- Supabase applies this migration transactionally. Hold source writes while
-- the initial snapshot is populated so trigger deltas cannot be overwritten.
LOCK TABLE public.sales_invoices IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO public.customer_metrics(customer_id, brand_id, ltv, orders_count, first_order_at, last_order_at)
SELECT
  si.customer_id,
  si.brand_id,
  sum(CASE WHEN si.type = 'return' THEN -si.total_amount ELSE si.total_amount END),
  count(*) FILTER (WHERE si.type = 'sale'),
  min(si.occurred_at),
  max(si.occurred_at)
FROM public.sales_invoices si
WHERE si.customer_id IS NOT NULL AND si.brand_id IS NOT NULL
GROUP BY si.customer_id, si.brand_id
ON CONFLICT (customer_id, brand_id) DO UPDATE SET
  ltv = EXCLUDED.ltv,
  orders_count = EXCLUDED.orders_count,
  first_order_at = EXCLUDED.first_order_at,
  last_order_at = EXCLUDED.last_order_at,
  updated_at = now();

CREATE TABLE IF NOT EXISTS public.cash_daily_metrics (
  day date NOT NULL,
  brand_key uuid NOT NULL,
  type text NOT NULL,
  user_key uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (day, brand_key, type, user_key)
);
ALTER TABLE public.cash_daily_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cash_daily_metrics_read ON public.cash_daily_metrics;
CREATE POLICY cash_daily_metrics_read ON public.cash_daily_metrics
FOR SELECT TO authenticated USING (
  (public.can_read_page(auth.uid(), '/treasury') OR public.can_read_page(auth.uid(), '/reports/cash-flow'))
  AND (
    brand_key = '00000000-0000-0000-0000-000000000000'::uuid
    OR public.has_brand_access(auth.uid(), brand_key)
  )
);
GRANT SELECT ON public.cash_daily_metrics TO authenticated;
GRANT ALL ON public.cash_daily_metrics TO service_role;
CREATE INDEX IF NOT EXISTS cash_daily_metrics_brand_day_idx
  ON public.cash_daily_metrics (brand_key, day, type);

CREATE TABLE IF NOT EXISTS public.courier_financial_metrics (
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  brand_key uuid NOT NULL,
  owed numeric NOT NULL DEFAULT 0,
  collected numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (courier_id, brand_key)
);
ALTER TABLE public.courier_financial_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS courier_financial_metrics_read ON public.courier_financial_metrics;
CREATE POLICY courier_financial_metrics_read ON public.courier_financial_metrics
FOR SELECT TO authenticated USING (
  public.can_read_page(auth.uid(), '/treasury')
  AND (
    brand_key = '00000000-0000-0000-0000-000000000000'::uuid
    OR public.has_brand_access(auth.uid(), brand_key)
  )
);
GRANT SELECT ON public.courier_financial_metrics TO authenticated;
GRANT ALL ON public.courier_financial_metrics TO service_role;

LOCK TABLE public.cash_transactions IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO public.cash_daily_metrics(day, brand_key, type, user_key, amount)
SELECT
  (ct.occurred_at AT TIME ZONE 'UTC')::date,
  COALESCE(ct.brand_id, '00000000-0000-0000-0000-000000000000'::uuid),
  ct.type,
  COALESCE(ct.for_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
  sum(ct.amount)::numeric
FROM public.cash_transactions ct
WHERE ct.transfer_group IS NULL
GROUP BY 1, 2, 3, 4
ON CONFLICT (day, brand_key, type, user_key) DO UPDATE SET amount = EXCLUDED.amount;

INSERT INTO public.courier_financial_metrics(courier_id, brand_key, owed, collected)
SELECT courier_id, brand_key, sum(owed)::numeric, sum(collected)::numeric
FROM (
  SELECT si.courier_id,
    COALESCE(si.brand_id, '00000000-0000-0000-0000-000000000000'::uuid) AS brand_key,
    CASE WHEN si.type = 'return' THEN -si.total_amount ELSE si.total_amount END AS owed,
    0::numeric AS collected
  FROM public.sales_invoices si WHERE si.courier_id IS NOT NULL
  UNION ALL
  SELECT ct.courier_id,
    COALESCE(ct.brand_id, '00000000-0000-0000-0000-000000000000'::uuid),
    0::numeric,
    ct.amount
  FROM public.cash_transactions ct
  WHERE ct.courier_id IS NOT NULL AND ct.type = 'collection'
) q
GROUP BY courier_id, brand_key
ON CONFLICT (courier_id, brand_key) DO UPDATE SET owed = EXCLUDED.owed, collected = EXCLUDED.collected;

CREATE OR REPLACE FUNCTION public.apply_cash_metric_delta(
  _occurred_at timestamptz,
  _brand_id uuid,
  _type text,
  _for_user_id uuid,
  _courier_id uuid,
  _transfer_group uuid,
  _amount numeric,
  _direction integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  zero_uuid constant uuid := '00000000-0000-0000-0000-000000000000'::uuid;
BEGIN
  IF _transfer_group IS NULL THEN
    INSERT INTO public.cash_daily_metrics(day, brand_key, type, user_key, amount)
    VALUES (
      (_occurred_at AT TIME ZONE 'UTC')::date,
      COALESCE(_brand_id, zero_uuid),
      _type,
      COALESCE(_for_user_id, zero_uuid),
      _amount * _direction
    )
    ON CONFLICT (day, brand_key, type, user_key) DO UPDATE
      SET amount = public.cash_daily_metrics.amount + EXCLUDED.amount;
  END IF;
  IF _courier_id IS NOT NULL AND _type = 'collection' THEN
    INSERT INTO public.courier_financial_metrics(courier_id, brand_key, owed, collected)
    VALUES (_courier_id, COALESCE(_brand_id, zero_uuid), 0, _amount * _direction)
    ON CONFLICT (courier_id, brand_key) DO UPDATE
      SET collected = public.courier_financial_metrics.collected + EXCLUDED.collected;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cash_metrics_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.apply_cash_metric_delta(OLD.occurred_at, OLD.brand_id, OLD.type::text,
      OLD.for_user_id, OLD.courier_id, OLD.transfer_group, OLD.amount, -1);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.apply_cash_metric_delta(NEW.occurred_at, NEW.brand_id, NEW.type::text,
      NEW.for_user_id, NEW.courier_id, NEW.transfer_group, NEW.amount, 1);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS cash_transactions_refresh_metrics ON public.cash_transactions;
CREATE TRIGGER cash_transactions_refresh_metrics
AFTER INSERT OR UPDATE OF occurred_at, brand_id, type, for_user_id, courier_id, transfer_group, amount OR DELETE
ON public.cash_transactions
FOR EACH ROW EXECUTE FUNCTION public.cash_metrics_trigger();

CREATE OR REPLACE FUNCTION public.courier_invoice_metrics_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  zero_uuid constant uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  old_owed numeric;
  new_owed numeric;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.courier_id IS NOT NULL THEN
    old_owed := CASE WHEN OLD.type = 'return' THEN -OLD.total_amount ELSE OLD.total_amount END;
    INSERT INTO public.courier_financial_metrics(courier_id, brand_key, owed, collected)
    VALUES (OLD.courier_id, COALESCE(OLD.brand_id, zero_uuid), -old_owed, 0)
    ON CONFLICT (courier_id, brand_key) DO UPDATE
      SET owed = public.courier_financial_metrics.owed + EXCLUDED.owed;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.courier_id IS NOT NULL THEN
    new_owed := CASE WHEN NEW.type = 'return' THEN -NEW.total_amount ELSE NEW.total_amount END;
    INSERT INTO public.courier_financial_metrics(courier_id, brand_key, owed, collected)
    VALUES (NEW.courier_id, COALESCE(NEW.brand_id, zero_uuid), new_owed, 0)
    ON CONFLICT (courier_id, brand_key) DO UPDATE
      SET owed = public.courier_financial_metrics.owed + EXCLUDED.owed;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS sales_invoices_refresh_courier_metrics ON public.sales_invoices;
CREATE TRIGGER sales_invoices_refresh_courier_metrics
AFTER INSERT OR UPDATE OF courier_id, brand_id, type, total_amount OR DELETE
ON public.sales_invoices
FOR EACH ROW EXECUTE FUNCTION public.courier_invoice_metrics_trigger();

REVOKE ALL ON FUNCTION public.apply_cash_metric_delta(timestamptz,uuid,text,uuid,uuid,uuid,numeric,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cash_metrics_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.courier_invoice_metrics_trigger() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.require_page_read(_route text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_read_page(auth.uid(), _route) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.require_page_read(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.require_page_read(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.orders_page(
  _from timestamptz,
  _to timestamptz,
  _brand_id uuid DEFAULT NULL,
  _order_status text DEFAULT NULL,
  _search text DEFAULT NULL,
  _cursor_at timestamptz DEFAULT NULL,
  _cursor_id uuid DEFAULT NULL,
  _limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH authz AS MATERIALIZED (
    SELECT public.require_page_read('/orders') AS allowed
  ), page_ids_all AS MATERIALIZED (
    SELECT o.id, o.occurred_at
    FROM public.orders o CROSS JOIN authz
    WHERE o.occurred_at >= _from
      AND o.occurred_at <= _to
      AND (_brand_id IS NULL OR o.brand_id = _brand_id)
      AND (_order_status IS NULL OR o.order_status = _order_status)
      AND (
        NULLIF(btrim(_search), '') IS NULL
        OR o.external_order_number ILIKE '%' || btrim(_search) || '%'
        OR o.customer_name ILIKE '%' || btrim(_search) || '%'
        OR o.customer_phone ILIKE '%' || btrim(_search) || '%'
      )
      AND (
        _cursor_at IS NULL
        OR (o.occurred_at, o.id) < (_cursor_at, COALESCE(_cursor_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
      )
    ORDER BY o.occurred_at DESC, o.id DESC
    LIMIT LEAST(GREATEST(_limit, 1), 100) + 1
  ), page_ids AS (
    SELECT * FROM page_ids_all
    ORDER BY occurred_at DESC, id DESC
    LIMIT LEAST(GREATEST(_limit, 1), 100)
  ), page_rows AS (
    SELECT
      p.id, p.brand_id, b.name AS brand_name, p.source, p.external_order_number,
      p.customer_id, p.customer_name, p.customer_phone, p.courier_id,
      c.name AS courier_name, p.employee_id, p.financial_status,
      p.fulfillment_status, p.confirmation_status, p.order_status,
      p.collection_status, p.shipment_outcome, p.lifecycle_source,
      p.lifecycle_updated_at, p.total_amount, p.cost_total, p.shipping_amount,
      p.currency, p.occurred_at, p.shipping_governorate,
      p.bosta_tracking,
      COALESCE(items.items_qty, 0) AS items_qty,
      COALESCE(items.items_summary, '[]'::jsonb) AS items_summary
    FROM page_ids pi
    JOIN public.orders p ON p.id = pi.id
    LEFT JOIN public.brands b ON b.id = p.brand_id
    LEFT JOIN public.couriers c ON c.id = p.courier_id
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(sum(oi.qty), 0) AS items_qty,
        jsonb_agg(jsonb_build_object('title', COALESCE(oi.title, '—'), 'qty', oi.qty) ORDER BY oi.id) AS items_summary
      FROM public.order_items oi
      WHERE oi.order_id = p.id
    ) items ON true
    ORDER BY p.occurred_at DESC, p.id DESC
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((
      SELECT jsonb_agg(to_jsonb(page_rows) ORDER BY occurred_at DESC, id DESC) FROM page_rows
    ), '[]'::jsonb),
    'hasMore', (SELECT count(*) > LEAST(GREATEST(_limit, 1), 100) FROM page_ids_all),
    'nextCursor', (
      SELECT jsonb_build_object('occurredAt', occurred_at, 'id', id)
      FROM page_rows ORDER BY occurred_at ASC, id ASC LIMIT 1
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.orders_summary(
  _from timestamptz,
  _to timestamptz,
  _brand_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH authz AS MATERIALIZED (
    SELECT public.require_page_read('/orders') AS allowed
  ), grouped AS (
    SELECT
      o.brand_id,
      b.name,
      count(*)::bigint AS count,
      count(*) FILTER (WHERE o.fulfillment_status = 'delivered')::bigint AS delivered,
      count(*) FILTER (WHERE o.fulfillment_status = 'returned')::bigint AS returned,
      COALESCE(sum(o.total_amount), 0)::numeric AS revenue,
      COALESCE(sum(o.cost_total), 0)::numeric AS cogs
    FROM public.orders o
    CROSS JOIN authz
    LEFT JOIN public.brands b ON b.id = o.brand_id
    WHERE o.occurred_at >= _from
      AND o.occurred_at <= _to
      AND (_brand_id IS NULL OR o.brand_id = _brand_id)
    GROUP BY o.brand_id, b.name
  )
  SELECT jsonb_build_object(
    'totalOrders', COALESCE(sum(count), 0),
    'delivered', COALESCE(sum(delivered), 0),
    'returned', COALESCE(sum(returned), 0),
    'revenue', COALESCE(sum(revenue), 0),
    'cogs', COALESCE(sum(cogs), 0),
    'grossProfit', COALESCE(sum(revenue - cogs), 0),
    'perBrand', COALESCE(
      jsonb_agg(jsonb_build_object(
        'brandId', brand_id, 'name', COALESCE(name, '—'), 'count', count,
        'revenue', revenue, 'cogs', cogs, 'delivered', delivered, 'returned', returned
      ) ORDER BY revenue DESC, brand_id),
      '[]'::jsonb
    )
  ) FROM grouped;
$$;

CREATE OR REPLACE FUNCTION public.orders_filter_summary(
  _from timestamptz,
  _to timestamptz,
  _brand_id uuid DEFAULT NULL,
  _order_status text DEFAULT NULL,
  _search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH authz AS MATERIALIZED (
    SELECT public.require_page_read('/orders') AS allowed
  )
  SELECT jsonb_build_object(
    'total', count(*)::bigint,
    'amount', COALESCE(sum(o.total_amount), 0)::numeric
  )
  FROM public.orders o CROSS JOIN authz
  WHERE o.occurred_at >= _from AND o.occurred_at <= _to
    AND (_brand_id IS NULL OR o.brand_id = _brand_id)
    AND (_order_status IS NULL OR o.order_status = _order_status)
    AND (
      NULLIF(btrim(_search), '') IS NULL
      OR o.external_order_number ILIKE '%' || btrim(_search) || '%'
      OR o.customer_name ILIKE '%' || btrim(_search) || '%'
      OR o.customer_phone ILIKE '%' || btrim(_search) || '%'
    );
$$;

CREATE OR REPLACE FUNCTION public.customers_page(
  _search text DEFAULT NULL,
  _segment text DEFAULT NULL,
  _brand_id uuid DEFAULT NULL,
  _cursor_at timestamptz DEFAULT NULL,
  _cursor_id uuid DEFAULT NULL,
  _limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH authz AS MATERIALIZED (
    SELECT public.require_page_read('/customers') AS allowed
  ), enriched AS (
    SELECT
      c.id, c.name, c.phone, c.email, c.governorate, c.is_general,
      COALESCE(m.ltv, 0)::numeric AS ltv,
      COALESCE(m.orders, 0)::bigint AS orders,
      GREATEST(m.last_order_at, c.last_seen_at) AS last_order_at,
      COALESCE(m.first_order_at, c.first_seen_at) AS first_order_at,
      COALESCE(m.invoice_brand_ids, ARRAY[]::uuid[]) AS invoice_brand_ids,
      c.last_seen_at AS sort_at,
      CASE
        WHEN (COALESCE(m.ltv, 0) >= 10000 OR COALESCE(m.orders, 0) >= 5)
          THEN CASE WHEN GREATEST(m.last_order_at, c.last_seen_at) < now() - interval '120 days' THEN 'at_risk' ELSE 'vip' END
        WHEN GREATEST(m.last_order_at, c.last_seen_at) IS NULL
          OR GREATEST(m.last_order_at, c.last_seen_at) < now() - interval '90 days' THEN 'at_risk'
        WHEN COALESCE(m.first_order_at, c.first_seen_at) >= now() - interval '30 days'
          AND COALESCE(m.orders, 0) <= 1 THEN 'new'
        ELSE 'active'
      END AS segment
    FROM public.customers c CROSS JOIN authz
    LEFT JOIN LATERAL (
      SELECT sum(cm.ltv)::numeric AS ltv, sum(cm.orders_count)::bigint AS orders,
        min(cm.first_order_at) AS first_order_at, max(cm.last_order_at) AS last_order_at,
        array_agg(DISTINCT cm.brand_id ORDER BY cm.brand_id) AS invoice_brand_ids
      FROM public.customer_metrics cm WHERE cm.customer_id = c.id
    ) m ON true
    WHERE (
        _cursor_id IS NULL OR
        (COALESCE(c.last_seen_at, '-infinity'::timestamptz), c.id)
          < (COALESCE(_cursor_at, '-infinity'::timestamptz), _cursor_id)
      )
      AND (
        NULLIF(btrim(_search), '') IS NULL
        OR c.name ILIKE '%' || btrim(_search) || '%'
        OR c.phone ILIKE '%' || btrim(_search) || '%'
        OR c.email ILIKE '%' || btrim(_search) || '%'
      )
      AND (
        _brand_id IS NULL
        OR EXISTS (SELECT 1 FROM public.customer_metrics cm WHERE cm.customer_id = c.id AND cm.brand_id = _brand_id)
        OR EXISTS (SELECT 1 FROM public.customer_brands cb WHERE cb.customer_id = c.id AND cb.brand_id = _brand_id)
      )
  ), candidates AS MATERIALIZED (
    SELECT * FROM enriched
    WHERE _segment IS NULL OR segment = _segment
    ORDER BY sort_at DESC NULLS LAST, id DESC
    LIMIT LEAST(GREATEST(_limit, 1), 100) + 1
  ), page_base AS (
    SELECT * FROM candidates
    ORDER BY sort_at DESC NULLS LAST, id DESC
    LIMIT LEAST(GREATEST(_limit, 1), 100)
  ), page_rows AS (
    SELECT
      b.id, b.name, b.phone, b.email, b.governorate, b.is_general AS "isGeneral",
      COALESCE(cb.assigned_brand_ids, ARRAY[]::uuid[]) AS "assignedBrandIds",
      b.ltv, b.orders,
      CASE WHEN b.orders > 0 THEN b.ltv / b.orders ELSE 0 END AS "avgOrder",
      b.last_order_at AS "lastOrderAt", b.first_order_at AS "firstOrderAt", b.sort_at AS "sortAt",
      cardinality(ARRAY(
        SELECT DISTINCT x FROM unnest(b.invoice_brand_ids || COALESCE(cb.assigned_brand_ids, ARRAY[]::uuid[])) x
        ORDER BY x
      )) AS "brandCount",
      ARRAY(
        SELECT DISTINCT x FROM unnest(b.invoice_brand_ids || COALESCE(cb.assigned_brand_ids, ARRAY[]::uuid[])) x
        ORDER BY x
      ) AS "brandIds",
      b.segment
    FROM page_base b
    LEFT JOIN LATERAL (
      SELECT array_agg(DISTINCT customer_brands.brand_id ORDER BY customer_brands.brand_id) AS assigned_brand_ids
      FROM public.customer_brands WHERE customer_brands.customer_id = b.id
    ) cb ON true
    ORDER BY b.sort_at DESC NULLS LAST, b.id DESC
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((
      SELECT jsonb_agg(to_jsonb(page_rows) ORDER BY "sortAt" DESC NULLS LAST, id DESC) FROM page_rows
    ), '[]'::jsonb),
    'hasMore', (SELECT count(*) > LEAST(GREATEST(_limit, 1), 100) FROM candidates),
    'nextCursor', (
      SELECT jsonb_build_object('lastOrderAt', "sortAt", 'id', id)
      FROM page_rows ORDER BY "sortAt" ASC NULLS FIRST, id ASC LIMIT 1
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.customers_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH authz AS MATERIALIZED (
    SELECT public.require_page_read('/customers') AS allowed
  ), visible_metrics AS MATERIALIZED (
    SELECT customer_id, sum(ltv)::numeric AS ltv, sum(orders_count)::bigint AS orders,
      max(last_order_at) AS last_order_at
    FROM public.customer_metrics CROSS JOIN authz GROUP BY customer_id
  ), per_customer AS (
    SELECT c.id, c.name, COALESCE(vm.ltv, 0)::numeric AS ltv,
      COALESCE(vm.orders, 0)::bigint AS orders,
      GREATEST(vm.last_order_at, c.last_seen_at) AS last_order_at
    FROM public.customers c CROSS JOIN authz
    LEFT JOIN visible_metrics vm ON vm.customer_id = c.id
  ), totals AS (
    SELECT count(*)::bigint AS total, COALESCE(avg(ltv), 0)::numeric AS avg_ltv,
      count(*) FILTER (WHERE orders >= 2)::bigint AS repeat_count,
      count(*) FILTER (WHERE last_order_at IS NOT NULL AND last_order_at < now() - interval '90 days')::bigint AS at_risk
    FROM per_customer
  )
  SELECT jsonb_build_object(
    'total', totals.total,
    'avgLtv', totals.avg_ltv,
    'repeatRate', CASE WHEN totals.total > 0 THEN totals.repeat_count::numeric / totals.total ELSE 0 END,
    'atRisk', totals.at_risk,
    'top', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY ltv DESC, id DESC) FROM (
      SELECT id, name, ltv, orders FROM per_customer ORDER BY ltv DESC, id DESC LIMIT 5
    ) t), '[]'::jsonb)
  ) FROM totals;
$$;

CREATE OR REPLACE FUNCTION public.customers_filter_summary(
  _search text DEFAULT NULL,
  _segment text DEFAULT NULL,
  _brand_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH authz AS MATERIALIZED (
    SELECT public.require_page_read('/customers') AS allowed
  ), enriched AS (
    SELECT c.id,
      CASE
        WHEN (COALESCE(m.ltv, 0) >= 10000 OR COALESCE(m.orders, 0) >= 5)
          THEN CASE WHEN GREATEST(m.last_order_at, c.last_seen_at) < now() - interval '120 days' THEN 'at_risk' ELSE 'vip' END
        WHEN GREATEST(m.last_order_at, c.last_seen_at) IS NULL
          OR GREATEST(m.last_order_at, c.last_seen_at) < now() - interval '90 days' THEN 'at_risk'
        WHEN COALESCE(m.first_order_at, c.first_seen_at) >= now() - interval '30 days'
          AND COALESCE(m.orders, 0) <= 1 THEN 'new'
        ELSE 'active'
      END AS segment
    FROM public.customers c CROSS JOIN authz
    LEFT JOIN LATERAL (
      SELECT sum(cm.ltv)::numeric AS ltv, sum(cm.orders_count)::bigint AS orders,
        min(cm.first_order_at) AS first_order_at, max(cm.last_order_at) AS last_order_at
      FROM public.customer_metrics cm WHERE cm.customer_id = c.id
    ) m ON true
    WHERE (
        NULLIF(btrim(_search), '') IS NULL
        OR c.name ILIKE '%' || btrim(_search) || '%'
        OR c.phone ILIKE '%' || btrim(_search) || '%'
        OR c.email ILIKE '%' || btrim(_search) || '%'
      )
      AND (
        _brand_id IS NULL
        OR EXISTS (SELECT 1 FROM public.customer_metrics cm WHERE cm.customer_id = c.id AND cm.brand_id = _brand_id)
        OR EXISTS (SELECT 1 FROM public.customer_brands cb WHERE cb.customer_id = c.id AND cb.brand_id = _brand_id)
      )
  )
  SELECT jsonb_build_object('total', count(*)::bigint)
  FROM enriched WHERE _segment IS NULL OR segment = _segment;
$$;

CREATE OR REPLACE FUNCTION public.accounting_profit_report(
  _from date,
  _to date,
  _brand_id uuid DEFAULT NULL,
  _exclude_brand_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH scoped_brands AS MATERIALIZED (
    SELECT b.id, b.name, b.type, COALESCE(b.cogs_percent_default, 0)::numeric AS default_cogs_pct
    FROM public.brands b
    WHERE b.active = true
      AND public.can_read_page(auth.uid(), '/reports/profits')
      AND public.has_brand_access(auth.uid(), b.id)
      AND (_brand_id IS NULL OR b.id = _brand_id)
      AND NOT (b.id = ANY(COALESCE(_exclude_brand_ids, ARRAY[]::uuid[])))
  ), scoped_invoices AS MATERIALIZED (
    SELECT si.id, si.brand_id, si.type, si.total_amount
    FROM public.sales_invoices si
    JOIN scoped_brands b ON b.id = si.brand_id
    WHERE si.occurred_at >= _from::timestamptz
      AND si.occurred_at < (_to + 1)::timestamptz
  ), distinct_products AS MATERIALIZED (
    SELECT DISTINCT sii.product_id
    FROM public.sales_invoice_items sii
    JOIN scoped_invoices si ON si.id = sii.invoice_id
    WHERE sii.product_id IS NOT NULL
  ), product_costs AS MATERIALIZED (
    SELECT product_id, COALESCE(public.product_cogs(product_id), 0)::numeric AS unit_cogs
    FROM distinct_products
  ), invoice_items AS MATERIALIZED (
    SELECT
      si.id AS invoice_id,
      COALESCE(sum(pc.unit_cogs * sii.qty) FILTER (WHERE pc.unit_cogs > 0 AND sii.qty > 0), 0)::numeric AS product_cogs,
      COALESCE(sum(COALESCE(NULLIF(sii.subtotal, 0), sii.unit_price * sii.qty)) FILTER (WHERE pc.unit_cogs > 0 AND sii.qty > 0), 0)::numeric AS covered_revenue
    FROM scoped_invoices si
    LEFT JOIN public.sales_invoice_items sii ON sii.invoice_id = si.id
    LEFT JOIN product_costs pc ON pc.product_id = sii.product_id
    GROUP BY si.id
  ), invoice_facts AS MATERIALIZED (
    SELECT
      si.brand_id, si.type, si.total_amount,
      (ii.product_cogs + GREATEST(0, si.total_amount - ii.covered_revenue) * sb.default_cogs_pct / 100)::numeric AS cogs
    FROM scoped_invoices si
    JOIN scoped_brands sb ON sb.id = si.brand_id
    JOIN invoice_items ii ON ii.invoice_id = si.id
  ), invoice_by_brand AS MATERIALIZED (
    SELECT
      brand_id,
      COALESCE(sum(total_amount) FILTER (WHERE type <> 'return'), 0)::numeric AS gross_revenue,
      COALESCE(sum(total_amount) FILTER (WHERE type = 'return'), 0)::numeric AS returns,
      COALESCE(sum(CASE WHEN type = 'return' THEN -cogs ELSE cogs END), 0)::numeric AS cogs,
      count(*) FILTER (WHERE type <> 'return')::bigint AS orders,
      count(*) FILTER (WHERE type = 'return')::bigint AS return_orders
    FROM invoice_facts GROUP BY brand_id
  ), discounts_by_brand AS MATERIALIZED (
    SELECT o.brand_id, COALESCE(sum(o.discount_amount), 0)::numeric AS discounts
    FROM public.orders o JOIN scoped_brands sb ON sb.id = o.brand_id
    WHERE o.occurred_at >= _from::timestamptz
      AND o.occurred_at < (_to + 1)::timestamptz
    GROUP BY o.brand_id
  ), scoped_expenses AS MATERIALIZED (
    SELECT e.brand_id, COALESCE(ec.name, '—') AS category_name, e.amount
    FROM public.expense_entries e
    JOIN scoped_brands sb ON sb.id = e.brand_id
    LEFT JOIN public.expense_categories ec ON ec.id = e.category_id
    WHERE e.posting_date BETWEEN _from AND _to
  ), expense_by_brand AS MATERIALIZED (
    SELECT brand_id, COALESCE(sum(amount), 0)::numeric AS expenses
    FROM scoped_expenses GROUP BY brand_id
  ), expense_category_by_brand AS MATERIALIZED (
    SELECT brand_id, category_name AS name, sum(amount)::numeric AS amount
    FROM scoped_expenses GROUP BY brand_id, category_name
  ), brand_rows AS MATERIALIZED (
    SELECT
      sb.id AS brand_id, sb.name AS brand_name, sb.type AS brand_type,
      COALESCE(ib.gross_revenue, 0)::numeric AS gross_revenue,
      COALESCE(ib.returns, 0)::numeric AS returns,
      COALESCE(db.discounts, 0)::numeric AS discounts,
      (COALESCE(ib.gross_revenue, 0) - COALESCE(ib.returns, 0))::numeric AS invoice_net_revenue,
      (COALESCE(ib.gross_revenue, 0) - COALESCE(ib.returns, 0) - COALESCE(db.discounts, 0))::numeric AS net_revenue,
      COALESCE(ib.cogs, 0)::numeric AS cogs,
      COALESCE(eb.expenses, 0)::numeric AS expenses,
      COALESCE(ib.orders, 0)::bigint AS orders,
      COALESCE(ib.return_orders, 0)::bigint AS return_orders,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('name', ecb.name, 'amount', ecb.amount) ORDER BY ecb.amount DESC, ecb.name)
        FROM expense_category_by_brand ecb WHERE ecb.brand_id = sb.id
      ), '[]'::jsonb) AS expense_categories
    FROM scoped_brands sb
    LEFT JOIN invoice_by_brand ib ON ib.brand_id = sb.id
    LEFT JOIN discounts_by_brand db ON db.brand_id = sb.id
    LEFT JOIN expense_by_brand eb ON eb.brand_id = sb.id
  ), category_totals AS (
    SELECT category_name AS name, sum(amount)::numeric AS amount
    FROM scoped_expenses GROUP BY category_name
  )
  SELECT jsonb_build_object(
    'from', _from, 'to', _to,
    'rows', COALESCE((SELECT jsonb_agg(to_jsonb(brand_rows) ORDER BY brand_name, brand_id) FROM brand_rows), '[]'::jsonb),
    'expenseCategories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', name, 'value', amount) ORDER BY amount DESC, name)
      FROM category_totals
    ), '[]'::jsonb),
    'totals', jsonb_build_object(
      'grossRevenue', COALESCE((SELECT sum(gross_revenue) FROM brand_rows), 0),
      'returns', COALESCE((SELECT sum(returns) FROM brand_rows), 0),
      'discounts', COALESCE((SELECT sum(discounts) FROM brand_rows), 0),
      'invoiceNetRevenue', COALESCE((SELECT sum(invoice_net_revenue) FROM brand_rows), 0),
      'netRevenue', COALESCE((SELECT sum(net_revenue) FROM brand_rows), 0),
      'cogs', COALESCE((SELECT sum(cogs) FROM brand_rows), 0),
      'expenses', COALESCE((SELECT sum(expenses) FROM brand_rows), 0),
      'orders', COALESCE((SELECT sum(orders) FROM brand_rows), 0),
      'returnOrders', COALESCE((SELECT sum(return_orders) FROM brand_rows), 0)
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.cash_flow_grouped(
  _from date,
  _to date,
  _brand_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', q.type, 'amount', q.amount, 'occurred_at', q.occurred_at, 'transfer_group', NULL
  ) ORDER BY q.occurred_at, q.type), '[]'::jsonb)
  FROM (
    SELECT m.type, sum(m.amount)::numeric AS amount,
      date_trunc('month', m.day::timestamptz) AS occurred_at
    FROM public.cash_daily_metrics m
    WHERE m.day BETWEEN _from AND _to
      AND public.can_read_page(auth.uid(), '/reports/cash-flow')
      AND (_brand_id IS NULL OR m.brand_key = _brand_id)
    GROUP BY m.type, date_trunc('month', m.day::timestamptz)
  ) q;
$$;

CREATE OR REPLACE FUNCTION public.cash_summary_report(
  _from date DEFAULT NULL,
  _to date DEFAULT NULL,
  _for_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH all_cash AS (
    SELECT COALESCE(sum(CASE WHEN type IN ('collection','deposit') THEN amount ELSE -amount END), 0)::numeric AS balance
    FROM public.cash_daily_metrics
    WHERE brand_key = '00000000-0000-0000-0000-000000000000'::uuid
      OR public.has_brand_access(auth.uid(), brand_key)
  ), wallet_opening AS (
    SELECT COALESCE(sum(opening_balance), 0)::numeric AS amount FROM public.wallets
  ), unlinked_all AS (
    SELECT COALESCE(sum(amount), 0)::numeric AS amount
    FROM public.expense_entries
    WHERE cash_transaction_id IS NULL
      AND (brand_id IS NULL OR public.has_brand_access(auth.uid(), brand_id))
  ), period_cash AS MATERIALIZED (
    SELECT * FROM public.cash_daily_metrics m
    WHERE (_from IS NULL OR m.day >= _from)
      AND (_to IS NULL OR m.day <= _to)
      AND (m.brand_key = '00000000-0000-0000-0000-000000000000'::uuid
        OR public.has_brand_access(auth.uid(), m.brand_key))
  ), period_cash_totals AS (
    SELECT
      COALESCE(sum(amount) FILTER (WHERE type IN ('collection','deposit')), 0)::numeric AS period_in,
      COALESCE(sum(amount) FILTER (WHERE type NOT IN ('collection','deposit')), 0)::numeric AS cash_out,
      COALESCE(sum(amount) FILTER (
        WHERE type = 'personal_withdrawal'
          AND (_for_user_id IS NULL OR user_key = _for_user_id)
      ), 0)::numeric AS personal_total
    FROM period_cash
  ), extra_period_expenses AS (
    SELECT COALESCE(sum(e.amount), 0)::numeric AS amount
    FROM public.expense_entries e
    WHERE (_from IS NULL OR e.effective_to >= _from)
      AND (_to IS NULL OR e.effective_from <= _to)
      AND (e.brand_id IS NULL OR public.has_brand_access(auth.uid(), e.brand_id))
      AND NOT EXISTS (
        SELECT 1 FROM public.cash_transactions ct
        WHERE ct.expense_entry_id = e.id
          AND (_from IS NULL OR ct.occurred_at >= _from::timestamptz)
          AND (_to IS NULL OR ct.occurred_at < (_to + 1)::timestamptz)
      )
  ), withdrawals_by_user AS (
    SELECT user_key AS "userId", sum(amount)::numeric AS total
    FROM period_cash
    WHERE type = 'personal_withdrawal'
      AND user_key <> '00000000-0000-0000-0000-000000000000'::uuid
    GROUP BY user_key
  ), courier_totals AS (
    SELECT courier_id, sum(owed)::numeric AS total_owed, sum(collected)::numeric AS total_collected
    FROM public.courier_financial_metrics
    WHERE public.courier_accessible_to_user(auth.uid(), courier_id)
    GROUP BY courier_id
  ), courier_debts AS (
    SELECT c.id, c.name, c.type, c.brand_id, c.active,
      COALESCE(cm.total_owed, 0)::numeric AS "totalOwed",
      COALESCE(cm.total_collected, 0)::numeric AS "totalCollected",
      (COALESCE(cm.total_owed, 0) - COALESCE(cm.total_collected, 0))::numeric AS remaining
    FROM public.couriers c LEFT JOIN courier_totals cm ON cm.courier_id = c.id
    WHERE public.courier_accessible_to_user(auth.uid(), c.id)
  )
  SELECT jsonb_build_object(
    'balance', (SELECT balance FROM all_cash) + (SELECT amount FROM wallet_opening) - (SELECT amount FROM unlinked_all),
    'periodIn', (SELECT period_in FROM period_cash_totals),
    'periodOut', (SELECT cash_out FROM period_cash_totals) + (SELECT amount FROM extra_period_expenses),
    'periodNet', (SELECT period_in - cash_out FROM period_cash_totals) - (SELECT amount FROM extra_period_expenses),
    'personalTotal', (SELECT personal_total FROM period_cash_totals),
    'byUser', COALESCE((SELECT jsonb_agg(to_jsonb(withdrawals_by_user) ORDER BY total DESC, "userId") FROM withdrawals_by_user), '[]'::jsonb),
    'courierDebts', COALESCE((SELECT jsonb_agg(to_jsonb(courier_debts) ORDER BY remaining DESC, id) FROM courier_debts), '[]'::jsonb)
  )
  WHERE public.can_read_page(auth.uid(), '/treasury');
$$;

CREATE OR REPLACE FUNCTION public.dashboard_operational_report(
  _from timestamptz,
  _to timestamptz,
  _brand_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH scoped_invoices AS MATERIALIZED (
    SELECT si.id, si.brand_id, si.product_id, si.type, si.qty, si.total_amount, si.occurred_at,
      COALESCE(b.cogs_percent_default, 0)::numeric AS default_cogs_pct
    FROM public.sales_invoices si
    JOIN public.brands b ON b.id = si.brand_id
    WHERE si.occurred_at >= _from AND si.occurred_at <= _to
      AND public.has_brand_access(auth.uid(), si.brand_id)
      AND (_brand_id IS NULL OR si.brand_id = _brand_id)
  ), distinct_products AS MATERIALIZED (
    SELECT DISTINCT product_id FROM (
      SELECT sii.product_id FROM public.sales_invoice_items sii
      JOIN scoped_invoices si ON si.id = sii.invoice_id WHERE sii.product_id IS NOT NULL
      UNION
      SELECT si.product_id FROM scoped_invoices si WHERE si.product_id IS NOT NULL
    ) p
  ), product_costs AS MATERIALIZED (
    SELECT product_id, COALESCE(public.product_cogs(product_id), 0)::numeric AS unit_cogs
    FROM distinct_products
  ), invoice_item_facts AS MATERIALIZED (
    SELECT si.id AS invoice_id,
      COALESCE(sum(pc.unit_cogs * sii.qty) FILTER (WHERE pc.unit_cogs > 0 AND sii.qty > 0), 0)::numeric AS product_cogs,
      COALESCE(sum(COALESCE(NULLIF(sii.subtotal, 0), sii.unit_price * sii.qty)) FILTER (WHERE pc.unit_cogs > 0 AND sii.qty > 0), 0)::numeric AS covered_revenue
    FROM scoped_invoices si
    LEFT JOIN public.sales_invoice_items sii ON sii.invoice_id = si.id
    LEFT JOIN product_costs pc ON pc.product_id = sii.product_id
    GROUP BY si.id
  ), invoice_facts AS MATERIALIZED (
    SELECT si.*,
      (iif.product_cogs + GREATEST(0, si.total_amount - iif.covered_revenue) * si.default_cogs_pct / 100)::numeric AS cogs
    FROM scoped_invoices si JOIN invoice_item_facts iif ON iif.invoice_id = si.id
  ), monthly_sales AS (
    SELECT extract(month FROM occurred_at)::integer AS month, brand_id AS "brandId",
      sum(CASE WHEN type = 'return' THEN -total_amount ELSE total_amount END)::numeric AS revenue,
      sum(CASE WHEN type = 'return' THEN -cogs ELSE cogs END)::numeric AS cogs
    FROM invoice_facts GROUP BY extract(month FROM occurred_at), brand_id
  ), item_product_sales AS (
    SELECT sii.product_id,
      sum(sii.qty) FILTER (WHERE si.type <> 'return')::numeric AS sold,
      sum(sii.qty) FILTER (WHERE si.type = 'return')::numeric AS returned
    FROM public.sales_invoice_items sii
    JOIN scoped_invoices si ON si.id = sii.invoice_id
    WHERE sii.product_id IS NOT NULL
    GROUP BY sii.product_id
  ), legacy_product_sales AS (
    SELECT si.product_id,
      sum(si.qty) FILTER (WHERE si.type <> 'return')::numeric AS sold,
      sum(si.qty) FILTER (WHERE si.type = 'return')::numeric AS returned
    FROM scoped_invoices si
    WHERE si.product_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.sales_invoice_items sii WHERE sii.invoice_id = si.id)
    GROUP BY si.product_id
  ), product_sales AS (
    SELECT product_id AS "productId", COALESCE(sum(sold), 0)::numeric AS sold,
      COALESCE(sum(returned), 0)::numeric AS returned
    FROM (
      SELECT * FROM item_product_sales UNION ALL SELECT * FROM legacy_product_sales
    ) p GROUP BY product_id
  ), monthly_orders AS (
    SELECT extract(month FROM o.occurred_at)::integer AS month,
      count(*)::bigint AS total,
      count(*) FILTER (WHERE o.confirmation_status = 'confirmed')::bigint AS confirmed,
      count(*) FILTER (WHERE o.fulfillment_status = 'delivered')::bigint AS delivered,
      count(*) FILTER (WHERE o.fulfillment_status = 'returned')::bigint AS returned
    FROM public.orders o
    WHERE o.occurred_at >= _from AND o.occurred_at <= _to
      AND public.has_brand_access(auth.uid(), o.brand_id)
      AND (_brand_id IS NULL OR o.brand_id = _brand_id)
    GROUP BY extract(month FROM o.occurred_at)
  ), courier_performance AS (
    SELECT c.id, c.name, c.type,
      count(o.id) FILTER (WHERE o.fulfillment_status = 'delivered')::bigint AS delivered,
      count(o.id) FILTER (WHERE o.fulfillment_status = 'returned')::bigint AS returned,
      COALESCE(sum(o.total_amount) FILTER (WHERE o.fulfillment_status = 'delivered'), 0)::numeric AS collected
    FROM public.couriers c
    LEFT JOIN public.orders o ON o.courier_id = c.id
      AND o.occurred_at >= _from AND o.occurred_at <= _to
      AND public.has_brand_access(auth.uid(), o.brand_id)
      AND (_brand_id IS NULL OR o.brand_id = _brand_id)
    WHERE c.active = true
      AND public.courier_accessible_to_user(auth.uid(), c.id)
    GROUP BY c.id, c.name, c.type
  ), inventory_products AS (
    SELECT im.product_id AS "productId",
      COALESCE(sum(CASE WHEN im.type IN ('production','return','adjustment') THEN im.qty ELSE -im.qty END), 0)::numeric AS stock,
      COALESCE(sum(im.qty) FILTER (WHERE im.type = 'production'), 0)::numeric AS produced
    FROM public.inventory_movements im
    JOIN public.products p ON p.id = im.product_id
    WHERE im.occurred_at >= _from AND im.occurred_at <= _to
      AND public.has_brand_access(auth.uid(), p.brand_id)
      AND (_brand_id IS NULL OR p.brand_id = _brand_id)
    GROUP BY im.product_id
  ), workers AS (
    SELECT im.worker_name AS name, sum(im.qty)::numeric AS produced,
      count(DISTINCT im.product_id)::bigint AS "productCount"
    FROM public.inventory_movements im
    JOIN public.products p ON p.id = im.product_id
    WHERE im.type = 'production' AND NULLIF(btrim(im.worker_name), '') IS NOT NULL
      AND im.occurred_at >= _from AND im.occurred_at <= _to
      AND public.has_brand_access(auth.uid(), p.brand_id)
      AND (_brand_id IS NULL OR p.brand_id = _brand_id)
    GROUP BY im.worker_name
  ), fulfillment AS (
    SELECT fe.employee_name AS name, sum(fe.orders_prepared)::numeric AS prepared,
      count(DISTINCT fe.occurred_at)::bigint AS days
    FROM public.fulfillment_entries fe
    WHERE fe.occurred_at >= _from::date AND fe.occurred_at <= _to::date
      AND public.has_brand_access(auth.uid(), fe.brand_id)
      AND (_brand_id IS NULL OR fe.brand_id = _brand_id)
      AND NULLIF(btrim(fe.employee_name), '') IS NOT NULL
    GROUP BY fe.employee_name
  )
  SELECT jsonb_build_object(
    'monthlySales', COALESCE((SELECT jsonb_agg(to_jsonb(monthly_sales) ORDER BY month, "brandId") FROM monthly_sales), '[]'::jsonb),
    'productSales', COALESCE((SELECT jsonb_agg(to_jsonb(product_sales) ORDER BY "productId") FROM product_sales), '[]'::jsonb),
    'monthlyOrders', COALESCE((SELECT jsonb_agg(to_jsonb(monthly_orders) ORDER BY month) FROM monthly_orders), '[]'::jsonb),
    'couriers', COALESCE((SELECT jsonb_agg(to_jsonb(courier_performance) ORDER BY delivered DESC, id) FROM courier_performance), '[]'::jsonb),
    'inventoryProducts', COALESCE((SELECT jsonb_agg(to_jsonb(inventory_products) ORDER BY "productId") FROM inventory_products), '[]'::jsonb),
    'workers', COALESCE((SELECT jsonb_agg(to_jsonb(workers) ORDER BY produced DESC, name) FROM workers), '[]'::jsonb),
    'fulfillment', COALESCE((SELECT jsonb_agg(to_jsonb(fulfillment) ORDER BY prepared DESC, name) FROM fulfillment), '[]'::jsonb)
  )
  WHERE public.can_read_page(auth.uid(), '/dashboard')
    AND (_brand_id IS NULL OR public.has_brand_access(auth.uid(), _brand_id));
$$;

CREATE OR REPLACE FUNCTION public.revenue_comparison_report(
  _year integer,
  _brand_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH manual AS (
    SELECT me.brand_id, me.month, sum(me.revenue)::numeric AS amount
    FROM public.monthly_entries me
    WHERE me.year = _year
      AND public.can_read_page(auth.uid(), '/reports/revenue-comparison')
      AND public.has_brand_access(auth.uid(), me.brand_id)
      AND me.period_type <> 'yearly'
      AND (_brand_id IS NULL OR me.brand_id = _brand_id)
    GROUP BY me.brand_id, me.month
  ), invoices AS (
    SELECT
      si.brand_id,
      extract(month FROM si.occurred_at)::integer AS month,
      sum(CASE WHEN si.type = 'return' THEN -si.total_amount ELSE si.total_amount END)::numeric AS amount
    FROM public.sales_invoices si
    WHERE si.occurred_at >= make_date(_year, 1, 1)::timestamptz
      AND public.can_read_page(auth.uid(), '/reports/revenue-comparison')
      AND public.has_brand_access(auth.uid(), si.brand_id)
      AND si.occurred_at < make_date(_year + 1, 1, 1)::timestamptz
      AND (_brand_id IS NULL OR si.brand_id = _brand_id)
    GROUP BY si.brand_id, extract(month FROM si.occurred_at)
  ), cells AS (
    SELECT
      COALESCE(m.brand_id, i.brand_id) AS brand_id,
      COALESCE(m.month, i.month) AS month,
      COALESCE(m.amount, 0)::numeric AS manual,
      COALESCE(i.amount, 0)::numeric AS invoices
    FROM manual m FULL OUTER JOIN invoices i
      ON i.brand_id = m.brand_id AND i.month = m.month
  ), rows AS (
    SELECT
      c.brand_id AS "brandId", COALESCE(b.name, '—') AS "brandName", c.month,
      c.manual, c.invoices, (c.manual - c.invoices)::numeric AS diff,
      abs(c.manual - c.invoices)::numeric AS "absDiff"
    FROM cells c LEFT JOIN public.brands b ON b.id = c.brand_id
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((SELECT jsonb_agg(to_jsonb(rows) ORDER BY "brandName", "brandId", month) FROM rows), '[]'::jsonb),
    'totals', jsonb_build_object(
      'manual', COALESCE((SELECT sum(manual) FROM rows), 0),
      'invoices', COALESCE((SELECT sum(invoices) FROM rows), 0),
      'diff', COALESCE((SELECT sum(diff) FROM rows), 0)
    ),
    'year', _year
  );
$$;

REVOKE ALL ON FUNCTION public.orders_page(timestamptz,timestamptz,uuid,text,text,timestamptz,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.orders_page(timestamptz,timestamptz,uuid,text,text,timestamptz,uuid,integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.orders_summary(timestamptz,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.orders_summary(timestamptz,timestamptz,uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.customers_page(text,text,uuid,timestamptz,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customers_page(text,text,uuid,timestamptz,uuid,integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.customers_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customers_summary() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.orders_filter_summary(timestamptz,timestamptz,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.orders_filter_summary(timestamptz,timestamptz,uuid,text,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.customers_filter_summary(text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customers_filter_summary(text,text,uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.accounting_profit_report(date,date,uuid,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accounting_profit_report(date,date,uuid,uuid[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.cash_flow_grouped(date,date,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cash_flow_grouped(date,date,uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.cash_summary_report(date,date,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cash_summary_report(date,date,uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.dashboard_operational_report(timestamptz,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_operational_report(timestamptz,timestamptz,uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.revenue_comparison_report(integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revenue_comparison_report(integer,uuid) TO authenticated, service_role;
