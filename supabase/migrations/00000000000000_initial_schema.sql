-- ===================== EXTENSION =====================

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ===================== TYPE =====================

-- Baseline schema for e-Gurus OS (public schema).
-- Generated from the live database as a single clean-start migration.
-- Every statement is idempotent so replays never fail on existing objects.

-- schema "public" is provided by the platform; nothing to create here.

DO $mig$ BEGIN
CREATE TYPE public.app_role AS ENUM (
    'admin',
    'member',
    'manager',
    'data_entry',
    'viewer',
    'education',
    'accountant',
    'investor',
    'order_prep',
    'production_manager',
    'hr',
    'sales_man',
    'project_manager',
    'operation_manager',
    'fulfillment_manager',
    'branch_manager',
    'team_leader',
    'production_worker',
    'moderator',
    'customer_service'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

DO $mig$ BEGIN
CREATE TYPE public.brand_type AS ENUM (
    'product',
    'service',
    'offline_branch'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

DO $mig$ BEGIN
CREATE TYPE public.cash_txn_type AS ENUM (
    'collection',
    'personal_withdrawal',
    'deposit',
    'other_out'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

DO $mig$ BEGIN
CREATE TYPE public.courier_type AS ENUM (
    'courier_company',
    'rep',
    'offline_branch'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

DO $mig$ BEGIN
CREATE TYPE public.employee_request_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

DO $mig$ BEGIN
CREATE TYPE public.employee_request_type AS ENUM (
    'leave',
    'advance'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

DO $mig$ BEGIN
CREATE TYPE public.inventory_movement_type AS ENUM (
    'production',
    'sale',
    'return',
    'adjustment',
    'supplier_return'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

DO $mig$ BEGIN
CREATE TYPE public.invoice_status AS ENUM (
    'open',
    'partial',
    'paid'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

DO $mig$ BEGIN
CREATE TYPE public.marketing_platform AS ENUM (
    'tiktok',
    'meta',
    'google',
    'snapchat',
    'whatsapp',
    'sms',
    'other',
    'influencer',
    'ugc',
    'media_production'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

DO $mig$ BEGIN
CREATE TYPE public.sales_invoice_stage AS ENUM (
    'new',
    'processing',
    'packing',
    'ready_to_ship',
    'with_courier',
    'delivered',
    'cancelled'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

DO $mig$ BEGIN
CREATE TYPE public.sales_invoice_type AS ENUM (
    'sale',
    'return'
);
EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;

-- ===================== TABLE =====================

CREATE TABLE IF NOT EXISTS public.app_user_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    connector_id text NOT NULL,
    connection_key_ciphertext text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.articles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    cover_image_url text,
    links jsonb DEFAULT '[]'::jsonb NOT NULL,
    images jsonb DEFAULT '[]'::jsonb NOT NULL,
    published boolean DEFAULT false NOT NULL,
    author_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bh_brand_access (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    brand_id uuid NOT NULL,
    sections text[],
    hidden_resource_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    hidden_wiki_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bh_brands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    tagline text DEFAULT ''::text NOT NULL,
    accent text DEFAULT '#3FDBB1'::text NOT NULL,
    bg text DEFAULT '#0E7C7B'::text NOT NULL,
    logo_path text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bh_creative_likes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    post_id uuid,
    comment_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bh_creative_post_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    parent_id uuid,
    author_id uuid,
    body text NOT NULL,
    hidden boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bh_creative_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_id uuid,
    brand_id uuid,
    kind text DEFAULT 'post'::text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    image_path text,
    file_path text,
    file_name text,
    link_url text,
    mime_type text,
    hidden boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bh_creative_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reporter_id uuid,
    post_id uuid,
    comment_id uuid,
    reason text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bh_resources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand_id uuid NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    file_type text DEFAULT 'html'::text NOT NULL,
    html_content text,
    storage_path text,
    url text,
    mime_type text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bh_task_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    title text NOT NULL,
    storage_path text,
    url text,
    mime_type text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bh_task_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    author_id uuid,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bh_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'todo'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    cadence text DEFAULT 'once'::text NOT NULL,
    due_date date,
    completed_at timestamp with time zone,
    assignee_id uuid,
    brand_id uuid,
    created_by uuid,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bh_wiki_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand_id uuid NOT NULL,
    title text NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.brand_integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand_id uuid NOT NULL,
    provider text NOT NULL,
    status text DEFAULT 'disconnected'::text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    credentials_ciphertext text,
    last_sync_at timestamp with time zone,
    last_sync_summary jsonb,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.brands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    type public.brand_type DEFAULT 'product'::public.brand_type NOT NULL,
    active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cogs_percent_default numeric
);

CREATE TABLE IF NOT EXISTS public.cash_daily_metrics (
    day date NOT NULL,
    brand_key uuid NOT NULL,
    type text NOT NULL,
    user_key uuid NOT NULL,
    amount numeric DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.cash_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type public.cash_txn_type NOT NULL,
    amount numeric NOT NULL,
    occurred_at date DEFAULT ((now() AT TIME ZONE 'Africa/Cairo'::text))::date NOT NULL,
    brand_id uuid,
    courier_id uuid,
    for_user_id uuid,
    created_by uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    category_id uuid,
    expense_entry_id uuid,
    wallet_id uuid,
    transfer_group uuid,
    CONSTRAINT cash_transactions_amount_check CHECK ((amount >= (0)::numeric))
);

CREATE TABLE IF NOT EXISTS public.company_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand_id uuid,
    name text NOT NULL,
    cost numeric(14,2) DEFAULT 0 NOT NULL,
    purchase_date date DEFAULT CURRENT_DATE NOT NULL,
    annual_depreciation_rate numeric(6,2) DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.courier_brands (
    courier_id uuid NOT NULL,
    brand_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.courier_charges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    brand_id uuid NOT NULL,
    courier_id uuid NOT NULL,
    rate_id uuid,
    charge_type text NOT NULL,
    amount numeric NOT NULL,
    rate_missing boolean DEFAULT false NOT NULL,
    accrued_at timestamp with time zone DEFAULT now() NOT NULL,
    settled_at timestamp with time zone,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT courier_charges_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT courier_charges_charge_type_check CHECK ((charge_type = ANY (ARRAY['delivery'::text, 'customer_return'::text, 'failed_delivery'::text, 'exchange'::text, 'legacy_return'::text])))
);

CREATE TABLE IF NOT EXISTS public.courier_financial_metrics (
    courier_id uuid NOT NULL,
    brand_key uuid NOT NULL,
    owed numeric DEFAULT 0 NOT NULL,
    collected numeric DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.courier_governorate_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    courier_id uuid NOT NULL,
    governorate text NOT NULL,
    delivery_fee numeric NOT NULL,
    return_fee numeric NOT NULL,
    active boolean DEFAULT true NOT NULL,
    effective_from date DEFAULT CURRENT_DATE NOT NULL,
    effective_to date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    customer_return_fee numeric DEFAULT 0 NOT NULL,
    failed_delivery_fee numeric DEFAULT 0 NOT NULL,
    exchange_fee numeric DEFAULT 0 NOT NULL,
    CONSTRAINT courier_governorate_rates_check CHECK (((effective_to IS NULL) OR (effective_to >= effective_from))),
    CONSTRAINT courier_governorate_rates_customer_return_fee_check CHECK ((customer_return_fee >= (0)::numeric)),
    CONSTRAINT courier_governorate_rates_delivery_fee_check CHECK ((delivery_fee >= (0)::numeric)),
    CONSTRAINT courier_governorate_rates_exchange_fee_check CHECK ((exchange_fee >= (0)::numeric)),
    CONSTRAINT courier_governorate_rates_failed_delivery_fee_check CHECK ((failed_delivery_fee >= (0)::numeric)),
    CONSTRAINT courier_governorate_rates_governorate_check CHECK ((btrim(governorate) <> ''::text)),
    CONSTRAINT courier_governorate_rates_return_fee_check CHECK ((return_fee >= (0)::numeric))
);

CREATE TABLE IF NOT EXISTS public.courier_settlement_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    settlement_id uuid NOT NULL,
    brand_id uuid NOT NULL,
    order_id uuid,
    tracking text,
    order_number text,
    declared_amount numeric DEFAULT 0 NOT NULL,
    shipping_fee numeric DEFAULT 0 NOT NULL,
    net_amount numeric DEFAULT 0 NOT NULL,
    system_amount numeric DEFAULT 0 NOT NULL,
    match_status text DEFAULT 'unmatched'::text NOT NULL,
    diff_reason text,
    posted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.courier_settlements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand_id uuid NOT NULL,
    courier_id uuid,
    reference text,
    period_from date,
    period_to date,
    declared_total numeric DEFAULT 0 NOT NULL,
    matched_total numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.courier_status_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    courier_id uuid NOT NULL,
    raw_status text NOT NULL,
    raw_collection_status text DEFAULT ''::text NOT NULL,
    order_status text NOT NULL,
    collection_status text NOT NULL,
    shipment_outcome text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT courier_status_mappings_collection_status_check CHECK ((collection_status = ANY (ARRAY['processing'::text, 'unavailable'::text, 'paid'::text, 'unpaid'::text]))),
    CONSTRAINT courier_status_mappings_order_status_check CHECK ((order_status = ANY (ARRAY['new'::text, 'processing'::text, 'postponed'::text, 'awaiting_response'::text, 'succeeded'::text, 'cancelled'::text]))),
    CONSTRAINT courier_status_mappings_shipment_outcome_check CHECK ((shipment_outcome = ANY (ARRAY['open'::text, 'delivered'::text, 'returned'::text, 'cancelled_before_dispatch'::text])))
);

CREATE TABLE IF NOT EXISTS public.couriers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type public.courier_type DEFAULT 'courier_company'::public.courier_type NOT NULL,
    contact text,
    brand_id uuid,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    opening_balance numeric DEFAULT 0 NOT NULL,
    serves_all_brands boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.customer_brands (
    customer_id uuid NOT NULL,
    brand_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.customer_metrics (
    customer_id uuid NOT NULL,
    brand_id uuid NOT NULL,
    ltv numeric DEFAULT 0 NOT NULL,
    orders_count bigint DEFAULT 0 NOT NULL,
    first_order_at timestamp with time zone,
    last_order_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.customer_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    author_id uuid,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    phone_norm text GENERATED ALWAYS AS (regexp_replace(COALESCE(phone, ''::text), '\D'::text, ''::text, 'g'::text)) STORED,
    email_norm text GENERATED ALWAYS AS (lower(COALESCE(email, ''::text))) STORED,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    governorate text,
    is_general boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.employee_attendance_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    days_absent numeric DEFAULT 0 NOT NULL,
    days_vacation numeric DEFAULT 0 NOT NULL,
    times_late integer DEFAULT 0 NOT NULL,
    deductions numeric DEFAULT 0 NOT NULL,
    bonuses numeric DEFAULT 0 NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    approved boolean DEFAULT false NOT NULL,
    CONSTRAINT employee_attendance_entries_month_check CHECK (((month >= 1) AND (month <= 12)))
);

CREATE TABLE IF NOT EXISTS public.employee_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    employee_id uuid,
    type public.employee_request_type NOT NULL,
    requested_date date NOT NULL,
    amount numeric,
    note text,
    proof_url text,
    status public.employee_request_status DEFAULT 'pending'::public.employee_request_status NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    review_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.employee_time_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    log_date date NOT NULL,
    check_in time without time zone,
    check_out time without time zone,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    brand_id uuid NOT NULL,
    "position" text,
    active boolean DEFAULT true NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    salary numeric DEFAULT 0 NOT NULL,
    work_start_time time without time zone,
    work_end_time time without time zone,
    monthly_work_hours numeric,
    off_days smallint[] DEFAULT ARRAY[(5)::smallint],
    hourly_rate numeric,
    user_id uuid
);

CREATE TABLE IF NOT EXISTS public.expense_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.expense_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand_id uuid NOT NULL,
    category_id uuid NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    platform public.marketing_platform,
    attributed_revenue numeric DEFAULT 0 NOT NULL,
    period_type text DEFAULT 'monthly'::text NOT NULL,
    period_date date,
    period_end_date date,
    attendance_id uuid,
    cash_transaction_id uuid,
    posting_date date GENERATED ALWAYS AS (COALESCE(period_date, make_date(year, month, 15))) STORED,
    effective_from date GENERATED ALWAYS AS (COALESCE(period_date, make_date(year, month, 1))) STORED,
    effective_to date GENERATED ALWAYS AS (COALESCE(period_end_date,
CASE
    WHEN ((period_type = 'weekly'::text) AND (period_date IS NOT NULL)) THEN (period_date + 6)
    WHEN (period_type = 'yearly'::text) THEN make_date(year, 12, 31)
    WHEN (period_date IS NOT NULL) THEN period_date
    ELSE ((make_date(year, month, 1) + '1 mon -1 days'::interval))::date
END)) STORED,
    CONSTRAINT expense_entries_month_check CHECK (((month >= 1) AND (month <= 12))),
    CONSTRAINT expense_entries_period_type_check CHECK ((period_type = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text, 'yearly'::text, 'custom'::text])))
);

CREATE TABLE IF NOT EXISTS public.financial_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_name text NOT NULL,
    record_id uuid,
    operation text NOT NULL,
    actor_id uuid,
    old_data jsonb,
    new_data jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT financial_audit_log_operation_check CHECK ((operation = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
);

CREATE TABLE IF NOT EXISTS public.financial_audit_log_archive (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_name text NOT NULL,
    record_id uuid,
    operation text NOT NULL,
    actor_id uuid,
    old_data jsonb,
    new_data jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT financial_audit_log_operation_check CHECK ((operation = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
);

CREATE TABLE IF NOT EXISTS public.fulfillment_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand_id uuid,
    employee_name text NOT NULL,
    orders_prepared integer DEFAULT 0 NOT NULL,
    occurred_at date DEFAULT CURRENT_DATE NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    employee_id uuid
);

CREATE TABLE IF NOT EXISTS public.integration_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    provider text NOT NULL,
    brand_id uuid,
    direction text NOT NULL,
    operation text NOT NULL,
    order_number text,
    order_id uuid,
    tracking_number text,
    status text NOT NULL,
    http_status integer,
    reason text,
    request jsonb,
    response jsonb,
    metadata jsonb,
    actor_id uuid,
    CONSTRAINT integration_logs_direction_check CHECK ((direction = ANY (ARRAY['outgoing'::text, 'incoming'::text, 'webhook'::text, 'internal'::text]))),
    CONSTRAINT integration_logs_status_check CHECK ((status = ANY (ARRAY['success'::text, 'error'::text, 'info'::text, 'warning'::text])))
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    type public.inventory_movement_type NOT NULL,
    qty numeric NOT NULL,
    occurred_at date DEFAULT CURRENT_DATE NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    worker_name text,
    employee_id uuid,
    unit_cost numeric,
    material_id uuid,
    reason text,
    source text DEFAULT 'manual'::text NOT NULL,
    source_id uuid,
    created_by uuid DEFAULT auth.uid()
);

CREATE TABLE IF NOT EXISTS public.investor_brand_shares (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    investor_id uuid NOT NULL,
    brand_id uuid NOT NULL,
    share_percentage numeric(6,3) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT investor_brand_shares_share_percentage_check CHECK (((share_percentage > (0)::numeric) AND (share_percentage <= (100)::numeric)))
);

CREATE TABLE IF NOT EXISTS public.investors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text,
    phone text,
    notes text,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.material_brands (
    material_id uuid NOT NULL,
    brand_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    unit text DEFAULT 'piece'::text NOT NULL,
    unit_cost numeric DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sku text,
    on_hand_qty numeric DEFAULT 0 NOT NULL,
    reorder_point numeric DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.monthly_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand_id uuid NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    revenue numeric DEFAULT 0 NOT NULL,
    cash_position numeric DEFAULT 0 NOT NULL,
    orders_total integer DEFAULT 0 NOT NULL,
    orders_confirmed integer DEFAULT 0 NOT NULL,
    orders_delivered integer DEFAULT 0 NOT NULL,
    orders_returned integer DEFAULT 0 NOT NULL,
    service_clients integer DEFAULT 0 NOT NULL,
    service_projects integer DEFAULT 0 NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    period_type text DEFAULT 'monthly'::text NOT NULL,
    period_date date,
    period_end_date date,
    CONSTRAINT monthly_entries_month_check CHECK (((month >= 1) AND (month <= 12)))
);

CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    body text,
    link text,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.order_assignment_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    previous_employee_id uuid,
    employee_id uuid,
    courier_id uuid,
    method text DEFAULT 'manual'::text NOT NULL,
    reason text,
    performed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_user_id uuid,
    previous_assigned_user_id uuid
);

CREATE TABLE IF NOT EXISTS public.order_collections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    shipment_id uuid,
    brand_id uuid NOT NULL,
    courier_id uuid,
    amount numeric DEFAULT 0 NOT NULL,
    method text DEFAULT 'cod'::text NOT NULL,
    collected_at timestamp with time zone DEFAULT now() NOT NULL,
    note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.order_confirmation_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    brand_id uuid NOT NULL,
    channel text DEFAULT 'call'::text NOT NULL,
    outcome text NOT NULL,
    reason text,
    note text,
    attempted_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid,
    sku text,
    title text NOT NULL,
    qty numeric DEFAULT 1 NOT NULL,
    unit_price numeric DEFAULT 0 NOT NULL,
    unit_cost numeric DEFAULT 0 NOT NULL,
    subtotal numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.order_lifecycle_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    brand_id uuid NOT NULL,
    source text NOT NULL,
    actor_id uuid,
    from_order_status text,
    to_order_status text NOT NULL,
    from_collection_status text,
    to_collection_status text NOT NULL,
    from_shipment_outcome text,
    to_shipment_outcome text NOT NULL,
    raw_status text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_lifecycle_events_source_check CHECK ((source = ANY (ARRAY['system'::text, 'manual'::text, 'bosta'::text, 'shopify'::text])))
);

CREATE TABLE IF NOT EXISTS public.order_returns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    brand_id uuid NOT NULL,
    kind text DEFAULT 'return'::text NOT NULL,
    reason text,
    status text DEFAULT 'requested'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    received_at timestamp with time zone,
    restocked boolean DEFAULT false NOT NULL,
    restocked_at timestamp with time zone,
    refund_amount numeric DEFAULT 0 NOT NULL,
    refunded_at timestamp with time zone,
    note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.order_shipments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    brand_id uuid NOT NULL,
    courier_id uuid,
    attempt_no integer DEFAULT 1 NOT NULL,
    tracking text,
    status text DEFAULT 'created'::text NOT NULL,
    expected_cod numeric DEFAULT 0 NOT NULL,
    shipping_fee numeric DEFAULT 0 NOT NULL,
    shipped_at timestamp with time zone,
    delivered_at timestamp with time zone,
    returned_at timestamp with time zone,
    note text,
    raw jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.order_sla_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stage text NOT NULL,
    max_hours integer DEFAULT 24 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.order_source_payloads (
    id bigint NOT NULL,
    order_id uuid NOT NULL,
    brand_id uuid NOT NULL,
    source text NOT NULL,
    payload jsonb NOT NULL,
    payload_hash text NOT NULL,
    payload_bytes integer NOT NULL,
    archived_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand_id uuid NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    external_id text,
    external_order_number text,
    customer_id uuid,
    customer_name text,
    customer_phone text,
    customer_email text,
    shipping_governorate text,
    shipping_address text,
    courier_id uuid,
    employee_id uuid,
    invoice_id uuid,
    financial_status text DEFAULT 'pending'::text NOT NULL,
    fulfillment_status text DEFAULT 'unfulfilled'::text NOT NULL,
    subtotal_amount numeric DEFAULT 0 NOT NULL,
    shipping_amount numeric DEFAULT 0 NOT NULL,
    discount_amount numeric DEFAULT 0 NOT NULL,
    total_amount numeric DEFAULT 0 NOT NULL,
    cost_total numeric DEFAULT 0 NOT NULL,
    currency text DEFAULT 'EGP'::text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    note text,
    raw jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    confirmation_status text DEFAULT 'pending'::text NOT NULL,
    building_number text,
    floor_number text,
    apartment_number text,
    order_status text DEFAULT 'new'::text NOT NULL,
    collection_status text DEFAULT 'processing'::text NOT NULL,
    shipment_outcome text DEFAULT 'open'::text NOT NULL,
    courier_status_raw text,
    courier_collection_status_raw text,
    courier_expense numeric DEFAULT 0 NOT NULL,
    shopify_sync_status text DEFAULT 'not_applicable'::text NOT NULL,
    shopify_sync_error text,
    lifecycle_source text DEFAULT 'system'::text NOT NULL,
    lifecycle_updated_by uuid,
    lifecycle_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    bosta_tracking text,
    bosta_delivery_id text,
    bosta_sent_at timestamp with time zone,
    bosta_manual_attached_at timestamp with time zone,
    bosta_event_at timestamp with time zone,
    dispatch_tracking text,
    dispatch_claim_token uuid,
    dispatch_claimed_by uuid,
    dispatch_claimed_at timestamp with time zone,
    assigned_user_id uuid,
    CONSTRAINT orders_collection_status_check CHECK ((collection_status = ANY (ARRAY['processing'::text, 'unavailable'::text, 'paid'::text, 'unpaid'::text]))),
    CONSTRAINT orders_confirmation_status_check CHECK ((confirmation_status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'cancelled'::text]))),
    CONSTRAINT orders_courier_expense_check CHECK ((courier_expense >= (0)::numeric)),
    CONSTRAINT orders_lifecycle_source_check CHECK ((lifecycle_source = ANY (ARRAY['system'::text, 'manual'::text, 'bosta'::text, 'shopify'::text]))),
    CONSTRAINT orders_order_status_check CHECK ((order_status = ANY (ARRAY['new'::text, 'processing'::text, 'postponed'::text, 'awaiting_response'::text, 'succeeded'::text, 'cancelled'::text]))),
    CONSTRAINT orders_shipment_outcome_check CHECK ((shipment_outcome = ANY (ARRAY['open'::text, 'delivered'::text, 'returned'::text, 'customer_returned'::text, 'exchanged'::text, 'cancelled_before_dispatch'::text]))),
    CONSTRAINT orders_shopify_sync_status_check CHECK ((shopify_sync_status = ANY (ARRAY['not_applicable'::text, 'pending'::text, 'synced'::text, 'error'::text])))
);

CREATE TABLE IF NOT EXISTS public.product_materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    material_id uuid NOT NULL,
    qty_per_unit numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.production_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'todo'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    due_date date,
    assignee_id uuid,
    brand_id uuid,
    created_by uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT production_tasks_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT production_tasks_status_check CHECK ((status = ANY (ARRAY['todo'::text, 'in_progress'::text, 'done'::text])))
);

CREATE TABLE IF NOT EXISTS public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand_id uuid NOT NULL,
    name text NOT NULL,
    sku text,
    sell_price numeric DEFAULT 0 NOT NULL,
    cogs_override numeric,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    unit text DEFAULT 'piece'::text NOT NULL,
    reorder_point numeric DEFAULT 0 NOT NULL,
    lead_time_days integer DEFAULT 7 NOT NULL,
    cogs_percent numeric,
    moving_avg_cost numeric,
    on_hand_qty numeric DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.project_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    parent_id uuid,
    author_id uuid,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.project_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand_id uuid NOT NULL,
    project_id uuid,
    kind text DEFAULT 'shoot'::text NOT NULL,
    title text NOT NULL,
    resource text,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.project_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    source text DEFAULT 'link'::text NOT NULL,
    mime text,
    thumbnail text,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.project_private_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    author_id uuid,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.project_revisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    title text NOT NULL,
    body text,
    status text DEFAULT 'open'::text NOT NULL,
    requested_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.project_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'todo'::text NOT NULL,
    assignee_id uuid,
    due_date date,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    purchase_order_id uuid NOT NULL,
    product_id uuid,
    material_id uuid,
    qty numeric NOT NULL,
    unit_cost numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchase_order_items_check CHECK (((product_id IS NOT NULL) OR (material_id IS NOT NULL))),
    CONSTRAINT purchase_order_items_qty_check CHECK ((qty > (0)::numeric))
);

CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_id uuid NOT NULL,
    brand_id uuid,
    status text DEFAULT 'draft'::text NOT NULL,
    expected_delivery_at date,
    note text,
    invoice_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchase_orders_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'awaiting_delivery'::text, 'completed'::text, 'cancelled'::text])))
);

CREATE TABLE IF NOT EXISTS public.sales_invoice_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    product_id uuid,
    qty numeric DEFAULT 1 NOT NULL,
    unit_price numeric DEFAULT 0 NOT NULL,
    subtotal numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.sales_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand_id uuid NOT NULL,
    courier_id uuid,
    product_id uuid,
    type public.sales_invoice_type DEFAULT 'sale'::public.sales_invoice_type NOT NULL,
    qty numeric DEFAULT 1 NOT NULL,
    total_amount numeric DEFAULT 0 NOT NULL,
    collected_amount numeric DEFAULT 0 NOT NULL,
    occurred_at date DEFAULT CURRENT_DATE NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    customer_id uuid,
    customer_name text,
    customer_phone text,
    customer_email text,
    stage public.sales_invoice_stage DEFAULT 'new'::public.sales_invoice_stage NOT NULL,
    stage_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    prep_assignee_id uuid,
    sold_by uuid,
    payment_method text,
    cash_amount numeric DEFAULT 0 NOT NULL,
    card_amount numeric DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.service_clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand_id uuid NOT NULL,
    name text NOT NULL,
    contact text,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT service_clients_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);

CREATE TABLE IF NOT EXISTS public.service_projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand_id uuid NOT NULL,
    client_id uuid NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'in_progress'::text NOT NULL,
    pricing_type text DEFAULT 'fixed'::text NOT NULL,
    cost numeric DEFAULT 0 NOT NULL,
    commission numeric DEFAULT 0 NOT NULL,
    started_at date,
    finished_at date,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deadline date,
    priority text DEFAULT 'normal'::text NOT NULL,
    progress_pct integer DEFAULT 0 NOT NULL,
    pm_user_id uuid,
    description text,
    invoice_id uuid,
    CONSTRAINT service_projects_pricing_type_check CHECK ((pricing_type = ANY (ARRAY['fixed'::text, 'commission'::text]))),
    CONSTRAINT service_projects_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'review'::text, 'done'::text, 'cancelled'::text])))
);

CREATE TABLE IF NOT EXISTS public.supplier_brands (
    supplier_id uuid NOT NULL,
    brand_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.supplier_invoice_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    kind text NOT NULL,
    product_id uuid,
    material_id uuid,
    description text,
    qty numeric DEFAULT 1 NOT NULL,
    unit_cost numeric DEFAULT 0 NOT NULL,
    subtotal numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supplier_invoice_items_kind_check CHECK ((kind = ANY (ARRAY['product'::text, 'material'::text, 'other'::text])))
);

CREATE TABLE IF NOT EXISTS public.supplier_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_id uuid NOT NULL,
    brand_id uuid,
    amount numeric DEFAULT 0 NOT NULL,
    issued_at date DEFAULT CURRENT_DATE NOT NULL,
    due_at date,
    status public.invoice_status DEFAULT 'open'::public.invoice_status NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    type text DEFAULT 'purchase'::text NOT NULL,
    CONSTRAINT supplier_invoices_type_check CHECK ((type = ANY (ARRAY['purchase'::text, 'return'::text])))
);

CREATE TABLE IF NOT EXISTS public.supplier_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid,
    amount numeric DEFAULT 0 NOT NULL,
    paid_at date DEFAULT CURRENT_DATE NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cash_transaction_id uuid,
    supplier_id uuid,
    CONSTRAINT supplier_payments_supplier_or_invoice_ck CHECK (((supplier_id IS NOT NULL) OR (invoice_id IS NOT NULL)))
);

CREATE TABLE IF NOT EXISTS public.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    contact text,
    notes text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    brand_id uuid,
    opening_balance numeric DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'todo'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    due_date date,
    assignee_id uuid,
    created_by uuid,
    brand_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT tasks_status_check CHECK ((status = ANY (ARRAY['todo'::text, 'in_progress'::text, 'done'::text])))
);

CREATE TABLE IF NOT EXISTS public.user_brand_access (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    brand_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_section_access (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    section text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id uuid NOT NULL,
    can_write boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_sheet_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    spreadsheet_id text NOT NULL,
    spreadsheet_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    attendance_range text
);

CREATE TABLE IF NOT EXISTS public.wallets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    kind text DEFAULT 'cash'::text NOT NULL,
    opening_balance numeric DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wallets_kind_check CHECK ((kind = ANY (ARRAY['cash'::text, 'bank'::text, 'ewallet'::text])))
);

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid NOT NULL,
    brand_id uuid NOT NULL,
    direction text DEFAULT 'out'::text NOT NULL,
    body text,
    media_url text,
    wa_message_id text,
    status text DEFAULT 'queued'::text NOT NULL,
    error text,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand_id uuid,
    name text NOT NULL,
    event_key text NOT NULL,
    body text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    auto_send boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.whatsapp_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand_id uuid NOT NULL,
    customer_id uuid,
    order_id uuid,
    phone text NOT NULL,
    display_name text,
    wa_conversation_id text,
    status text DEFAULT 'open'::text NOT NULL,
    unread_count integer DEFAULT 0 NOT NULL,
    last_message_at timestamp with time zone,
    last_message_preview text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.order_source_payloads ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.order_source_payloads_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- ===================== PK_UNIQUE =====================

