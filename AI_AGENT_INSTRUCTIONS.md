# AI Agent Instructions: Database-Driven Architecture & Migration Guidelines

This document is the **strict source of truth** for any AI agent (Claude, Lovable, Cursor)
modifying this codebase. The project is a **TypeScript stack (frontend & server)** coupled with
**Supabase**, following a **database-driven architecture**, packaged and deployed through
**Docker**.

The guiding invariant: **a brand-new, empty Supabase project + a filled `.env` + a deploy must
produce a fully working system, with no human ever running SQL.**

---

## 1. Core Rule: Migration Constraints (Strictly Schema-Only)

Everything under `supabase/migrations/` must describe **structure**, never **state**.

- **Schema and structure only.** Migrations may contain DDL: `CREATE TABLE`, `ALTER TABLE`,
  `CREATE INDEX`, constraints, foreign keys, enums/types, plus the DDL that defines functions,
  triggers, RLS enablement and policies. Data-manipulation statements written *inside* a function
  body are part of that function's definition and are fine; a bare top-level `INSERT`/`UPDATE`/
  `DELETE` is not.
- **No hardcoded values or data seeding in migrations.** Never insert static application data,
  configuration rows, secrets, tokens, URLs, or mock content into a migration file. Never call
  `vault.create_secret` / `vault.update_secret`, `cron.schedule` / `cron.alter_job` /
  `cron.unschedule`, or otherwise mutate runtime state from a migration.
- **Idempotency and collision prevention.** Before writing a migration, audit the existing
  migration files (starting with the squashed baseline
  `supabase/migrations/00000000000000_initial_schema.sql`) to confirm what already exists. Then
  write defensively so a replay against a populated database never fails:
  - `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`,
    `CREATE INDEX IF NOT EXISTS`, `CREATE SEQUENCE IF NOT EXISTS`, `CREATE EXTENSION IF NOT EXISTS`
  - `CREATE OR REPLACE FUNCTION` / `VIEW`
  - `DROP POLICY IF EXISTS ...;` before every `CREATE POLICY`
  - `DROP TRIGGER IF EXISTS ...;` before every `CREATE TRIGGER`
  - enums and constraints wrapped in
    `DO $mig$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;`
- **Every new `public` table** gets `GRANT`s, `ENABLE ROW LEVEL SECURITY`, and its policies in the
  same migration.
- **New files** go in `supabase/migrations/` with a timestamp *after* the baseline, use a proper timestamp function to generate the actual current timestamp when creating migration names.
  `supabase/migrations_archive/` is history only and is never replayed — do not add to it.
- **Zero raw SQL execution.** Manual or ad-hoc SQL against a production database is forbidden. All
  state manipulation outside pure schema happens through the application layer.

`tests/migration-idempotency.test.ts` and `tests/migration-safety-contracts.test.ts` enforce parts
of this automatically. Run `bun test` after touching migrations.

---

## 2. Cron Jobs, Secrets, Policies & Functions Seeding Architecture

Because a Docker container may boot against **any** Supabase project, runtime provisioning belongs
to the app, not to SQL.

- **Application-level seeding is the only provisioning path.** Vault secrets, `pg_cron` schedules,
  and any required configuration rows are provisioned by the TypeScript seeder, not by loose
  scripts or deployment hooks.
  - Seeder module: `src/server/coreSecretsSeed.server.ts`
  - Boot entry: `src/server.ts` calls `ensureCoreSecretsSynced()` once per container, lazily on the
    first request, memoised in a module-level promise.
- **Migrations provide the mechanism, the seeder supplies the values.** The DDL defines
  `SECURITY DEFINER`, `service_role`-only functions such as `public.sync_core_vault_secret`,
  `public.sync_core_cron_jobs`, `public.core_vault_secret_status`, and
  `public.core_cron_job_status`. The seeder calls them with values read from `process.env`.
- **Reconciling semantics.** Every seeded item resolves to `created`, `updated`, `unchanged`,
  `missing`, or `error`. Re-running after a redeploy must be a no-op for anything already correct.
- **Never log values.** Only names and outcomes are logged, ever.
- **Non-blocking.** A seeding failure logs a warning and must never prevent the app from serving.
- **Naming.** Instance-level vault secrets and cron job names use the `core_` prefix; the database
  functions reject anything else. Per-brand vendor credentials (Shopify, Bosta, …) stay encrypted
  in `public.brand_integrations` and are never written to Vault.
- **Manual re-run.** `POST /api/public/hooks/sync-core-secrets` (token-guarded) forces a re-sync
  and returns the secret and cron outcomes. The `/integrations` admin page shows presence-only
  status.
- **Adding a new secret or job** means adding an entry to `CORE_SECRET_MAP` or `CORE_CRON_JOBS` in
  the seeder — never a new SQL statement.
- **If work is relocated out of a migration, it must land in the seeder in the same change**, so a
  fresh database loses nothing.

---

## 3. CI/CD Pipeline Protection

- **Hands off.** Do not touch, modify, or refactor anything in `.github/workflows/`, the
  `Dockerfile`, `docker-compose.yml`, `Caddyfile`, or `deploy/`.
- Pipeline behaviour, automated builds, and deployment definitions are out of bounds for agentic
  modification. If a change genuinely requires a pipeline update, stop and say so instead of
  editing.

---

## 4. General Guidelines & Best Practices

1. **TypeScript first.** Strict typing across server and frontend. Do not use `any` for Supabase
   responses or row shapes — use the generated `Database` types from
   `src/integrations/supabase/types.ts`. That file is generated: never hand-edit it, nor
   `src/integrations/supabase/client.ts`, `client.server.ts`, `auth-middleware.ts`, or
   `auth-attacher.ts`.
2. **Environment-agnostic code.** Never hardcode Supabase project URLs, refs, API keys, or
   project-specific endpoints. Server code reads `process.env.*` **inside** handlers; browser code
   reads `import.meta.env.VITE_*`.
3. **Correct client for the job.** Browser: the generated `supabase` client (RLS applies).
   Authenticated server functions: `.middleware([requireSupabaseAuth])` and `context.supabase`.
   Privileged work only: `supabaseAdmin`, imported lazily inside the handler after verifying the
   caller. Never use the admin client for ordinary reads or to decide whether a caller is an admin.
4. **Server boundaries.** App-internal logic uses `createServerFn` from `@tanstack/react-start`.
   External callers (webhooks, cron, public APIs) use file routes under
   `src/routes/api/public/*`, which bypass site auth — always verify the caller inside the handler
   with a constant-time token or signature comparison.
5. **Component safety.** Keep Lovable-generated frontend components modular, styled with Tailwind
   using semantic design tokens (no hardcoded colour utilities), and synchronise state with the
   backend through clean hooks or service layers rather than ad-hoc effects.
6. **Error handling & logging.** Never swallow a database or network error. On the server, log the
   full Postgres error surface (`code`, `message`, `details`, `hint`) plus the identifying context,
   with secrets and credentials redacted. On the frontend, show a user-friendly fallback state.
