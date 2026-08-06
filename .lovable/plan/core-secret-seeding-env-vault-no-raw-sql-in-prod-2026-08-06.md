# Core secret seeding: `.env` -> Vault, no raw SQL in prod

## Goal

A fresh Supabase project plus a Docker image with a filled `.env` should be fully working with no manual SQL. The only values Postgres genuinely needs (so `pg_cron` can call our own `/api/public/*` hooks) are pushed into Vault by the application itself, at boot, from `.env` — created when absent, updated when the value differs, untouched when identical.

## Verified current state

- The squashed baseline `supabase/migrations/00000000000000_initial_schema.sql` contains `public.invoke_public_hook(...)` and **no** `vault.create_secret` / `vault.update_secret` calls. Hardcoded secret values exist only in `supabase/migrations_archive/` (historical, not replayed).
- `invoke_public_hook` reads `app_public_base_url` always, plus `app_public_api_key` or the name passed as `_apikey_secret_name`, plus the optional `_secret_name` for the `x-webhook-secret` header.
- The restricted psql role cannot read `vault.secrets` / `cron.job`, so the seeder must report what it did rather than us inspecting Vault by hand.

## The core secret set (all `.env` driven)

| Vault name | Source `.env` variable | Purpose |
|---|---|---|
| `core_public_base_url` | `PUBLIC_SITE_URL` | base URL used by `net.http_post` |
| `core_cron_token_shopify_sync` | `CRON_TOKEN_SHOPIFY_SYNC` | `apikey` header on `/api/public/hooks/shopify-sync` |
| `core_cron_token_bosta_recall` | `CRON_TOKEN_BOSTA_RECALL` | `x-webhook-secret` header on `/api/public/hooks/bosta-recall` |

`core_` prefix keeps these disjoint from anything an admin configures on `/integrations`; per-brand Shopify/Bosta vendor credentials stay encrypted in `public.brand_integrations` and are never written to Vault.

## Feature design

**1. Migration — mechanism only, zero values.**

- `public.sync_core_vault_secret(_name text, _value text) RETURNS text` — `SECURITY DEFINER`, `search_path = public, vault`. Rejects any `_name` not starting with `core_`. Looks up `vault.secrets` by name: inserts via `vault.create_secret` when missing (returns `'created'`), compares against `vault.decrypted_secrets` and calls `vault.update_secret` only when different (`'updated'`), otherwise `'unchanged'`.
- `public.core_vault_secret_status() RETURNS TABLE(name text, present boolean)` — presence only, never values, for the admin readout.
- `REVOKE ALL ... FROM PUBLIC, anon, authenticated;` then `GRANT EXECUTE ... TO service_role;` Only the service-role client can call it.
- Also re-point the two cron jobs to the `core_*` names, guarded so it is a no-op when the jobs do not exist yet (fresh project).

**2. Seeder module — `src/server/coreSecretsSeed.server.ts`.**

Single exported `syncCoreSecretsToVault()`: builds the name/value list from `process.env` (read inside the function), skips entries whose env var is unset and records them as `missing`, and for the rest calls `supabaseAdmin.rpc('sync_core_vault_secret', ...)`. Returns a per-name result array of `created | updated | unchanged | missing | error`. Values are never logged — only names and outcomes.

**3. Automatic run at boot.**

Called once from the server entry (`src/server.ts`), lazily on the first request and memoised in a module-level promise so it runs once per container. Wrapped in try/catch: a Vault failure logs a warning and never blocks serving. This is what makes "new Supabase project + new `.env` + `docker compose up`" sufficient.

**4. Manual re-run + visibility.**

- `POST /api/public/hooks/sync-core-secrets` — guarded by the same `CRON_TOKEN_SHOPIFY_SYNC`-style token check pattern already used by the other hooks (its own `CRON_TOKEN_SECRETS_SYNC`), returning the outcome list. Lets you force a re-sync after editing `.env` without a redeploy.
- On `/integrations`, an admin-only card listing the three core names with a present/absent badge, backed by a `requireSupabaseAuth` server function that checks the admin role then calls `core_vault_secret_status()`. Never displays values.

## Notes

- Idempotent by construction: re-running after a redeploy yields `unchanged` for everything already correct.
- No application `.env` variable names change; only the Vault-side names become `core_*`, resolved by the seeder.
- `app_public_api_key` is dropped from the flow — both hooks pass their own dedicated token, so the publishable-key fallback in `invoke_public_hook` is removed.