DO $mig$ BEGIN
ALTER TABLE ONLY public.app_user_connections
    ADD CONSTRAINT app_user_connections_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.app_user_connections
    ADD CONSTRAINT app_user_connections_user_id_connector_id_key UNIQUE (user_id, connector_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.articles
    ADD CONSTRAINT articles_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.bh_brand_access
    ADD CONSTRAINT bh_brand_access_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.bh_brand_access
    ADD CONSTRAINT bh_brand_access_user_id_brand_id_key UNIQUE (user_id, brand_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.bh_brands
    ADD CONSTRAINT bh_brands_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.bh_brands
    ADD CONSTRAINT bh_brands_slug_key UNIQUE (slug);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.bh_creative_likes
    ADD CONSTRAINT bh_creative_likes_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.bh_creative_post_comments
    ADD CONSTRAINT bh_creative_post_comments_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.bh_creative_posts
    ADD CONSTRAINT bh_creative_posts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.bh_creative_reports
    ADD CONSTRAINT bh_creative_reports_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.bh_resources
    ADD CONSTRAINT bh_resources_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.bh_task_attachments
    ADD CONSTRAINT bh_task_attachments_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.bh_task_comments
    ADD CONSTRAINT bh_task_comments_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.bh_tasks
    ADD CONSTRAINT bh_tasks_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.bh_wiki_entries
    ADD CONSTRAINT bh_wiki_entries_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.brand_integrations
    ADD CONSTRAINT brand_integrations_brand_id_provider_key UNIQUE (brand_id, provider);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.brand_integrations
    ADD CONSTRAINT brand_integrations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_slug_key UNIQUE (slug);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.cash_daily_metrics
    ADD CONSTRAINT cash_daily_metrics_pkey PRIMARY KEY (day, brand_key, type, user_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.cash_transactions
    ADD CONSTRAINT cash_transactions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.company_assets
    ADD CONSTRAINT company_assets_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.courier_brands
    ADD CONSTRAINT courier_brands_pkey PRIMARY KEY (courier_id, brand_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.courier_charges
    ADD CONSTRAINT courier_charges_order_id_key UNIQUE (order_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.courier_charges
    ADD CONSTRAINT courier_charges_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.courier_financial_metrics
    ADD CONSTRAINT courier_financial_metrics_pkey PRIMARY KEY (courier_id, brand_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.courier_governorate_rates
    ADD CONSTRAINT courier_governorate_rates_courier_id_governorate_effective__key UNIQUE (courier_id, governorate, effective_from);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.courier_governorate_rates
    ADD CONSTRAINT courier_governorate_rates_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.courier_settlement_lines
    ADD CONSTRAINT courier_settlement_lines_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.courier_settlements
    ADD CONSTRAINT courier_settlements_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.courier_status_mappings
    ADD CONSTRAINT courier_status_mappings_courier_id_raw_status_raw_collectio_key UNIQUE (courier_id, raw_status, raw_collection_status);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.courier_status_mappings
    ADD CONSTRAINT courier_status_mappings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.couriers
    ADD CONSTRAINT couriers_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.customer_brands
    ADD CONSTRAINT customer_brands_pkey PRIMARY KEY (customer_id, brand_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.customer_metrics
    ADD CONSTRAINT customer_metrics_pkey PRIMARY KEY (customer_id, brand_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.customer_notes
    ADD CONSTRAINT customer_notes_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.employee_attendance_entries
    ADD CONSTRAINT employee_attendance_entries_employee_id_year_month_key UNIQUE (employee_id, year, month);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.employee_attendance_entries
    ADD CONSTRAINT employee_attendance_entries_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.employee_requests
    ADD CONSTRAINT employee_requests_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.employee_time_logs
    ADD CONSTRAINT employee_time_logs_employee_id_log_date_key UNIQUE (employee_id, log_date);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.employee_time_logs
    ADD CONSTRAINT employee_time_logs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.expense_categories
    ADD CONSTRAINT expense_categories_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.expense_categories
    ADD CONSTRAINT expense_categories_slug_key UNIQUE (slug);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.expense_entries
    ADD CONSTRAINT expense_entries_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.financial_audit_log_archive
    ADD CONSTRAINT financial_audit_log_archive_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.financial_audit_log
    ADD CONSTRAINT financial_audit_log_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.fulfillment_entries
    ADD CONSTRAINT fulfillment_entries_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.integration_logs
    ADD CONSTRAINT integration_logs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.investor_brand_shares
    ADD CONSTRAINT investor_brand_shares_investor_id_brand_id_key UNIQUE (investor_id, brand_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.investor_brand_shares
    ADD CONSTRAINT investor_brand_shares_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.investors
    ADD CONSTRAINT investors_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.material_brands
    ADD CONSTRAINT material_brands_pkey PRIMARY KEY (material_id, brand_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.monthly_entries
    ADD CONSTRAINT monthly_entries_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_assignment_log
    ADD CONSTRAINT order_assignment_log_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_collections
    ADD CONSTRAINT order_collections_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_confirmation_attempts
    ADD CONSTRAINT order_confirmation_attempts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_lifecycle_events
    ADD CONSTRAINT order_lifecycle_events_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_returns
    ADD CONSTRAINT order_returns_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_shipments
    ADD CONSTRAINT order_shipments_order_id_attempt_no_key UNIQUE (order_id, attempt_no);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_shipments
    ADD CONSTRAINT order_shipments_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_sla_rules
    ADD CONSTRAINT order_sla_rules_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_sla_rules
    ADD CONSTRAINT order_sla_rules_stage_key UNIQUE (stage);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_source_payloads
    ADD CONSTRAINT order_source_payloads_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_brand_id_source_external_id_key UNIQUE (brand_id, source, external_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.product_materials
    ADD CONSTRAINT product_materials_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.product_materials
    ADD CONSTRAINT product_materials_product_id_material_id_key UNIQUE (product_id, material_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.production_tasks
    ADD CONSTRAINT production_tasks_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.project_comments
    ADD CONSTRAINT project_comments_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.project_events
    ADD CONSTRAINT project_events_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.project_files
    ADD CONSTRAINT project_files_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.project_private_notes
    ADD CONSTRAINT project_private_notes_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.project_revisions
    ADD CONSTRAINT project_revisions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.project_tasks
    ADD CONSTRAINT project_tasks_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.sales_invoice_items
    ADD CONSTRAINT sales_invoice_items_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.sales_invoices
    ADD CONSTRAINT sales_invoices_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.service_clients
    ADD CONSTRAINT service_clients_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.service_projects
    ADD CONSTRAINT service_projects_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.supplier_brands
    ADD CONSTRAINT supplier_brands_pkey PRIMARY KEY (supplier_id, brand_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.supplier_invoice_items
    ADD CONSTRAINT supplier_invoice_items_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.user_brand_access
    ADD CONSTRAINT user_brand_access_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.user_brand_access
    ADD CONSTRAINT user_brand_access_user_id_brand_id_key UNIQUE (user_id, brand_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.user_section_access
    ADD CONSTRAINT user_section_access_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.user_section_access
    ADD CONSTRAINT user_section_access_user_id_section_key UNIQUE (user_id, section);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_pkey PRIMARY KEY (user_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.user_sheet_config
    ADD CONSTRAINT user_sheet_config_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.user_sheet_config
    ADD CONSTRAINT user_sheet_config_user_id_key UNIQUE (user_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_wa_message_id_key UNIQUE (wa_message_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.whatsapp_threads
    ADD CONSTRAINT whatsapp_threads_brand_id_phone_key UNIQUE (brand_id, phone);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.whatsapp_threads
    ADD CONSTRAINT whatsapp_threads_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

-- ===================== INDEX =====================

CREATE UNIQUE INDEX IF NOT EXISTS bh_likes_comment_uniq ON public.bh_creative_likes USING btree (user_id, comment_id) WHERE (comment_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS bh_likes_post_uniq ON public.bh_creative_likes USING btree (user_id, post_id) WHERE (post_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS bh_resources_brand_idx ON public.bh_resources USING btree (brand_id, kind, sort_order);

CREATE INDEX IF NOT EXISTS bh_wiki_brand_idx ON public.bh_wiki_entries USING btree (brand_id, sort_order);

CREATE INDEX IF NOT EXISTS cash_daily_metrics_brand_day_idx ON public.cash_daily_metrics USING btree (brand_key, day, type);

CREATE INDEX IF NOT EXISTS cash_transactions_brand_occurred_type_idx ON public.cash_transactions USING btree (brand_id, occurred_at, type) WHERE (transfer_group IS NULL);

CREATE INDEX IF NOT EXISTS cash_transactions_courier_type_idx ON public.cash_transactions USING btree (courier_id, type) WHERE (courier_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS cash_transactions_expense_entry_uidx ON public.cash_transactions USING btree (expense_entry_id) WHERE (expense_entry_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS cash_transactions_expense_occurred_idx ON public.cash_transactions USING btree (expense_entry_id, occurred_at) WHERE (expense_entry_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS cash_transactions_occurred_brand_type_idx ON public.cash_transactions USING btree (occurred_at, brand_id, type) WHERE (transfer_group IS NULL);

CREATE INDEX IF NOT EXISTS cash_transactions_transfer_group_idx ON public.cash_transactions USING btree (transfer_group);

CREATE INDEX IF NOT EXISTS cash_transactions_wallet_id_idx ON public.cash_transactions USING btree (wallet_id);

CREATE INDEX IF NOT EXISTS courier_rates_lookup_idx ON public.courier_governorate_rates USING btree (courier_id, lower(btrim(governorate)), effective_from DESC) WHERE active;

CREATE INDEX IF NOT EXISTS courier_settlement_lines_settlement_idx ON public.courier_settlement_lines USING btree (settlement_id);

CREATE INDEX IF NOT EXISTS courier_settlement_lines_tracking_idx ON public.courier_settlement_lines USING btree (tracking);

CREATE INDEX IF NOT EXISTS courier_settlements_brand_idx ON public.courier_settlements USING btree (brand_id, created_at DESC);

CREATE INDEX IF NOT EXISTS customer_metrics_brand_customer_idx ON public.customer_metrics USING btree (brand_id, customer_id);

CREATE INDEX IF NOT EXISTS customers_email_trgm_idx ON public.customers USING gin (email extensions.gin_trgm_ops);

CREATE UNIQUE INDEX IF NOT EXISTS customers_email_uidx ON public.customers USING btree (email_norm) WHERE (email_norm <> ''::text);

CREATE INDEX IF NOT EXISTS customers_last_seen_desc_idx ON public.customers USING btree (last_seen_at DESC NULLS LAST, id DESC);

CREATE INDEX IF NOT EXISTS customers_name_trgm_idx ON public.customers USING gin (name extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS customers_phone_trgm_idx ON public.customers USING gin (phone extensions.gin_trgm_ops);

CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_uidx ON public.customers USING btree (phone_norm) WHERE (phone_norm <> ''::text);

CREATE UNIQUE INDEX IF NOT EXISTS ee_attendance_uidx ON public.expense_entries USING btree (attendance_id) WHERE (attendance_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS ee_brand_year_month_idx ON public.expense_entries USING btree (brand_id, year, month);

CREATE INDEX IF NOT EXISTS ee_category_idx ON public.expense_entries USING btree (category_id);

CREATE UNIQUE INDEX IF NOT EXISTS employees_user_id_key ON public.employees USING btree (user_id) WHERE (user_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS employees_user_id_unique ON public.employees USING btree (user_id) WHERE (user_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS expense_entries_brand_effective_period_idx ON public.expense_entries USING btree (brand_id, effective_from, effective_to);

CREATE INDEX IF NOT EXISTS expense_entries_brand_posting_date_idx ON public.expense_entries USING btree (brand_id, posting_date);

CREATE INDEX IF NOT EXISTS expense_entries_cash_transaction_idx ON public.expense_entries USING btree (cash_transaction_id) WHERE (cash_transaction_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS expense_entries_effective_period_gist_idx ON public.expense_entries USING gist (daterange(effective_from, effective_to, '[]'::text));

CREATE INDEX IF NOT EXISTS financial_audit_archive_created_idx ON public.financial_audit_log_archive USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS financial_audit_log_archive_actor_id_idx ON public.financial_audit_log_archive USING btree (actor_id);

CREATE INDEX IF NOT EXISTS financial_audit_log_archive_created_at_idx ON public.financial_audit_log_archive USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS financial_audit_log_archive_table_name_record_id_idx ON public.financial_audit_log_archive USING btree (table_name, record_id);

CREATE INDEX IF NOT EXISTS idx_cash_txn_brand ON public.cash_transactions USING btree (brand_id);

CREATE INDEX IF NOT EXISTS idx_cash_txn_courier ON public.cash_transactions USING btree (courier_id);

CREATE INDEX IF NOT EXISTS idx_cash_txn_date ON public.cash_transactions USING btree (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_cash_txn_for_user ON public.cash_transactions USING btree (for_user_id);

CREATE INDEX IF NOT EXISTS idx_cash_txn_type ON public.cash_transactions USING btree (type);

CREATE INDEX IF NOT EXISTS idx_company_assets_brand ON public.company_assets USING btree (brand_id);

CREATE INDEX IF NOT EXISTS idx_fin_audit_actor ON public.financial_audit_log USING btree (actor_id);

CREATE INDEX IF NOT EXISTS idx_fin_audit_created_at ON public.financial_audit_log USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fin_audit_table_record ON public.financial_audit_log USING btree (table_name, record_id);

CREATE INDEX IF NOT EXISTS idx_fulfillment_brand ON public.fulfillment_entries USING btree (brand_id);

CREATE INDEX IF NOT EXISTS idx_fulfillment_date ON public.fulfillment_entries USING btree (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_im_material ON public.inventory_movements USING btree (material_id);

CREATE INDEX IF NOT EXISTS idx_im_occurred ON public.inventory_movements USING btree (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_integration_logs_brand ON public.integration_logs USING btree (brand_id);

CREATE INDEX IF NOT EXISTS idx_integration_logs_created_at ON public.integration_logs USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_integration_logs_op ON public.integration_logs USING btree (operation);

CREATE INDEX IF NOT EXISTS idx_integration_logs_order_number ON public.integration_logs USING btree (order_number);

CREATE INDEX IF NOT EXISTS idx_integration_logs_provider ON public.integration_logs USING btree (provider);

CREATE INDEX IF NOT EXISTS idx_integration_logs_status ON public.integration_logs USING btree (status);

CREATE INDEX IF NOT EXISTS idx_inv_moves_worker ON public.inventory_movements USING btree (worker_name);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications USING btree (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_oal_created ON public.order_assignment_log USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_oal_employee ON public.order_assignment_log USING btree (employee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_oal_order ON public.order_assignment_log USING btree (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_assigned_user ON public.orders USING btree (assigned_user_id) WHERE (assigned_user_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_project_comments_project ON public.project_comments USING btree (project_id);

CREATE INDEX IF NOT EXISTS idx_project_events_brand ON public.project_events USING btree (brand_id, starts_at);

CREATE INDEX IF NOT EXISTS idx_project_files_project ON public.project_files USING btree (project_id);

CREATE INDEX IF NOT EXISTS idx_project_revisions_project ON public.project_revisions USING btree (project_id);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON public.project_tasks USING btree (project_id);

CREATE INDEX IF NOT EXISTS idx_sales_items_invoice ON public.sales_invoice_items USING btree (invoice_id);

CREATE INDEX IF NOT EXISTS idx_sales_items_product ON public.sales_invoice_items USING btree (product_id);

CREATE INDEX IF NOT EXISTS idx_service_clients_brand ON public.service_clients USING btree (brand_id);

CREATE INDEX IF NOT EXISTS idx_service_projects_brand ON public.service_projects USING btree (brand_id);

CREATE INDEX IF NOT EXISTS idx_service_projects_client ON public.service_projects USING btree (client_id);

CREATE INDEX IF NOT EXISTS idx_service_projects_deadline ON public.service_projects USING btree (deadline);

CREATE INDEX IF NOT EXISTS idx_service_projects_invoice ON public.service_projects USING btree (invoice_id);

CREATE INDEX IF NOT EXISTS idx_service_projects_pm ON public.service_projects USING btree (pm_user_id);

CREATE INDEX IF NOT EXISTS idx_supplier_invoice_items_invoice ON public.supplier_invoice_items USING btree (invoice_id);

CREATE INDEX IF NOT EXISTS idx_suppliers_brand_id ON public.suppliers USING btree (brand_id);

CREATE INDEX IF NOT EXISTS me_brand_year_month_idx ON public.monthly_entries USING btree (brand_id, year, month);

CREATE INDEX IF NOT EXISTS order_collections_brand_idx ON public.order_collections USING btree (brand_id, collected_at DESC);

CREATE INDEX IF NOT EXISTS order_collections_order_idx ON public.order_collections USING btree (order_id, collected_at DESC);

CREATE INDEX IF NOT EXISTS order_confirmation_attempts_order_idx ON public.order_confirmation_attempts USING btree (order_id, attempted_at DESC);

CREATE INDEX IF NOT EXISTS order_items_order_idx ON public.order_items USING btree (order_id);

CREATE INDEX IF NOT EXISTS order_items_product_idx ON public.order_items USING btree (product_id);

CREATE INDEX IF NOT EXISTS order_lifecycle_events_order_idx ON public.order_lifecycle_events USING btree (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS order_returns_brand_idx ON public.order_returns USING btree (brand_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS order_returns_order_idx ON public.order_returns USING btree (order_id);

CREATE INDEX IF NOT EXISTS order_shipments_brand_idx ON public.order_shipments USING btree (brand_id, shipped_at DESC);

CREATE INDEX IF NOT EXISTS order_shipments_order_idx ON public.order_shipments USING btree (order_id, attempt_no);

CREATE INDEX IF NOT EXISTS order_source_payloads_brand_updated_idx ON public.order_source_payloads USING btree (brand_id, archived_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS order_source_payloads_event_unique_idx ON public.order_source_payloads USING btree (order_id, source, payload_hash);

CREATE INDEX IF NOT EXISTS order_source_payloads_hash_idx ON public.order_source_payloads USING btree (payload_hash);

CREATE INDEX IF NOT EXISTS order_source_payloads_order_latest_idx ON public.order_source_payloads USING btree (order_id, source, archived_at DESC, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS orders_bosta_tracking_unique_idx ON public.orders USING btree (bosta_tracking) WHERE (bosta_tracking IS NOT NULL);

CREATE INDEX IF NOT EXISTS orders_brand_occurred_idx ON public.orders USING btree (brand_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS orders_brand_status_occurred_idx ON public.orders USING btree (brand_id, order_status, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS orders_collection_status_idx ON public.orders USING btree (collection_status);

CREATE INDEX IF NOT EXISTS orders_confirmation_status_idx ON public.orders USING btree (confirmation_status);

CREATE INDEX IF NOT EXISTS orders_customer_idx ON public.orders USING btree (customer_id);

CREATE INDEX IF NOT EXISTS orders_customer_name_trgm_idx ON public.orders USING gin (customer_name extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS orders_customer_phone_trgm_idx ON public.orders USING gin (customer_phone extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS orders_dispatch_claim_idx ON public.orders USING btree (dispatch_claim_token) WHERE (dispatch_claim_token IS NOT NULL);

CREATE INDEX IF NOT EXISTS orders_external_number_trgm_idx ON public.orders USING gin (external_order_number extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS orders_fulfillment_idx ON public.orders USING btree (fulfillment_status);

CREATE INDEX IF NOT EXISTS orders_occurred_at_desc_idx ON public.orders USING btree (occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS orders_open_bosta_recall_idx ON public.orders USING btree (brand_id, occurred_at DESC, id) WHERE ((bosta_tracking IS NOT NULL) AND (fulfillment_status <> ALL (ARRAY['delivered'::text, 'returned'::text, 'cancelled'::text])));

CREATE INDEX IF NOT EXISTS orders_order_status_idx ON public.orders USING btree (order_status);

CREATE INDEX IF NOT EXISTS orders_shipment_outcome_idx ON public.orders USING btree (shipment_outcome);

CREATE INDEX IF NOT EXISTS orders_status_occurred_idx ON public.orders USING btree (order_status, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS po_brand_idx ON public.purchase_orders USING btree (brand_id);

CREATE INDEX IF NOT EXISTS po_status_idx ON public.purchase_orders USING btree (status);

CREATE INDEX IF NOT EXISTS po_supplier_idx ON public.purchase_orders USING btree (supplier_id);

CREATE INDEX IF NOT EXISTS poi_po_idx ON public.purchase_order_items USING btree (purchase_order_id);

CREATE INDEX IF NOT EXISTS products_active_brand_idx ON public.products USING btree (active, brand_id) WHERE active;

CREATE INDEX IF NOT EXISTS sales_invoices_active_prep_idx ON public.sales_invoices USING btree (stage_updated_at) WHERE ((type = 'sale'::public.sales_invoice_type) AND (stage <> 'delivered'::public.sales_invoice_stage) AND (stage <> 'cancelled'::public.sales_invoice_stage));

CREATE INDEX IF NOT EXISTS sales_invoices_brand_occurred_idx ON public.sales_invoices USING btree (brand_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS sales_invoices_courier_type_idx ON public.sales_invoices USING btree (courier_id, type) WHERE (courier_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS sales_invoices_customer_idx ON public.sales_invoices USING btree (customer_id);

CREATE INDEX IF NOT EXISTS sales_invoices_customer_occurred_idx ON public.sales_invoices USING btree (customer_id, occurred_at DESC) WHERE (customer_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS sales_invoices_occurred_brand_idx ON public.sales_invoices USING btree (occurred_at DESC, brand_id);

CREATE INDEX IF NOT EXISTS sales_invoices_occurred_idx ON public.sales_invoices USING btree (occurred_at DESC);

CREATE INDEX IF NOT EXISTS sales_invoices_prep_assignee_idx ON public.sales_invoices USING btree (prep_assignee_id);

CREATE INDEX IF NOT EXISTS sales_invoices_sold_by_idx ON public.sales_invoices USING btree (sold_by);

CREATE INDEX IF NOT EXISTS sales_invoices_stage_idx ON public.sales_invoices USING btree (stage);

CREATE INDEX IF NOT EXISTS sales_invoices_stage_occurred_idx ON public.sales_invoices USING btree (stage, occurred_at DESC);

CREATE INDEX IF NOT EXISTS si_brand_idx ON public.supplier_invoices USING btree (brand_id);

CREATE INDEX IF NOT EXISTS si_supplier_idx ON public.supplier_invoices USING btree (supplier_id);

CREATE INDEX IF NOT EXISTS sp_invoice_idx ON public.supplier_payments USING btree (invoice_id);

CREATE INDEX IF NOT EXISTS supplier_payments_supplier_id_idx ON public.supplier_payments USING btree (supplier_id);

CREATE INDEX IF NOT EXISTS whatsapp_messages_thread_idx ON public.whatsapp_messages USING btree (thread_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS whatsapp_templates_event_idx ON public.whatsapp_templates USING btree (event_key, active);

CREATE INDEX IF NOT EXISTS whatsapp_threads_brand_idx ON public.whatsapp_threads USING btree (brand_id, last_message_at DESC);

-- ===================== FK =====================

DO $mig$ BEGIN
ALTER TABLE ONLY public.app_user_connections
    ADD CONSTRAINT app_user_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.articles
    ADD CONSTRAINT articles_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.bh_brand_access
    ADD CONSTRAINT bh_brand_access_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.bh_brands(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.bh_creative_likes
    ADD CONSTRAINT bh_creative_likes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.bh_creative_post_comments(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.bh_creative_likes
    ADD CONSTRAINT bh_creative_likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.bh_creative_posts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.bh_creative_post_comments
    ADD CONSTRAINT bh_creative_post_comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.bh_creative_post_comments(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.bh_creative_post_comments
    ADD CONSTRAINT bh_creative_post_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.bh_creative_posts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.bh_creative_posts
    ADD CONSTRAINT bh_creative_posts_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.bh_brands(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.bh_creative_reports
    ADD CONSTRAINT bh_creative_reports_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.bh_creative_post_comments(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.bh_creative_reports
    ADD CONSTRAINT bh_creative_reports_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.bh_creative_posts(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.bh_resources
    ADD CONSTRAINT bh_resources_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.bh_brands(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.bh_task_attachments
    ADD CONSTRAINT bh_task_attachments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.bh_tasks(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.bh_task_comments
    ADD CONSTRAINT bh_task_comments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.bh_tasks(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.bh_tasks
    ADD CONSTRAINT bh_tasks_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.bh_brands(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.bh_wiki_entries
    ADD CONSTRAINT bh_wiki_entries_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.bh_brands(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.brand_integrations
    ADD CONSTRAINT brand_integrations_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.cash_transactions
    ADD CONSTRAINT cash_transactions_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.cash_transactions
    ADD CONSTRAINT cash_transactions_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.expense_categories(id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.cash_transactions
    ADD CONSTRAINT cash_transactions_courier_id_fkey FOREIGN KEY (courier_id) REFERENCES public.couriers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.cash_transactions
    ADD CONSTRAINT cash_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.cash_transactions
    ADD CONSTRAINT cash_transactions_expense_entry_id_fkey FOREIGN KEY (expense_entry_id) REFERENCES public.expense_entries(id) DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.cash_transactions
    ADD CONSTRAINT cash_transactions_for_user_id_fkey FOREIGN KEY (for_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.cash_transactions
    ADD CONSTRAINT cash_transactions_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES public.wallets(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.company_assets
    ADD CONSTRAINT company_assets_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.courier_brands
    ADD CONSTRAINT courier_brands_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.courier_brands
    ADD CONSTRAINT courier_brands_courier_id_fkey FOREIGN KEY (courier_id) REFERENCES public.couriers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.courier_charges
    ADD CONSTRAINT courier_charges_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.courier_charges
    ADD CONSTRAINT courier_charges_courier_id_fkey FOREIGN KEY (courier_id) REFERENCES public.couriers(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.courier_charges
    ADD CONSTRAINT courier_charges_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.courier_charges
    ADD CONSTRAINT courier_charges_rate_id_fkey FOREIGN KEY (rate_id) REFERENCES public.courier_governorate_rates(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.courier_financial_metrics
    ADD CONSTRAINT courier_financial_metrics_courier_id_fkey FOREIGN KEY (courier_id) REFERENCES public.couriers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.courier_governorate_rates
    ADD CONSTRAINT courier_governorate_rates_courier_id_fkey FOREIGN KEY (courier_id) REFERENCES public.couriers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.courier_settlement_lines
    ADD CONSTRAINT courier_settlement_lines_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.courier_settlement_lines
    ADD CONSTRAINT courier_settlement_lines_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.courier_settlement_lines
    ADD CONSTRAINT courier_settlement_lines_settlement_id_fkey FOREIGN KEY (settlement_id) REFERENCES public.courier_settlements(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.courier_settlements
    ADD CONSTRAINT courier_settlements_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.courier_settlements
    ADD CONSTRAINT courier_settlements_courier_id_fkey FOREIGN KEY (courier_id) REFERENCES public.couriers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.courier_status_mappings
    ADD CONSTRAINT courier_status_mappings_courier_id_fkey FOREIGN KEY (courier_id) REFERENCES public.couriers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.couriers
    ADD CONSTRAINT couriers_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.customer_brands
    ADD CONSTRAINT customer_brands_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.customer_brands
    ADD CONSTRAINT customer_brands_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.customer_metrics
    ADD CONSTRAINT customer_metrics_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.customer_metrics
    ADD CONSTRAINT customer_metrics_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.customer_notes
    ADD CONSTRAINT customer_notes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.employee_attendance_entries
    ADD CONSTRAINT employee_attendance_entries_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.employee_requests
    ADD CONSTRAINT employee_requests_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.employee_requests
    ADD CONSTRAINT employee_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.employee_requests
    ADD CONSTRAINT employee_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.employee_time_logs
    ADD CONSTRAINT employee_time_logs_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.expense_entries
    ADD CONSTRAINT expense_entries_attendance_id_fkey FOREIGN KEY (attendance_id) REFERENCES public.employee_attendance_entries(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.expense_entries
    ADD CONSTRAINT expense_entries_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.expense_entries
    ADD CONSTRAINT expense_entries_cash_transaction_id_fkey FOREIGN KEY (cash_transaction_id) REFERENCES public.cash_transactions(id) DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.expense_entries
    ADD CONSTRAINT expense_entries_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.expense_categories(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.fulfillment_entries
    ADD CONSTRAINT fulfillment_entries_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.fulfillment_entries
    ADD CONSTRAINT fulfillment_entries_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.integration_logs
    ADD CONSTRAINT integration_logs_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.investor_brand_shares
    ADD CONSTRAINT investor_brand_shares_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.investor_brand_shares
    ADD CONSTRAINT investor_brand_shares_investor_id_fkey FOREIGN KEY (investor_id) REFERENCES public.investors(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.investors
    ADD CONSTRAINT investors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.material_brands
    ADD CONSTRAINT material_brands_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.material_brands
    ADD CONSTRAINT material_brands_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.monthly_entries
    ADD CONSTRAINT monthly_entries_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_assignment_log
    ADD CONSTRAINT order_assignment_log_courier_id_fkey FOREIGN KEY (courier_id) REFERENCES public.couriers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_assignment_log
    ADD CONSTRAINT order_assignment_log_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_assignment_log
    ADD CONSTRAINT order_assignment_log_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_assignment_log
    ADD CONSTRAINT order_assignment_log_previous_employee_id_fkey FOREIGN KEY (previous_employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_collections
    ADD CONSTRAINT order_collections_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_collections
    ADD CONSTRAINT order_collections_courier_id_fkey FOREIGN KEY (courier_id) REFERENCES public.couriers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_collections
    ADD CONSTRAINT order_collections_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_collections
    ADD CONSTRAINT order_collections_shipment_id_fkey FOREIGN KEY (shipment_id) REFERENCES public.order_shipments(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_confirmation_attempts
    ADD CONSTRAINT order_confirmation_attempts_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_confirmation_attempts
    ADD CONSTRAINT order_confirmation_attempts_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_lifecycle_events
    ADD CONSTRAINT order_lifecycle_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_lifecycle_events
    ADD CONSTRAINT order_lifecycle_events_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_lifecycle_events
    ADD CONSTRAINT order_lifecycle_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_returns
    ADD CONSTRAINT order_returns_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_returns
    ADD CONSTRAINT order_returns_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_shipments
    ADD CONSTRAINT order_shipments_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_shipments
    ADD CONSTRAINT order_shipments_courier_id_fkey FOREIGN KEY (courier_id) REFERENCES public.couriers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_shipments
    ADD CONSTRAINT order_shipments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_source_payloads
    ADD CONSTRAINT order_source_payloads_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.order_source_payloads
    ADD CONSTRAINT order_source_payloads_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_courier_id_fkey FOREIGN KEY (courier_id) REFERENCES public.couriers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_dispatch_claimed_by_fkey FOREIGN KEY (dispatch_claimed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.sales_invoices(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_lifecycle_updated_by_fkey FOREIGN KEY (lifecycle_updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.product_materials
    ADD CONSTRAINT product_materials_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.product_materials
    ADD CONSTRAINT product_materials_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.production_tasks
    ADD CONSTRAINT production_tasks_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.production_tasks
    ADD CONSTRAINT production_tasks_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.production_tasks
    ADD CONSTRAINT production_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.project_comments
    ADD CONSTRAINT project_comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.project_comments(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.project_comments
    ADD CONSTRAINT project_comments_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.service_projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.project_events
    ADD CONSTRAINT project_events_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.service_projects(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.project_files
    ADD CONSTRAINT project_files_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.service_projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.project_private_notes
    ADD CONSTRAINT project_private_notes_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.service_projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.project_revisions
    ADD CONSTRAINT project_revisions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.service_projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.project_tasks
    ADD CONSTRAINT project_tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.service_projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.supplier_invoices(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.sales_invoice_items
    ADD CONSTRAINT sales_invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.sales_invoices(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.sales_invoice_items
    ADD CONSTRAINT sales_invoice_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.sales_invoices
    ADD CONSTRAINT sales_invoices_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.sales_invoices
    ADD CONSTRAINT sales_invoices_courier_id_fkey FOREIGN KEY (courier_id) REFERENCES public.couriers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.sales_invoices
    ADD CONSTRAINT sales_invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.sales_invoices
    ADD CONSTRAINT sales_invoices_prep_assignee_id_fkey FOREIGN KEY (prep_assignee_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.sales_invoices
    ADD CONSTRAINT sales_invoices_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.sales_invoices
    ADD CONSTRAINT sales_invoices_sold_by_fkey FOREIGN KEY (sold_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.service_clients
    ADD CONSTRAINT service_clients_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.service_projects
    ADD CONSTRAINT service_projects_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.service_projects
    ADD CONSTRAINT service_projects_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.service_clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.service_projects
    ADD CONSTRAINT service_projects_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.sales_invoices(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.supplier_brands
    ADD CONSTRAINT supplier_brands_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.supplier_brands
    ADD CONSTRAINT supplier_brands_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.supplier_invoice_items
    ADD CONSTRAINT supplier_invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.supplier_invoices(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.supplier_invoice_items
    ADD CONSTRAINT supplier_invoice_items_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.supplier_invoice_items
    ADD CONSTRAINT supplier_invoice_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT supplier_invoices_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_cash_transaction_id_fkey FOREIGN KEY (cash_transaction_id) REFERENCES public.cash_transactions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.supplier_invoices(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.user_brand_access
    ADD CONSTRAINT user_brand_access_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.user_brand_access
    ADD CONSTRAINT user_brand_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.user_section_access
    ADD CONSTRAINT user_section_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.user_sheet_config
    ADD CONSTRAINT user_sheet_config_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.whatsapp_threads(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.whatsapp_threads
    ADD CONSTRAINT whatsapp_threads_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.whatsapp_threads
    ADD CONSTRAINT whatsapp_threads_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

DO $mig$ BEGIN
ALTER TABLE ONLY public.whatsapp_threads
    ADD CONSTRAINT whatsapp_threads_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $mig$;

-- ===================== FUNCTION =====================

CREATE OR REPLACE FUNCTION public.accrue_order_courier_charge() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  selected_rate public.courier_governorate_rates%ROWTYPE;
  charge_amount numeric := 0;
  existing_settled_at timestamptz;
  existing_charge_type text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT settled_at, charge_type INTO existing_settled_at, existing_charge_type
    FROM public.courier_charges WHERE order_id = NEW.id;
    IF existing_charge_type = 'legacy_return' THEN
      NEW.courier_expense := OLD.courier_expense;
      RETURN NEW;
    END IF;
    IF existing_settled_at IS NOT NULL AND (
      NEW.courier_id IS DISTINCT FROM OLD.courier_id OR
      NEW.shipping_governorate IS DISTINCT FROM OLD.shipping_governorate OR
      NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
    ) THEN
      RAISE EXCEPTION 'Cannot change a settled courier charge for order %', NEW.id;
    END IF;
    IF existing_settled_at IS NOT NULL
       AND NEW.shipment_outcome IS DISTINCT FROM OLD.shipment_outcome THEN
      NEW.courier_expense := OLD.courier_expense;
      RETURN NEW;
    END IF;
  END IF;
  IF NEW.shipment_outcome NOT IN ('delivered','returned','customer_returned','exchanged') THEN
    NEW.courier_expense := 0;
    RETURN NEW;
  END IF;
  IF NEW.courier_id IS NULL OR NULLIF(btrim(NEW.shipping_governorate), '') IS NULL THEN
    NEW.courier_expense := 0;
    RETURN NEW;
  END IF;
  SELECT * INTO selected_rate
  FROM public.courier_governorate_rates
  WHERE courier_id = NEW.courier_id
    AND lower(btrim(governorate)) = lower(btrim(NEW.shipping_governorate))
    AND active
    AND effective_from <= NEW.occurred_at::date
    AND (effective_to IS NULL OR effective_to >= NEW.occurred_at::date)
  ORDER BY effective_from DESC LIMIT 1;
  charge_amount := CASE NEW.shipment_outcome
    WHEN 'delivered' THEN selected_rate.delivery_fee
    WHEN 'returned' THEN selected_rate.failed_delivery_fee
    WHEN 'customer_returned' THEN selected_rate.customer_return_fee
    WHEN 'exchanged' THEN selected_rate.exchange_fee
    ELSE 0
  END;
  NEW.courier_expense := COALESCE(charge_amount, 0);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_cash_metric_delta(_occurred_at timestamp with time zone, _brand_id uuid, _type text, _for_user_id uuid, _courier_id uuid, _transfer_group uuid, _amount numeric, _direction integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
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

CREATE OR REPLACE FUNCTION public.audit_order_lifecycle_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.order_status IS DISTINCT FROM OLD.order_status
     OR NEW.collection_status IS DISTINCT FROM OLD.collection_status
     OR NEW.shipment_outcome IS DISTINCT FROM OLD.shipment_outcome THEN
    INSERT INTO public.order_lifecycle_events(
      order_id, brand_id, source, actor_id,
      from_order_status, to_order_status,
      from_collection_status, to_collection_status,
      from_shipment_outcome, to_shipment_outcome,
      raw_status, note
    ) VALUES (
      NEW.id, NEW.brand_id, NEW.lifecycle_source, NEW.lifecycle_updated_by,
      OLD.order_status, NEW.order_status,
      OLD.collection_status, NEW.collection_status,
      OLD.shipment_outcome, NEW.shipment_outcome,
      NEW.courier_status_raw,
      CASE WHEN NEW.lifecycle_source = 'manual' THEN 'Manual lifecycle override' ELSE NULL END
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_pay_supplier_invoice() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  already_paid numeric;
  remaining numeric;
BEGIN
  IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid') THEN
    SELECT COALESCE(SUM(amount),0) INTO already_paid FROM public.supplier_payments WHERE invoice_id = NEW.id;
    remaining := COALESCE(NEW.amount,0) - already_paid;
    IF remaining > 0 THEN
      INSERT INTO public.supplier_payments(invoice_id, amount, paid_at, note)
      VALUES (NEW.id, remaining, COALESCE(NEW.issued_at, CURRENT_DATE), 'دفعة تلقائية عند تعليم الفاتورة كمدفوعة');
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.bh_is_manager(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','manager')
  )
$$;

CREATE OR REPLACE FUNCTION public.cash_metrics_trigger() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
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

CREATE OR REPLACE FUNCTION public.cash_txn_default_wallet() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.wallet_id IS NULL THEN
    SELECT id INTO NEW.wallet_id FROM public.wallets WHERE active = true ORDER BY sort_order, created_at LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.courier_invoice_metrics_trigger() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
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

CREATE OR REPLACE FUNCTION public.courier_serves_brand(_courier_id uuid, _brand_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.couriers c
    WHERE c.id = _courier_id
      AND (
        c.serves_all_brands
        OR c.brand_id = _brand_id
        OR EXISTS (
          SELECT 1 FROM public.courier_brands cb
          WHERE cb.courier_id = c.id AND cb.brand_id = _brand_id
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.dashboard_supplier_debt_summary(_brand_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
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
BEGIN
  FOR s IN
    SELECT id, name, brand_id, COALESCE(opening_balance, 0)::numeric AS opening_balance
    FROM public.suppliers
    ORDER BY id
  LOOP
    _out := 0;
    _ovd := 0;

    SELECT COALESCE(SUM(amount), 0)::numeric INTO _standalone
    FROM public.supplier_payments
    WHERE supplier_id = s.id AND invoice_id IS NULL;

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
    END IF;

    FOR inv IN
      SELECT i.id, i.brand_id, COALESCE(i.amount, 0)::numeric AS amount, i.due_at, i.status,
             COALESCE((SELECT SUM(p.amount) FROM public.supplier_payments p WHERE p.invoice_id = i.id), 0)::numeric AS paid
      FROM public.supplier_invoices i
      WHERE i.supplier_id = s.id
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
      IF inv.due_at IS NOT NULL AND inv.due_at::date < _today AND inv.status::text IS DISTINCT FROM 'paid' THEN
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

CREATE OR REPLACE FUNCTION public.employee_requests_validate() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.enforce_brand_share_total() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _brand_id uuid;
  _total numeric;
BEGIN
  _brand_id := COALESCE(NEW.brand_id, OLD.brand_id);
  IF _brand_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(sum(share_percentage), 0) INTO _total
    FROM public.investor_brand_shares
    WHERE brand_id = _brand_id;

  IF _total > 100.0001 THEN
    RAISE EXCEPTION 'إجمالي حصص هذا البراند سيتجاوز 100%% (الإجمالي: %)', round(_total, 2);
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_order_courier_brand() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.courier_id IS NOT NULL
     AND NOT public.courier_serves_brand(NEW.courier_id, NEW.brand_id) THEN
    RAISE EXCEPTION 'Courier % is not available for order brand %', NEW.courier_id, NEW.brand_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL
         AND coalesce(current_setting('role', true), '') NOT IN ('service_role','postgres','supabase_admin')
      THEN false
    WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
  END
$$;

CREATE OR REPLACE FUNCTION public.has_section_access(_user_id uuid, _section text) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT
    public.has_role(_user_id,'admin')
    OR public.has_role(_user_id,'manager')
    OR EXISTS (SELECT 1 FROM public.user_section_access WHERE user_id = _user_id AND section = _section);
$$;

CREATE OR REPLACE FUNCTION public.im_consume_bom() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.type::text <> 'production' OR NEW.product_id IS NULL OR NEW.source = 'bom' OR NEW.qty <= 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.inventory_movements
    (material_id, type, qty, occurred_at, reason, source, source_id, note, created_by)
  SELECT pm.material_id, 'sale', pm.qty_per_unit * NEW.qty, NEW.occurred_at,
         'production_consumption', 'bom', NEW.id,
         'استهلاك خامات من أمر إنتاج', NEW.created_by
  FROM public.product_materials pm
  WHERE pm.product_id = NEW.product_id AND pm.qty_per_unit > 0;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.im_update_moving_avg() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  cur_qty  numeric;
  cur_cost numeric;
  delta    numeric;
  new_qty  numeric;
  new_cost numeric;
  is_in    boolean;
BEGIN
  is_in := NEW.type::text IN ('production', 'return');

  IF NEW.type::text = 'adjustment' THEN
    delta := NEW.qty;           -- signed
  ELSIF is_in THEN
    delta := abs(NEW.qty);
  ELSE
    delta := -abs(NEW.qty);
  END IF;

  IF NEW.product_id IS NOT NULL THEN
    SELECT coalesce(on_hand_qty,0), coalesce(moving_avg_cost,0)
      INTO cur_qty, cur_cost FROM public.products WHERE id = NEW.product_id FOR UPDATE;
    new_qty := coalesce(cur_qty,0) + delta;
    IF delta > 0 AND NEW.unit_cost IS NOT NULL AND new_qty > 0 THEN
      new_cost := ((greatest(cur_qty,0) * cur_cost) + (delta * NEW.unit_cost)) / new_qty;
      UPDATE public.products SET moving_avg_cost = new_cost, on_hand_qty = new_qty WHERE id = NEW.product_id;
    ELSE
      UPDATE public.products SET on_hand_qty = new_qty WHERE id = NEW.product_id;
    END IF;
  ELSIF NEW.material_id IS NOT NULL THEN
    SELECT coalesce(on_hand_qty,0), coalesce(unit_cost,0)
      INTO cur_qty, cur_cost FROM public.materials WHERE id = NEW.material_id FOR UPDATE;
    new_qty := coalesce(cur_qty,0) + delta;
    IF delta > 0 AND NEW.unit_cost IS NOT NULL AND new_qty > 0 THEN
      new_cost := ((greatest(cur_qty,0) * cur_cost) + (delta * NEW.unit_cost)) / new_qty;
      UPDATE public.materials SET unit_cost = new_cost, on_hand_qty = new_qty WHERE id = NEW.material_id;
    ELSE
      UPDATE public.materials SET on_hand_qty = new_qty WHERE id = NEW.material_id;
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.im_validate_target() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF (NEW.product_id IS NULL) = (NEW.material_id IS NULL) THEN
    RAISE EXCEPTION 'inventory movement must reference exactly one of product_id / material_id';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.invoke_public_hook(_path text, _body jsonb DEFAULT '{}'::jsonb, _secret_name text DEFAULT NULL::text, _apikey_secret_name text DEFAULT NULL::text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'vault'
    AS $$
DECLARE
  v_base text;
  v_key text;
  v_hook_secret text;
  v_headers jsonb;
  v_request_id bigint;
BEGIN
  IF _path !~ '^/api/public/' THEN
    RAISE EXCEPTION 'invoke_public_hook: only /api/public/* paths are allowed';
  END IF;

  SELECT decrypted_secret INTO v_base FROM vault.decrypted_secrets WHERE name = 'app_public_base_url';

  IF _apikey_secret_name IS NOT NULL THEN
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = _apikey_secret_name;
  ELSE
    SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'app_public_api_key';
  END IF;

  IF v_base IS NULL OR v_key IS NULL THEN
    RAISE EXCEPTION 'invoke_public_hook: missing vault secrets (base url / apikey)';
  END IF;

  v_headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_key);

  IF _secret_name IS NOT NULL THEN
    SELECT decrypted_secret INTO v_hook_secret FROM vault.decrypted_secrets WHERE name = _secret_name;
    IF v_hook_secret IS NULL THEN
      RAISE EXCEPTION 'invoke_public_hook: missing vault secret %', _secret_name;
    END IF;
    v_headers := v_headers || jsonb_build_object('x-webhook-secret', v_hook_secret);
  END IF;

  SELECT net.http_post(
    url := v_base || _path,
    headers := v_headers,
    body := COALESCE(_body, '{}'::jsonb)
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_global_reader(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL
         AND coalesce(current_setting('role', true), '') NOT IN ('service_role','postgres','supabase_admin')
      THEN false
    WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','manager','accountant'))
  END
$$;

CREATE OR REPLACE FUNCTION public.is_investor_of_brand(_user_id uuid, _brand_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.investor_brand_shares s
    JOIN public.investors i ON i.id = s.investor_id
    WHERE i.user_id = _user_id AND s.brand_id = _brand_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_project_manager(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = 'project_manager') $$;

CREATE OR REPLACE FUNCTION public.is_writer(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL
         AND coalesce(current_setting('role', true), '') NOT IN ('service_role','postgres','supabase_admin')
      THEN false
    WHEN auth.uid() IS NOT NULL AND _user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role IN ('admin','manager','data_entry')
    )
  END
$$;

CREATE OR REPLACE FUNCTION public.link_order_customer() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  pnorm text := regexp_replace(coalesce(NEW.customer_phone,''), '\D', '', 'g');
  enorm text := lower(coalesce(NEW.customer_email,''));
  cid uuid;
BEGIN
  IF NEW.customer_id IS NULL AND (pnorm <> '' OR enorm <> '') THEN
    IF pnorm <> '' THEN SELECT id INTO cid FROM public.customers WHERE phone_norm = pnorm LIMIT 1; END IF;
    IF cid IS NULL AND enorm <> '' THEN SELECT id INTO cid FROM public.customers WHERE email_norm = enorm LIMIT 1; END IF;
    IF cid IS NULL THEN
      INSERT INTO public.customers(name, phone, email, governorate)
      VALUES (coalesce(NEW.customer_name, NEW.customer_phone, NEW.customer_email, 'Unknown'),
              NULLIF(NEW.customer_phone,''), NULLIF(NEW.customer_email,''),
              NULLIF(NEW.shipping_governorate,''))
      RETURNING id INTO cid;
    END IF;
    NEW.customer_id := cid;
  END IF;
  IF NEW.customer_id IS NOT NULL THEN
    UPDATE public.customers
      SET last_seen_at = GREATEST(coalesce(last_seen_at, '-infinity'::timestamptz), NEW.occurred_at)
      WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.link_sales_invoice_customer() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

CREATE OR REPLACE FUNCTION public.lock_customer_brand_metrics(_customer_id uuid, _brand_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT pg_advisory_xact_lock(hashtextextended(_customer_id::text || ':' || _brand_id::text, 0));
$$;

CREATE OR REPLACE FUNCTION public.log_financial_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  rec_id uuid;
  old_snapshot jsonb;
  new_snapshot jsonb;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_snapshot := to_jsonb(OLD);
    IF TG_TABLE_NAME = 'orders' THEN old_snapshot := old_snapshot - 'raw'; END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_snapshot := to_jsonb(NEW);
    IF TG_TABLE_NAME = 'orders' THEN new_snapshot := new_snapshot - 'raw'; END IF;
  END IF;
  rec_id := COALESCE((new_snapshot->>'id')::uuid, (old_snapshot->>'id')::uuid);
  INSERT INTO public.financial_audit_log(table_name, record_id, operation, actor_id, old_data, new_data)
  VALUES (TG_TABLE_NAME, rec_id, TG_OP, auth.uid(), old_snapshot, new_snapshot);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.map_order_to_invoice_stage(_ff text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT CASE _ff
    WHEN 'unfulfilled' THEN 'new'
    WHEN 'processing'  THEN 'processing'
    WHEN 'shipped'     THEN 'with_courier'
    WHEN 'delivered'   THEN 'delivered'
    WHEN 'returned'    THEN 'cancelled'
    WHEN 'cancelled'   THEN 'cancelled'
    ELSE 'new'
  END
$$;

CREATE OR REPLACE FUNCTION public.notify_revision_opened() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE pm uuid;
BEGIN
  SELECT pm_user_id INTO pm FROM public.service_projects WHERE id = NEW.project_id;
  IF pm IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, kind, title, body, link)
    VALUES (pm, 'revision_opened', 'New revision requested', NEW.title,
            '/services-dashboard/projects/' || NEW.project_id::text);
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_task_assigned() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.assignee_id IS NOT NULL AND NEW.assignee_id IS DISTINCT FROM COALESCE(OLD.assignee_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    INSERT INTO public.notifications(user_id, kind, title, body, link)
    VALUES (NEW.assignee_id, 'task_assigned', 'New task assigned', NEW.title,
            '/services-dashboard/projects/' || NEW.project_id::text);
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.offline_branch_deduct_inventory() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  is_offline boolean;
  inv_type text;
BEGIN
  IF NEW.product_id IS NULL OR NEW.qty IS NULL OR NEW.qty <= 0 THEN
    RETURN NEW;
  END IF;
  SELECT (b.type::text = 'offline_branch'), si.type::text
    INTO is_offline, inv_type
  FROM public.sales_invoices si
  JOIN public.brands b ON b.id = si.brand_id
  WHERE si.id = NEW.invoice_id;

  IF COALESCE(is_offline, false) THEN
    IF inv_type = 'return' THEN
      INSERT INTO public.inventory_movements(product_id, type, qty, note)
        VALUES (NEW.product_id, 'return_in', NEW.qty, 'POS return');
    ELSE
      INSERT INTO public.inventory_movements(product_id, type, qty, note)
        VALUES (NEW.product_id, 'sale', NEW.qty, 'POS sale');
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.order_items_sync_invoice_items() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  order_row_id uuid := coalesce(NEW.order_id, OLD.order_id);
  inv_id uuid;
BEGIN
  SELECT invoice_id INTO inv_id FROM public.orders WHERE id = order_row_id;
  IF inv_id IS NULL THEN RETURN coalesce(NEW, OLD); END IF;
  DELETE FROM public.sales_invoice_items WHERE invoice_id = inv_id;
  INSERT INTO public.sales_invoice_items(invoice_id, product_id, qty, unit_price, subtotal)
    SELECT inv_id, product_id, qty, unit_price, coalesce(subtotal, qty*unit_price)
    FROM public.order_items WHERE order_id = order_row_id;
  UPDATE public.sales_invoices
    SET qty = (SELECT coalesce(sum(qty),1) FROM public.order_items WHERE order_id = order_row_id)
    WHERE id = inv_id;
  RETURN coalesce(NEW, OLD);
END $$;

CREATE OR REPLACE FUNCTION public.orders_deduct_stock() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  is_offline boolean;
BEGIN
  IF NEW.confirmation_status IS DISTINCT FROM 'confirmed'
     OR OLD.confirmation_status IS NOT DISTINCT FROM NEW.confirmation_status THEN
    RETURN NEW;
  END IF;

  SELECT (b.type::text = 'offline_branch') INTO is_offline
  FROM public.brands b WHERE b.id = NEW.brand_id;
  IF coalesce(is_offline, false) THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM public.inventory_movements
             WHERE source = 'order' AND source_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.inventory_movements(product_id, type, qty, occurred_at, reason, source, source_id, note)
  SELECT oi.product_id, 'sale', oi.qty, NEW.occurred_at::date, 'order_confirmed', 'order', NEW.id,
         'خصم مخزون عند تأكيد أوردر ' || coalesce(NEW.external_order_number, '')
  FROM public.order_items oi
  WHERE oi.order_id = NEW.id AND oi.product_id IS NOT NULL AND oi.qty > 0;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.orders_delete_invoice() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.invoice_id IS NOT NULL THEN
    DELETE FROM public.sales_invoices WHERE id = OLD.invoice_id;
  END IF;
  RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION public.orders_sync_invoice() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  inv_id uuid;
  qty_sum numeric;
  stage_val text := public.map_order_to_invoice_stage(NEW.fulfillment_status);
  is_return boolean := (NEW.fulfillment_status = 'returned');
  collected numeric := CASE
    WHEN NEW.financial_status IN ('paid','partially_refunded') THEN NEW.total_amount
    WHEN NEW.financial_status = 'partially_paid' THEN NEW.total_amount / 2
    ELSE 0
  END;
BEGIN
  SELECT coalesce(sum(qty), 1) INTO qty_sum FROM public.order_items WHERE order_id = NEW.id;
  IF NEW.invoice_id IS NULL THEN
    INSERT INTO public.sales_invoices(
      brand_id, courier_id, type, qty, total_amount, collected_amount, occurred_at,
      customer_id, customer_name, customer_phone, customer_email,
      stage, stage_updated_at, note
    ) VALUES (
      NEW.brand_id, NEW.courier_id,
      CASE WHEN is_return THEN 'return'::sales_invoice_type ELSE 'sale'::sales_invoice_type END,
      qty_sum, NEW.total_amount, collected, NEW.occurred_at::date,
      NEW.customer_id, NEW.customer_name, NEW.customer_phone, NEW.customer_email,
      stage_val::sales_invoice_stage, now(),
      'Order ' || coalesce(NEW.external_order_number, NEW.id::text)
    ) RETURNING id INTO inv_id;
    NEW.invoice_id := inv_id;
  ELSE
    UPDATE public.sales_invoices SET
      brand_id         = NEW.brand_id,
      courier_id       = NEW.courier_id,
      type             = CASE WHEN is_return THEN 'return'::sales_invoice_type ELSE 'sale'::sales_invoice_type END,
      qty              = qty_sum,
      total_amount     = NEW.total_amount,
      collected_amount = collected,
      occurred_at      = NEW.occurred_at::date,
      customer_id      = NEW.customer_id,
      customer_name    = NEW.customer_name,
      customer_phone   = NEW.customer_phone,
      customer_email   = NEW.customer_email,
      stage            = stage_val::sales_invoice_stage
    WHERE id = NEW.invoice_id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.page_access_level(_user_id uuid, _route text) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'manager') THEN
    RETURN 'write';
  END IF;
  IF public.has_section_access(_user_id, 'deny:' || _route) THEN
    RETURN 'hidden';
  END IF;
  IF public.has_section_access(_user_id, 'write:' || _route) THEN
    RETURN 'write';
  END IF;
  IF public.has_section_access(_user_id, 'page:' || _route) THEN
    RETURN CASE WHEN public.is_writer(_user_id) THEN 'write' ELSE 'read' END;
  END IF;
  IF public.is_writer(_user_id) THEN
    RETURN 'write';
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.persist_order_courier_charge() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE selected_rate_id uuid; charge_kind text;
BEGIN
  IF NEW.shipment_outcome NOT IN ('delivered','returned','customer_returned','exchanged')
     OR NEW.courier_id IS NULL THEN
    DELETE FROM public.courier_charges
    WHERE order_id = NEW.id AND settled_at IS NULL AND charge_type <> 'legacy_return';
    RETURN NEW;
  END IF;
  SELECT id INTO selected_rate_id
  FROM public.courier_governorate_rates
  WHERE courier_id = NEW.courier_id
    AND lower(btrim(governorate)) = lower(btrim(NEW.shipping_governorate))
    AND active
    AND effective_from <= NEW.occurred_at::date
    AND (effective_to IS NULL OR effective_to >= NEW.occurred_at::date)
  ORDER BY effective_from DESC LIMIT 1;
  charge_kind := CASE NEW.shipment_outcome
    WHEN 'delivered' THEN 'delivery'
    WHEN 'returned' THEN 'failed_delivery'
    WHEN 'customer_returned' THEN 'customer_return'
    ELSE 'exchange'
  END;
  INSERT INTO public.courier_charges(
    order_id, brand_id, courier_id, rate_id, charge_type, amount, rate_missing, note, updated_at
  ) VALUES (
    NEW.id, NEW.brand_id, NEW.courier_id, selected_rate_id, charge_kind,
    NEW.courier_expense, selected_rate_id IS NULL,
    CASE WHEN selected_rate_id IS NULL THEN 'Missing courier rate for ' || COALESCE(NEW.shipping_governorate, 'unknown governorate') END,
    now()
  )
  ON CONFLICT (order_id) DO UPDATE SET
    courier_id = EXCLUDED.courier_id,
    rate_id = EXCLUDED.rate_id,
    charge_type = EXCLUDED.charge_type,
    amount = EXCLUDED.amount,
    rate_missing = EXCLUDED.rate_missing,
    note = EXCLUDED.note,
    updated_at = now()
  WHERE public.courier_charges.settled_at IS NULL
    AND public.courier_charges.charge_type <> 'legacy_return';
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.preserve_terminal_order_lifecycle() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  trusted_manual_actor text := current_setting('app.manual_lifecycle_actor', true);
BEGIN
  IF NEW.lifecycle_source = 'manual'
     AND NEW.lifecycle_updated_by IS NOT NULL
     AND NEW.lifecycle_updated_by = auth.uid()
     AND trusted_manual_actor = auth.uid()::text THEN
    IF NEW.shipment_outcome = 'delivered' THEN
      NEW.order_status := 'succeeded';
      NEW.fulfillment_status := 'delivered';
    ELSIF NEW.shipment_outcome = 'exchanged' THEN
      NEW.order_status := 'succeeded';
      NEW.fulfillment_status := 'delivered';
    ELSIF NEW.shipment_outcome IN ('returned', 'customer_returned') THEN
      NEW.order_status := 'cancelled';
      NEW.fulfillment_status := 'returned';
    ELSIF NEW.shipment_outcome = 'cancelled_before_dispatch' THEN
      NEW.order_status := 'cancelled';
      NEW.fulfillment_status := 'cancelled';
    ELSIF NEW.order_status NOT IN ('new', 'processing', 'postponed', 'awaiting_response') THEN
      NEW.order_status := 'processing';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.lifecycle_source = 'manual'
     AND trusted_manual_actor IS DISTINCT FROM auth.uid()::text
     AND (
       NEW.order_status IS DISTINCT FROM OLD.order_status OR
       NEW.collection_status IS DISTINCT FROM OLD.collection_status OR
       NEW.shipment_outcome IS DISTINCT FROM OLD.shipment_outcome OR
       NEW.fulfillment_status IS DISTINCT FROM OLD.fulfillment_status
     ) THEN
    RAISE EXCEPTION 'Manual lifecycle changes must use update_order_lifecycle_manually';
  END IF;
  IF OLD.shipment_outcome = 'delivered'
     AND NEW.shipment_outcome = 'returned'
     AND NEW.lifecycle_source = 'bosta' THEN
    NEW.shipment_outcome := 'customer_returned';
    NEW.order_status := 'cancelled';
    NEW.fulfillment_status := 'returned';
    RETURN NEW;
  END IF;
  IF (
    OLD.shipment_outcome IN ('returned', 'customer_returned', 'exchanged')
    AND NEW.shipment_outcome IS DISTINCT FROM OLD.shipment_outcome
  ) OR (
    OLD.shipment_outcome = 'delivered'
    AND NEW.shipment_outcome IN ('open', 'cancelled_before_dispatch')
  ) OR (
    OLD.shipment_outcome = 'cancelled_before_dispatch'
    AND NEW.shipment_outcome = 'open'
  ) THEN
    NEW.order_status := OLD.order_status;
    NEW.collection_status := OLD.collection_status;
    NEW.shipment_outcome := OLD.shipment_outcome;
    NEW.fulfillment_status := OLD.fulfillment_status;
    NEW.courier_status_raw := OLD.courier_status_raw;
    NEW.courier_collection_status_raw := OLD.courier_collection_status_raw;
    NEW.lifecycle_source := OLD.lifecycle_source;
    NEW.lifecycle_updated_by := OLD.lifecycle_updated_by;
    NEW.lifecycle_updated_at := OLD.lifecycle_updated_at;
    RETURN NEW;
  END IF;
  IF NEW.shipment_outcome IS NOT DISTINCT FROM OLD.shipment_outcome THEN
    NEW.fulfillment_status := CASE OLD.shipment_outcome
      WHEN 'delivered' THEN 'delivered'
      WHEN 'exchanged' THEN 'delivered'
      WHEN 'returned' THEN 'returned'
      WHEN 'customer_returned' THEN 'returned'
      WHEN 'cancelled_before_dispatch' THEN 'cancelled'
      ELSE NEW.fulfillment_status
    END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_invalid_courier_brand_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.brand_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.courier_id = NEW.id
      AND o.brand_id <> NEW.brand_id
  ) THEN
    RAISE EXCEPTION 'Courier % is already assigned to orders from another brand', NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.product_cogs(_product_id uuid) RETURNS numeric
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT coalesce(
    (SELECT cogs_override FROM public.products WHERE id = _product_id AND cogs_override IS NOT NULL),
    (SELECT moving_avg_cost FROM public.products WHERE id = _product_id AND moving_avg_cost IS NOT NULL AND moving_avg_cost > 0),
    (SELECT p.sell_price * (p.cogs_percent/100.0)
       FROM public.products p
      WHERE p.id = _product_id AND p.cogs_percent IS NOT NULL),
    (SELECT p.sell_price * (b.cogs_percent_default/100.0)
       FROM public.products p JOIN public.brands b ON b.id = p.brand_id
      WHERE p.id = _product_id AND b.cogs_percent_default IS NOT NULL),
    coalesce((
      SELECT sum(pm.qty_per_unit * m.unit_cost)
      FROM public.product_materials pm
      JOIN public.materials m ON m.id = pm.material_id
      WHERE pm.product_id = _product_id
    ), 0)
  );
$$;

CREATE OR REPLACE FUNCTION public.production_tasks_prevent_field_tampering() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'manager')
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'production_manager')
  ) THEN
    IF NEW.title IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.brand_id IS DISTINCT FROM OLD.brand_id
       OR NEW.priority IS DISTINCT FROM OLD.priority
       OR NEW.due_date IS DISTINCT FROM OLD.due_date
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
       OR NEW.notes IS DISTINCT FROM OLD.notes THEN
      RAISE EXCEPTION 'Assignees may only update the status field';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.products_cogs_map(_ids uuid[]) RETURNS TABLE(product_id uuid, cogs numeric)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT p.id AS product_id, public.product_cogs(p.id) AS cogs
  FROM public.products p
  WHERE p.id = ANY(_ids);
$$;

CREATE OR REPLACE FUNCTION public.receivables_aging_report() RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
WITH base AS (
  SELECT
    si.id,
    si.brand_id,
    COALESCE(b.name, '—') AS brand_name,
    si.customer_id,
    COALESCE(NULLIF(si.customer_name, ''), '—') AS customer_name,
    (COALESCE(si.total_amount, 0) - COALESCE(si.collected_amount, 0))::numeric AS outstanding,
    GREATEST(0, ((now() AT TIME ZONE 'Africa/Cairo')::date - (COALESCE(si.stage_updated_at, si.occurred_at) AT TIME ZONE 'Africa/Cairo')::date))::int AS days
  FROM public.sales_invoices si
  LEFT JOIN public.brands b ON b.id = si.brand_id
  WHERE (COALESCE(si.total_amount, 0) - COALESCE(si.collected_amount, 0)) > 0
    AND (
      si.stage IS NULL
      OR si.stage::text NOT IN ('delivered', 'cancelled')
      OR (si.stage::text IN ('delivered', 'cancelled') AND COALESCE(si.total_amount, 0) > COALESCE(si.collected_amount, 0))
    )
),
bucketed AS (
  SELECT base.*,
    CASE
      WHEN days <= 30 THEN 'b0_30'
      WHEN days <= 60 THEN 'b31_60'
      WHEN days <= 90 THEN 'b61_90'
      ELSE 'b90_plus'
    END AS bucket
  FROM base
),
by_brand AS (
  SELECT brand_id::text AS key, MIN(brand_name) AS label,
    COALESCE(SUM(outstanding) FILTER (WHERE bucket = 'b0_30'), 0) AS b0_30,
    COALESCE(SUM(outstanding) FILTER (WHERE bucket = 'b31_60'), 0) AS b31_60,
    COALESCE(SUM(outstanding) FILTER (WHERE bucket = 'b61_90'), 0) AS b61_90,
    COALESCE(SUM(outstanding) FILTER (WHERE bucket = 'b90_plus'), 0) AS b90_plus,
    SUM(outstanding) AS total
  FROM bucketed GROUP BY brand_id
),
by_customer AS (
  SELECT COALESCE(customer_id::text, 'name:' || customer_name) AS key, MIN(customer_name) AS label,
    COALESCE(SUM(outstanding) FILTER (WHERE bucket = 'b0_30'), 0) AS b0_30,
    COALESCE(SUM(outstanding) FILTER (WHERE bucket = 'b31_60'), 0) AS b31_60,
    COALESCE(SUM(outstanding) FILTER (WHERE bucket = 'b61_90'), 0) AS b61_90,
    COALESCE(SUM(outstanding) FILTER (WHERE bucket = 'b90_plus'), 0) AS b90_plus,
    SUM(outstanding) AS total
  FROM bucketed GROUP BY COALESCE(customer_id::text, 'name:' || customer_name)
)
SELECT jsonb_build_object(
  'totals', jsonb_build_object(
    'b0_30', COALESCE((SELECT SUM(outstanding) FROM bucketed WHERE bucket = 'b0_30'), 0),
    'b31_60', COALESCE((SELECT SUM(outstanding) FROM bucketed WHERE bucket = 'b31_60'), 0),
    'b61_90', COALESCE((SELECT SUM(outstanding) FROM bucketed WHERE bucket = 'b61_90'), 0),
    'b90_plus', COALESCE((SELECT SUM(outstanding) FROM bucketed WHERE bucket = 'b90_plus'), 0)
  ),
  'grand_total', COALESCE((SELECT SUM(outstanding) FROM bucketed), 0),
  'invoice_count', (SELECT COUNT(*) FROM bucketed),
  'by_brand', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'key', key, 'label', label, 'total', total,
      'totals', jsonb_build_object('b0_30', b0_30, 'b31_60', b31_60, 'b61_90', b61_90, 'b90_plus', b90_plus)
    ) ORDER BY total DESC) FROM by_brand), '[]'::jsonb),
  'by_customer', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'key', key, 'label', label, 'total', total,
      'totals', jsonb_build_object('b0_30', b0_30, 'b31_60', b31_60, 'b61_90', b61_90, 'b90_plus', b90_plus)
    ) ORDER BY total DESC) FROM by_customer), '[]'::jsonb),
  'top_rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'brand_id', brand_id, 'brand_name', brand_name,
      'customer_id', customer_id, 'customer_name', customer_name,
      'outstanding', outstanding, 'days', days, 'bucket', bucket
    ) ORDER BY outstanding DESC) FROM (SELECT * FROM bucketed ORDER BY outstanding DESC LIMIT 200) t), '[]'::jsonb)
);
$$;

CREATE OR REPLACE FUNCTION public.recompute_supplier_invoice_status(_invoice_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  inv_amt numeric; paid numeric; new_status invoice_status;
BEGIN
  SELECT amount INTO inv_amt FROM public.supplier_invoices WHERE id = _invoice_id;
  IF inv_amt IS NULL THEN RETURN; END IF;
  SELECT COALESCE(SUM(amount),0) INTO paid FROM public.supplier_payments WHERE invoice_id = _invoice_id;
  IF paid <= 0 THEN new_status := 'open';
  ELSIF paid < inv_amt THEN new_status := 'partial';
  ELSE new_status := 'paid';
  END IF;
  UPDATE public.supplier_invoices SET status = new_status WHERE id = _invoice_id;
END $$;

CREATE OR REPLACE FUNCTION public.refresh_courier_charges_for_rate() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  rate_courier_id uuid;
  rate_governorate text;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.courier_id IS DISTINCT FROM OLD.courier_id OR
    lower(btrim(NEW.governorate)) IS DISTINCT FROM lower(btrim(OLD.governorate))
  ) THEN
    RAISE EXCEPTION 'Move a courier rate by creating a new dated rate instead';
  END IF;
  IF TG_OP = 'DELETE' THEN
    rate_courier_id := OLD.courier_id;
    rate_governorate := OLD.governorate;
  ELSE
    rate_courier_id := NEW.courier_id;
    rate_governorate := NEW.governorate;
  END IF;
  UPDATE public.orders o
  SET shipment_outcome = o.shipment_outcome
  WHERE o.courier_id = rate_courier_id
    AND lower(btrim(o.shipping_governorate)) = lower(btrim(rate_governorate))
    AND o.shipment_outcome IN ('delivered','returned','customer_returned','exchanged')
    AND NOT EXISTS (
      SELECT 1 FROM public.courier_charges c
      WHERE c.order_id = o.id AND c.settled_at IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.courier_charges c
      WHERE c.order_id = o.id AND c.charge_type = 'legacy_return'
    );
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_customer_brand_metrics(_customer_id uuid, _brand_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
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

CREATE OR REPLACE FUNCTION public.refresh_customer_metrics_trigger() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
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

CREATE OR REPLACE FUNCTION public.release_order_dispatch_claim(_order_id uuid, _claim_token uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.orders SET
    dispatch_claim_token = NULL,
    dispatch_claimed_by = NULL,
    dispatch_claimed_at = NULL
  WHERE id = _order_id
    AND dispatch_claim_token = _claim_token
    AND dispatch_claimed_by = auth.uid();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_invoices_prep_field_lock() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF public.has_role(auth.uid(),'admin')
     OR public.has_role(auth.uid(),'manager')
     OR public.has_role(auth.uid(),'data_entry')
     OR public.has_role(auth.uid(),'accountant') THEN
    RETURN NEW;
  END IF;
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

CREATE OR REPLACE FUNCTION public.sii_stock_in() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _is_return boolean;
BEGIN
  IF NEW.qty IS NULL OR NEW.qty <= 0 THEN RETURN NEW; END IF;
  SELECT (type = 'return') INTO _is_return FROM public.supplier_invoices WHERE id = NEW.invoice_id;
  IF NEW.product_id IS NOT NULL THEN
    INSERT INTO public.inventory_movements(product_id, type, qty, unit_cost, reason, source, source_id, note)
    VALUES (
      NEW.product_id,
      (CASE WHEN _is_return THEN 'supplier_return' ELSE 'production' END)::public.inventory_movement_type,
      NEW.qty, NEW.unit_cost,
      CASE WHEN _is_return THEN 'supplier_return' ELSE 'purchase' END,
      'supplier_invoice', NEW.invoice_id,
      CASE WHEN _is_return THEN 'مرتجع بضاعة لمورد' ELSE 'دخول مخزون من فاتورة مشتريات' END
    );
  ELSIF NEW.material_id IS NOT NULL THEN
    INSERT INTO public.inventory_movements(material_id, type, qty, unit_cost, reason, source, source_id, note)
    VALUES (
      NEW.material_id,
      (CASE WHEN _is_return THEN 'supplier_return' ELSE 'production' END)::public.inventory_movement_type,
      NEW.qty, NEW.unit_cost,
      CASE WHEN _is_return THEN 'supplier_return' ELSE 'purchase' END,
      'supplier_invoice', NEW.invoice_id,
      CASE WHEN _is_return THEN 'مرتجع خامات لمورد' ELSE 'دخول خامات من فاتورة مشتريات' END
    );
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sii_update_material_avg_cost() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  cur_qty  numeric;
  cur_cost numeric;
  new_cost numeric;
  _is_return boolean;
BEGIN
  IF NEW.kind <> 'material' OR NEW.material_id IS NULL OR NEW.qty <= 0 THEN
    RETURN NEW;
  END IF;
  SELECT (type = 'return') INTO _is_return FROM public.supplier_invoices WHERE id = NEW.invoice_id;
  IF _is_return THEN
    RETURN NEW;
  END IF;
  SELECT coalesce(unit_cost,0) INTO cur_cost
    FROM public.materials WHERE id = NEW.material_id FOR UPDATE;
  SELECT coalesce(sum(sii.qty),0) INTO cur_qty
    FROM public.supplier_invoice_items sii
    JOIN public.supplier_invoices si ON si.id = sii.invoice_id
    WHERE sii.material_id = NEW.material_id AND sii.id <> NEW.id AND si.type = 'purchase';
  IF cur_qty + NEW.qty > 0 THEN
    new_cost := ((cur_qty * cur_cost) + (NEW.qty * NEW.unit_cost)) / (cur_qty + NEW.qty);
    UPDATE public.materials SET unit_cost = new_cost WHERE id = NEW.material_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_cash_delete_expense() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  IF OLD.expense_entry_id IS NOT NULL THEN
    DELETE FROM public.expense_entries WHERE id = OLD.expense_entry_id;
  ELSE
    DELETE FROM public.expense_entries WHERE cash_transaction_id = OLD.id;
  END IF;
  RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION public.sync_cash_to_expense() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE new_exp_id uuid; y int; m int;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.expense_entry_id IS NOT NULL AND TG_OP='INSERT' THEN RETURN NEW; END IF;
  IF NEW.type <> 'other_out' THEN RETURN NEW; END IF;
  IF NEW.category_id IS NULL OR NEW.brand_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.amount,0) <= 0 THEN RETURN NEW; END IF;

  y := EXTRACT(YEAR FROM NEW.occurred_at)::int;
  m := EXTRACT(MONTH FROM NEW.occurred_at)::int;

  IF TG_OP='INSERT' THEN
    INSERT INTO public.expense_entries(brand_id, category_id, year, month, amount, note, period_type, period_date, cash_transaction_id)
    VALUES (NEW.brand_id, NEW.category_id, y, m, NEW.amount, NEW.note, 'daily', NEW.occurred_at, NEW.id)
    RETURNING id INTO new_exp_id;
    UPDATE public.cash_transactions SET expense_entry_id = new_exp_id WHERE id = NEW.id;
  ELSIF TG_OP='UPDATE' THEN
    UPDATE public.expense_entries
      SET amount=NEW.amount, brand_id=NEW.brand_id, category_id=NEW.category_id,
          year=y, month=m, period_date=NEW.occurred_at, note=NEW.note
      WHERE cash_transaction_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sync_expense_delete_cash() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  IF OLD.cash_transaction_id IS NOT NULL THEN
    DELETE FROM public.cash_transactions WHERE id = OLD.cash_transaction_id;
  END IF;
  RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION public.sync_expense_to_cash() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  new_cash_id uuid;
  occ date;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.cash_transaction_id IS NOT NULL THEN
      DELETE FROM public.cash_transactions
      WHERE id = OLD.cash_transaction_id;
    ELSE
      DELETE FROM public.cash_transactions
      WHERE expense_entry_id = OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.cash_transaction_id IS NOT NULL AND TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.amount, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  occ := COALESCE(NEW.period_date, make_date(NEW.year, GREATEST(1, LEAST(12, NEW.month)), 15));

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.cash_transactions(type, amount, occurred_at, brand_id, category_id, expense_entry_id, note)
    VALUES ('other_out', NEW.amount, occ, NEW.brand_id, NEW.category_id, NEW.id, COALESCE(NEW.note, 'مصروف'))
    RETURNING id INTO new_cash_id;

    UPDATE public.expense_entries
    SET cash_transaction_id = new_cash_id
    WHERE id = NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.cash_transaction_id IS NOT NULL THEN
      UPDATE public.cash_transactions
      SET amount = NEW.amount,
          occurred_at = occ,
          brand_id = NEW.brand_id,
          category_id = NEW.category_id,
          note = COALESCE(NEW.note, 'مصروف')
      WHERE id = NEW.cash_transaction_id;
    ELSE
      SELECT id INTO new_cash_id
      FROM public.cash_transactions
      WHERE expense_entry_id = NEW.id
      LIMIT 1;

      IF new_cash_id IS NULL THEN
        INSERT INTO public.cash_transactions(type, amount, occurred_at, brand_id, category_id, expense_entry_id, note)
        VALUES ('other_out', NEW.amount, occ, NEW.brand_id, NEW.category_id, NEW.id, COALESCE(NEW.note, 'مصروف'))
        RETURNING id INTO new_cash_id;
      ELSE
        UPDATE public.cash_transactions
        SET amount = NEW.amount,
            occurred_at = occ,
            brand_id = NEW.brand_id,
            category_id = NEW.category_id,
            note = COALESCE(NEW.note, 'مصروف')
        WHERE id = new_cash_id;
      END IF;

      UPDATE public.expense_entries
      SET cash_transaction_id = new_cash_id
      WHERE id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.sync_order_cost_total() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order uuid;
  v_total numeric;
BEGIN
  v_order := COALESCE(NEW.order_id, OLD.order_id);
  SELECT COALESCE(SUM(qty * COALESCE(unit_cost, 0)), 0) INTO v_total
  FROM public.order_items WHERE order_id = v_order;
  UPDATE public.orders SET cost_total = v_total WHERE id = v_order;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_order_item_cost() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_cost numeric;
BEGIN
  IF NEW.product_id IS NOT NULL AND (NEW.unit_cost IS NULL OR NEW.unit_cost = 0) THEN
    v_cost := public.product_cogs(NEW.product_id);
    NEW.unit_cost := coalesce(v_cost, 0);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_salary_expense() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  emp_brand uuid;
  emp_salary numeric;
  cat_id uuid;
  net_amount numeric;
BEGIN
  SELECT brand_id, salary INTO emp_brand, emp_salary
    FROM public.employees WHERE id = NEW.employee_id;
  IF emp_brand IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO cat_id FROM public.expense_categories WHERE slug = 'salaries' LIMIT 1;
  IF cat_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.approved THEN
    net_amount := COALESCE(emp_salary,0) - COALESCE(NEW.deductions,0) + COALESCE(NEW.bonuses,0);
    UPDATE public.expense_entries
      SET amount = net_amount, brand_id = emp_brand, year = NEW.year, month = NEW.month,
          category_id = cat_id, period_type = 'monthly'
      WHERE attendance_id = NEW.id;
    IF NOT FOUND THEN
      INSERT INTO public.expense_entries(brand_id, category_id, year, month, amount, note, period_type, attendance_id)
        VALUES (emp_brand, cat_id, NEW.year, NEW.month, net_amount,
                'مرتب موظف (تلقائي)', 'monthly', NEW.id);
    END IF;
  ELSE
    DELETE FROM public.expense_entries WHERE attendance_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_sales_return_cash() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  cat_id uuid;
  new_cash_id uuid;
  built_note text;
BEGIN
  SELECT id INTO cat_id FROM public.expense_categories WHERE slug = 'sales_refunds' LIMIT 1;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.cash_transactions
      WHERE note = 'مرتجع مبيعات #' || OLD.id::text;
    RETURN OLD;
  END IF;

  built_note := 'مرتجع مبيعات #' || NEW.id::text;

  IF NEW.type = 'return' AND COALESCE(NEW.total_amount,0) > 0 THEN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.cash_transactions(type, amount, occurred_at, brand_id, category_id, note)
      VALUES ('other_out', NEW.total_amount, NEW.occurred_at, NEW.brand_id, cat_id, built_note)
      RETURNING id INTO new_cash_id;
    ELSIF TG_OP = 'UPDATE' THEN
      UPDATE public.cash_transactions
        SET amount = NEW.total_amount,
            occurred_at = NEW.occurred_at,
            brand_id = NEW.brand_id,
            category_id = COALESCE(category_id, cat_id)
        WHERE note = built_note;
      IF NOT FOUND THEN
        INSERT INTO public.cash_transactions(type, amount, occurred_at, brand_id, category_id, note)
        VALUES ('other_out', NEW.total_amount, NEW.occurred_at, NEW.brand_id, cat_id, built_note);
      END IF;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.type = 'return' AND NEW.type <> 'return' THEN
    DELETE FROM public.cash_transactions WHERE note = 'مرتجع مبيعات #' || NEW.id::text;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sync_service_client_to_customer() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
END $_$;

CREATE OR REPLACE FUNCTION public.sync_service_project_invoice() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

CREATE OR REPLACE FUNCTION public.sync_service_project_invoice_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.invoice_id IS NOT NULL THEN
    DELETE FROM public.sales_invoices WHERE id = OLD.invoice_id;
  END IF;
  RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION public.sync_supplier_payment() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  new_cash_id uuid;
  b_id uuid;
  s_name text;
  cat_id uuid;
  built_note text;
  sup_id uuid;
BEGIN
  SELECT id INTO cat_id FROM public.expense_categories WHERE slug = 'supplier_payments' LIMIT 1;

  IF NEW.invoice_id IS NOT NULL THEN
    SELECT si.brand_id, sup.name, si.supplier_id
      INTO b_id, s_name, sup_id
      FROM public.supplier_invoices si
      LEFT JOIN public.suppliers sup ON sup.id = si.supplier_id
      WHERE si.id = NEW.invoice_id;
  ELSE
    sup_id := NEW.supplier_id;
    SELECT sup.brand_id, sup.name INTO b_id, s_name FROM public.suppliers sup WHERE sup.id = sup_id;
  END IF;

  IF NEW.supplier_id IS NULL AND sup_id IS NOT NULL THEN
    NEW.supplier_id := sup_id;
  END IF;

  built_note := 'دفعة مورد: ' || COALESCE(s_name,'') ||
                CASE WHEN NEW.note IS NOT NULL AND NEW.note <> '' THEN ' - ' || NEW.note ELSE '' END;

  IF TG_OP = 'INSERT' THEN
    IF NEW.cash_transaction_id IS NULL AND COALESCE(NEW.amount,0) > 0 THEN
      INSERT INTO public.cash_transactions(type, amount, occurred_at, brand_id, category_id, note, wallet_id)
      VALUES ('other_out', NEW.amount, NEW.paid_at, b_id, cat_id, built_note,
              (SELECT id FROM public.wallets WHERE active = true ORDER BY sort_order LIMIT 1))
      RETURNING id INTO new_cash_id;
      UPDATE public.supplier_payments SET cash_transaction_id = new_cash_id, supplier_id = sup_id WHERE id = NEW.id;
    END IF;
    IF NEW.invoice_id IS NOT NULL THEN
      PERFORM public.recompute_supplier_invoice_status(NEW.invoice_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.cash_transaction_id IS NOT NULL THEN
      UPDATE public.cash_transactions
        SET amount = NEW.amount,
            occurred_at = NEW.paid_at,
            brand_id = b_id,
            category_id = COALESCE(category_id, cat_id),
            note = built_note
        WHERE id = NEW.cash_transaction_id;
    END IF;
    IF NEW.invoice_id IS NOT NULL THEN
      PERFORM public.recompute_supplier_invoice_status(NEW.invoice_id);
    END IF;
    IF OLD.invoice_id IS NOT NULL AND OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
      PERFORM public.recompute_supplier_invoice_status(OLD.invoice_id);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sync_supplier_payment_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.cash_transaction_id IS NOT NULL THEN
    DELETE FROM public.cash_transactions WHERE id = OLD.cash_transaction_id;
  END IF;
  PERFORM public.recompute_supplier_invoice_status(OLD.invoice_id);
  RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION public.tasks_prevent_assignee_field_tampering() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN
    IF NEW.title IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.brand_id IS DISTINCT FROM OLD.brand_id
       OR NEW.priority IS DISTINCT FROM OLD.priority
       OR NEW.due_date IS DISTINCT FROM OLD.due_date
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
      RAISE EXCEPTION 'Assignees may only update task status fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_sales_invoice_stage() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_updated_at := now();
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.try_parse_source_timestamptz(_value text) RETURNS timestamp with time zone
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NULLIF(btrim(_value), '') IS NULL THEN RETURN NULL; END IF;
  RETURN _value::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.upsert_order_with_items(_order_id uuid, _order_patch jsonb, _items jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  target_order_id uuid;
  column_names text;
  selected_columns text;
BEGIN
  IF _order_patch IS NULL OR jsonb_typeof(_order_patch) <> 'object' THEN
    RAISE EXCEPTION 'order patch must be a JSON object';
  END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' THEN
    RAISE EXCEPTION 'items must be a JSON array';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(_order_patch) AS requested(name)
    LEFT JOIN pg_attribute a
      ON a.attrelid = 'public.orders'::regclass
     AND a.attname = requested.name
     AND a.attnum > 0
     AND NOT a.attisdropped
    WHERE a.attname IS NULL OR requested.name IN ('id', 'created_at')
  ) THEN
    RAISE EXCEPTION 'order patch contains an invalid or immutable column';
  END IF;

  SELECT
    string_agg(format('%I', requested.name), ', ' ORDER BY requested.name),
    string_agg(format('x.%I', requested.name), ', ' ORDER BY requested.name)
  INTO column_names, selected_columns
  FROM jsonb_object_keys(_order_patch) AS requested(name);

  IF column_names IS NULL THEN
    RAISE EXCEPTION 'order patch cannot be empty';
  END IF;

  IF _order_id IS NULL THEN
    EXECUTE format(
      'INSERT INTO public.orders (%s) SELECT %s FROM jsonb_populate_record(NULL::public.orders, $1) AS x RETURNING id',
      column_names,
      selected_columns
    )
    USING _order_patch
    INTO target_order_id;
  ELSE
    EXECUTE format(
      'UPDATE public.orders AS o SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.orders, $1) AS x) WHERE o.id = $2 RETURNING o.id',
      column_names,
      selected_columns
    )
    USING _order_patch, _order_id
    INTO target_order_id;
  END IF;

  IF target_order_id IS NULL THEN
    RAISE EXCEPTION 'order not found or not writable';
  END IF;

  DELETE FROM public.order_items WHERE order_id = target_order_id;

  INSERT INTO public.order_items (
    order_id, product_id, sku, title, qty, unit_price, unit_cost, subtotal
  )
  SELECT
    target_order_id,
    item.product_id,
    item.sku,
    item.title,
    item.qty,
    item.unit_price,
    item.unit_cost,
    item.subtotal
  FROM jsonb_to_recordset(_items) AS item(
    product_id uuid,
    sku text,
    title text,
    qty numeric,
    unit_price numeric,
    unit_cost numeric,
    subtotal numeric
  );

  RETURN target_order_id;
END;
$_$;

CREATE OR REPLACE FUNCTION public.archive_financial_audit_logs(_before timestamp with time zone DEFAULT (now() - '180 days'::interval), _limit integer DEFAULT 10000) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  moved integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  WITH picked AS MATERIALIZED (
    SELECT id FROM public.financial_audit_log
    WHERE created_at < _before ORDER BY created_at LIMIT LEAST(GREATEST(_limit, 1), 50000)
    FOR UPDATE SKIP LOCKED
  ), archived AS (
    INSERT INTO public.financial_audit_log_archive
    SELECT l.* FROM public.financial_audit_log l JOIN picked p ON p.id = l.id
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  ), removed AS (
    DELETE FROM public.financial_audit_log l
    USING picked p
    WHERE l.id = p.id
      AND EXISTS (SELECT 1 FROM public.financial_audit_log_archive a WHERE a.id = l.id)
    RETURNING l.id
  )
  SELECT count(*) INTO moved FROM removed;
  RETURN moved;
END;
$$;

CREATE OR REPLACE FUNCTION public.bh_can_access_brand(_user_id uuid, _brand_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT public.bh_is_manager(_user_id)
     OR EXISTS (
       SELECT 1 FROM public.bh_brand_access
       WHERE user_id = _user_id AND brand_id = _brand_id
     )
$$;

CREATE OR REPLACE FUNCTION public.can_read_page(_user_id uuid, _route text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(public.page_access_level(_user_id, _route) IN ('read', 'write'), false)
$$;

CREATE OR REPLACE FUNCTION public.can_write_page(_user_id uuid, _route text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(public.page_access_level(_user_id, _route) = 'write', false)
$$;

CREATE OR REPLACE FUNCTION public.cash_flow_grouped(_from date, _to date, _brand_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
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

CREATE OR REPLACE FUNCTION public.employees_guard_user_id_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
            OR public.has_role(auth.uid(), 'manager'::app_role)) THEN
      RAISE EXCEPTION 'Only admins or managers can change the linked account of an employee record';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_brand_access(_user_id uuid, _brand_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    public.has_role(_user_id,'admin')
    OR public.has_role(_user_id,'manager')
    OR public.has_role(_user_id,'accountant')
    OR EXISTS (SELECT 1 FROM public.user_brand_access WHERE user_id = _user_id AND brand_id = _brand_id)
$$;

CREATE OR REPLACE FUNCTION public.reconcile_release_order_dispatch_claim(_order_id uuid, _confirmed_absent_on_bosta boolean) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  current_order public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
     OR NOT public.can_write_page(auth.uid(), '/couriers') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF NOT COALESCE(_confirmed_absent_on_bosta, false) THEN
    RAISE EXCEPTION 'Confirm that no Bosta delivery exists before releasing the claim';
  END IF;
  SELECT * INTO current_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.has_brand_access(auth.uid(), current_order.brand_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.orders SET
    dispatch_claim_token = NULL,
    dispatch_claimed_by = NULL,
    dispatch_claimed_at = NULL
  WHERE id = _order_id
    AND dispatch_claim_token IS NOT NULL
    AND dispatch_claimed_at < now() - interval '15 minutes'
    AND bosta_tracking IS NULL
    AND dispatch_tracking IS NULL;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.require_page_read(_route text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_read_page(auth.uid(), _route) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.revenue_comparison_report(_year integer, _brand_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
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

CREATE OR REPLACE FUNCTION public.reverse_purchase_order_completion(_po_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  po record;
  mv record;
  _payment_count int;
BEGIN
  SELECT * INTO po FROM public.purchase_orders WHERE id = _po_id FOR UPDATE;
  IF po.id IS NULL THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;
  IF NOT (public.has_brand_access(_uid, po.brand_id) AND public.is_writer(_uid)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF po.status <> 'completed' THEN
    RAISE EXCEPTION 'Purchase order is not completed';
  END IF;

  IF po.invoice_id IS NOT NULL THEN
    SELECT count(*) INTO _payment_count FROM public.supplier_payments WHERE invoice_id = po.invoice_id;
    IF _payment_count > 0 THEN
      RAISE EXCEPTION 'Cannot reverse: supplier payments already recorded against this order''s invoice. Remove them first.';
    END IF;

    FOR mv IN
      SELECT * FROM public.inventory_movements
      WHERE source = 'supplier_invoice' AND source_id = po.invoice_id
    LOOP
      INSERT INTO public.inventory_movements (product_id, material_id, type, qty, occurred_at, note, source, source_id)
      VALUES (mv.product_id, mv.material_id, 'adjustment', -abs(mv.qty), (now() AT TIME ZONE 'Africa/Cairo')::date,
              'تراجع عن إكمال أمر شراء', 'purchase_order_reversal', _po_id);
    END LOOP;

    DELETE FROM public.supplier_invoice_items WHERE invoice_id = po.invoice_id;
    DELETE FROM public.supplier_invoices WHERE id = po.invoice_id;
  END IF;

  UPDATE public.purchase_orders SET status = 'awaiting_delivery', invoice_id = NULL WHERE id = _po_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_order_lifecycle_manually(_order_id uuid, _order_status text, _collection_status text, _shipment_outcome text, _fulfillment_status text, _confirmation_status text, _financial_status text, _shopify_sync_status text, _shopify_sync_error text, _raw jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  order_brand_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_write_page(auth.uid(), '/orders') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT brand_id INTO order_brand_id FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.has_brand_access(auth.uid(), order_brand_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  PERFORM set_config('app.manual_lifecycle_actor', auth.uid()::text, true);
  UPDATE public.orders SET
    order_status = _order_status,
    collection_status = _collection_status,
    shipment_outcome = _shipment_outcome,
    fulfillment_status = _fulfillment_status,
    confirmation_status = _confirmation_status,
    financial_status = _financial_status,
    lifecycle_source = 'manual',
    lifecycle_updated_by = auth.uid(),
    lifecycle_updated_at = now(),
    shopify_sync_status = _shopify_sync_status,
    shopify_sync_error = _shopify_sync_error,
    raw = _raw
  WHERE id = _order_id;
  RETURN _order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accounting_profit_report(_from date, _to date, _brand_id uuid DEFAULT NULL::uuid, _exclude_brand_ids uuid[] DEFAULT ARRAY[]::uuid[]) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
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

CREATE OR REPLACE FUNCTION public.archive_order_source_payload(_order_id uuid, _source text, _payload jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  target_brand_id uuid;
  next_hash text;
BEGIN
  IF _payload IS NULL THEN RETURN; END IF;
  SELECT brand_id INTO target_brand_id FROM public.orders WHERE id = _order_id;
  IF target_brand_id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF auth.uid() IS NOT NULL AND (
    NOT public.has_brand_access(auth.uid(), target_brand_id)
    OR NOT (
      public.can_write_page(auth.uid(), '/orders')
      OR public.can_write_page(auth.uid(), '/couriers')
      OR public.can_write_page(auth.uid(), '/integrations')
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  next_hash := encode(extensions.digest(_payload::text, 'sha256'), 'hex');
  INSERT INTO public.order_source_payloads(
    order_id, brand_id, source, payload, payload_hash, payload_bytes, archived_at
  ) VALUES (
    _order_id, target_brand_id, lower(btrim(_source)), _payload, next_hash,
    octet_length(_payload::text), now()
  )
  ON CONFLICT (order_id, source, payload_hash) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_customer(_user_id uuid, _customer_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT
    public.has_role(_user_id,'admin')
    OR public.has_role(_user_id,'manager')
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = _customer_id AND c.is_general = true)
    OR EXISTS (
      SELECT 1 FROM public.customer_brands cb
      WHERE cb.customer_id = _customer_id
        AND public.has_brand_access(_user_id, cb.brand_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_service_project(_user_id uuid, _project_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.service_projects p
    WHERE p.id = _project_id AND public.has_brand_access(_user_id, p.brand_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.claim_order_dispatch(_order_id uuid, _claim_token uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  current_order public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO current_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.has_brand_access(auth.uid(), current_order.brand_id)
     OR NOT (public.can_write_page(auth.uid(), '/orders') OR public.can_write_page(auth.uid(), '/couriers')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF current_order.shipment_outcome IN (
    'delivered', 'returned', 'customer_returned', 'exchanged', 'cancelled_before_dispatch'
  ) THEN
    RAISE EXCEPTION 'Cannot dispatch a terminal order';
  END IF;
  IF current_order.bosta_tracking IS NOT NULL
     OR current_order.dispatch_tracking IS NOT NULL
     OR current_order.dispatch_claim_token IS NOT NULL THEN
    RAISE EXCEPTION 'Order is already dispatched or dispatch is in progress';
  END IF;
  UPDATE public.orders SET
    dispatch_claim_token = _claim_token,
    dispatch_claimed_by = auth.uid(),
    dispatch_claimed_at = now()
  WHERE id = _order_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_purchase_order(_po_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  po record;
  _invoice_id uuid;
  _total numeric := 0;
  item record;
BEGIN
  SELECT * INTO po FROM public.purchase_orders WHERE id = _po_id FOR UPDATE;
  IF po.id IS NULL THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;
  IF NOT (public.has_brand_access(_uid, po.brand_id) AND public.is_writer(_uid)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF po.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Purchase order is already %', po.status;
  END IF;

  SELECT COALESCE(SUM(qty * unit_cost), 0) INTO _total
  FROM public.purchase_order_items WHERE purchase_order_id = _po_id;
  IF _total <= 0 THEN
    RAISE EXCEPTION 'Purchase order has no items to complete';
  END IF;

  INSERT INTO public.supplier_invoices (supplier_id, brand_id, amount, issued_at, status, note)
  VALUES (po.supplier_id, po.brand_id, _total, (now() AT TIME ZONE 'Africa/Cairo')::date, 'open',
          'أمر شراء #' || substr(_po_id::text, 1, 8))
  RETURNING id INTO _invoice_id;

  FOR item IN SELECT * FROM public.purchase_order_items WHERE purchase_order_id = _po_id LOOP
    INSERT INTO public.supplier_invoice_items (invoice_id, product_id, material_id, kind, qty, unit_cost, subtotal)
    VALUES (
      _invoice_id, item.product_id, item.material_id,
      CASE WHEN item.product_id IS NOT NULL THEN 'product' ELSE 'material' END,
      item.qty, item.unit_cost, item.qty * item.unit_cost
    );
  END LOOP;

  UPDATE public.purchase_orders SET status = 'completed', invoice_id = _invoice_id WHERE id = _po_id;
  RETURN _invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.courier_accessible_to_user(_user_id uuid, _courier_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.couriers c
    WHERE c.id = _courier_id
      AND (
        c.serves_all_brands
        OR (c.brand_id IS NOT NULL AND public.has_brand_access(_user_id, c.brand_id))
        OR EXISTS (
          SELECT 1 FROM public.courier_brands cb
          WHERE cb.courier_id = c.id AND public.has_brand_access(_user_id, cb.brand_id)
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.courier_manageable_by_user(_user_id uuid, _courier_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.couriers c
    WHERE c.id = _courier_id
      AND (
        (c.serves_all_brands AND public.has_role(_user_id, 'admin'))
        OR (
          NOT c.serves_all_brands
          AND (c.brand_id IS NULL OR public.has_brand_access(_user_id, c.brand_id))
          AND NOT EXISTS (
            SELECT 1 FROM public.courier_brands cb
            WHERE cb.courier_id = c.id
              AND NOT public.has_brand_access(_user_id, cb.brand_id)
          )
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.customers_filter_summary(_search text DEFAULT NULL::text, _segment text DEFAULT NULL::text, _brand_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
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

CREATE OR REPLACE FUNCTION public.customers_page(_search text DEFAULT NULL::text, _segment text DEFAULT NULL::text, _brand_id uuid DEFAULT NULL::uuid, _cursor_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _cursor_id uuid DEFAULT NULL::uuid, _limit integer DEFAULT 50) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
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

CREATE OR REPLACE FUNCTION public.customers_summary() RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
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

CREATE OR REPLACE FUNCTION public.dashboard_operational_report(_from timestamp with time zone, _to timestamp with time zone, _brand_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  _brands uuid[];
  _couriers uuid[];
  _result jsonb;
BEGIN
  IF NOT public.can_read_page(_uid, '/dashboard') THEN
    RETURN NULL;
  END IF;
  IF _brand_id IS NOT NULL AND NOT public.has_brand_access(_uid, _brand_id) THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(array_agg(b.id), '{}')
    INTO _brands
  FROM public.brands b
  WHERE public.has_brand_access(_uid, b.id)
    AND (_brand_id IS NULL OR b.id = _brand_id);

  SELECT coalesce(array_agg(c.id), '{}')
    INTO _couriers
  FROM public.couriers c
  WHERE c.active = true
    AND public.courier_accessible_to_user(_uid, c.id);

  WITH scoped_invoices AS MATERIALIZED (
    SELECT si.id, si.brand_id, si.product_id, si.type, si.qty, si.total_amount, si.occurred_at,
      COALESCE(b.cogs_percent_default, 0)::numeric AS default_cogs_pct
    FROM public.sales_invoices si
    JOIN public.brands b ON b.id = si.brand_id
    WHERE si.occurred_at >= _from AND si.occurred_at <= _to
      AND si.brand_id = ANY(_brands)
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
      AND o.brand_id = ANY(_brands)
    GROUP BY extract(month FROM o.occurred_at)
  ), courier_performance AS (
    SELECT c.id, c.name, c.type,
      count(o.id) FILTER (WHERE o.fulfillment_status = 'delivered')::bigint AS delivered,
      count(o.id) FILTER (WHERE o.fulfillment_status = 'returned')::bigint AS returned,
      COALESCE(sum(o.total_amount) FILTER (WHERE o.fulfillment_status = 'delivered'), 0)::numeric AS collected
    FROM public.couriers c
    LEFT JOIN public.orders o ON o.courier_id = c.id
      AND o.occurred_at >= _from AND o.occurred_at <= _to
      AND o.brand_id = ANY(_brands)
    WHERE c.id = ANY(_couriers)
    GROUP BY c.id, c.name, c.type
  ), inventory_products AS (
    SELECT im.product_id AS "productId",
      COALESCE(sum(CASE WHEN im.type IN ('production','return','adjustment') THEN im.qty ELSE -im.qty END), 0)::numeric AS stock,
      COALESCE(sum(im.qty) FILTER (WHERE im.type = 'production'), 0)::numeric AS produced
    FROM public.inventory_movements im
    JOIN public.products p ON p.id = im.product_id
    WHERE im.occurred_at >= _from AND im.occurred_at <= _to
      AND p.brand_id = ANY(_brands)
    GROUP BY im.product_id
  ), workers AS (
    SELECT im.worker_name AS name, sum(im.qty)::numeric AS produced,
      count(DISTINCT im.product_id)::bigint AS "productCount"
    FROM public.inventory_movements im
    JOIN public.products p ON p.id = im.product_id
    WHERE im.type = 'production' AND NULLIF(btrim(im.worker_name), '') IS NOT NULL
      AND im.occurred_at >= _from AND im.occurred_at <= _to
      AND p.brand_id = ANY(_brands)
    GROUP BY im.worker_name
  ), fulfillment AS (
    SELECT fe.employee_name AS name, sum(fe.orders_prepared)::numeric AS prepared,
      count(DISTINCT fe.occurred_at)::bigint AS days
    FROM public.fulfillment_entries fe
    WHERE fe.occurred_at >= _from::date AND fe.occurred_at <= _to::date
      AND fe.brand_id = ANY(_brands)
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
  ) INTO _result;

  RETURN _result;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_purchase_order(_po_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _uid uuid := auth.uid();
  po record;
BEGIN
  SELECT * INTO po FROM public.purchase_orders WHERE id = _po_id FOR UPDATE;
  IF po.id IS NULL THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;
  IF NOT (public.has_brand_access(_uid, po.brand_id) AND public.is_writer(_uid)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF po.status = 'completed' THEN
    PERFORM public.reverse_purchase_order_completion(_po_id);
  END IF;
  DELETE FROM public.purchase_orders WHERE id = _po_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_generic_order_dispatch(_order_id uuid, _claim_token uuid, _courier_id uuid, _tracking text, _provider_tracking boolean, _note text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE current_order public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NULLIF(btrim(_tracking), '') IS NULL THEN RAISE EXCEPTION 'Tracking is required'; END IF;
  SELECT * INTO current_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.has_brand_access(auth.uid(), current_order.brand_id)
     OR NOT public.can_write_page(auth.uid(), '/couriers')
     OR NOT public.courier_serves_brand(_courier_id, current_order.brand_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF current_order.dispatch_claim_token IS DISTINCT FROM _claim_token
     OR current_order.dispatch_claimed_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Dispatch claim is no longer owned by this request';
  END IF;
  IF current_order.bosta_tracking IS NOT NULL OR current_order.dispatch_tracking IS NOT NULL THEN
    RAISE EXCEPTION 'Order already has tracking';
  END IF;
  IF current_order.shipment_outcome IN (
    'delivered', 'returned', 'customer_returned', 'exchanged', 'cancelled_before_dispatch'
  ) THEN
    RAISE EXCEPTION 'Cannot finalize dispatch for a terminal order';
  END IF;
  UPDATE public.orders SET
    courier_id = _courier_id,
    fulfillment_status = 'processing',
    lifecycle_source = CASE WHEN _provider_tracking THEN 'bosta' ELSE 'system' END,
    lifecycle_updated_by = NULL,
    lifecycle_updated_at = now(),
    note = _note,
    bosta_tracking = CASE WHEN _provider_tracking THEN btrim(_tracking) ELSE NULL END,
    bosta_sent_at = CASE WHEN _provider_tracking THEN now() ELSE bosta_sent_at END,
    dispatch_tracking = CASE WHEN _provider_tracking THEN NULL ELSE btrim(_tracking) END,
    dispatch_claim_token = NULL,
    dispatch_claimed_by = NULL,
    dispatch_claimed_at = NULL
  WHERE id = _order_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_order_dispatch(_order_id uuid, _claim_token uuid, _tracking text, _delivery_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  current_order public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NULLIF(btrim(_tracking), '') IS NULL THEN RAISE EXCEPTION 'Tracking is required'; END IF;
  SELECT * INTO current_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.has_brand_access(auth.uid(), current_order.brand_id)
     OR NOT (public.can_write_page(auth.uid(), '/orders') OR public.can_write_page(auth.uid(), '/couriers')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF current_order.dispatch_claim_token IS DISTINCT FROM _claim_token
     OR current_order.dispatch_claimed_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Dispatch claim is no longer owned by this request';
  END IF;
  IF current_order.bosta_tracking IS NOT NULL OR current_order.dispatch_tracking IS NOT NULL THEN
    RAISE EXCEPTION 'Order already has tracking';
  END IF;
  IF current_order.shipment_outcome IN (
    'delivered', 'returned', 'customer_returned', 'exchanged', 'cancelled_before_dispatch'
  ) THEN
    RAISE EXCEPTION 'Cannot finalize dispatch for a terminal order';
  END IF;
  UPDATE public.orders SET
    fulfillment_status = 'shipped',
    order_status = 'processing',
    collection_status = 'processing',
    shipment_outcome = 'open',
    courier_status_raw = 'created',
    courier_collection_status_raw = 'pending',
    lifecycle_source = 'bosta',
    lifecycle_updated_by = NULL,
    lifecycle_updated_at = now(),
    bosta_tracking = btrim(_tracking),
    bosta_delivery_id = NULLIF(btrim(_delivery_id), ''),
    bosta_sent_at = now(),
    dispatch_claim_token = NULL,
    dispatch_claimed_by = NULL,
    dispatch_claimed_at = NULL
  WHERE id = _order_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.orders_filter_summary(_from timestamp with time zone, _to timestamp with time zone, _brand_id uuid DEFAULT NULL::uuid, _order_status text DEFAULT NULL::text, _search text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
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

CREATE OR REPLACE FUNCTION public.orders_page(_from timestamp with time zone, _to timestamp with time zone, _brand_id uuid DEFAULT NULL::uuid, _order_status text DEFAULT NULL::text, _search text DEFAULT NULL::text, _cursor_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _cursor_id uuid DEFAULT NULL::uuid, _limit integer DEFAULT 50) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
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

CREATE OR REPLACE FUNCTION public.orders_summary(_from timestamp with time zone, _to timestamp with time zone, _brand_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
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

CREATE OR REPLACE FUNCTION public.upsert_courier_with_brands(_courier_id uuid, _name text, _type text, _contact text, _active boolean, _opening_balance numeric, _serves_all_brands boolean, _brand_ids uuid[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  saved_id uuid;
  legacy_brand_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') AND NOT public.has_role(auth.uid(), 'manager') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF NOT public.can_write_page(auth.uid(), '/couriers') THEN
    RAISE EXCEPTION 'Forbidden: courier write access denied';
  END IF;
  IF _courier_id IS NOT NULL AND NOT public.courier_manageable_by_user(auth.uid(), _courier_id) THEN
    RAISE EXCEPTION 'Forbidden: existing courier brand access denied';
  END IF;
  IF _serves_all_brands AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can manage all-brand couriers';
  END IF;
  IF NOT _serves_all_brands AND COALESCE(array_length(_brand_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Choose at least one brand or all brands';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(COALESCE(_brand_ids, ARRAY[]::uuid[])) b
    WHERE NOT public.has_brand_access(auth.uid(), b)
  ) THEN
    RAISE EXCEPTION 'Forbidden: brand access denied';
  END IF;
  legacy_brand_id := CASE
    WHEN NOT _serves_all_brands AND array_length(_brand_ids, 1) = 1 THEN _brand_ids[1]
    ELSE NULL
  END;
  INSERT INTO public.couriers(id, name, type, contact, brand_id, active, opening_balance, serves_all_brands)
  VALUES (COALESCE(_courier_id, gen_random_uuid()), btrim(_name), _type::public.courier_type, NULLIF(btrim(_contact), ''),
          legacy_brand_id, _active, COALESCE(_opening_balance, 0), _serves_all_brands)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    contact = EXCLUDED.contact,
    brand_id = EXCLUDED.brand_id,
    active = EXCLUDED.active,
    opening_balance = EXCLUDED.opening_balance,
    serves_all_brands = EXCLUDED.serves_all_brands
  RETURNING id INTO saved_id;
  DELETE FROM public.courier_brands WHERE courier_id = saved_id;
  IF NOT _serves_all_brands THEN
    INSERT INTO public.courier_brands(courier_id, brand_id)
    SELECT saved_id, b FROM unnest(_brand_ids) b
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN saved_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_shopify_order_with_archive(_order_id uuid, _order_patch jsonb, _items jsonb, _payload jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  target_order_id uuid;
  identity_order_id uuid;
  identity_brand_id uuid;
  identity_source text;
  identity_external_id text;
BEGIN
  IF _payload IS NULL OR jsonb_typeof(_payload) <> 'object' THEN
    RAISE EXCEPTION 'Shopify payload must be a JSON object';
  END IF;
  BEGIN
    identity_brand_id := NULLIF(_order_patch->>'brand_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Valid Shopify brand identity is required';
  END;
  identity_source := lower(NULLIF(btrim(_order_patch->>'source'), ''));
  identity_external_id := NULLIF(btrim(_order_patch->>'external_id'), '');
  IF identity_brand_id IS NULL OR identity_source <> 'shopify' OR identity_external_id IS NULL THEN
    RAISE EXCEPTION 'Complete Shopify order identity is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    identity_brand_id::text || E'\x1f' || identity_source || E'\x1f' || identity_external_id,
    0
  ));
  SELECT id INTO identity_order_id
  FROM public.orders
  WHERE brand_id = identity_brand_id
    AND source = identity_source
    AND external_id = identity_external_id
  FOR UPDATE;
  IF identity_order_id IS NOT NULL AND _order_id IS NOT NULL AND identity_order_id <> _order_id THEN
    RAISE EXCEPTION 'Shopify order identity conflicts with supplied order id';
  END IF;
  IF identity_order_id IS NULL AND _order_id IS NOT NULL THEN
    SELECT id INTO identity_order_id
    FROM public.orders
    WHERE id = _order_id
      AND brand_id = identity_brand_id
      AND source = identity_source
      AND external_id = identity_external_id
    FOR UPDATE;
    IF identity_order_id IS NULL THEN
      RAISE EXCEPTION 'Supplied order id does not match the Shopify identity';
    END IF;
  END IF;
  target_order_id := COALESCE(identity_order_id, _order_id);
  target_order_id := public.upsert_order_with_items(
    target_order_id,
    jsonb_set(_order_patch, '{raw}', '{}'::jsonb, true),
    _items
  );
  PERFORM public.archive_order_source_payload(target_order_id, 'shopify', _payload);
  RETURN target_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_bosta_lifecycle(_order_id uuid, _provider_event_at timestamp with time zone, _tracking text, _state text, _collection_state text, _order_status text, _collection_status text, _shipment_outcome text, _fulfillment_status text, _shopify_sync_status text, _shopify_sync_error text, _payload jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  current_order public.orders%ROWTYPE;
  current_rank integer;
  incoming_rank integer;
  current_collection_rank integer;
  incoming_collection_rank integer;
  current_tiebreak text;
  incoming_tiebreak text;
  apply_shipment boolean := true;
  apply_collection boolean := true;
BEGIN
  SELECT * INTO current_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF auth.uid() IS NOT NULL AND (
    NOT public.has_brand_access(auth.uid(), current_order.brand_id)
    OR NOT (public.can_write_page(auth.uid(), '/orders') OR public.can_write_page(auth.uid(), '/couriers'))
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.archive_order_source_payload(_order_id, 'bosta', _payload);

  current_rank := CASE
    WHEN lower(COALESCE(current_order.courier_status_raw, '')) ~ 'returned|returning|rtb' THEN 110
    WHEN lower(COALESCE(current_order.courier_status_raw, '')) ~ 'delivered' THEN 100
    WHEN lower(COALESCE(current_order.courier_status_raw, '')) ~ 'cancel|terminated' THEN 90
    WHEN lower(COALESCE(current_order.courier_status_raw, '')) ~ 'out for delivery' THEN 50
    WHEN lower(COALESCE(current_order.courier_status_raw, '')) ~ 'transit' THEN 40
    WHEN lower(COALESCE(current_order.courier_status_raw, '')) ~ 'picked|received' THEN 30
    WHEN lower(COALESCE(current_order.courier_status_raw, '')) ~ 'new|created' THEN 10
    ELSE 20
  END;
  incoming_rank := CASE
    WHEN lower(COALESCE(_state, '')) ~ 'returned|returning|rtb' THEN 110
    WHEN lower(COALESCE(_state, '')) ~ 'delivered' THEN 100
    WHEN lower(COALESCE(_state, '')) ~ 'cancel|terminated' THEN 90
    WHEN lower(COALESCE(_state, '')) ~ 'out for delivery' THEN 50
    WHEN lower(COALESCE(_state, '')) ~ 'transit' THEN 40
    WHEN lower(COALESCE(_state, '')) ~ 'picked|received' THEN 30
    WHEN lower(COALESCE(_state, '')) ~ 'new|created' THEN 10
    ELSE 20
  END;
  current_collection_rank := CASE
    WHEN lower(btrim(COALESCE(current_order.collection_status, ''))) = 'paid' THEN 30
    WHEN lower(btrim(COALESCE(current_order.collection_status, ''))) = 'processing' THEN 20
    ELSE 10
  END;
  incoming_collection_rank := CASE
    WHEN lower(btrim(COALESCE(_collection_status, ''))) = 'paid' THEN 30
    WHEN lower(btrim(COALESCE(_collection_status, ''))) = 'processing' THEN 20
    ELSE 10
  END;
  current_tiebreak := concat_ws(E'\x1f',
    lower(COALESCE(current_order.courier_status_raw, '')),
    lower(COALESCE(current_order.courier_collection_status_raw, '')),
    COALESCE(current_order.order_status, ''),
    COALESCE(current_order.collection_status, ''),
    COALESCE(current_order.shipment_outcome, ''),
    COALESCE(current_order.fulfillment_status, '')
  );
  incoming_tiebreak := concat_ws(E'\x1f',
    lower(COALESCE(_state, '')),
    lower(COALESCE(_collection_state, '')),
    COALESCE(_order_status, ''),
    COALESCE(_collection_status, ''),
    COALESCE(_shipment_outcome, ''),
    COALESCE(_fulfillment_status, '')
  );

  IF current_order.bosta_event_at IS NOT NULL AND (
    _provider_event_at IS NULL OR _provider_event_at < current_order.bosta_event_at
  ) THEN
    RETURN false;
  END IF;
  IF current_order.bosta_event_at IS NOT NULL
     AND _provider_event_at = current_order.bosta_event_at THEN
    IF incoming_rank = current_rank AND incoming_collection_rank = current_collection_rank THEN
      IF incoming_tiebreak <= current_tiebreak THEN RETURN false; END IF;
    ELSE
      apply_shipment := incoming_rank > current_rank;
      apply_collection := incoming_collection_rank > current_collection_rank;
      IF NOT apply_shipment AND NOT apply_collection THEN RETURN false; END IF;
    END IF;
  END IF;

  IF _provider_event_at IS NULL AND current_order.bosta_event_at IS NULL THEN
    IF incoming_rank = current_rank AND incoming_collection_rank = current_collection_rank THEN
      IF incoming_tiebreak <= current_tiebreak THEN RETURN false; END IF;
    ELSE
      apply_shipment := incoming_rank > current_rank;
      apply_collection := incoming_collection_rank > current_collection_rank;
      IF NOT apply_shipment AND NOT apply_collection THEN RETURN false; END IF;
    END IF;
  END IF;

  IF incoming_collection_rank < current_collection_rank THEN apply_collection := false; END IF;

  IF apply_shipment
     AND current_order.shipment_outcome IN ('returned', 'customer_returned', 'exchanged')
     AND _shipment_outcome IS DISTINCT FROM current_order.shipment_outcome THEN
    RETURN false;
  END IF;
  IF apply_shipment
     AND current_order.shipment_outcome = 'delivered'
     AND _shipment_outcome NOT IN ('delivered', 'returned', 'customer_returned', 'exchanged') THEN
    RETURN false;
  END IF;
  IF apply_shipment
     AND current_order.shipment_outcome = 'cancelled_before_dispatch'
     AND _shipment_outcome = 'open' THEN
    RETURN false;
  END IF;

  UPDATE public.orders SET
    order_status = CASE WHEN apply_shipment THEN _order_status ELSE order_status END,
    collection_status = CASE WHEN apply_collection THEN _collection_status ELSE collection_status END,
    shipment_outcome = CASE WHEN apply_shipment THEN _shipment_outcome ELSE shipment_outcome END,
    fulfillment_status = CASE WHEN apply_shipment
      THEN COALESCE(NULLIF(_fulfillment_status, ''), fulfillment_status)
      ELSE fulfillment_status END,
    courier_status_raw = CASE WHEN apply_shipment THEN _state ELSE courier_status_raw END,
    courier_collection_status_raw = CASE WHEN apply_collection
      THEN _collection_state ELSE courier_collection_status_raw END,
    lifecycle_source = 'bosta',
    lifecycle_updated_by = NULL,
    lifecycle_updated_at = now(),
    bosta_event_at = COALESCE(_provider_event_at, bosta_event_at),
    bosta_tracking = COALESCE(NULLIF(btrim(_tracking), ''), bosta_tracking),
    shopify_sync_status = CASE WHEN apply_shipment THEN _shopify_sync_status ELSE shopify_sync_status END,
    shopify_sync_error = CASE WHEN apply_shipment THEN _shopify_sync_error ELSE shopify_sync_error END
  WHERE id = _order_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.cash_summary_report(_from date DEFAULT NULL::date, _to date DEFAULT NULL::date, _for_user_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
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

-- ===================== TRIGGER =====================

DROP TRIGGER IF EXISTS audit_cash_transactions ON public.cash_transactions;

CREATE TRIGGER audit_cash_transactions AFTER INSERT OR DELETE OR UPDATE ON public.cash_transactions FOR EACH ROW EXECUTE FUNCTION public.log_financial_change();

DROP TRIGGER IF EXISTS audit_expense_entries ON public.expense_entries;

CREATE TRIGGER audit_expense_entries AFTER INSERT OR DELETE OR UPDATE ON public.expense_entries FOR EACH ROW EXECUTE FUNCTION public.log_financial_change();

DROP TRIGGER IF EXISTS audit_orders ON public.orders;

CREATE TRIGGER audit_orders AFTER INSERT OR DELETE OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.log_financial_change();

DROP TRIGGER IF EXISTS audit_sales_invoices ON public.sales_invoices;

CREATE TRIGGER audit_sales_invoices AFTER INSERT OR DELETE OR UPDATE ON public.sales_invoices FOR EACH ROW EXECUTE FUNCTION public.log_financial_change();

DROP TRIGGER IF EXISTS audit_supplier_invoices ON public.supplier_invoices;

CREATE TRIGGER audit_supplier_invoices AFTER INSERT OR DELETE OR UPDATE ON public.supplier_invoices FOR EACH ROW EXECUTE FUNCTION public.log_financial_change();

DROP TRIGGER IF EXISTS audit_supplier_payments ON public.supplier_payments;

CREATE TRIGGER audit_supplier_payments AFTER INSERT OR DELETE OR UPDATE ON public.supplier_payments FOR EACH ROW EXECUTE FUNCTION public.log_financial_change();

DROP TRIGGER IF EXISTS bh_brands_touch ON public.bh_brands;

CREATE TRIGGER bh_brands_touch BEFORE UPDATE ON public.bh_brands FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS bh_post_comments_touch ON public.bh_creative_post_comments;

CREATE TRIGGER bh_post_comments_touch BEFORE UPDATE ON public.bh_creative_post_comments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS bh_posts_touch ON public.bh_creative_posts;

CREATE TRIGGER bh_posts_touch BEFORE UPDATE ON public.bh_creative_posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS bh_reports_touch ON public.bh_creative_reports;

CREATE TRIGGER bh_reports_touch BEFORE UPDATE ON public.bh_creative_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS bh_resources_touch ON public.bh_resources;

CREATE TRIGGER bh_resources_touch BEFORE UPDATE ON public.bh_resources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS bh_task_comments_touch ON public.bh_task_comments;

CREATE TRIGGER bh_task_comments_touch BEFORE UPDATE ON public.bh_task_comments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS bh_tasks_touch ON public.bh_tasks;

CREATE TRIGGER bh_tasks_touch BEFORE UPDATE ON public.bh_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS bh_wiki_touch ON public.bh_wiki_entries;

CREATE TRIGGER bh_wiki_touch BEFORE UPDATE ON public.bh_wiki_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS brands_updated_at ON public.brands;

CREATE TRIGGER brands_updated_at BEFORE UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS cash_transactions_refresh_metrics ON public.cash_transactions;

CREATE TRIGGER cash_transactions_refresh_metrics AFTER INSERT OR DELETE OR UPDATE OF occurred_at, brand_id, type, for_user_id, courier_id, transfer_group, amount ON public.cash_transactions FOR EACH ROW EXECUTE FUNCTION public.cash_metrics_trigger();

DROP TRIGGER IF EXISTS cats_updated_at ON public.expense_categories;

CREATE TRIGGER cats_updated_at BEFORE UPDATE ON public.expense_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS cnotes_updated_at ON public.customer_notes;

CREATE TRIGGER cnotes_updated_at BEFORE UPDATE ON public.customer_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS courier_settlement_lines_updated_at ON public.courier_settlement_lines;

CREATE TRIGGER courier_settlement_lines_updated_at BEFORE UPDATE ON public.courier_settlement_lines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS courier_settlements_updated_at ON public.courier_settlements;

CREATE TRIGGER courier_settlements_updated_at BEFORE UPDATE ON public.courier_settlements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS couriers_updated_at ON public.couriers;

CREATE TRIGGER couriers_updated_at BEFORE UPDATE ON public.couriers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS customers_updated_at ON public.customers;

CREATE TRIGGER customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS ee_updated_at ON public.expense_entries;

CREATE TRIGGER ee_updated_at BEFORE UPDATE ON public.expense_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS employees_guard_user_id_change ON public.employees;

CREATE TRIGGER employees_guard_user_id_change BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.employees_guard_user_id_change();

DROP TRIGGER IF EXISTS im_updated_at ON public.inventory_movements;

CREATE TRIGGER im_updated_at BEFORE UPDATE ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS investor_shares_updated ON public.investor_brand_shares;

CREATE TRIGGER investor_shares_updated BEFORE UPDATE ON public.investor_brand_shares FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS investors_updated ON public.investors;

CREATE TRIGGER investors_updated BEFORE UPDATE ON public.investors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS materials_updated_at ON public.materials;

CREATE TRIGGER materials_updated_at BEFORE UPDATE ON public.materials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS me_updated_at ON public.monthly_entries;

CREATE TRIGGER me_updated_at BEFORE UPDATE ON public.monthly_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS order_collections_updated_at ON public.order_collections;

CREATE TRIGGER order_collections_updated_at BEFORE UPDATE ON public.order_collections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS order_returns_updated_at ON public.order_returns;

CREATE TRIGGER order_returns_updated_at BEFORE UPDATE ON public.order_returns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS order_shipments_updated_at ON public.order_shipments;

CREATE TRIGGER order_shipments_updated_at BEFORE UPDATE ON public.order_shipments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS order_sla_rules_updated_at ON public.order_sla_rules;

CREATE TRIGGER order_sla_rules_updated_at BEFORE UPDATE ON public.order_sla_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS orders_00_preserve_terminal_lifecycle ON public.orders;

CREATE TRIGGER orders_00_preserve_terminal_lifecycle BEFORE UPDATE OF shipment_outcome, fulfillment_status, lifecycle_source ON public.orders FOR EACH ROW EXECUTE FUNCTION public.preserve_terminal_order_lifecycle();

DROP TRIGGER IF EXISTS orders_accrue_courier_charge_after ON public.orders;

CREATE TRIGGER orders_accrue_courier_charge_after AFTER INSERT OR UPDATE OF shipment_outcome, courier_id, shipping_governorate, occurred_at, courier_expense ON public.orders FOR EACH ROW EXECUTE FUNCTION public.persist_order_courier_charge();

DROP TRIGGER IF EXISTS orders_accrue_courier_charge_before ON public.orders;

CREATE TRIGGER orders_accrue_courier_charge_before BEFORE INSERT OR UPDATE OF shipment_outcome, courier_id, shipping_governorate, occurred_at ON public.orders FOR EACH ROW EXECUTE FUNCTION public.accrue_order_courier_charge();

DROP TRIGGER IF EXISTS orders_audit_lifecycle_after ON public.orders;

CREATE TRIGGER orders_audit_lifecycle_after AFTER UPDATE OF order_status, collection_status, shipment_outcome ON public.orders FOR EACH ROW EXECUTE FUNCTION public.audit_order_lifecycle_change();

DROP TRIGGER IF EXISTS orders_enforce_courier_brand ON public.orders;

CREATE TRIGGER orders_enforce_courier_brand BEFORE INSERT OR UPDATE OF courier_id, brand_id ON public.orders FOR EACH ROW EXECUTE FUNCTION public.enforce_order_courier_brand();

DROP TRIGGER IF EXISTS orders_link_customer ON public.orders;

CREATE TRIGGER orders_link_customer BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.link_order_customer();

DROP TRIGGER IF EXISTS orders_updated_at ON public.orders;

CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS pe_touch ON public.project_events;

CREATE TRIGGER pe_touch BEFORE UPDATE ON public.project_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS ppn_touch ON public.project_private_notes;

CREATE TRIGGER ppn_touch BEFORE UPDATE ON public.project_private_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS pr_notify_open ON public.project_revisions;

CREATE TRIGGER pr_notify_open AFTER INSERT ON public.project_revisions FOR EACH ROW EXECUTE FUNCTION public.notify_revision_opened();

DROP TRIGGER IF EXISTS pr_touch ON public.project_revisions;

CREATE TRIGGER pr_touch BEFORE UPDATE ON public.project_revisions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS product_materials_updated_at ON public.product_materials;

CREATE TRIGGER product_materials_updated_at BEFORE UPDATE ON public.product_materials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS products_updated_at ON public.products;

CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS pt_notify_assign ON public.project_tasks;

CREATE TRIGGER pt_notify_assign AFTER INSERT OR UPDATE OF assignee_id ON public.project_tasks FOR EACH ROW EXECUTE FUNCTION public.notify_task_assigned();

DROP TRIGGER IF EXISTS pt_touch ON public.project_tasks;

CREATE TRIGGER pt_touch BEFORE UPDATE ON public.project_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS purchase_order_items_updated_at ON public.purchase_order_items;

CREATE TRIGGER purchase_order_items_updated_at BEFORE UPDATE ON public.purchase_order_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS purchase_orders_updated_at ON public.purchase_orders;

CREATE TRIGGER purchase_orders_updated_at BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS refresh_courier_charges_after_rate ON public.courier_governorate_rates;

CREATE TRIGGER refresh_courier_charges_after_rate AFTER INSERT OR DELETE OR UPDATE OF delivery_fee, customer_return_fee, failed_delivery_fee, exchange_fee, active, effective_from, effective_to, courier_id, governorate ON public.courier_governorate_rates FOR EACH ROW EXECUTE FUNCTION public.refresh_courier_charges_for_rate();

DROP TRIGGER IF EXISTS sales_invoices_link_customer ON public.sales_invoices;

CREATE TRIGGER sales_invoices_link_customer BEFORE INSERT OR UPDATE OF customer_phone, customer_email, customer_name ON public.sales_invoices FOR EACH ROW EXECUTE FUNCTION public.link_sales_invoice_customer();

DROP TRIGGER IF EXISTS sales_invoices_refresh_courier_metrics ON public.sales_invoices;

CREATE TRIGGER sales_invoices_refresh_courier_metrics AFTER INSERT OR DELETE OR UPDATE OF courier_id, brand_id, type, total_amount ON public.sales_invoices FOR EACH ROW EXECUTE FUNCTION public.courier_invoice_metrics_trigger();

DROP TRIGGER IF EXISTS sales_invoices_refresh_customer_metrics ON public.sales_invoices;

CREATE TRIGGER sales_invoices_refresh_customer_metrics AFTER INSERT OR DELETE OR UPDATE OF customer_id, type, total_amount, occurred_at, brand_id ON public.sales_invoices FOR EACH ROW EXECUTE FUNCTION public.refresh_customer_metrics_trigger();

DROP TRIGGER IF EXISTS sales_invoices_stage_touch ON public.sales_invoices;

CREATE TRIGGER sales_invoices_stage_touch BEFORE UPDATE ON public.sales_invoices FOR EACH ROW EXECUTE FUNCTION public.touch_sales_invoice_stage();

DROP TRIGGER IF EXISTS sales_updated_at ON public.sales_invoices;

CREATE TRIGGER sales_updated_at BEFORE UPDATE ON public.sales_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS si_updated_at ON public.supplier_invoices;

CREATE TRIGGER si_updated_at BEFORE UPDATE ON public.supplier_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS sp_updated_at ON public.supplier_payments;

CREATE TRIGGER sp_updated_at BEFORE UPDATE ON public.supplier_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS suppliers_updated_at ON public.suppliers;

CREATE TRIGGER suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_articles_updated ON public.articles;

CREATE TRIGGER trg_articles_updated BEFORE UPDATE ON public.articles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_attendance_updated ON public.employee_attendance_entries;

CREATE TRIGGER trg_attendance_updated BEFORE UPDATE ON public.employee_attendance_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_auto_pay_supplier_invoice ON public.supplier_invoices;

CREATE TRIGGER trg_auto_pay_supplier_invoice AFTER INSERT OR UPDATE OF status, amount ON public.supplier_invoices FOR EACH ROW EXECUTE FUNCTION public.auto_pay_supplier_invoice();

DROP TRIGGER IF EXISTS trg_brand_integrations_updated ON public.brand_integrations;

CREATE TRIGGER trg_brand_integrations_updated BEFORE UPDATE ON public.brand_integrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_cash_txn_default_wallet ON public.cash_transactions;

CREATE TRIGGER trg_cash_txn_default_wallet BEFORE INSERT OR UPDATE ON public.cash_transactions FOR EACH ROW EXECUTE FUNCTION public.cash_txn_default_wallet();

DROP TRIGGER IF EXISTS trg_cash_txn_updated_at ON public.cash_transactions;

CREATE TRIGGER trg_cash_txn_updated_at BEFORE UPDATE ON public.cash_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_employee_requests_updated_at ON public.employee_requests;

CREATE TRIGGER trg_employee_requests_updated_at BEFORE UPDATE ON public.employee_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_employee_requests_validate ON public.employee_requests;

CREATE TRIGGER trg_employee_requests_validate BEFORE INSERT OR UPDATE ON public.employee_requests FOR EACH ROW EXECUTE FUNCTION public.employee_requests_validate();

DROP TRIGGER IF EXISTS trg_employee_time_logs_updated ON public.employee_time_logs;

CREATE TRIGGER trg_employee_time_logs_updated BEFORE UPDATE ON public.employee_time_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_employees_updated ON public.employees;

CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_enforce_brand_share_total ON public.investor_brand_shares;

DROP TRIGGER IF EXISTS trg_fulfillment_updated ON public.fulfillment_entries;

CREATE TRIGGER trg_fulfillment_updated BEFORE UPDATE ON public.fulfillment_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_im_consume_bom ON public.inventory_movements;

CREATE TRIGGER trg_im_consume_bom AFTER INSERT ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.im_consume_bom();

DROP TRIGGER IF EXISTS trg_im_update_moving_avg ON public.inventory_movements;

CREATE TRIGGER trg_im_update_moving_avg AFTER INSERT ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.im_update_moving_avg();

DROP TRIGGER IF EXISTS trg_im_validate_target ON public.inventory_movements;

CREATE TRIGGER trg_im_validate_target BEFORE INSERT OR UPDATE ON public.inventory_movements FOR EACH ROW EXECUTE FUNCTION public.im_validate_target();

DROP TRIGGER IF EXISTS trg_offline_branch_deduct ON public.sales_invoice_items;

CREATE TRIGGER trg_offline_branch_deduct AFTER INSERT ON public.sales_invoice_items FOR EACH ROW EXECUTE FUNCTION public.offline_branch_deduct_inventory();

DROP TRIGGER IF EXISTS trg_order_items_sync ON public.order_items;

CREATE TRIGGER trg_order_items_sync AFTER INSERT OR DELETE OR UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.order_items_sync_invoice_items();

DROP TRIGGER IF EXISTS trg_orders_deduct_stock ON public.orders;

CREATE TRIGGER trg_orders_deduct_stock AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.orders_deduct_stock();

DROP TRIGGER IF EXISTS trg_orders_delete_invoice ON public.orders;

CREATE TRIGGER trg_orders_delete_invoice BEFORE DELETE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.orders_delete_invoice();

DROP TRIGGER IF EXISTS trg_orders_sync_invoice ON public.orders;

CREATE TRIGGER trg_orders_sync_invoice BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.orders_sync_invoice();

DROP TRIGGER IF EXISTS trg_production_tasks_field_lock ON public.production_tasks;

CREATE TRIGGER trg_production_tasks_field_lock BEFORE UPDATE ON public.production_tasks FOR EACH ROW EXECUTE FUNCTION public.production_tasks_prevent_field_tampering();

DROP TRIGGER IF EXISTS trg_production_tasks_updated_at ON public.production_tasks;

CREATE TRIGGER trg_production_tasks_updated_at BEFORE UPDATE ON public.production_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_sales_invoices_prep_field_lock ON public.sales_invoices;

CREATE TRIGGER trg_sales_invoices_prep_field_lock BEFORE UPDATE ON public.sales_invoices FOR EACH ROW EXECUTE FUNCTION public.sales_invoices_prep_field_lock();

DROP TRIGGER IF EXISTS trg_service_clients_updated ON public.service_clients;

CREATE TRIGGER trg_service_clients_updated BEFORE UPDATE ON public.service_clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_service_projects_updated ON public.service_projects;

CREATE TRIGGER trg_service_projects_updated BEFORE UPDATE ON public.service_projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_sii_stock_in ON public.supplier_invoice_items;

CREATE TRIGGER trg_sii_stock_in AFTER INSERT ON public.supplier_invoice_items FOR EACH ROW EXECUTE FUNCTION public.sii_stock_in();

DROP TRIGGER IF EXISTS trg_sii_update_material_avg_cost ON public.supplier_invoice_items;

CREATE TRIGGER trg_sii_update_material_avg_cost AFTER INSERT ON public.supplier_invoice_items FOR EACH ROW EXECUTE FUNCTION public.sii_update_material_avg_cost();

DROP TRIGGER IF EXISTS trg_supplier_invoice_items_updated ON public.supplier_invoice_items;

CREATE TRIGGER trg_supplier_invoice_items_updated BEFORE UPDATE ON public.supplier_invoice_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_sync_cash_delete_expense ON public.cash_transactions;

CREATE TRIGGER trg_sync_cash_delete_expense BEFORE DELETE ON public.cash_transactions FOR EACH ROW EXECUTE FUNCTION public.sync_cash_delete_expense();

DROP TRIGGER IF EXISTS trg_sync_cash_to_expense_ins ON public.cash_transactions;

CREATE TRIGGER trg_sync_cash_to_expense_ins AFTER INSERT ON public.cash_transactions FOR EACH ROW EXECUTE FUNCTION public.sync_cash_to_expense();

DROP TRIGGER IF EXISTS trg_sync_cash_to_expense_upd ON public.cash_transactions;

CREATE TRIGGER trg_sync_cash_to_expense_upd AFTER UPDATE OF amount, occurred_at, brand_id, category_id, note, type ON public.cash_transactions FOR EACH ROW EXECUTE FUNCTION public.sync_cash_to_expense();

DROP TRIGGER IF EXISTS trg_sync_expense_delete_cash ON public.expense_entries;

CREATE TRIGGER trg_sync_expense_delete_cash BEFORE DELETE ON public.expense_entries FOR EACH ROW EXECUTE FUNCTION public.sync_expense_delete_cash();

DROP TRIGGER IF EXISTS trg_sync_expense_to_cash_ins ON public.expense_entries;

CREATE TRIGGER trg_sync_expense_to_cash_ins AFTER INSERT ON public.expense_entries FOR EACH ROW EXECUTE FUNCTION public.sync_expense_to_cash();

DROP TRIGGER IF EXISTS trg_sync_expense_to_cash_upd ON public.expense_entries;

CREATE TRIGGER trg_sync_expense_to_cash_upd AFTER UPDATE OF amount, period_date, year, month, brand_id, category_id, note ON public.expense_entries FOR EACH ROW EXECUTE FUNCTION public.sync_expense_to_cash();

DROP TRIGGER IF EXISTS trg_sync_order_cost_total ON public.order_items;

CREATE TRIGGER trg_sync_order_cost_total AFTER INSERT OR DELETE OR UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.sync_order_cost_total();

DROP TRIGGER IF EXISTS trg_sync_order_item_cost ON public.order_items;

CREATE TRIGGER trg_sync_order_item_cost BEFORE INSERT OR UPDATE OF product_id, unit_cost ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.sync_order_item_cost();

DROP TRIGGER IF EXISTS trg_sync_salary_expense ON public.employee_attendance_entries;

CREATE TRIGGER trg_sync_salary_expense AFTER INSERT OR UPDATE ON public.employee_attendance_entries FOR EACH ROW EXECUTE FUNCTION public.sync_salary_expense();

DROP TRIGGER IF EXISTS trg_sync_sales_return_cash_del ON public.sales_invoices;

CREATE TRIGGER trg_sync_sales_return_cash_del BEFORE DELETE ON public.sales_invoices FOR EACH ROW EXECUTE FUNCTION public.sync_sales_return_cash();

DROP TRIGGER IF EXISTS trg_sync_sales_return_cash_iu ON public.sales_invoices;

CREATE TRIGGER trg_sync_sales_return_cash_iu AFTER INSERT OR UPDATE OF type, total_amount, occurred_at, brand_id ON public.sales_invoices FOR EACH ROW EXECUTE FUNCTION public.sync_sales_return_cash();

DROP TRIGGER IF EXISTS trg_sync_service_client_to_customer ON public.service_clients;

CREATE TRIGGER trg_sync_service_client_to_customer AFTER INSERT ON public.service_clients FOR EACH ROW EXECUTE FUNCTION public.sync_service_client_to_customer();

DROP TRIGGER IF EXISTS trg_sync_service_project_invoice ON public.service_projects;

CREATE TRIGGER trg_sync_service_project_invoice BEFORE INSERT OR UPDATE OF cost, commission, status, brand_id, name, client_id, started_at, finished_at ON public.service_projects FOR EACH ROW EXECUTE FUNCTION public.sync_service_project_invoice();

DROP TRIGGER IF EXISTS trg_sync_service_project_invoice_del ON public.service_projects;

CREATE TRIGGER trg_sync_service_project_invoice_del BEFORE DELETE ON public.service_projects FOR EACH ROW EXECUTE FUNCTION public.sync_service_project_invoice_delete();

DROP TRIGGER IF EXISTS trg_sync_supplier_payment ON public.supplier_payments;

CREATE TRIGGER trg_sync_supplier_payment AFTER INSERT OR UPDATE ON public.supplier_payments FOR EACH ROW EXECUTE FUNCTION public.sync_supplier_payment();

DROP TRIGGER IF EXISTS trg_sync_supplier_payment_del ON public.supplier_payments;

CREATE TRIGGER trg_sync_supplier_payment_del AFTER DELETE ON public.supplier_payments FOR EACH ROW EXECUTE FUNCTION public.sync_supplier_payment_delete();

DROP TRIGGER IF EXISTS trg_tasks_prevent_assignee_tamper ON public.tasks;

CREATE TRIGGER trg_tasks_prevent_assignee_tamper BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.tasks_prevent_assignee_field_tampering();

DROP TRIGGER IF EXISTS trg_user_settings_updated ON public.user_settings;

CREATE TRIGGER trg_user_settings_updated BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_app_user_connections_updated_at ON public.app_user_connections;

CREATE TRIGGER update_app_user_connections_updated_at BEFORE UPDATE ON public.app_user_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_company_assets_updated_at ON public.company_assets;

CREATE TRIGGER update_company_assets_updated_at BEFORE UPDATE ON public.company_assets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_tasks_updated_at ON public.tasks;

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_sheet_config_updated_at ON public.user_sheet_config;

CREATE TRIGGER update_user_sheet_config_updated_at BEFORE UPDATE ON public.user_sheet_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS wallets_updated_at ON public.wallets;

CREATE TRIGGER wallets_updated_at BEFORE UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS whatsapp_templates_updated_at ON public.whatsapp_templates;

CREATE TRIGGER whatsapp_templates_updated_at BEFORE UPDATE ON public.whatsapp_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS whatsapp_threads_updated_at ON public.whatsapp_threads;

CREATE TRIGGER whatsapp_threads_updated_at BEFORE UPDATE ON public.whatsapp_threads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===================== RLS =====================

DROP POLICY IF EXISTS "Admins and managers can view audit log" ON public.financial_audit_log;

CREATE POLICY "Admins and managers can view audit log" ON public.financial_audit_log FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));

DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(( SELECT auth.uid() AS uid), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;

CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(( SELECT auth.uid() AS uid), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;

CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(( SELECT auth.uid() AS uid), 'admin'::public.app_role)) WITH CHECK (public.has_role(( SELECT auth.uid() AS uid), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;

CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(( SELECT auth.uid() AS uid), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins manage brand access" ON public.user_brand_access;

CREATE POLICY "Admins manage brand access" ON public.user_brand_access TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins manage section access" ON public.user_section_access;

CREATE POLICY "Admins manage section access" ON public.user_section_access TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Assignees update status" ON public.tasks;

CREATE POLICY "Assignees update status" ON public.tasks FOR UPDATE TO authenticated USING ((assignee_id = auth.uid())) WITH CHECK ((assignee_id = auth.uid()));

DROP POLICY IF EXISTS "Assignees view own tasks" ON public.tasks;

CREATE POLICY "Assignees view own tasks" ON public.tasks FOR SELECT TO authenticated USING (((assignee_id = auth.uid()) OR (created_by = auth.uid())));

DROP POLICY IF EXISTS "Catalog roles read material_brands" ON public.material_brands;

CREATE POLICY "Catalog roles read material_brands" ON public.material_brands FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'accountant'::public.app_role) OR public.has_role(auth.uid(), 'production_manager'::public.app_role) OR public.has_brand_access(auth.uid(), brand_id)));

DROP POLICY IF EXISTS "Catalog roles write material_brands" ON public.material_brands;

CREATE POLICY "Catalog roles write material_brands" ON public.material_brands TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));

DROP POLICY IF EXISTS "HR staff read time logs" ON public.employee_time_logs;

CREATE POLICY "HR staff read time logs" ON public.employee_time_logs FOR SELECT TO authenticated USING (((( SELECT public.has_role(auth.uid(), 'admin'::public.app_role) AS has_role) OR ( SELECT public.has_role(auth.uid(), 'manager'::public.app_role) AS has_role) OR ( SELECT public.has_role(auth.uid(), 'accountant'::public.app_role) AS has_role) OR ( SELECT public.has_role(auth.uid(), 'data_entry'::public.app_role) AS has_role) OR ( SELECT public.has_role(auth.uid(), 'hr'::public.app_role) AS has_role)) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = employee_time_logs.employee_id) AND public.has_brand_access(auth.uid(), e.brand_id))))));

DROP POLICY IF EXISTS "HR staff write time logs" ON public.employee_time_logs;

CREATE POLICY "HR staff write time logs" ON public.employee_time_logs TO authenticated USING (((( SELECT public.has_role(auth.uid(), 'admin'::public.app_role) AS has_role) OR ( SELECT public.has_role(auth.uid(), 'manager'::public.app_role) AS has_role) OR ( SELECT public.has_role(auth.uid(), 'accountant'::public.app_role) AS has_role) OR ( SELECT public.has_role(auth.uid(), 'data_entry'::public.app_role) AS has_role) OR ( SELECT public.has_role(auth.uid(), 'hr'::public.app_role) AS has_role)) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = employee_time_logs.employee_id) AND public.has_brand_access(auth.uid(), e.brand_id)))))) WITH CHECK (((( SELECT public.has_role(auth.uid(), 'admin'::public.app_role) AS has_role) OR ( SELECT public.has_role(auth.uid(), 'manager'::public.app_role) AS has_role) OR ( SELECT public.has_role(auth.uid(), 'accountant'::public.app_role) AS has_role) OR ( SELECT public.has_role(auth.uid(), 'data_entry'::public.app_role) AS has_role) OR ( SELECT public.has_role(auth.uid(), 'hr'::public.app_role) AS has_role)) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = employee_time_logs.employee_id) AND public.has_brand_access(auth.uid(), e.brand_id))))));

DROP POLICY IF EXISTS "Managers manage all tasks" ON public.tasks;

CREATE POLICY "Managers manage all tasks" ON public.tasks TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));

DROP POLICY IF EXISTS "Users can delete own connection" ON public.app_user_connections;

CREATE POLICY "Users can delete own connection" ON public.app_user_connections FOR DELETE TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view own connection status" ON public.app_user_connections;

CREATE POLICY "Users can view own connection status" ON public.app_user_connections FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users manage own sheet config" ON public.user_sheet_config;

CREATE POLICY "Users manage own sheet config" ON public.user_sheet_config TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Users read own brand access" ON public.user_brand_access;

CREATE POLICY "Users read own brand access" ON public.user_brand_access FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));

DROP POLICY IF EXISTS "Users read own section access" ON public.user_section_access;

CREATE POLICY "Users read own section access" ON public.user_section_access FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));

DROP POLICY IF EXISTS "admin write couriers" ON public.couriers;

CREATE POLICY "admin write couriers" ON public.couriers TO authenticated USING ((public.can_write_page(auth.uid(), '/couriers'::text) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)) AND public.courier_manageable_by_user(auth.uid(), id))) WITH CHECK ((public.can_write_page(auth.uid(), '/couriers'::text) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))));

DROP POLICY IF EXISTS "admin write im" ON public.inventory_movements;

CREATE POLICY "admin write im" ON public.inventory_movements TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "admin write materials" ON public.materials;

CREATE POLICY "admin write materials" ON public.materials TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "admin write pm" ON public.product_materials;

CREATE POLICY "admin write pm" ON public.product_materials TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "admin write products" ON public.products;

CREATE POLICY "admin write products" ON public.products TO authenticated USING (public.has_role(( SELECT auth.uid() AS uid), 'admin'::public.app_role)) WITH CHECK (public.has_role(( SELECT auth.uid() AS uid), 'admin'::public.app_role));

DROP POLICY IF EXISTS "admin/manager read integration logs" ON public.integration_logs;

CREATE POLICY "admin/manager read integration logs" ON public.integration_logs FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));

DROP POLICY IF EXISTS "admin_manage_settings" ON public.user_settings;

CREATE POLICY admin_manage_settings ON public.user_settings TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

ALTER TABLE public.app_user_connections ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assets_delete_admin_manager" ON public.company_assets;

CREATE POLICY assets_delete_admin_manager ON public.company_assets FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));

DROP POLICY IF EXISTS "assets_read_scoped" ON public.company_assets;

CREATE POLICY assets_read_scoped ON public.company_assets FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR ((brand_id IS NOT NULL) AND public.has_brand_access(auth.uid(), brand_id))));

DROP POLICY IF EXISTS "assets_update_admin_manager_accountant" ON public.company_assets;

CREATE POLICY assets_update_admin_manager_accountant ON public.company_assets FOR UPDATE TO authenticated USING (((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'accountant'::public.app_role)) AND (((brand_id IS NOT NULL) AND public.has_brand_access(auth.uid(), brand_id)) OR ((brand_id IS NULL) AND public.has_role(auth.uid(), 'admin'::public.app_role))))) WITH CHECK (((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'accountant'::public.app_role)) AND (((brand_id IS NOT NULL) AND public.has_brand_access(auth.uid(), brand_id)) OR ((brand_id IS NULL) AND public.has_role(auth.uid(), 'admin'::public.app_role)))));

DROP POLICY IF EXISTS "assets_write_admin_manager_accountant" ON public.company_assets;

CREATE POLICY assets_write_admin_manager_accountant ON public.company_assets FOR INSERT TO authenticated WITH CHECK ((((brand_id IS NOT NULL) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'accountant'::public.app_role)) AND public.has_brand_access(auth.uid(), brand_id)) OR ((brand_id IS NULL) AND public.has_role(auth.uid(), 'admin'::public.app_role))));

DROP POLICY IF EXISTS "attendance read brand scoped" ON public.employee_attendance_entries;

CREATE POLICY "attendance read brand scoped" ON public.employee_attendance_entries FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = employee_attendance_entries.employee_id) AND public.has_brand_access(auth.uid(), e.brand_id)))));

DROP POLICY IF EXISTS "attendance write writer" ON public.employee_attendance_entries;

CREATE POLICY "attendance write writer" ON public.employee_attendance_entries TO authenticated USING ((public.is_writer(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = employee_attendance_entries.employee_id) AND public.has_brand_access(auth.uid(), e.brand_id)))))) WITH CHECK ((public.is_writer(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = employee_attendance_entries.employee_id) AND public.has_brand_access(auth.uid(), e.brand_id))))));

DROP POLICY IF EXISTS "auc_block_client_insert" ON public.app_user_connections;

CREATE POLICY auc_block_client_insert ON public.app_user_connections AS RESTRICTIVE FOR INSERT TO authenticated, anon WITH CHECK (false);

DROP POLICY IF EXISTS "auc_block_client_update" ON public.app_user_connections;

CREATE POLICY auc_block_client_update ON public.app_user_connections AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "auth delete sales_invoice_items" ON public.sales_invoice_items;

CREATE POLICY "auth delete sales_invoice_items" ON public.sales_invoice_items FOR DELETE TO authenticated USING (public.is_writer(( SELECT auth.uid() AS uid)));

DROP POLICY IF EXISTS "auth insert sales_invoice_items" ON public.sales_invoice_items;

CREATE POLICY "auth insert sales_invoice_items" ON public.sales_invoice_items FOR INSERT TO authenticated WITH CHECK (public.is_writer(( SELECT auth.uid() AS uid)));

DROP POLICY IF EXISTS "auth manage articles" ON public.articles;

CREATE POLICY "auth manage articles" ON public.articles TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));

DROP POLICY IF EXISTS "auth read articles" ON public.articles;

CREATE POLICY "auth read articles" ON public.articles FOR SELECT TO authenticated USING (((published = true) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));

DROP POLICY IF EXISTS "auth update sales_invoice_items" ON public.sales_invoice_items;

CREATE POLICY "auth update sales_invoice_items" ON public.sales_invoice_items FOR UPDATE TO authenticated USING (public.is_writer(( SELECT auth.uid() AS uid))) WITH CHECK (public.is_writer(( SELECT auth.uid() AS uid)));

ALTER TABLE public.bh_brand_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bh_brand_access manage" ON public.bh_brand_access;

CREATE POLICY "bh_brand_access manage" ON public.bh_brand_access TO authenticated USING (public.bh_is_manager(auth.uid())) WITH CHECK (public.bh_is_manager(auth.uid()));

DROP POLICY IF EXISTS "bh_brand_access self read" ON public.bh_brand_access;

CREATE POLICY "bh_brand_access self read" ON public.bh_brand_access FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.bh_is_manager(auth.uid())));

ALTER TABLE public.bh_brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bh_brands manage" ON public.bh_brands;

CREATE POLICY "bh_brands manage" ON public.bh_brands TO authenticated USING (public.bh_is_manager(auth.uid())) WITH CHECK (public.bh_is_manager(auth.uid()));

DROP POLICY IF EXISTS "bh_brands read" ON public.bh_brands;

CREATE POLICY "bh_brands read" ON public.bh_brands FOR SELECT TO authenticated USING (public.bh_can_access_brand(auth.uid(), id));

ALTER TABLE public.bh_creative_likes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bh_creative_post_comments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bh_creative_posts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bh_creative_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bh_likes delete" ON public.bh_creative_likes;

CREATE POLICY "bh_likes delete" ON public.bh_creative_likes FOR DELETE TO authenticated USING ((user_id = auth.uid()));

DROP POLICY IF EXISTS "bh_likes insert" ON public.bh_creative_likes;

CREATE POLICY "bh_likes insert" ON public.bh_creative_likes FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));

DROP POLICY IF EXISTS "bh_likes read" ON public.bh_creative_likes;

CREATE POLICY "bh_likes read" ON public.bh_creative_likes FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR ((post_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.bh_creative_posts p
  WHERE ((p.id = bh_creative_likes.post_id) AND ((p.hidden = false) OR (p.author_id = ( SELECT auth.uid() AS uid)) OR public.bh_is_manager(( SELECT auth.uid() AS uid))))))) OR ((comment_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (public.bh_creative_post_comments c
     JOIN public.bh_creative_posts p ON ((p.id = c.post_id)))
  WHERE ((c.id = bh_creative_likes.comment_id) AND ((c.hidden = false) OR (c.author_id = ( SELECT auth.uid() AS uid)) OR public.bh_is_manager(( SELECT auth.uid() AS uid))) AND ((p.hidden = false) OR (p.author_id = ( SELECT auth.uid() AS uid)) OR public.bh_is_manager(( SELECT auth.uid() AS uid)))))))));

DROP POLICY IF EXISTS "bh_post_comments delete" ON public.bh_creative_post_comments;

CREATE POLICY "bh_post_comments delete" ON public.bh_creative_post_comments FOR DELETE TO authenticated USING (((author_id = auth.uid()) OR public.bh_is_manager(auth.uid())));

DROP POLICY IF EXISTS "bh_post_comments insert" ON public.bh_creative_post_comments;

CREATE POLICY "bh_post_comments insert" ON public.bh_creative_post_comments FOR INSERT TO authenticated WITH CHECK ((author_id = auth.uid()));

DROP POLICY IF EXISTS "bh_post_comments read" ON public.bh_creative_post_comments;

CREATE POLICY "bh_post_comments read" ON public.bh_creative_post_comments FOR SELECT TO authenticated USING (((hidden = false) OR (author_id = auth.uid()) OR public.bh_is_manager(auth.uid())));

DROP POLICY IF EXISTS "bh_post_comments update" ON public.bh_creative_post_comments;

CREATE POLICY "bh_post_comments update" ON public.bh_creative_post_comments FOR UPDATE TO authenticated USING (((author_id = auth.uid()) OR public.bh_is_manager(auth.uid())));

DROP POLICY IF EXISTS "bh_posts delete" ON public.bh_creative_posts;

CREATE POLICY "bh_posts delete" ON public.bh_creative_posts FOR DELETE TO authenticated USING (((author_id = auth.uid()) OR public.bh_is_manager(auth.uid())));

DROP POLICY IF EXISTS "bh_posts insert" ON public.bh_creative_posts;

CREATE POLICY "bh_posts insert" ON public.bh_creative_posts FOR INSERT TO authenticated WITH CHECK ((author_id = auth.uid()));

DROP POLICY IF EXISTS "bh_posts read" ON public.bh_creative_posts;

CREATE POLICY "bh_posts read" ON public.bh_creative_posts FOR SELECT TO authenticated USING (((hidden = false) OR (author_id = auth.uid()) OR public.bh_is_manager(auth.uid())));

DROP POLICY IF EXISTS "bh_posts update" ON public.bh_creative_posts;

CREATE POLICY "bh_posts update" ON public.bh_creative_posts FOR UPDATE TO authenticated USING (((author_id = auth.uid()) OR public.bh_is_manager(auth.uid())));

DROP POLICY IF EXISTS "bh_reports insert" ON public.bh_creative_reports;

CREATE POLICY "bh_reports insert" ON public.bh_creative_reports FOR INSERT TO authenticated WITH CHECK ((reporter_id = auth.uid()));

DROP POLICY IF EXISTS "bh_reports manage" ON public.bh_creative_reports;

CREATE POLICY "bh_reports manage" ON public.bh_creative_reports FOR UPDATE TO authenticated USING (public.bh_is_manager(auth.uid()));

DROP POLICY IF EXISTS "bh_reports read" ON public.bh_creative_reports;

CREATE POLICY "bh_reports read" ON public.bh_creative_reports FOR SELECT TO authenticated USING (((reporter_id = auth.uid()) OR public.bh_is_manager(auth.uid())));

DROP POLICY IF EXISTS "bh_reports remove" ON public.bh_creative_reports;

CREATE POLICY "bh_reports remove" ON public.bh_creative_reports FOR DELETE TO authenticated USING (public.bh_is_manager(auth.uid()));

ALTER TABLE public.bh_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bh_resources manage" ON public.bh_resources;

CREATE POLICY "bh_resources manage" ON public.bh_resources TO authenticated USING (public.bh_is_manager(auth.uid())) WITH CHECK (public.bh_is_manager(auth.uid()));

DROP POLICY IF EXISTS "bh_resources read" ON public.bh_resources;

CREATE POLICY "bh_resources read" ON public.bh_resources FOR SELECT TO authenticated USING (public.bh_can_access_brand(auth.uid(), brand_id));

ALTER TABLE public.bh_task_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bh_task_attachments insert" ON public.bh_task_attachments;

CREATE POLICY "bh_task_attachments insert" ON public.bh_task_attachments FOR INSERT TO authenticated WITH CHECK ((created_by = auth.uid()));

DROP POLICY IF EXISTS "bh_task_attachments read" ON public.bh_task_attachments;

CREATE POLICY "bh_task_attachments read" ON public.bh_task_attachments FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.bh_tasks t
  WHERE ((t.id = bh_task_attachments.task_id) AND (public.bh_is_manager(( SELECT auth.uid() AS uid)) OR (t.created_by = ( SELECT auth.uid() AS uid)) OR (t.assignee_id = ( SELECT auth.uid() AS uid)) OR ((t.brand_id IS NOT NULL) AND public.bh_can_access_brand(( SELECT auth.uid() AS uid), t.brand_id)))))));

DROP POLICY IF EXISTS "bh_task_attachments remove" ON public.bh_task_attachments;

CREATE POLICY "bh_task_attachments remove" ON public.bh_task_attachments FOR DELETE TO authenticated USING (((created_by = auth.uid()) OR public.bh_is_manager(auth.uid())));

ALTER TABLE public.bh_task_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bh_task_comments insert" ON public.bh_task_comments;

CREATE POLICY "bh_task_comments insert" ON public.bh_task_comments FOR INSERT TO authenticated WITH CHECK ((author_id = auth.uid()));

DROP POLICY IF EXISTS "bh_task_comments modify" ON public.bh_task_comments;

CREATE POLICY "bh_task_comments modify" ON public.bh_task_comments FOR UPDATE TO authenticated USING (((author_id = auth.uid()) OR public.bh_is_manager(auth.uid())));

DROP POLICY IF EXISTS "bh_task_comments read" ON public.bh_task_comments;

CREATE POLICY "bh_task_comments read" ON public.bh_task_comments FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.bh_tasks t
  WHERE ((t.id = bh_task_comments.task_id) AND (public.bh_is_manager(( SELECT auth.uid() AS uid)) OR (t.created_by = ( SELECT auth.uid() AS uid)) OR (t.assignee_id = ( SELECT auth.uid() AS uid)) OR ((t.brand_id IS NOT NULL) AND public.bh_can_access_brand(( SELECT auth.uid() AS uid), t.brand_id)))))));

DROP POLICY IF EXISTS "bh_task_comments remove" ON public.bh_task_comments;

CREATE POLICY "bh_task_comments remove" ON public.bh_task_comments FOR DELETE TO authenticated USING (((author_id = auth.uid()) OR public.bh_is_manager(auth.uid())));

ALTER TABLE public.bh_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bh_tasks delete" ON public.bh_tasks;

CREATE POLICY "bh_tasks delete" ON public.bh_tasks FOR DELETE TO authenticated USING ((public.bh_is_manager(auth.uid()) OR (created_by = auth.uid())));

DROP POLICY IF EXISTS "bh_tasks insert" ON public.bh_tasks;

CREATE POLICY "bh_tasks insert" ON public.bh_tasks FOR INSERT TO authenticated WITH CHECK ((public.bh_is_manager(auth.uid()) OR (created_by = auth.uid())));

DROP POLICY IF EXISTS "bh_tasks read" ON public.bh_tasks;

CREATE POLICY "bh_tasks read" ON public.bh_tasks FOR SELECT TO authenticated USING ((public.bh_is_manager(( SELECT auth.uid() AS uid)) OR (created_by = ( SELECT auth.uid() AS uid)) OR (assignee_id = ( SELECT auth.uid() AS uid)) OR ((brand_id IS NOT NULL) AND public.bh_can_access_brand(( SELECT auth.uid() AS uid), brand_id))));

DROP POLICY IF EXISTS "bh_tasks update" ON public.bh_tasks;

CREATE POLICY "bh_tasks update" ON public.bh_tasks FOR UPDATE TO authenticated USING ((public.bh_is_manager(auth.uid()) OR (assignee_id = auth.uid()) OR (created_by = auth.uid())));

DROP POLICY IF EXISTS "bh_wiki manage" ON public.bh_wiki_entries;

CREATE POLICY "bh_wiki manage" ON public.bh_wiki_entries TO authenticated USING (public.bh_is_manager(auth.uid())) WITH CHECK (public.bh_is_manager(auth.uid()));

DROP POLICY IF EXISTS "bh_wiki read" ON public.bh_wiki_entries;

CREATE POLICY "bh_wiki read" ON public.bh_wiki_entries FOR SELECT TO authenticated USING (public.bh_can_access_brand(auth.uid(), brand_id));

ALTER TABLE public.bh_wiki_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.brand_integrations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brands write admin" ON public.brands;

CREATE POLICY "brands write admin" ON public.brands TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

ALTER TABLE public.cash_daily_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cash_daily_metrics_read" ON public.cash_daily_metrics;

CREATE POLICY cash_daily_metrics_read ON public.cash_daily_metrics FOR SELECT TO authenticated USING (((public.can_read_page(( SELECT auth.uid() AS uid), '/treasury'::text) OR public.can_read_page(( SELECT auth.uid() AS uid), '/reports/cash-flow'::text)) AND
CASE
    WHEN (brand_key = '00000000-0000-0000-0000-000000000000'::uuid) THEN ( SELECT (public.has_role(( SELECT auth.uid() AS uid), 'admin'::public.app_role) OR public.has_role(( SELECT auth.uid() AS uid), 'manager'::public.app_role)))
    ELSE public.has_brand_access(( SELECT auth.uid() AS uid), brand_key)
END));

ALTER TABLE public.cash_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cash_txn_read" ON public.cash_transactions;

CREATE POLICY cash_txn_read ON public.cash_transactions FOR SELECT TO authenticated USING ((( SELECT public.is_global_reader(( SELECT auth.uid() AS uid)) AS is_global_reader) OR ((brand_id IS NOT NULL) AND (brand_id IN ( SELECT uba.brand_id
   FROM public.user_brand_access uba
  WHERE (uba.user_id = ( SELECT auth.uid() AS uid))))) OR (created_by = ( SELECT auth.uid() AS uid)) OR (for_user_id = ( SELECT auth.uid() AS uid))));

DROP POLICY IF EXISTS "cash_txn_write_delete" ON public.cash_transactions;

CREATE POLICY cash_txn_write_delete ON public.cash_transactions FOR DELETE TO authenticated USING ((public.is_writer(auth.uid()) AND (((brand_id IS NOT NULL) AND public.has_brand_access(auth.uid(), brand_id)) OR ((brand_id IS NULL) AND public.has_role(auth.uid(), 'admin'::public.app_role)))));

DROP POLICY IF EXISTS "cash_txn_write_insert" ON public.cash_transactions;

CREATE POLICY cash_txn_write_insert ON public.cash_transactions FOR INSERT TO authenticated WITH CHECK ((public.is_writer(auth.uid()) AND (created_by = auth.uid()) AND (((brand_id IS NOT NULL) AND public.has_brand_access(auth.uid(), brand_id)) OR ((brand_id IS NULL) AND public.has_role(auth.uid(), 'admin'::public.app_role)))));

DROP POLICY IF EXISTS "cash_txn_write_update" ON public.cash_transactions;

CREATE POLICY cash_txn_write_update ON public.cash_transactions FOR UPDATE TO authenticated USING ((public.is_writer(auth.uid()) AND (((brand_id IS NOT NULL) AND public.has_brand_access(auth.uid(), brand_id)) OR ((brand_id IS NULL) AND public.has_role(auth.uid(), 'admin'::public.app_role))))) WITH CHECK ((public.is_writer(auth.uid()) AND (((brand_id IS NOT NULL) AND public.has_brand_access(auth.uid(), brand_id)) OR ((brand_id IS NULL) AND public.has_role(auth.uid(), 'admin'::public.app_role)))));

DROP POLICY IF EXISTS "cats write admin" ON public.expense_categories;

CREATE POLICY "cats write admin" ON public.expense_categories TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

ALTER TABLE public.company_assets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.courier_brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courier_brands_read" ON public.courier_brands;

CREATE POLICY courier_brands_read ON public.courier_brands FOR SELECT TO authenticated USING ((public.can_read_page(auth.uid(), '/couriers'::text) AND public.has_brand_access(auth.uid(), brand_id)));

DROP POLICY IF EXISTS "courier_brands_write" ON public.courier_brands;

CREATE POLICY courier_brands_write ON public.courier_brands TO authenticated USING ((public.can_write_page(auth.uid(), '/couriers'::text) AND public.has_brand_access(auth.uid(), brand_id))) WITH CHECK ((public.can_write_page(auth.uid(), '/couriers'::text) AND public.has_brand_access(auth.uid(), brand_id)));

ALTER TABLE public.courier_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courier_charges_read" ON public.courier_charges;

CREATE POLICY courier_charges_read ON public.courier_charges FOR SELECT TO authenticated USING ((public.can_read_page(auth.uid(), '/couriers'::text) AND public.has_brand_access(auth.uid(), brand_id)));

DROP POLICY IF EXISTS "courier_charges_write" ON public.courier_charges;

CREATE POLICY courier_charges_write ON public.courier_charges TO authenticated USING ((public.can_write_page(auth.uid(), '/couriers'::text) AND public.has_brand_access(auth.uid(), brand_id))) WITH CHECK ((public.can_write_page(auth.uid(), '/couriers'::text) AND public.has_brand_access(auth.uid(), brand_id)));

ALTER TABLE public.courier_financial_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courier_financial_metrics_read" ON public.courier_financial_metrics;

CREATE POLICY courier_financial_metrics_read ON public.courier_financial_metrics FOR SELECT TO authenticated USING ((public.can_read_page(( SELECT auth.uid() AS uid), '/treasury'::text) AND
CASE
    WHEN (brand_key = '00000000-0000-0000-0000-000000000000'::uuid) THEN ( SELECT (public.has_role(( SELECT auth.uid() AS uid), 'admin'::public.app_role) OR public.has_role(( SELECT auth.uid() AS uid), 'manager'::public.app_role)))
    ELSE public.has_brand_access(( SELECT auth.uid() AS uid), brand_key)
END));

ALTER TABLE public.courier_governorate_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courier_mappings_read" ON public.courier_status_mappings;

CREATE POLICY courier_mappings_read ON public.courier_status_mappings FOR SELECT TO authenticated USING ((public.can_read_page(auth.uid(), '/couriers'::text) AND public.courier_accessible_to_user(auth.uid(), courier_id)));

DROP POLICY IF EXISTS "courier_mappings_write" ON public.courier_status_mappings;

CREATE POLICY courier_mappings_write ON public.courier_status_mappings TO authenticated USING ((public.can_write_page(auth.uid(), '/couriers'::text) AND public.courier_manageable_by_user(auth.uid(), courier_id))) WITH CHECK ((public.can_write_page(auth.uid(), '/couriers'::text) AND public.courier_manageable_by_user(auth.uid(), courier_id)));

DROP POLICY IF EXISTS "courier_rates_read" ON public.courier_governorate_rates;

CREATE POLICY courier_rates_read ON public.courier_governorate_rates FOR SELECT TO authenticated USING ((public.can_read_page(auth.uid(), '/couriers'::text) AND public.courier_accessible_to_user(auth.uid(), courier_id)));

DROP POLICY IF EXISTS "courier_rates_write" ON public.courier_governorate_rates;

CREATE POLICY courier_rates_write ON public.courier_governorate_rates TO authenticated USING ((public.can_write_page(auth.uid(), '/couriers'::text) AND public.courier_manageable_by_user(auth.uid(), courier_id))) WITH CHECK ((public.can_write_page(auth.uid(), '/couriers'::text) AND public.courier_manageable_by_user(auth.uid(), courier_id)));

ALTER TABLE public.courier_settlement_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courier_settlement_lines_delete" ON public.courier_settlement_lines;

CREATE POLICY courier_settlement_lines_delete ON public.courier_settlement_lines FOR DELETE TO authenticated USING ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), courier_settlement_lines.brand_id) AS has_brand_access)));

DROP POLICY IF EXISTS "courier_settlement_lines_insert" ON public.courier_settlement_lines;

CREATE POLICY courier_settlement_lines_insert ON public.courier_settlement_lines FOR INSERT TO authenticated WITH CHECK ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), courier_settlement_lines.brand_id) AS has_brand_access)));

DROP POLICY IF EXISTS "courier_settlement_lines_read" ON public.courier_settlement_lines;

CREATE POLICY courier_settlement_lines_read ON public.courier_settlement_lines FOR SELECT TO authenticated USING ((( SELECT public.can_read_page(auth.uid(), '/orders'::text) AS can_read_page) AND ( SELECT public.has_brand_access(auth.uid(), courier_settlement_lines.brand_id) AS has_brand_access)));

DROP POLICY IF EXISTS "courier_settlement_lines_update" ON public.courier_settlement_lines;

CREATE POLICY courier_settlement_lines_update ON public.courier_settlement_lines FOR UPDATE TO authenticated USING ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), courier_settlement_lines.brand_id) AS has_brand_access))) WITH CHECK ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), courier_settlement_lines.brand_id) AS has_brand_access)));

ALTER TABLE public.courier_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courier_settlements_delete" ON public.courier_settlements;

CREATE POLICY courier_settlements_delete ON public.courier_settlements FOR DELETE TO authenticated USING ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), courier_settlements.brand_id) AS has_brand_access)));

DROP POLICY IF EXISTS "courier_settlements_insert" ON public.courier_settlements;

CREATE POLICY courier_settlements_insert ON public.courier_settlements FOR INSERT TO authenticated WITH CHECK ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), courier_settlements.brand_id) AS has_brand_access)));

DROP POLICY IF EXISTS "courier_settlements_read" ON public.courier_settlements;

CREATE POLICY courier_settlements_read ON public.courier_settlements FOR SELECT TO authenticated USING ((( SELECT public.can_read_page(auth.uid(), '/orders'::text) AS can_read_page) AND ( SELECT public.has_brand_access(auth.uid(), courier_settlements.brand_id) AS has_brand_access)));

DROP POLICY IF EXISTS "courier_settlements_update" ON public.courier_settlements;

CREATE POLICY courier_settlements_update ON public.courier_settlements FOR UPDATE TO authenticated USING ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), courier_settlements.brand_id) AS has_brand_access))) WITH CHECK ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), courier_settlements.brand_id) AS has_brand_access)));

ALTER TABLE public.courier_status_mappings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customer_brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_brands_read" ON public.customer_brands;

CREATE POLICY customer_brands_read ON public.customer_brands FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'data_entry'::public.app_role) OR public.has_role(auth.uid(), 'accountant'::public.app_role) OR public.has_brand_access(auth.uid(), brand_id)));

DROP POLICY IF EXISTS "customer_brands_write" ON public.customer_brands;

CREATE POLICY customer_brands_write ON public.customer_brands TO authenticated USING ((public.is_writer(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id))) WITH CHECK ((public.is_writer(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id)));

ALTER TABLE public.customer_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_metrics_read" ON public.customer_metrics;

CREATE POLICY customer_metrics_read ON public.customer_metrics FOR SELECT TO authenticated USING ((public.can_read_page(auth.uid(), '/customers'::text) AND public.has_brand_access(auth.uid(), brand_id) AND public.can_access_customer(auth.uid(), customer_id)));

ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers delete" ON public.customers;

CREATE POLICY "customers delete" ON public.customers FOR DELETE TO authenticated USING ((( SELECT public.has_role(( SELECT auth.uid() AS uid), 'admin'::public.app_role) AS has_role) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'manager'::public.app_role) AS has_role) OR (public.is_writer(( SELECT auth.uid() AS uid)) AND ((is_general = true) OR (EXISTS ( SELECT 1
   FROM public.customer_brands cb
  WHERE ((cb.customer_id = customers.id) AND public.has_brand_access(( SELECT auth.uid() AS uid), cb.brand_id))))))));

DROP POLICY IF EXISTS "customers insert" ON public.customers;

CREATE POLICY "customers insert" ON public.customers FOR INSERT TO authenticated WITH CHECK ((( SELECT public.has_role(( SELECT auth.uid() AS uid), 'admin'::public.app_role) AS has_role) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'manager'::public.app_role) AS has_role) OR (public.is_writer(( SELECT auth.uid() AS uid)) AND ((is_general = true) OR (EXISTS ( SELECT 1
   FROM public.customer_brands cb
  WHERE ((cb.customer_id = customers.id) AND public.has_brand_access(( SELECT auth.uid() AS uid), cb.brand_id))))))));

DROP POLICY IF EXISTS "customers read" ON public.customers;

CREATE POLICY "customers read" ON public.customers FOR SELECT TO authenticated USING ((( SELECT public.has_role(( SELECT auth.uid() AS uid), 'admin'::public.app_role) AS has_role) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'manager'::public.app_role) AS has_role) OR ((( SELECT public.has_role(( SELECT auth.uid() AS uid), 'data_entry'::public.app_role) AS has_role) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'accountant'::public.app_role) AS has_role)) AND ((is_general = true) OR (EXISTS ( SELECT 1
   FROM public.customer_brands cb
  WHERE ((cb.customer_id = customers.id) AND (( SELECT public.is_global_reader(( SELECT auth.uid() AS uid)) AS is_global_reader) OR (cb.brand_id IN ( SELECT uba.brand_id
           FROM public.user_brand_access uba
          WHERE (uba.user_id = ( SELECT auth.uid() AS uid))))))))))));

DROP POLICY IF EXISTS "customers update" ON public.customers;

CREATE POLICY "customers update" ON public.customers FOR UPDATE TO authenticated USING ((( SELECT public.has_role(( SELECT auth.uid() AS uid), 'admin'::public.app_role) AS has_role) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'manager'::public.app_role) AS has_role) OR (public.is_writer(( SELECT auth.uid() AS uid)) AND ((is_general = true) OR (EXISTS ( SELECT 1
   FROM public.customer_brands cb
  WHERE ((cb.customer_id = customers.id) AND public.has_brand_access(( SELECT auth.uid() AS uid), cb.brand_id)))))))) WITH CHECK ((( SELECT public.has_role(( SELECT auth.uid() AS uid), 'admin'::public.app_role) AS has_role) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'manager'::public.app_role) AS has_role) OR (public.is_writer(( SELECT auth.uid() AS uid)) AND ((is_general = true) OR (EXISTS ( SELECT 1
   FROM public.customer_brands cb
  WHERE ((cb.customer_id = customers.id) AND public.has_brand_access(( SELECT auth.uid() AS uid), cb.brand_id))))))));

DROP POLICY IF EXISTS "delete fulfillment" ON public.fulfillment_entries;

CREATE POLICY "delete fulfillment" ON public.fulfillment_entries FOR DELETE TO authenticated USING (public.is_writer(( SELECT auth.uid() AS uid)));

DROP POLICY IF EXISTS "ee delete privileged" ON public.expense_entries;

CREATE POLICY "ee delete privileged" ON public.expense_entries FOR DELETE TO authenticated USING ((public.has_brand_access(( SELECT auth.uid() AS uid), brand_id) AND public.is_writer(( SELECT auth.uid() AS uid))));

DROP POLICY IF EXISTS "ee insert privileged" ON public.expense_entries;

CREATE POLICY "ee insert privileged" ON public.expense_entries FOR INSERT TO authenticated WITH CHECK ((public.has_brand_access(( SELECT auth.uid() AS uid), brand_id) AND public.is_writer(( SELECT auth.uid() AS uid))));

DROP POLICY IF EXISTS "ee update privileged" ON public.expense_entries;

CREATE POLICY "ee update privileged" ON public.expense_entries FOR UPDATE TO authenticated USING ((public.has_brand_access(( SELECT auth.uid() AS uid), brand_id) AND public.is_writer(( SELECT auth.uid() AS uid)))) WITH CHECK ((public.has_brand_access(( SELECT auth.uid() AS uid), brand_id) AND public.is_writer(( SELECT auth.uid() AS uid))));

ALTER TABLE public.employee_attendance_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.employee_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.employee_time_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employees delete admin manager" ON public.employees;

CREATE POLICY "employees delete admin manager" ON public.employees FOR DELETE TO authenticated USING (((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)) AND public.has_brand_access(auth.uid(), brand_id)));

DROP POLICY IF EXISTS "employees insert admin manager" ON public.employees;

CREATE POLICY "employees insert admin manager" ON public.employees FOR INSERT TO authenticated WITH CHECK (((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)) AND public.has_brand_access(auth.uid(), brand_id)));

DROP POLICY IF EXISTS "employees read privileged or self" ON public.employees;

CREATE POLICY "employees read privileged or self" ON public.employees FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (public.has_brand_access(( SELECT auth.uid() AS uid), brand_id) AND (public.has_role(( SELECT auth.uid() AS uid), 'admin'::public.app_role) OR public.has_role(( SELECT auth.uid() AS uid), 'manager'::public.app_role) OR public.has_role(( SELECT auth.uid() AS uid), 'hr'::public.app_role) OR public.has_role(( SELECT auth.uid() AS uid), 'accountant'::public.app_role)))));

DROP POLICY IF EXISTS "employees update admin manager" ON public.employees;

CREATE POLICY "employees update admin manager" ON public.employees FOR UPDATE TO authenticated USING (((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'hr'::public.app_role)) AND public.has_brand_access(auth.uid(), brand_id))) WITH CHECK (((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'hr'::public.app_role)) AND public.has_brand_access(auth.uid(), brand_id)));

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.expense_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.financial_audit_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.financial_audit_log_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "financial_audit_log_archive_read" ON public.financial_audit_log_archive;

CREATE POLICY financial_audit_log_archive_read ON public.financial_audit_log_archive FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));

