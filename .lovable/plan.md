# Integration log writes + boot-time cron seeding

## What was verified

- `integration_logs` has exactly one policy: an admin/manager **read** policy. There is **no insert policy**, and the `authenticated` role only holds a read grant on the table. `service_role` holds full grants.
- The logger is called two ways: with the service client (Bosta recall, Bosta/Shopify webhooks) and with the **signed-in user's client** (`context.supabase`) from `integrations.functions.ts` and `couriers.functions.ts` — ~20 call sites. Those user-context inserts are the ones that can produce the reported error; they have neither grant nor policy. This is the leading cause; the brand FK is not involved (a bad FK reports a foreign-key violation, not an RLS violation).
- The failure is swallowed: `logIntegrationEvent` prints only `error.message`, so the code, details, and hint Postgres returns are lost.
- The scheduled jobs do not exist in the squashed baseline migration — nothing schedules them, matching what you observed.

## Plan

### 1. Make log writes actually land

Route every log write through the service client instead of the caller's session: `logIntegrationEvent` loads the admin client itself and no longer takes a client argument, so a user-triggered sync logs with the same identity as a cron-triggered one. The ~20 user-context call sites drop their first argument. No new insert policy is added — logs stay readable only by admin/manager, and no browser session can forge entries.

### 2. Make the failure legible when it happens again

Expand the error branch to print the full Postgres error surface — `code`, `message`, `details`, `hint` — plus the row context that matters (provider, operation, brand id, order id, whether the write used the service client). Still no values from secrets, headers, or credentials: request/response bodies keep going through the existing redactor. For outbound calls, the log row already stores the request; the console mirror gains the target URL and HTTP status so a failing call is identifiable without opening the table.

### 3. Seed cron jobs at boot, from the app

Extend the existing core-secret seeder into a general boot seeder:

- A new `SECURITY DEFINER`, service-role-only function `public.sync_core_cron_jobs(_jobs jsonb)` that, per entry, unschedules any existing job of that name and re-creates it with the given schedule and command. It only accepts job names on a fixed `core_`-prefixed allowlist and only commands built from `invoke_public_hook`, so it cannot be used to schedule arbitrary SQL.
- The seeder module gains a job table (name, schedule, hook path, which core secret supplies the token) covering the Shopify sync and Bosta recall hooks, and calls the function after the secrets sync — order matters, since the jobs read the secrets it just wrote.
- Both run inside the same once-per-container boot promise from `src/server.ts`, still non-blocking and still never logging values. Jobs whose backing secret is missing are skipped and reported as `missing` rather than scheduled with a broken token.
- `POST /api/public/hooks/sync-core-secrets` returns the cron outcomes alongside the secret outcomes, and the `/integrations` admin card lists each job with its schedule and last-seed outcome.

Because scheduling lives in the seeder, a fresh database plus a filled `.env` plus a deploy is enough — no migration carries a job definition.

## Technical notes

- The restricted database role used for inspection cannot read `cron.job` or `vault.secrets`, so status is reported by the seeder's own return values rather than read back.
- Schedules: Shopify sync and Bosta recall keep whatever cadence they were previously documented with; both are defined in one place in the seeder and are changeable without SQL.
