-- =====================================================================
--  RESET ALL DATA  —  keeps logins, wipes everything else
-- =====================================================================
--
--  IRREVERSIBLE. Read this before running any of it.
--
--  KEEPS
--    auth.users                 your logins live in the auth schema; this
--                               script only touches public, so they survive
--    public.user_roles          who is admin / manager / accountant
--    public.user_section_access which pages each user may open
--    public.user_settings       per-user preferences
--    public.user_sheet_config   per-user table layouts
--
--  WIPES  83 tables — every brand, product, courier, rate, wallet,
--         order, invoice, collection, cash movement, customer, employee,
--         supplier, project, and all audit history.
--
--  user_brand_access is NOT in the keep list: it grants access to brands,
--  and every brand is being deleted, so those grants would point at nothing.
--  Re-grant brand access after you recreate the brands.
--
--  NOTE ON TRIGGERS: TRUNCATE fires only TRUNCATE-level triggers, and every
--  trigger in this schema is FOR EACH ROW. So none of the accrual, audit, or
--  rollup triggers run — which is what a bulk wipe wants. The rollup tables
--  (cash_daily_metrics, courier_financial_metrics, customer_metrics) are
--  truncated here too, so nothing is left holding stale totals.
--
--  All tables are truncated in ONE statement so Postgres resolves the foreign
--  keys between them itself; no manual ordering to get wrong. CASCADE is a
--  safety net for tables added after this was written — today it does nothing,
--  because nothing outside the list references anything inside it.
--
--  =====================================================================
--  STEP 1 — see what you are about to destroy (safe, read-only):
--
--    SELECT relname AS table_name, n_live_tup AS approx_rows
--    FROM pg_stat_user_tables
--    WHERE schemaname = 'public' AND n_live_tup > 0
--    ORDER BY n_live_tup DESC;
--
--  STEP 2 — take a backup. Supabase dashboard → Database → Backups.
--
--  STEP 3 — delete the guard block below, then run the rest.
--  =====================================================================

-- ↓↓↓ DELETE THIS BLOCK TO ARM THE SCRIPT ↓↓↓
DO $guard$
BEGIN
  RAISE EXCEPTION 'Safety guard is still in place. Read the header, take a backup, then delete this DO block and run again.';
END
$guard$;
-- ↑↑↑ DELETE THIS BLOCK TO ARM THE SCRIPT ↑↑↑

BEGIN;

TRUNCATE TABLE
  public.app_user_connections,
  public.articles,
  public.bh_brand_access,
  public.bh_brands,
  public.bh_creative_likes,
  public.bh_creative_post_comments,
  public.bh_creative_posts,
  public.bh_creative_reports,
  public.bh_resources,
  public.bh_task_attachments,
  public.bh_task_comments,
  public.bh_tasks,
  public.bh_wiki_entries,
  public.brand_integrations,
  public.brands,
  public.cash_daily_metrics,
  public.cash_transactions,
  public.company_assets,
  public.courier_brands,
  public.courier_charges,
  public.courier_financial_metrics,
  public.courier_governorate_rates,
  public.courier_settlement_lines,
  public.courier_settlements,
  public.courier_status_mappings,
  public.couriers,
  public.customer_brands,
  public.customer_metrics,
  public.customer_notes,
  public.customers,
  public.employee_attendance_entries,
  public.employee_requests,
  public.employee_time_logs,
  public.employees,
  public.expense_categories,
  public.expense_entries,
  public.financial_audit_log,
  public.financial_audit_log_archive,
  public.fulfillment_entries,
  public.integration_logs,
  public.inventory_movements,
  public.investor_brand_shares,
  public.investors,
  public.material_brands,
  public.materials,
  public.monthly_entries,
  public.notifications,
  public.order_assignment_log,
  public.order_collections,
  public.order_confirmation_attempts,
  public.order_items,
  public.order_lifecycle_events,
  public.order_returns,
  public.order_shipments,
  public.order_sla_rules,
  public.order_source_payloads,
  public.orders,
  public.product_materials,
  public.production_tasks,
  public.products,
  public.project_comments,
  public.project_events,
  public.project_files,
  public.project_private_notes,
  public.project_revisions,
  public.project_tasks,
  public.purchase_order_items,
  public.purchase_orders,
  public.sales_invoice_items,
  public.sales_invoices,
  public.service_clients,
  public.service_projects,
  public.supplier_brands,
  public.supplier_invoice_items,
  public.supplier_invoices,
  public.supplier_payments,
  public.suppliers,
  public.tasks,
  public.user_brand_access,
  public.wallets,
  public.whatsapp_messages,
  public.whatsapp_templates,
  public.whatsapp_threads
  RESTART IDENTITY CASCADE;

COMMIT;

-- After this completes:
--   1. Log in (your account still works).
--   2. Recreate brands, then re-grant brand access to each user.
--   3. Recreate couriers and their governorate rates before taking orders —
--      an order delivered with no rate accrues a zero fee, silently.
--   4. Create at least one wallet before recording any cash; new cash
--      movements are auto-assigned to the default wallet.