ALTER TABLE public.fulfillment_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert fulfillment" ON public.fulfillment_entries;

CREATE POLICY "insert fulfillment" ON public.fulfillment_entries FOR INSERT TO authenticated WITH CHECK (public.is_writer(( SELECT auth.uid() AS uid)));

ALTER TABLE public.integration_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "integrations delete brand scoped" ON public.brand_integrations;

CREATE POLICY "integrations delete brand scoped" ON public.brand_integrations FOR DELETE TO authenticated USING (((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)) AND public.has_brand_access(auth.uid(), brand_id)));

DROP POLICY IF EXISTS "integrations read brand scoped" ON public.brand_integrations;

CREATE POLICY "integrations read brand scoped" ON public.brand_integrations FOR SELECT TO authenticated USING (((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)) AND public.has_brand_access(auth.uid(), brand_id)));

DROP POLICY IF EXISTS "integrations write brand scoped" ON public.brand_integrations;

CREATE POLICY "integrations write brand scoped" ON public.brand_integrations TO authenticated USING (((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)) AND public.has_brand_access(auth.uid(), brand_id))) WITH CHECK (((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)) AND public.has_brand_access(auth.uid(), brand_id)));

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.investor_brand_shares ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "investors admin all" ON public.investors;

CREATE POLICY "investors admin all" ON public.investors TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "investors self read" ON public.investors;

CREATE POLICY "investors self read" ON public.investors FOR SELECT TO authenticated USING ((user_id = auth.uid()));

ALTER TABLE public.material_brands ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "me delete privileged" ON public.monthly_entries;

CREATE POLICY "me delete privileged" ON public.monthly_entries FOR DELETE TO authenticated USING ((public.has_brand_access(( SELECT auth.uid() AS uid), brand_id) AND public.is_writer(( SELECT auth.uid() AS uid))));

DROP POLICY IF EXISTS "me insert privileged" ON public.monthly_entries;

CREATE POLICY "me insert privileged" ON public.monthly_entries FOR INSERT TO authenticated WITH CHECK ((public.has_brand_access(( SELECT auth.uid() AS uid), brand_id) AND public.is_writer(( SELECT auth.uid() AS uid))));

DROP POLICY IF EXISTS "me update privileged" ON public.monthly_entries;

CREATE POLICY "me update privileged" ON public.monthly_entries FOR UPDATE TO authenticated USING ((public.has_brand_access(( SELECT auth.uid() AS uid), brand_id) AND public.is_writer(( SELECT auth.uid() AS uid)))) WITH CHECK ((public.has_brand_access(( SELECT auth.uid() AS uid), brand_id) AND public.is_writer(( SELECT auth.uid() AS uid))));

ALTER TABLE public.monthly_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notes read" ON public.customer_notes;

CREATE POLICY "notes read" ON public.customer_notes FOR SELECT TO authenticated USING (((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'data_entry'::public.app_role) OR public.has_role(auth.uid(), 'accountant'::public.app_role)) AND public.can_access_customer(auth.uid(), customer_id)));

DROP POLICY IF EXISTS "notes write" ON public.customer_notes;

CREATE POLICY "notes write" ON public.customer_notes TO authenticated USING ((public.is_writer(auth.uid()) AND public.can_access_customer(auth.uid(), customer_id))) WITH CHECK ((public.is_writer(auth.uid()) AND public.can_access_customer(auth.uid(), customer_id)));

DROP POLICY IF EXISTS "notif_admin_manager_insert" ON public.notifications;

CREATE POLICY notif_admin_manager_insert ON public.notifications FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR (user_id = auth.uid())));

DROP POLICY IF EXISTS "notif_owner_read" ON public.notifications;

CREATE POLICY notif_owner_read ON public.notifications FOR SELECT TO authenticated USING ((user_id = auth.uid()));

DROP POLICY IF EXISTS "notif_owner_write" ON public.notifications;

CREATE POLICY notif_owner_write ON public.notifications FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oal_insert" ON public.order_assignment_log;

CREATE POLICY oal_insert ON public.order_assignment_log FOR INSERT TO authenticated WITH CHECK ((performed_by = auth.uid()));

DROP POLICY IF EXISTS "oal_read" ON public.order_assignment_log;

CREATE POLICY oal_read ON public.order_assignment_log FOR SELECT TO authenticated USING ((public.has_role(( SELECT auth.uid() AS uid), 'admin'::public.app_role) OR public.has_role(( SELECT auth.uid() AS uid), 'manager'::public.app_role) OR public.is_global_reader(( SELECT auth.uid() AS uid)) OR (performed_by = ( SELECT auth.uid() AS uid)) OR (assigned_user_id = ( SELECT auth.uid() AS uid)) OR (previous_assigned_user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_assignment_log.order_id) AND public.has_brand_access(( SELECT auth.uid() AS uid), o.brand_id))))));

ALTER TABLE public.order_assignment_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.order_collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_collections_delete" ON public.order_collections;

CREATE POLICY order_collections_delete ON public.order_collections FOR DELETE TO authenticated USING ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), order_collections.brand_id) AS has_brand_access)));

DROP POLICY IF EXISTS "order_collections_insert" ON public.order_collections;

CREATE POLICY order_collections_insert ON public.order_collections FOR INSERT TO authenticated WITH CHECK ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), order_collections.brand_id) AS has_brand_access)));

DROP POLICY IF EXISTS "order_collections_read" ON public.order_collections;

CREATE POLICY order_collections_read ON public.order_collections FOR SELECT TO authenticated USING ((( SELECT public.can_read_page(auth.uid(), '/orders'::text) AS can_read_page) AND ( SELECT public.has_brand_access(auth.uid(), order_collections.brand_id) AS has_brand_access)));

DROP POLICY IF EXISTS "order_collections_update" ON public.order_collections;

CREATE POLICY order_collections_update ON public.order_collections FOR UPDATE TO authenticated USING ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), order_collections.brand_id) AS has_brand_access))) WITH CHECK ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), order_collections.brand_id) AS has_brand_access)));

DROP POLICY IF EXISTS "order_conf_attempts_delete" ON public.order_confirmation_attempts;

CREATE POLICY order_conf_attempts_delete ON public.order_confirmation_attempts FOR DELETE TO authenticated USING ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), order_confirmation_attempts.brand_id) AS has_brand_access)));

DROP POLICY IF EXISTS "order_conf_attempts_insert" ON public.order_confirmation_attempts;

CREATE POLICY order_conf_attempts_insert ON public.order_confirmation_attempts FOR INSERT TO authenticated WITH CHECK ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), order_confirmation_attempts.brand_id) AS has_brand_access)));

DROP POLICY IF EXISTS "order_conf_attempts_read" ON public.order_confirmation_attempts;

CREATE POLICY order_conf_attempts_read ON public.order_confirmation_attempts FOR SELECT TO authenticated USING ((( SELECT public.can_read_page(auth.uid(), '/orders'::text) AS can_read_page) AND ( SELECT public.has_brand_access(auth.uid(), order_confirmation_attempts.brand_id) AS has_brand_access)));

DROP POLICY IF EXISTS "order_conf_attempts_update" ON public.order_confirmation_attempts;

CREATE POLICY order_conf_attempts_update ON public.order_confirmation_attempts FOR UPDATE TO authenticated USING ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), order_confirmation_attempts.brand_id) AS has_brand_access))) WITH CHECK ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), order_confirmation_attempts.brand_id) AS has_brand_access)));

ALTER TABLE public.order_confirmation_attempts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_items_delete" ON public.order_items;

CREATE POLICY order_items_delete ON public.order_items FOR DELETE TO authenticated USING ((public.can_write_page(( SELECT auth.uid() AS uid), '/orders'::text) AND (EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND public.has_brand_access(( SELECT auth.uid() AS uid), o.brand_id))))));

DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;

CREATE POLICY order_items_insert ON public.order_items FOR INSERT TO authenticated WITH CHECK ((public.can_write_page(( SELECT auth.uid() AS uid), '/orders'::text) AND (EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND public.has_brand_access(( SELECT auth.uid() AS uid), o.brand_id))))));

DROP POLICY IF EXISTS "order_items_read" ON public.order_items;

CREATE POLICY order_items_read ON public.order_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND (( SELECT public.is_global_reader(( SELECT auth.uid() AS uid)) AS is_global_reader) OR (o.brand_id IN ( SELECT uba.brand_id
           FROM public.user_brand_access uba
          WHERE (uba.user_id = ( SELECT auth.uid() AS uid)))))))));

DROP POLICY IF EXISTS "order_items_update" ON public.order_items;

CREATE POLICY order_items_update ON public.order_items FOR UPDATE TO authenticated USING ((public.can_write_page(( SELECT auth.uid() AS uid), '/orders'::text) AND (EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND public.has_brand_access(( SELECT auth.uid() AS uid), o.brand_id)))))) WITH CHECK ((public.can_write_page(( SELECT auth.uid() AS uid), '/orders'::text) AND (EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND public.has_brand_access(( SELECT auth.uid() AS uid), o.brand_id))))));

ALTER TABLE public.order_lifecycle_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_lifecycle_events_read" ON public.order_lifecycle_events;

CREATE POLICY order_lifecycle_events_read ON public.order_lifecycle_events FOR SELECT TO authenticated USING ((public.can_read_page(auth.uid(), '/orders'::text) AND public.has_brand_access(auth.uid(), brand_id)));

ALTER TABLE public.order_returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_returns_delete" ON public.order_returns;

CREATE POLICY order_returns_delete ON public.order_returns FOR DELETE TO authenticated USING ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), order_returns.brand_id) AS has_brand_access)));

DROP POLICY IF EXISTS "order_returns_insert" ON public.order_returns;

CREATE POLICY order_returns_insert ON public.order_returns FOR INSERT TO authenticated WITH CHECK ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), order_returns.brand_id) AS has_brand_access)));

DROP POLICY IF EXISTS "order_returns_read" ON public.order_returns;

CREATE POLICY order_returns_read ON public.order_returns FOR SELECT TO authenticated USING ((( SELECT public.can_read_page(auth.uid(), '/orders'::text) AS can_read_page) AND ( SELECT public.has_brand_access(auth.uid(), order_returns.brand_id) AS has_brand_access)));

DROP POLICY IF EXISTS "order_returns_update" ON public.order_returns;

CREATE POLICY order_returns_update ON public.order_returns FOR UPDATE TO authenticated USING ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), order_returns.brand_id) AS has_brand_access))) WITH CHECK ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), order_returns.brand_id) AS has_brand_access)));

ALTER TABLE public.order_shipments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_shipments_delete" ON public.order_shipments;

CREATE POLICY order_shipments_delete ON public.order_shipments FOR DELETE TO authenticated USING ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), order_shipments.brand_id) AS has_brand_access)));

DROP POLICY IF EXISTS "order_shipments_insert" ON public.order_shipments;

CREATE POLICY order_shipments_insert ON public.order_shipments FOR INSERT TO authenticated WITH CHECK ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), order_shipments.brand_id) AS has_brand_access)));

DROP POLICY IF EXISTS "order_shipments_read" ON public.order_shipments;

CREATE POLICY order_shipments_read ON public.order_shipments FOR SELECT TO authenticated USING ((( SELECT public.can_read_page(auth.uid(), '/orders'::text) AS can_read_page) AND ( SELECT public.has_brand_access(auth.uid(), order_shipments.brand_id) AS has_brand_access)));

DROP POLICY IF EXISTS "order_shipments_update" ON public.order_shipments;

CREATE POLICY order_shipments_update ON public.order_shipments FOR UPDATE TO authenticated USING ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), order_shipments.brand_id) AS has_brand_access))) WITH CHECK ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), order_shipments.brand_id) AS has_brand_access)));

ALTER TABLE public.order_sla_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_sla_rules_read" ON public.order_sla_rules;

CREATE POLICY order_sla_rules_read ON public.order_sla_rules FOR SELECT TO authenticated USING (( SELECT public.can_read_page(auth.uid(), '/orders'::text) AS can_read_page));

DROP POLICY IF EXISTS "order_sla_rules_write" ON public.order_sla_rules;

CREATE POLICY order_sla_rules_write ON public.order_sla_rules TO authenticated USING (( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page)) WITH CHECK (( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page));

ALTER TABLE public.order_source_payloads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_source_payloads_read" ON public.order_source_payloads;

CREATE POLICY order_source_payloads_read ON public.order_source_payloads FOR SELECT TO authenticated USING ((public.can_read_page(auth.uid(), '/orders'::text) AND public.has_brand_access(auth.uid(), brand_id)));

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_brand_read" ON public.orders;

CREATE POLICY orders_brand_read ON public.orders FOR SELECT TO authenticated USING ((( SELECT public.is_global_reader(( SELECT auth.uid() AS uid)) AS is_global_reader) OR (brand_id IN ( SELECT uba.brand_id
   FROM public.user_brand_access uba
  WHERE (uba.user_id = ( SELECT auth.uid() AS uid))))));

DROP POLICY IF EXISTS "orders_distribution_update" ON public.orders;

CREATE POLICY orders_distribution_update ON public.orders FOR UPDATE TO authenticated USING ((public.can_write_page(( SELECT auth.uid() AS uid), '/order-distribution'::text) AND public.has_brand_access(( SELECT auth.uid() AS uid), brand_id))) WITH CHECK ((public.can_write_page(( SELECT auth.uid() AS uid), '/order-distribution'::text) AND public.has_brand_access(( SELECT auth.uid() AS uid), brand_id)));

DROP POLICY IF EXISTS "orders_writer_delete" ON public.orders;

CREATE POLICY orders_writer_delete ON public.orders FOR DELETE TO authenticated USING ((public.can_write_page(( SELECT auth.uid() AS uid), '/orders'::text) AND public.has_brand_access(( SELECT auth.uid() AS uid), brand_id)));

DROP POLICY IF EXISTS "orders_writer_insert" ON public.orders;

CREATE POLICY orders_writer_insert ON public.orders FOR INSERT TO authenticated WITH CHECK ((public.can_write_page(( SELECT auth.uid() AS uid), '/orders'::text) AND public.has_brand_access(( SELECT auth.uid() AS uid), brand_id)));

DROP POLICY IF EXISTS "orders_writer_update" ON public.orders;

CREATE POLICY orders_writer_update ON public.orders FOR UPDATE TO authenticated USING ((public.can_write_page(( SELECT auth.uid() AS uid), '/orders'::text) AND public.has_brand_access(( SELECT auth.uid() AS uid), brand_id))) WITH CHECK ((public.can_write_page(( SELECT auth.uid() AS uid), '/orders'::text) AND public.has_brand_access(( SELECT auth.uid() AS uid), brand_id)));

DROP POLICY IF EXISTS "own_settings_select" ON public.user_settings;

CREATE POLICY own_settings_select ON public.user_settings FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));

DROP POLICY IF EXISTS "pc_delete_own_or_writer" ON public.project_comments;

CREATE POLICY pc_delete_own_or_writer ON public.project_comments FOR DELETE TO authenticated USING ((public.can_access_service_project(auth.uid(), project_id) AND ((author_id = auth.uid()) OR public.is_writer(auth.uid()) OR public.is_project_manager(auth.uid()))));

DROP POLICY IF EXISTS "pc_insert_own" ON public.project_comments;

CREATE POLICY pc_insert_own ON public.project_comments FOR INSERT TO authenticated WITH CHECK ((public.can_access_service_project(auth.uid(), project_id) AND (author_id = auth.uid())));

DROP POLICY IF EXISTS "pc_read" ON public.project_comments;

CREATE POLICY pc_read ON public.project_comments FOR SELECT TO authenticated USING (public.can_access_service_project(auth.uid(), project_id));

DROP POLICY IF EXISTS "pc_update_own" ON public.project_comments;

CREATE POLICY pc_update_own ON public.project_comments FOR UPDATE TO authenticated USING ((public.can_access_service_project(auth.uid(), project_id) AND (author_id = auth.uid()))) WITH CHECK ((public.can_access_service_project(auth.uid(), project_id) AND (author_id = auth.uid())));

DROP POLICY IF EXISTS "pe_read" ON public.project_events;

CREATE POLICY pe_read ON public.project_events FOR SELECT TO authenticated USING (public.has_brand_access(auth.uid(), brand_id));

DROP POLICY IF EXISTS "pe_write" ON public.project_events;

CREATE POLICY pe_write ON public.project_events TO authenticated USING ((public.has_brand_access(auth.uid(), brand_id) AND (public.is_writer(auth.uid()) OR public.is_project_manager(auth.uid())))) WITH CHECK ((public.has_brand_access(auth.uid(), brand_id) AND (public.is_writer(auth.uid()) OR public.is_project_manager(auth.uid()))));

DROP POLICY IF EXISTS "pf_read" ON public.project_files;

CREATE POLICY pf_read ON public.project_files FOR SELECT TO authenticated USING (public.can_access_service_project(auth.uid(), project_id));

DROP POLICY IF EXISTS "pf_write" ON public.project_files;

CREATE POLICY pf_write ON public.project_files TO authenticated USING ((public.can_access_service_project(auth.uid(), project_id) AND (public.is_writer(auth.uid()) OR public.is_project_manager(auth.uid()) OR (uploaded_by = auth.uid())))) WITH CHECK ((public.can_access_service_project(auth.uid(), project_id) AND (public.is_writer(auth.uid()) OR public.is_project_manager(auth.uid()) OR (uploaded_by = auth.uid()))));

DROP POLICY IF EXISTS "pm_all_project_comments" ON public.project_comments;

CREATE POLICY pm_all_project_comments ON public.project_comments TO authenticated USING ((public.is_project_manager(auth.uid()) AND public.can_access_service_project(auth.uid(), project_id))) WITH CHECK ((public.is_project_manager(auth.uid()) AND public.can_access_service_project(auth.uid(), project_id)));

DROP POLICY IF EXISTS "pm_all_project_events" ON public.project_events;

CREATE POLICY pm_all_project_events ON public.project_events TO authenticated USING ((public.is_project_manager(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id))) WITH CHECK ((public.is_project_manager(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id)));

DROP POLICY IF EXISTS "pm_all_project_files" ON public.project_files;

CREATE POLICY pm_all_project_files ON public.project_files TO authenticated USING ((public.is_project_manager(auth.uid()) AND public.can_access_service_project(auth.uid(), project_id))) WITH CHECK ((public.is_project_manager(auth.uid()) AND public.can_access_service_project(auth.uid(), project_id)));

DROP POLICY IF EXISTS "pm_all_project_private_notes" ON public.project_private_notes;

CREATE POLICY pm_all_project_private_notes ON public.project_private_notes TO authenticated USING ((public.is_project_manager(auth.uid()) AND public.can_access_service_project(auth.uid(), project_id))) WITH CHECK ((public.is_project_manager(auth.uid()) AND public.can_access_service_project(auth.uid(), project_id)));

DROP POLICY IF EXISTS "pm_all_project_revisions" ON public.project_revisions;

CREATE POLICY pm_all_project_revisions ON public.project_revisions TO authenticated USING ((public.is_project_manager(auth.uid()) AND public.can_access_service_project(auth.uid(), project_id))) WITH CHECK ((public.is_project_manager(auth.uid()) AND public.can_access_service_project(auth.uid(), project_id)));

DROP POLICY IF EXISTS "pm_all_project_tasks" ON public.project_tasks;

CREATE POLICY pm_all_project_tasks ON public.project_tasks TO authenticated USING ((public.is_project_manager(auth.uid()) AND public.can_access_service_project(auth.uid(), project_id))) WITH CHECK ((public.is_project_manager(auth.uid()) AND public.can_access_service_project(auth.uid(), project_id)));

DROP POLICY IF EXISTS "pm_all_service_clients" ON public.service_clients;

CREATE POLICY pm_all_service_clients ON public.service_clients TO authenticated USING ((public.is_project_manager(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id))) WITH CHECK ((public.is_project_manager(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id)));

DROP POLICY IF EXISTS "pm_all_service_projects" ON public.service_projects;

CREATE POLICY pm_all_service_projects ON public.service_projects TO authenticated USING ((public.is_project_manager(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id))) WITH CHECK ((public.is_project_manager(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id)));

DROP POLICY IF EXISTS "ppn_pm_admin_read" ON public.project_private_notes;

CREATE POLICY ppn_pm_admin_read ON public.project_private_notes FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.service_projects p
  WHERE ((p.id = project_private_notes.project_id) AND (p.pm_user_id = auth.uid()))))));

DROP POLICY IF EXISTS "ppn_pm_admin_write" ON public.project_private_notes;

CREATE POLICY ppn_pm_admin_write ON public.project_private_notes TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.service_projects p
  WHERE ((p.id = project_private_notes.project_id) AND (p.pm_user_id = auth.uid())))))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.service_projects p
  WHERE ((p.id = project_private_notes.project_id) AND (p.pm_user_id = auth.uid()))))));

DROP POLICY IF EXISTS "pr_delete" ON public.project_revisions;

CREATE POLICY pr_delete ON public.project_revisions FOR DELETE TO authenticated USING ((public.can_access_service_project(auth.uid(), project_id) AND (public.is_writer(auth.uid()) OR public.is_project_manager(auth.uid()))));

DROP POLICY IF EXISTS "pr_insert" ON public.project_revisions;

CREATE POLICY pr_insert ON public.project_revisions FOR INSERT TO authenticated WITH CHECK ((public.can_access_service_project(auth.uid(), project_id) AND ((requested_by = auth.uid()) OR public.is_writer(auth.uid()) OR public.is_project_manager(auth.uid()))));

DROP POLICY IF EXISTS "pr_read" ON public.project_revisions;

CREATE POLICY pr_read ON public.project_revisions FOR SELECT TO authenticated USING (public.can_access_service_project(auth.uid(), project_id));

DROP POLICY IF EXISTS "pr_update" ON public.project_revisions;

CREATE POLICY pr_update ON public.project_revisions FOR UPDATE TO authenticated USING ((public.can_access_service_project(auth.uid(), project_id) AND (public.is_writer(auth.uid()) OR public.is_project_manager(auth.uid())))) WITH CHECK ((public.can_access_service_project(auth.uid(), project_id) AND (public.is_writer(auth.uid()) OR public.is_project_manager(auth.uid()))));

DROP POLICY IF EXISTS "prep read assigned invoices" ON public.sales_invoices;

CREATE POLICY "prep read assigned invoices" ON public.sales_invoices FOR SELECT TO authenticated USING ((prep_assignee_id = ( SELECT auth.uid() AS uid)));

DROP POLICY IF EXISTS "prep update assigned invoices" ON public.sales_invoices;

CREATE POLICY "prep update assigned invoices" ON public.sales_invoices FOR UPDATE TO authenticated USING (((prep_assignee_id = ( SELECT auth.uid() AS uid)) AND public.has_role(( SELECT auth.uid() AS uid), 'order_prep'::public.app_role) AND public.has_brand_access(( SELECT auth.uid() AS uid), brand_id))) WITH CHECK (((prep_assignee_id = ( SELECT auth.uid() AS uid)) AND public.has_role(( SELECT auth.uid() AS uid), 'order_prep'::public.app_role) AND public.has_brand_access(( SELECT auth.uid() AS uid), brand_id)));

DROP POLICY IF EXISTS "prod_tasks_assignee_read" ON public.production_tasks;

CREATE POLICY prod_tasks_assignee_read ON public.production_tasks FOR SELECT TO authenticated USING ((assignee_id = auth.uid()));

DROP POLICY IF EXISTS "prod_tasks_assignee_update" ON public.production_tasks;

CREATE POLICY prod_tasks_assignee_update ON public.production_tasks FOR UPDATE TO authenticated USING ((assignee_id = auth.uid())) WITH CHECK ((assignee_id = auth.uid()));

DROP POLICY IF EXISTS "prod_tasks_manage_all" ON public.production_tasks;

CREATE POLICY prod_tasks_manage_all ON public.production_tasks TO authenticated USING ((( SELECT public.has_role(auth.uid(), 'admin'::public.app_role) AS has_role) OR ( SELECT public.has_role(auth.uid(), 'manager'::public.app_role) AS has_role) OR ( SELECT public.has_role(auth.uid(), 'production_manager'::public.app_role) AS has_role))) WITH CHECK ((( SELECT public.has_role(auth.uid(), 'admin'::public.app_role) AS has_role) OR ( SELECT public.has_role(auth.uid(), 'manager'::public.app_role) AS has_role) OR ( SELECT public.has_role(auth.uid(), 'production_manager'::public.app_role) AS has_role)));

ALTER TABLE public.product_materials ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.production_tasks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.project_comments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.project_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.project_private_notes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.project_revisions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pt_read" ON public.project_tasks;

CREATE POLICY pt_read ON public.project_tasks FOR SELECT TO authenticated USING (public.can_access_service_project(auth.uid(), project_id));

DROP POLICY IF EXISTS "pt_write" ON public.project_tasks;

CREATE POLICY pt_write ON public.project_tasks TO authenticated USING ((public.can_access_service_project(auth.uid(), project_id) AND (public.is_writer(auth.uid()) OR public.is_project_manager(auth.uid())))) WITH CHECK ((public.can_access_service_project(auth.uid(), project_id) AND (public.is_writer(auth.uid()) OR public.is_project_manager(auth.uid()))));

ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read brands" ON public.brands;

CREATE POLICY "read brands" ON public.brands FOR SELECT TO authenticated USING (public.has_brand_access(auth.uid(), id));

DROP POLICY IF EXISTS "read couriers" ON public.couriers;

CREATE POLICY "read couriers" ON public.couriers FOR SELECT TO authenticated USING ((public.can_read_page(auth.uid(), '/couriers'::text) AND (serves_all_brands OR ((brand_id IS NOT NULL) AND public.has_brand_access(auth.uid(), brand_id)) OR (EXISTS ( SELECT 1
   FROM public.courier_brands cb
  WHERE ((cb.courier_id = couriers.id) AND public.has_brand_access(auth.uid(), cb.brand_id)))))));

DROP POLICY IF EXISTS "read expense_categories" ON public.expense_categories;

CREATE POLICY "read expense_categories" ON public.expense_categories FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'data_entry'::public.app_role)));

DROP POLICY IF EXISTS "read expense_entries" ON public.expense_entries;

CREATE POLICY "read expense_entries" ON public.expense_entries FOR SELECT TO authenticated USING ((( SELECT public.is_global_reader(( SELECT auth.uid() AS uid)) AS is_global_reader) OR (brand_id IN ( SELECT uba.brand_id
   FROM public.user_brand_access uba
  WHERE (uba.user_id = ( SELECT auth.uid() AS uid))))));

DROP POLICY IF EXISTS "read fulfillment" ON public.fulfillment_entries;

CREATE POLICY "read fulfillment" ON public.fulfillment_entries FOR SELECT TO authenticated USING (((( SELECT public.has_role(( SELECT auth.uid() AS uid), 'admin'::public.app_role) AS has_role) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'manager'::public.app_role) AS has_role) OR ( SELECT public.has_section_access(( SELECT auth.uid() AS uid), 'couriers'::text) AS has_section_access) OR ( SELECT public.has_section_access(( SELECT auth.uid() AS uid), 'reports_production'::text) AS has_section_access)) AND (( SELECT public.is_global_reader(( SELECT auth.uid() AS uid)) AS is_global_reader) OR (brand_id IN ( SELECT uba.brand_id
   FROM public.user_brand_access uba
  WHERE (uba.user_id = ( SELECT auth.uid() AS uid)))))));

DROP POLICY IF EXISTS "read inventory_movements" ON public.inventory_movements;

CREATE POLICY "read inventory_movements" ON public.inventory_movements FOR SELECT TO authenticated USING ((( SELECT public.is_global_reader(( SELECT auth.uid() AS uid)) AS is_global_reader) OR (EXISTS ( SELECT 1
   FROM public.products p
  WHERE ((p.id = inventory_movements.product_id) AND (p.brand_id IN ( SELECT uba.brand_id
           FROM public.user_brand_access uba
          WHERE (uba.user_id = ( SELECT auth.uid() AS uid)))))))));

DROP POLICY IF EXISTS "read materials" ON public.materials;

CREATE POLICY "read materials" ON public.materials FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'data_entry'::public.app_role)));

DROP POLICY IF EXISTS "read monthly_entries" ON public.monthly_entries;

CREATE POLICY "read monthly_entries" ON public.monthly_entries FOR SELECT TO authenticated USING ((( SELECT public.is_global_reader(( SELECT auth.uid() AS uid)) AS is_global_reader) OR (brand_id IN ( SELECT uba.brand_id
   FROM public.user_brand_access uba
  WHERE (uba.user_id = ( SELECT auth.uid() AS uid))))));

DROP POLICY IF EXISTS "read product_materials" ON public.product_materials;

CREATE POLICY "read product_materials" ON public.product_materials FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.products p
  WHERE ((p.id = product_materials.product_id) AND public.has_brand_access(auth.uid(), p.brand_id)))));

DROP POLICY IF EXISTS "read products" ON public.products;

CREATE POLICY "read products" ON public.products FOR SELECT TO authenticated USING ((( SELECT public.is_global_reader(( SELECT auth.uid() AS uid)) AS is_global_reader) OR (brand_id IN ( SELECT uba.brand_id
   FROM public.user_brand_access uba
  WHERE (uba.user_id = ( SELECT auth.uid() AS uid))))));

DROP POLICY IF EXISTS "read purchase_order_items" ON public.purchase_order_items;

CREATE POLICY "read purchase_order_items" ON public.purchase_order_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.purchase_orders po
  WHERE ((po.id = purchase_order_items.purchase_order_id) AND public.has_brand_access(auth.uid(), po.brand_id)))));

DROP POLICY IF EXISTS "read purchase_orders" ON public.purchase_orders;

CREATE POLICY "read purchase_orders" ON public.purchase_orders FOR SELECT TO authenticated USING (public.has_brand_access(auth.uid(), brand_id));

DROP POLICY IF EXISTS "read sales" ON public.sales_invoices;

CREATE POLICY "read sales" ON public.sales_invoices FOR SELECT TO authenticated USING ((( SELECT public.is_global_reader(( SELECT auth.uid() AS uid)) AS is_global_reader) OR (brand_id IN ( SELECT uba.brand_id
   FROM public.user_brand_access uba
  WHERE (uba.user_id = ( SELECT auth.uid() AS uid))))));

DROP POLICY IF EXISTS "read sales_invoice_items" ON public.sales_invoice_items;

CREATE POLICY "read sales_invoice_items" ON public.sales_invoice_items FOR SELECT TO authenticated USING ((( SELECT public.is_global_reader(( SELECT auth.uid() AS uid)) AS is_global_reader) OR (EXISTS ( SELECT 1
   FROM public.sales_invoices si
  WHERE ((si.id = sales_invoice_items.invoice_id) AND (si.brand_id IN ( SELECT uba.brand_id
           FROM public.user_brand_access uba
          WHERE (uba.user_id = ( SELECT auth.uid() AS uid)))))))));

DROP POLICY IF EXISTS "read supplier_brands" ON public.supplier_brands;

CREATE POLICY "read supplier_brands" ON public.supplier_brands FOR SELECT TO authenticated USING (public.has_brand_access(auth.uid(), brand_id));

DROP POLICY IF EXISTS "read suppliers" ON public.suppliers;

CREATE POLICY "read suppliers" ON public.suppliers FOR SELECT TO authenticated USING ((public.has_brand_access(auth.uid(), brand_id) OR (EXISTS ( SELECT 1
   FROM public.supplier_brands sb
  WHERE ((sb.supplier_id = suppliers.id) AND public.has_brand_access(auth.uid(), sb.brand_id))))));

DROP POLICY IF EXISTS "requests_hr_read_all" ON public.employee_requests;

CREATE POLICY requests_hr_read_all ON public.employee_requests FOR SELECT TO authenticated USING ((( SELECT public.has_role(auth.uid(), 'admin'::public.app_role) AS has_role) OR ( SELECT public.has_role(auth.uid(), 'manager'::public.app_role) AS has_role) OR ( SELECT public.has_role(auth.uid(), 'hr'::public.app_role) AS has_role)));

DROP POLICY IF EXISTS "requests_hr_update_all" ON public.employee_requests;

CREATE POLICY requests_hr_update_all ON public.employee_requests FOR UPDATE TO authenticated USING ((( SELECT public.has_role(auth.uid(), 'admin'::public.app_role) AS has_role) OR ( SELECT public.has_role(auth.uid(), 'manager'::public.app_role) AS has_role) OR ( SELECT public.has_role(auth.uid(), 'hr'::public.app_role) AS has_role))) WITH CHECK ((( SELECT public.has_role(auth.uid(), 'admin'::public.app_role) AS has_role) OR ( SELECT public.has_role(auth.uid(), 'manager'::public.app_role) AS has_role) OR ( SELECT public.has_role(auth.uid(), 'hr'::public.app_role) AS has_role)));

DROP POLICY IF EXISTS "requests_owner_delete_pending" ON public.employee_requests;

CREATE POLICY requests_owner_delete_pending ON public.employee_requests FOR DELETE TO authenticated USING (((user_id = auth.uid()) AND (status = 'pending'::public.employee_request_status)));

DROP POLICY IF EXISTS "requests_owner_insert" ON public.employee_requests;

CREATE POLICY requests_owner_insert ON public.employee_requests FOR INSERT TO authenticated WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::public.employee_request_status) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL) AND (employee_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = employee_requests.employee_id) AND (e.user_id = ( SELECT auth.uid() AS uid)))))));

DROP POLICY IF EXISTS "requests_owner_no_update" ON public.employee_requests;

CREATE POLICY requests_owner_no_update ON public.employee_requests AS RESTRICTIVE FOR UPDATE TO authenticated USING ((( SELECT public.has_role(auth.uid(), 'admin'::public.app_role) AS has_role) OR ( SELECT public.has_role(auth.uid(), 'manager'::public.app_role) AS has_role) OR ( SELECT public.has_role(auth.uid(), 'hr'::public.app_role) AS has_role))) WITH CHECK ((( SELECT public.has_role(auth.uid(), 'admin'::public.app_role) AS has_role) OR ( SELECT public.has_role(auth.uid(), 'manager'::public.app_role) AS has_role) OR ( SELECT public.has_role(auth.uid(), 'hr'::public.app_role) AS has_role)));

DROP POLICY IF EXISTS "requests_owner_read" ON public.employee_requests;

CREATE POLICY requests_owner_read ON public.employee_requests FOR SELECT TO authenticated USING ((user_id = auth.uid()));

DROP POLICY IF EXISTS "sales delete privileged" ON public.sales_invoices;

CREATE POLICY "sales delete privileged" ON public.sales_invoices FOR DELETE TO authenticated USING ((public.has_brand_access(( SELECT auth.uid() AS uid), brand_id) AND public.is_writer(( SELECT auth.uid() AS uid))));

DROP POLICY IF EXISTS "sales insert privileged" ON public.sales_invoices;

CREATE POLICY "sales insert privileged" ON public.sales_invoices FOR INSERT TO authenticated WITH CHECK ((public.has_brand_access(( SELECT auth.uid() AS uid), brand_id) AND public.is_writer(( SELECT auth.uid() AS uid))));

DROP POLICY IF EXISTS "sales update privileged" ON public.sales_invoices;

CREATE POLICY "sales update privileged" ON public.sales_invoices FOR UPDATE TO authenticated USING ((public.has_brand_access(( SELECT auth.uid() AS uid), brand_id) AND public.is_writer(( SELECT auth.uid() AS uid)))) WITH CHECK ((public.has_brand_access(( SELECT auth.uid() AS uid), brand_id) AND public.is_writer(( SELECT auth.uid() AS uid))));

ALTER TABLE public.sales_invoice_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sales_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_man insert offline invoice items" ON public.sales_invoice_items;

CREATE POLICY "sales_man insert offline invoice items" ON public.sales_invoice_items FOR INSERT TO authenticated WITH CHECK ((public.has_role(( SELECT auth.uid() AS uid), 'sales_man'::public.app_role) AND (EXISTS ( SELECT 1
   FROM (public.sales_invoices si
     JOIN public.brands b ON ((b.id = si.brand_id)))
  WHERE ((si.id = sales_invoice_items.invoice_id) AND (si.sold_by = ( SELECT auth.uid() AS uid)) AND ((b.type)::text = 'offline_branch'::text))))));

DROP POLICY IF EXISTS "sales_man insert offline invoices" ON public.sales_invoices;

CREATE POLICY "sales_man insert offline invoices" ON public.sales_invoices FOR INSERT TO authenticated WITH CHECK ((public.has_role(( SELECT auth.uid() AS uid), 'sales_man'::public.app_role) AND public.has_brand_access(( SELECT auth.uid() AS uid), brand_id) AND (sold_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.brands b
  WHERE ((b.id = sales_invoices.brand_id) AND ((b.type)::text = 'offline_branch'::text))))));

DROP POLICY IF EXISTS "sales_man read own invoice items" ON public.sales_invoice_items;

CREATE POLICY "sales_man read own invoice items" ON public.sales_invoice_items FOR SELECT TO authenticated USING ((public.has_role(( SELECT auth.uid() AS uid), 'sales_man'::public.app_role) AND (EXISTS ( SELECT 1
   FROM public.sales_invoices si
  WHERE ((si.id = sales_invoice_items.invoice_id) AND (si.sold_by = ( SELECT auth.uid() AS uid)))))));

DROP POLICY IF EXISTS "sales_man read own invoices" ON public.sales_invoices;

CREATE POLICY "sales_man read own invoices" ON public.sales_invoices FOR SELECT TO authenticated USING (((sold_by = ( SELECT auth.uid() AS uid)) AND public.has_role(( SELECT auth.uid() AS uid), 'sales_man'::public.app_role)));

ALTER TABLE public.service_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_clients read by brand access" ON public.service_clients;

CREATE POLICY "service_clients read by brand access" ON public.service_clients FOR SELECT TO authenticated USING (public.has_brand_access(auth.uid(), brand_id));

DROP POLICY IF EXISTS "service_clients write by writers" ON public.service_clients;

CREATE POLICY "service_clients write by writers" ON public.service_clients TO authenticated USING ((public.is_writer(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id))) WITH CHECK ((public.is_writer(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id)));

ALTER TABLE public.service_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_projects read by brand access" ON public.service_projects;

CREATE POLICY "service_projects read by brand access" ON public.service_projects FOR SELECT TO authenticated USING (public.has_brand_access(auth.uid(), brand_id));

DROP POLICY IF EXISTS "service_projects write by writers" ON public.service_projects;

CREATE POLICY "service_projects write by writers" ON public.service_projects TO authenticated USING ((public.is_writer(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id))) WITH CHECK ((public.is_writer(auth.uid()) AND public.has_brand_access(auth.uid(), brand_id)));

DROP POLICY IF EXISTS "shares admin all" ON public.investor_brand_shares;

CREATE POLICY "shares admin all" ON public.investor_brand_shares TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "shares self read" ON public.investor_brand_shares;

CREATE POLICY "shares self read" ON public.investor_brand_shares FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.investors i
  WHERE ((i.id = investor_brand_shares.investor_id) AND (i.user_id = auth.uid())))));

DROP POLICY IF EXISTS "sii_read" ON public.supplier_invoice_items;

CREATE POLICY sii_read ON public.supplier_invoice_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.supplier_invoices si
  WHERE ((si.id = supplier_invoice_items.invoice_id) AND (((si.brand_id IS NOT NULL) AND public.has_brand_access(auth.uid(), si.brand_id)) OR ((si.brand_id IS NULL) AND public.has_role(auth.uid(), 'admin'::public.app_role)))))));

DROP POLICY IF EXISTS "sii_write" ON public.supplier_invoice_items;

CREATE POLICY sii_write ON public.supplier_invoice_items TO authenticated USING ((public.is_writer(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.supplier_invoices si
  WHERE ((si.id = supplier_invoice_items.invoice_id) AND (((si.brand_id IS NOT NULL) AND public.has_brand_access(auth.uid(), si.brand_id)) OR ((si.brand_id IS NULL) AND public.has_role(auth.uid(), 'admin'::public.app_role)))))))) WITH CHECK ((public.is_writer(auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.supplier_invoices si
  WHERE ((si.id = supplier_invoice_items.invoice_id) AND (((si.brand_id IS NOT NULL) AND public.has_brand_access(auth.uid(), si.brand_id)) OR ((si.brand_id IS NULL) AND public.has_role(auth.uid(), 'admin'::public.app_role))))))));

DROP POLICY IF EXISTS "sp_read" ON public.supplier_payments;

CREATE POLICY sp_read ON public.supplier_payments FOR SELECT TO authenticated USING ((((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.supplier_invoices si
  WHERE ((si.id = supplier_payments.invoice_id) AND (((si.brand_id IS NOT NULL) AND public.has_brand_access(auth.uid(), si.brand_id)) OR ((si.brand_id IS NULL) AND public.has_role(auth.uid(), 'admin'::public.app_role))))))) OR ((invoice_id IS NULL) AND (supplier_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.suppliers s
  WHERE ((s.id = supplier_payments.supplier_id) AND (((s.brand_id IS NOT NULL) AND public.has_brand_access(auth.uid(), s.brand_id)) OR ((s.brand_id IS NULL) AND public.has_role(auth.uid(), 'admin'::public.app_role))))))) OR public.has_role(auth.uid(), 'admin'::public.app_role)));

DROP POLICY IF EXISTS "sp_write" ON public.supplier_payments;

CREATE POLICY sp_write ON public.supplier_payments TO authenticated USING ((public.is_writer(auth.uid()) AND (((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.supplier_invoices si
  WHERE ((si.id = supplier_payments.invoice_id) AND (((si.brand_id IS NOT NULL) AND public.has_brand_access(auth.uid(), si.brand_id)) OR ((si.brand_id IS NULL) AND public.has_role(auth.uid(), 'admin'::public.app_role))))))) OR ((invoice_id IS NULL) AND (supplier_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.suppliers s
  WHERE ((s.id = supplier_payments.supplier_id) AND (((s.brand_id IS NOT NULL) AND public.has_brand_access(auth.uid(), s.brand_id)) OR ((s.brand_id IS NULL) AND public.has_role(auth.uid(), 'admin'::public.app_role))))))) OR public.has_role(auth.uid(), 'admin'::public.app_role)))) WITH CHECK ((public.is_writer(auth.uid()) AND (((invoice_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.supplier_invoices si
  WHERE ((si.id = supplier_payments.invoice_id) AND (((si.brand_id IS NOT NULL) AND public.has_brand_access(auth.uid(), si.brand_id)) OR ((si.brand_id IS NULL) AND public.has_role(auth.uid(), 'admin'::public.app_role))))))) OR ((invoice_id IS NULL) AND (supplier_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.suppliers s
  WHERE ((s.id = supplier_payments.supplier_id) AND (((s.brand_id IS NOT NULL) AND public.has_brand_access(auth.uid(), s.brand_id)) OR ((s.brand_id IS NULL) AND public.has_role(auth.uid(), 'admin'::public.app_role))))))) OR public.has_role(auth.uid(), 'admin'::public.app_role))));

ALTER TABLE public.supplier_brands ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.supplier_invoice_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supplier_invoices_read" ON public.supplier_invoices;

CREATE POLICY supplier_invoices_read ON public.supplier_invoices FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR ((brand_id IS NOT NULL) AND public.has_brand_access(auth.uid(), brand_id)) OR ((brand_id IS NULL) AND public.has_role(auth.uid(), 'admin'::public.app_role))));

DROP POLICY IF EXISTS "supplier_invoices_write" ON public.supplier_invoices;

CREATE POLICY supplier_invoices_write ON public.supplier_invoices TO authenticated USING ((public.is_writer(auth.uid()) AND (((brand_id IS NOT NULL) AND public.has_brand_access(auth.uid(), brand_id)) OR ((brand_id IS NULL) AND public.has_role(auth.uid(), 'admin'::public.app_role))))) WITH CHECK ((public.is_writer(auth.uid()) AND (((brand_id IS NOT NULL) AND public.has_brand_access(auth.uid(), brand_id)) OR ((brand_id IS NULL) AND public.has_role(auth.uid(), 'admin'::public.app_role)))));

ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suppliers write privileged" ON public.suppliers;

CREATE POLICY "suppliers write privileged" ON public.suppliers TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR ((public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'data_entry'::public.app_role)) AND (((brand_id IS NOT NULL) AND public.has_brand_access(auth.uid(), brand_id)) OR ((brand_id IS NULL) AND public.has_role(auth.uid(), 'manager'::public.app_role)) OR (EXISTS ( SELECT 1
   FROM public.supplier_brands sb
  WHERE ((sb.supplier_id = suppliers.id) AND public.has_brand_access(auth.uid(), sb.brand_id)))))))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR ((public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'data_entry'::public.app_role)) AND (((brand_id IS NOT NULL) AND public.has_brand_access(auth.uid(), brand_id)) OR ((brand_id IS NULL) AND public.has_role(auth.uid(), 'manager'::public.app_role))))));

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "update fulfillment" ON public.fulfillment_entries;

CREATE POLICY "update fulfillment" ON public.fulfillment_entries FOR UPDATE TO authenticated USING (public.is_writer(( SELECT auth.uid() AS uid))) WITH CHECK (public.is_writer(( SELECT auth.uid() AS uid)));

ALTER TABLE public.user_brand_access ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_section_access ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_sheet_config ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallets_read" ON public.wallets;

CREATE POLICY wallets_read ON public.wallets FOR SELECT TO authenticated USING ((public.has_role(( SELECT auth.uid() AS uid), 'admin'::public.app_role) OR public.has_role(( SELECT auth.uid() AS uid), 'manager'::public.app_role) OR public.has_role(( SELECT auth.uid() AS uid), 'accountant'::public.app_role)));

DROP POLICY IF EXISTS "wallets_write" ON public.wallets;

CREATE POLICY wallets_write ON public.wallets TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'accountant'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role) OR public.has_role(auth.uid(), 'accountant'::public.app_role)));

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_messages_delete" ON public.whatsapp_messages;

CREATE POLICY whatsapp_messages_delete ON public.whatsapp_messages FOR DELETE TO authenticated USING ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), whatsapp_messages.brand_id) AS has_brand_access)));

DROP POLICY IF EXISTS "whatsapp_messages_insert" ON public.whatsapp_messages;

CREATE POLICY whatsapp_messages_insert ON public.whatsapp_messages FOR INSERT TO authenticated WITH CHECK ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), whatsapp_messages.brand_id) AS has_brand_access)));

DROP POLICY IF EXISTS "whatsapp_messages_read" ON public.whatsapp_messages;

CREATE POLICY whatsapp_messages_read ON public.whatsapp_messages FOR SELECT TO authenticated USING ((( SELECT public.can_read_page(auth.uid(), '/orders'::text) AS can_read_page) AND ( SELECT public.has_brand_access(auth.uid(), whatsapp_messages.brand_id) AS has_brand_access)));

DROP POLICY IF EXISTS "whatsapp_messages_update" ON public.whatsapp_messages;

CREATE POLICY whatsapp_messages_update ON public.whatsapp_messages FOR UPDATE TO authenticated USING ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), whatsapp_messages.brand_id) AS has_brand_access))) WITH CHECK ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), whatsapp_messages.brand_id) AS has_brand_access)));

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_templates_delete" ON public.whatsapp_templates;

CREATE POLICY whatsapp_templates_delete ON public.whatsapp_templates FOR DELETE TO authenticated USING ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ((brand_id IS NULL) OR ( SELECT public.has_brand_access(auth.uid(), whatsapp_templates.brand_id) AS has_brand_access))));

DROP POLICY IF EXISTS "whatsapp_templates_insert" ON public.whatsapp_templates;

CREATE POLICY whatsapp_templates_insert ON public.whatsapp_templates FOR INSERT TO authenticated WITH CHECK ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ((brand_id IS NULL) OR ( SELECT public.has_brand_access(auth.uid(), whatsapp_templates.brand_id) AS has_brand_access))));

DROP POLICY IF EXISTS "whatsapp_templates_read" ON public.whatsapp_templates;

CREATE POLICY whatsapp_templates_read ON public.whatsapp_templates FOR SELECT TO authenticated USING ((( SELECT public.can_read_page(auth.uid(), '/orders'::text) AS can_read_page) AND ((brand_id IS NULL) OR ( SELECT public.has_brand_access(auth.uid(), whatsapp_templates.brand_id) AS has_brand_access))));

DROP POLICY IF EXISTS "whatsapp_templates_update" ON public.whatsapp_templates;

CREATE POLICY whatsapp_templates_update ON public.whatsapp_templates FOR UPDATE TO authenticated USING ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ((brand_id IS NULL) OR ( SELECT public.has_brand_access(auth.uid(), whatsapp_templates.brand_id) AS has_brand_access)))) WITH CHECK ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ((brand_id IS NULL) OR ( SELECT public.has_brand_access(auth.uid(), whatsapp_templates.brand_id) AS has_brand_access))));

ALTER TABLE public.whatsapp_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_threads_delete" ON public.whatsapp_threads;

CREATE POLICY whatsapp_threads_delete ON public.whatsapp_threads FOR DELETE TO authenticated USING ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), whatsapp_threads.brand_id) AS has_brand_access)));

DROP POLICY IF EXISTS "whatsapp_threads_insert" ON public.whatsapp_threads;

CREATE POLICY whatsapp_threads_insert ON public.whatsapp_threads FOR INSERT TO authenticated WITH CHECK ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), whatsapp_threads.brand_id) AS has_brand_access)));

DROP POLICY IF EXISTS "whatsapp_threads_read" ON public.whatsapp_threads;

CREATE POLICY whatsapp_threads_read ON public.whatsapp_threads FOR SELECT TO authenticated USING ((( SELECT public.can_read_page(auth.uid(), '/orders'::text) AS can_read_page) AND ( SELECT public.has_brand_access(auth.uid(), whatsapp_threads.brand_id) AS has_brand_access)));

DROP POLICY IF EXISTS "whatsapp_threads_update" ON public.whatsapp_threads;

CREATE POLICY whatsapp_threads_update ON public.whatsapp_threads FOR UPDATE TO authenticated USING ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), whatsapp_threads.brand_id) AS has_brand_access))) WITH CHECK ((( SELECT public.can_write_page(auth.uid(), '/orders'::text) AS can_write_page) AND ( SELECT public.has_brand_access(auth.uid(), whatsapp_threads.brand_id) AS has_brand_access)));

DROP POLICY IF EXISTS "write purchase_order_items privileged" ON public.purchase_order_items;

CREATE POLICY "write purchase_order_items privileged" ON public.purchase_order_items TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.purchase_orders po
  WHERE ((po.id = purchase_order_items.purchase_order_id) AND public.has_brand_access(auth.uid(), po.brand_id) AND public.is_writer(auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.purchase_orders po
  WHERE ((po.id = purchase_order_items.purchase_order_id) AND public.has_brand_access(auth.uid(), po.brand_id) AND public.is_writer(auth.uid())))));

DROP POLICY IF EXISTS "write purchase_orders privileged" ON public.purchase_orders;

CREATE POLICY "write purchase_orders privileged" ON public.purchase_orders TO authenticated USING ((public.has_brand_access(auth.uid(), brand_id) AND public.is_writer(auth.uid()))) WITH CHECK ((public.has_brand_access(auth.uid(), brand_id) AND public.is_writer(auth.uid())));

DROP POLICY IF EXISTS "write supplier_brands admin/manager" ON public.supplier_brands;

CREATE POLICY "write supplier_brands admin/manager" ON public.supplier_brands TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'manager'::public.app_role)));

-- ===================== GRANT =====================

REVOKE USAGE ON SCHEMA public FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO anon;

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT USAGE ON SCHEMA public TO service_role;

REVOKE ALL ON FUNCTION public.accounting_profit_report(_from date, _to date, _brand_id uuid, _exclude_brand_ids uuid[]) FROM PUBLIC;

GRANT ALL ON FUNCTION public.accounting_profit_report(_from date, _to date, _brand_id uuid, _exclude_brand_ids uuid[]) TO authenticated;

GRANT ALL ON FUNCTION public.accounting_profit_report(_from date, _to date, _brand_id uuid, _exclude_brand_ids uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.accrue_order_courier_charge() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.apply_bosta_lifecycle(_order_id uuid, _provider_event_at timestamp with time zone, _tracking text, _state text, _collection_state text, _order_status text, _collection_status text, _shipment_outcome text, _fulfillment_status text, _shopify_sync_status text, _shopify_sync_error text, _payload jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.apply_bosta_lifecycle(_order_id uuid, _provider_event_at timestamp with time zone, _tracking text, _state text, _collection_state text, _order_status text, _collection_status text, _shipment_outcome text, _fulfillment_status text, _shopify_sync_status text, _shopify_sync_error text, _payload jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.apply_bosta_lifecycle(_order_id uuid, _provider_event_at timestamp with time zone, _tracking text, _state text, _collection_state text, _order_status text, _collection_status text, _shipment_outcome text, _fulfillment_status text, _shopify_sync_status text, _shopify_sync_error text, _payload jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.apply_cash_metric_delta(_occurred_at timestamp with time zone, _brand_id uuid, _type text, _for_user_id uuid, _courier_id uuid, _transfer_group uuid, _amount numeric, _direction integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.archive_financial_audit_logs(_before timestamp with time zone, _limit integer) FROM PUBLIC;

GRANT ALL ON FUNCTION public.archive_financial_audit_logs(_before timestamp with time zone, _limit integer) TO service_role;

REVOKE ALL ON FUNCTION public.archive_order_source_payload(_order_id uuid, _source text, _payload jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.archive_order_source_payload(_order_id uuid, _source text, _payload jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.archive_order_source_payload(_order_id uuid, _source text, _payload jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.audit_order_lifecycle_change() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.auto_pay_supplier_invoice() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.bh_can_access_brand(_user_id uuid, _brand_id uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.bh_can_access_brand(_user_id uuid, _brand_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.bh_can_access_brand(_user_id uuid, _brand_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.bh_is_manager(_user_id uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.bh_is_manager(_user_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.bh_is_manager(_user_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.can_access_customer(_user_id uuid, _customer_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.can_access_service_project(_user_id uuid, _project_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.can_read_page(_user_id uuid, _route text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.can_read_page(_user_id uuid, _route text) TO authenticated;

GRANT ALL ON FUNCTION public.can_read_page(_user_id uuid, _route text) TO service_role;

REVOKE ALL ON FUNCTION public.can_write_page(_user_id uuid, _route text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.can_write_page(_user_id uuid, _route text) TO authenticated;

GRANT ALL ON FUNCTION public.can_write_page(_user_id uuid, _route text) TO service_role;

REVOKE ALL ON FUNCTION public.cash_flow_grouped(_from date, _to date, _brand_id uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.cash_flow_grouped(_from date, _to date, _brand_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.cash_flow_grouped(_from date, _to date, _brand_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.cash_metrics_trigger() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.cash_summary_report(_from date, _to date, _for_user_id uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.cash_summary_report(_from date, _to date, _for_user_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.cash_summary_report(_from date, _to date, _for_user_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.cash_txn_default_wallet() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.claim_order_dispatch(_order_id uuid, _claim_token uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.claim_order_dispatch(_order_id uuid, _claim_token uuid) TO authenticated;

GRANT ALL ON FUNCTION public.claim_order_dispatch(_order_id uuid, _claim_token uuid) TO service_role;

REVOKE ALL ON FUNCTION public.complete_purchase_order(_po_id uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.complete_purchase_order(_po_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.complete_purchase_order(_po_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.courier_accessible_to_user(_user_id uuid, _courier_id uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.courier_accessible_to_user(_user_id uuid, _courier_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.courier_accessible_to_user(_user_id uuid, _courier_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.courier_invoice_metrics_trigger() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.courier_manageable_by_user(_user_id uuid, _courier_id uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.courier_manageable_by_user(_user_id uuid, _courier_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.courier_manageable_by_user(_user_id uuid, _courier_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.courier_serves_brand(_courier_id uuid, _brand_id uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.courier_serves_brand(_courier_id uuid, _brand_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.courier_serves_brand(_courier_id uuid, _brand_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.customers_filter_summary(_search text, _segment text, _brand_id uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.customers_filter_summary(_search text, _segment text, _brand_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.customers_filter_summary(_search text, _segment text, _brand_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.customers_page(_search text, _segment text, _brand_id uuid, _cursor_at timestamp with time zone, _cursor_id uuid, _limit integer) FROM PUBLIC;

GRANT ALL ON FUNCTION public.customers_page(_search text, _segment text, _brand_id uuid, _cursor_at timestamp with time zone, _cursor_id uuid, _limit integer) TO authenticated;

GRANT ALL ON FUNCTION public.customers_page(_search text, _segment text, _brand_id uuid, _cursor_at timestamp with time zone, _cursor_id uuid, _limit integer) TO service_role;

REVOKE ALL ON FUNCTION public.customers_summary() FROM PUBLIC;

GRANT ALL ON FUNCTION public.customers_summary() TO authenticated;

GRANT ALL ON FUNCTION public.customers_summary() TO service_role;

REVOKE ALL ON FUNCTION public.dashboard_operational_report(_from timestamp with time zone, _to timestamp with time zone, _brand_id uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.dashboard_operational_report(_from timestamp with time zone, _to timestamp with time zone, _brand_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.dashboard_operational_report(_from timestamp with time zone, _to timestamp with time zone, _brand_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.dashboard_supplier_debt_summary(_brand_id uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.dashboard_supplier_debt_summary(_brand_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.dashboard_supplier_debt_summary(_brand_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.delete_purchase_order(_po_id uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.delete_purchase_order(_po_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.delete_purchase_order(_po_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.employees_guard_user_id_change() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.enforce_brand_share_total() FROM PUBLIC;

GRANT ALL ON FUNCTION public.enforce_brand_share_total() TO service_role;

REVOKE ALL ON FUNCTION public.enforce_order_courier_brand() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.finalize_generic_order_dispatch(_order_id uuid, _claim_token uuid, _courier_id uuid, _tracking text, _provider_tracking boolean, _note text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.finalize_generic_order_dispatch(_order_id uuid, _claim_token uuid, _courier_id uuid, _tracking text, _provider_tracking boolean, _note text) TO service_role;

GRANT ALL ON FUNCTION public.finalize_generic_order_dispatch(_order_id uuid, _claim_token uuid, _courier_id uuid, _tracking text, _provider_tracking boolean, _note text) TO authenticated;

REVOKE ALL ON FUNCTION public.finalize_order_dispatch(_order_id uuid, _claim_token uuid, _tracking text, _delivery_id text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.finalize_order_dispatch(_order_id uuid, _claim_token uuid, _tracking text, _delivery_id text) TO authenticated;

GRANT ALL ON FUNCTION public.finalize_order_dispatch(_order_id uuid, _claim_token uuid, _tracking text, _delivery_id text) TO service_role;

REVOKE ALL ON FUNCTION public.has_brand_access(_user_id uuid, _brand_id uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.has_brand_access(_user_id uuid, _brand_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.has_brand_access(_user_id uuid, _brand_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) FROM PUBLIC;

GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO authenticated;

GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO service_role;

REVOKE ALL ON FUNCTION public.has_section_access(_user_id uuid, _section text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.has_section_access(_user_id uuid, _section text) TO authenticated;

GRANT ALL ON FUNCTION public.has_section_access(_user_id uuid, _section text) TO service_role;

REVOKE ALL ON FUNCTION public.im_consume_bom() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.im_update_moving_avg() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.im_validate_target() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.invoke_public_hook(_path text, _body jsonb, _secret_name text, _apikey_secret_name text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.is_global_reader(_user_id uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.is_global_reader(_user_id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.is_investor_of_brand(_user_id uuid, _brand_id uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.is_investor_of_brand(_user_id uuid, _brand_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.is_project_manager(_user_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.is_project_manager(_user_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.is_writer(_user_id uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.is_writer(_user_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.is_writer(_user_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.link_sales_invoice_customer() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.lock_customer_brand_metrics(_customer_id uuid, _brand_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.log_financial_change() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.notify_revision_opened() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.notify_task_assigned() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.offline_branch_deduct_inventory() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.order_items_sync_invoice_items() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.orders_deduct_stock() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.orders_delete_invoice() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.orders_filter_summary(_from timestamp with time zone, _to timestamp with time zone, _brand_id uuid, _order_status text, _search text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.orders_filter_summary(_from timestamp with time zone, _to timestamp with time zone, _brand_id uuid, _order_status text, _search text) TO authenticated;

GRANT ALL ON FUNCTION public.orders_filter_summary(_from timestamp with time zone, _to timestamp with time zone, _brand_id uuid, _order_status text, _search text) TO service_role;

REVOKE ALL ON FUNCTION public.orders_page(_from timestamp with time zone, _to timestamp with time zone, _brand_id uuid, _order_status text, _search text, _cursor_at timestamp with time zone, _cursor_id uuid, _limit integer) FROM PUBLIC;

GRANT ALL ON FUNCTION public.orders_page(_from timestamp with time zone, _to timestamp with time zone, _brand_id uuid, _order_status text, _search text, _cursor_at timestamp with time zone, _cursor_id uuid, _limit integer) TO authenticated;

GRANT ALL ON FUNCTION public.orders_page(_from timestamp with time zone, _to timestamp with time zone, _brand_id uuid, _order_status text, _search text, _cursor_at timestamp with time zone, _cursor_id uuid, _limit integer) TO service_role;

REVOKE ALL ON FUNCTION public.orders_summary(_from timestamp with time zone, _to timestamp with time zone, _brand_id uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.orders_summary(_from timestamp with time zone, _to timestamp with time zone, _brand_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.orders_summary(_from timestamp with time zone, _to timestamp with time zone, _brand_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.orders_sync_invoice() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.page_access_level(_user_id uuid, _route text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.page_access_level(_user_id uuid, _route text) TO service_role;

REVOKE ALL ON FUNCTION public.persist_order_courier_charge() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.prevent_invalid_courier_brand_change() FROM PUBLIC;

GRANT ALL ON FUNCTION public.product_cogs(_product_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.products_cogs_map(_ids uuid[]) TO authenticated;

REVOKE ALL ON FUNCTION public.receivables_aging_report() FROM PUBLIC;

GRANT ALL ON FUNCTION public.receivables_aging_report() TO authenticated;

REVOKE ALL ON FUNCTION public.recompute_supplier_invoice_status(_invoice_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.reconcile_release_order_dispatch_claim(_order_id uuid, _confirmed_absent_on_bosta boolean) FROM PUBLIC;

GRANT ALL ON FUNCTION public.reconcile_release_order_dispatch_claim(_order_id uuid, _confirmed_absent_on_bosta boolean) TO service_role;

GRANT ALL ON FUNCTION public.reconcile_release_order_dispatch_claim(_order_id uuid, _confirmed_absent_on_bosta boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.refresh_courier_charges_for_rate() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.refresh_customer_brand_metrics(_customer_id uuid, _brand_id uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.refresh_customer_metrics_trigger() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.release_order_dispatch_claim(_order_id uuid, _claim_token uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.release_order_dispatch_claim(_order_id uuid, _claim_token uuid) TO authenticated;

GRANT ALL ON FUNCTION public.release_order_dispatch_claim(_order_id uuid, _claim_token uuid) TO service_role;

REVOKE ALL ON FUNCTION public.require_page_read(_route text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.require_page_read(_route text) TO service_role;

GRANT ALL ON FUNCTION public.require_page_read(_route text) TO authenticated;

REVOKE ALL ON FUNCTION public.revenue_comparison_report(_year integer, _brand_id uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.revenue_comparison_report(_year integer, _brand_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.revenue_comparison_report(_year integer, _brand_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.reverse_purchase_order_completion(_po_id uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.reverse_purchase_order_completion(_po_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.reverse_purchase_order_completion(_po_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.sii_stock_in() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.sync_cash_delete_expense() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.sync_cash_to_expense() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.sync_expense_delete_cash() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.sync_expense_to_cash() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.sync_order_cost_total() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.sync_order_item_cost() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.sync_salary_expense() FROM PUBLIC;

GRANT ALL ON FUNCTION public.sync_salary_expense() TO authenticated;

REVOKE ALL ON FUNCTION public.sync_sales_return_cash() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.sync_service_client_to_customer() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.sync_service_project_invoice() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.sync_service_project_invoice_delete() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.sync_supplier_payment() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.sync_supplier_payment_delete() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.try_parse_source_timestamptz(_value text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.update_order_lifecycle_manually(_order_id uuid, _order_status text, _collection_status text, _shipment_outcome text, _fulfillment_status text, _confirmation_status text, _financial_status text, _shopify_sync_status text, _shopify_sync_error text, _raw jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.update_order_lifecycle_manually(_order_id uuid, _order_status text, _collection_status text, _shipment_outcome text, _fulfillment_status text, _confirmation_status text, _financial_status text, _shopify_sync_status text, _shopify_sync_error text, _raw jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.upsert_courier_with_brands(_courier_id uuid, _name text, _type text, _contact text, _active boolean, _opening_balance numeric, _serves_all_brands boolean, _brand_ids uuid[]) FROM PUBLIC;

GRANT ALL ON FUNCTION public.upsert_courier_with_brands(_courier_id uuid, _name text, _type text, _contact text, _active boolean, _opening_balance numeric, _serves_all_brands boolean, _brand_ids uuid[]) TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_order_with_items(_order_id uuid, _order_patch jsonb, _items jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.upsert_order_with_items(_order_id uuid, _order_patch jsonb, _items jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.upsert_order_with_items(_order_id uuid, _order_patch jsonb, _items jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.upsert_shopify_order_with_archive(_order_id uuid, _order_patch jsonb, _items jsonb, _payload jsonb) FROM PUBLIC;

GRANT ALL ON FUNCTION public.upsert_shopify_order_with_archive(_order_id uuid, _order_patch jsonb, _items jsonb, _payload jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.upsert_shopify_order_with_archive(_order_id uuid, _order_patch jsonb, _items jsonb, _payload jsonb) TO service_role;

GRANT SELECT,DELETE ON TABLE public.app_user_connections TO authenticated;

GRANT ALL ON TABLE public.app_user_connections TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.articles TO authenticated;

GRANT ALL ON TABLE public.articles TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.bh_brand_access TO authenticated;

GRANT ALL ON TABLE public.bh_brand_access TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.bh_brands TO authenticated;

GRANT ALL ON TABLE public.bh_brands TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.bh_creative_likes TO authenticated;

GRANT ALL ON TABLE public.bh_creative_likes TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.bh_creative_post_comments TO authenticated;

GRANT ALL ON TABLE public.bh_creative_post_comments TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.bh_creative_posts TO authenticated;

GRANT ALL ON TABLE public.bh_creative_posts TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.bh_creative_reports TO authenticated;

GRANT ALL ON TABLE public.bh_creative_reports TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.bh_resources TO authenticated;

GRANT ALL ON TABLE public.bh_resources TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.bh_task_attachments TO authenticated;

GRANT ALL ON TABLE public.bh_task_attachments TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.bh_task_comments TO authenticated;

GRANT ALL ON TABLE public.bh_task_comments TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.bh_tasks TO authenticated;

GRANT ALL ON TABLE public.bh_tasks TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.bh_wiki_entries TO authenticated;

GRANT ALL ON TABLE public.bh_wiki_entries TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.brand_integrations TO authenticated;

GRANT ALL ON TABLE public.brand_integrations TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.brands TO authenticated;

GRANT ALL ON TABLE public.brands TO service_role;

GRANT SELECT ON TABLE public.cash_daily_metrics TO authenticated;

GRANT ALL ON TABLE public.cash_daily_metrics TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.cash_transactions TO authenticated;

GRANT ALL ON TABLE public.cash_transactions TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.company_assets TO authenticated;

GRANT ALL ON TABLE public.company_assets TO service_role;

GRANT SELECT ON TABLE public.courier_brands TO authenticated;

GRANT ALL ON TABLE public.courier_brands TO service_role;

GRANT SELECT ON TABLE public.courier_charges TO authenticated;

GRANT ALL ON TABLE public.courier_charges TO service_role;

GRANT SELECT ON TABLE public.courier_financial_metrics TO authenticated;

GRANT ALL ON TABLE public.courier_financial_metrics TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.courier_governorate_rates TO authenticated;

GRANT ALL ON TABLE public.courier_governorate_rates TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.courier_settlement_lines TO authenticated;

GRANT ALL ON TABLE public.courier_settlement_lines TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.courier_settlements TO authenticated;

GRANT ALL ON TABLE public.courier_settlements TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.courier_status_mappings TO authenticated;

GRANT ALL ON TABLE public.courier_status_mappings TO service_role;

GRANT SELECT,DELETE ON TABLE public.couriers TO authenticated;

GRANT ALL ON TABLE public.couriers TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.customer_brands TO authenticated;

GRANT ALL ON TABLE public.customer_brands TO service_role;

GRANT SELECT ON TABLE public.customer_metrics TO authenticated;

GRANT ALL ON TABLE public.customer_metrics TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.customer_notes TO authenticated;

GRANT ALL ON TABLE public.customer_notes TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.customers TO authenticated;

GRANT ALL ON TABLE public.customers TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.employee_attendance_entries TO authenticated;

GRANT ALL ON TABLE public.employee_attendance_entries TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.employee_requests TO authenticated;

GRANT ALL ON TABLE public.employee_requests TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.employee_time_logs TO authenticated;

GRANT ALL ON TABLE public.employee_time_logs TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.employees TO authenticated;

GRANT ALL ON TABLE public.employees TO service_role;

GRANT SELECT(id) ON TABLE public.employees TO authenticated;

GRANT SELECT(name) ON TABLE public.employees TO authenticated;

GRANT SELECT(brand_id) ON TABLE public.employees TO authenticated;

GRANT SELECT("position") ON TABLE public.employees TO authenticated;

GRANT SELECT(active) ON TABLE public.employees TO authenticated;

GRANT SELECT(created_at) ON TABLE public.employees TO authenticated;

GRANT SELECT(updated_at) ON TABLE public.employees TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.expense_categories TO authenticated;

GRANT ALL ON TABLE public.expense_categories TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.expense_entries TO authenticated;

GRANT ALL ON TABLE public.expense_entries TO service_role;

GRANT SELECT ON TABLE public.financial_audit_log TO authenticated;

GRANT ALL ON TABLE public.financial_audit_log TO service_role;

GRANT SELECT ON TABLE public.financial_audit_log_archive TO authenticated;

GRANT ALL ON TABLE public.financial_audit_log_archive TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.fulfillment_entries TO authenticated;

GRANT ALL ON TABLE public.fulfillment_entries TO service_role;

GRANT SELECT ON TABLE public.integration_logs TO authenticated;

GRANT ALL ON TABLE public.integration_logs TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.inventory_movements TO authenticated;

GRANT ALL ON TABLE public.inventory_movements TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.investor_brand_shares TO authenticated;

GRANT ALL ON TABLE public.investor_brand_shares TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.investors TO authenticated;

GRANT ALL ON TABLE public.investors TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.material_brands TO authenticated;

GRANT ALL ON TABLE public.material_brands TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.materials TO authenticated;

GRANT ALL ON TABLE public.materials TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.monthly_entries TO authenticated;

GRANT ALL ON TABLE public.monthly_entries TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.notifications TO authenticated;

GRANT ALL ON TABLE public.notifications TO service_role;

GRANT SELECT,INSERT ON TABLE public.order_assignment_log TO authenticated;

GRANT ALL ON TABLE public.order_assignment_log TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.order_collections TO authenticated;

GRANT ALL ON TABLE public.order_collections TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.order_confirmation_attempts TO authenticated;

GRANT ALL ON TABLE public.order_confirmation_attempts TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.order_items TO authenticated;

GRANT ALL ON TABLE public.order_items TO service_role;

GRANT SELECT ON TABLE public.order_lifecycle_events TO authenticated;

GRANT ALL ON TABLE public.order_lifecycle_events TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.order_returns TO authenticated;

GRANT ALL ON TABLE public.order_returns TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.order_shipments TO authenticated;

GRANT ALL ON TABLE public.order_shipments TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.order_sla_rules TO authenticated;

GRANT ALL ON TABLE public.order_sla_rules TO service_role;

GRANT SELECT ON TABLE public.order_source_payloads TO authenticated;

GRANT SELECT,INSERT ON TABLE public.order_source_payloads TO service_role;

GRANT SELECT,USAGE ON SEQUENCE public.order_source_payloads_id_seq TO service_role;

GRANT SELECT,INSERT,DELETE ON TABLE public.orders TO authenticated;

GRANT ALL ON TABLE public.orders TO service_role;

GRANT UPDATE(id) ON TABLE public.orders TO authenticated;

GRANT UPDATE(brand_id) ON TABLE public.orders TO authenticated;

GRANT UPDATE(source) ON TABLE public.orders TO authenticated;

GRANT UPDATE(external_id) ON TABLE public.orders TO authenticated;

GRANT UPDATE(external_order_number) ON TABLE public.orders TO authenticated;

GRANT UPDATE(customer_id) ON TABLE public.orders TO authenticated;

GRANT UPDATE(customer_name) ON TABLE public.orders TO authenticated;

GRANT UPDATE(customer_phone) ON TABLE public.orders TO authenticated;

GRANT UPDATE(customer_email) ON TABLE public.orders TO authenticated;

GRANT UPDATE(shipping_governorate) ON TABLE public.orders TO authenticated;

GRANT UPDATE(shipping_address) ON TABLE public.orders TO authenticated;

GRANT UPDATE(courier_id) ON TABLE public.orders TO authenticated;

GRANT UPDATE(employee_id) ON TABLE public.orders TO authenticated;

GRANT UPDATE(invoice_id) ON TABLE public.orders TO authenticated;

GRANT UPDATE(financial_status) ON TABLE public.orders TO authenticated;

GRANT UPDATE(fulfillment_status) ON TABLE public.orders TO authenticated;

GRANT UPDATE(subtotal_amount) ON TABLE public.orders TO authenticated;

GRANT UPDATE(shipping_amount) ON TABLE public.orders TO authenticated;

GRANT UPDATE(discount_amount) ON TABLE public.orders TO authenticated;

GRANT UPDATE(total_amount) ON TABLE public.orders TO authenticated;

GRANT UPDATE(cost_total) ON TABLE public.orders TO authenticated;

GRANT UPDATE(currency) ON TABLE public.orders TO authenticated;

GRANT UPDATE(occurred_at) ON TABLE public.orders TO authenticated;

GRANT UPDATE(note) ON TABLE public.orders TO authenticated;

GRANT UPDATE(raw) ON TABLE public.orders TO authenticated;

GRANT UPDATE(created_at) ON TABLE public.orders TO authenticated;

GRANT UPDATE(updated_at) ON TABLE public.orders TO authenticated;

GRANT UPDATE(confirmation_status) ON TABLE public.orders TO authenticated;

GRANT UPDATE(building_number) ON TABLE public.orders TO authenticated;

GRANT UPDATE(floor_number) ON TABLE public.orders TO authenticated;

GRANT UPDATE(apartment_number) ON TABLE public.orders TO authenticated;

GRANT UPDATE(order_status) ON TABLE public.orders TO authenticated;

GRANT UPDATE(collection_status) ON TABLE public.orders TO authenticated;

GRANT UPDATE(shipment_outcome) ON TABLE public.orders TO authenticated;

GRANT UPDATE(courier_status_raw) ON TABLE public.orders TO authenticated;

GRANT UPDATE(courier_collection_status_raw) ON TABLE public.orders TO authenticated;

GRANT UPDATE(courier_expense) ON TABLE public.orders TO authenticated;

GRANT UPDATE(shopify_sync_status) ON TABLE public.orders TO authenticated;

GRANT UPDATE(shopify_sync_error) ON TABLE public.orders TO authenticated;

GRANT UPDATE(lifecycle_source) ON TABLE public.orders TO authenticated;

GRANT UPDATE(lifecycle_updated_by) ON TABLE public.orders TO authenticated;

GRANT UPDATE(lifecycle_updated_at) ON TABLE public.orders TO authenticated;

GRANT UPDATE(bosta_tracking) ON TABLE public.orders TO authenticated;

GRANT UPDATE(bosta_delivery_id) ON TABLE public.orders TO authenticated;

GRANT UPDATE(bosta_sent_at) ON TABLE public.orders TO authenticated;

GRANT UPDATE(bosta_manual_attached_at) ON TABLE public.orders TO authenticated;

GRANT UPDATE(bosta_event_at) ON TABLE public.orders TO authenticated;

GRANT UPDATE(dispatch_tracking) ON TABLE public.orders TO authenticated;

GRANT UPDATE(assigned_user_id) ON TABLE public.orders TO authenticated;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_materials TO authenticated;

GRANT ALL ON TABLE public.product_materials TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.production_tasks TO authenticated;

GRANT ALL ON TABLE public.production_tasks TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.products TO authenticated;

GRANT ALL ON TABLE public.products TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.project_comments TO authenticated;

GRANT ALL ON TABLE public.project_comments TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.project_events TO authenticated;

GRANT ALL ON TABLE public.project_events TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.project_files TO authenticated;

GRANT ALL ON TABLE public.project_files TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.project_private_notes TO authenticated;

GRANT ALL ON TABLE public.project_private_notes TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.project_revisions TO authenticated;

GRANT ALL ON TABLE public.project_revisions TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.project_tasks TO authenticated;

GRANT ALL ON TABLE public.project_tasks TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.purchase_order_items TO authenticated;

GRANT ALL ON TABLE public.purchase_order_items TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.purchase_orders TO authenticated;

GRANT ALL ON TABLE public.purchase_orders TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sales_invoice_items TO authenticated;

GRANT ALL ON TABLE public.sales_invoice_items TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sales_invoices TO authenticated;

GRANT ALL ON TABLE public.sales_invoices TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.service_clients TO authenticated;

GRANT ALL ON TABLE public.service_clients TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.service_projects TO authenticated;

GRANT ALL ON TABLE public.service_projects TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.supplier_brands TO authenticated;

GRANT ALL ON TABLE public.supplier_brands TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.supplier_invoice_items TO authenticated;

GRANT ALL ON TABLE public.supplier_invoice_items TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.supplier_invoices TO authenticated;

GRANT ALL ON TABLE public.supplier_invoices TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.supplier_payments TO authenticated;

GRANT ALL ON TABLE public.supplier_payments TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.suppliers TO authenticated;

GRANT ALL ON TABLE public.suppliers TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.tasks TO authenticated;

GRANT ALL ON TABLE public.tasks TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_brand_access TO authenticated;

GRANT ALL ON TABLE public.user_brand_access TO service_role;

GRANT SELECT ON TABLE public.user_roles TO authenticated;

GRANT ALL ON TABLE public.user_roles TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_section_access TO authenticated;

GRANT ALL ON TABLE public.user_section_access TO service_role;

GRANT SELECT ON TABLE public.user_settings TO authenticated;

GRANT ALL ON TABLE public.user_settings TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_sheet_config TO authenticated;

GRANT ALL ON TABLE public.user_sheet_config TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.wallets TO authenticated;

GRANT ALL ON TABLE public.wallets TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.whatsapp_messages TO authenticated;

GRANT ALL ON TABLE public.whatsapp_messages TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.whatsapp_templates TO authenticated;

GRANT ALL ON TABLE public.whatsapp_templates TO service_role;

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.whatsapp_threads TO authenticated;

GRANT ALL ON TABLE public.whatsapp_threads TO service_role;

-- ===================== OTHER =====================

CREATE CONSTRAINT TRIGGER trg_enforce_brand_share_total AFTER INSERT OR UPDATE ON public.investor_brand_shares DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.enforce_brand_share_total();

