# Vault secrets contract for scheduled jobs

## Current state (verified)

- The squashed baseline `supabase/migrations/00000000000000_initial_schema.sql` contains `public.invoke_public_hook(...)` and **no** `vault.create_secret` calls. The hardcoded `vault.update_secret` blocks only exist in `supabase/migrations_archive/` (historical, not replayed).
- `invoke_public_hook` reads three things from `vault.decrypted_secrets`:
  - `app_public_base_url` (always)
  - `app_public_api_key` (default apikey header) or the name passed in `_apikey_secret_name`
  - the name passed in `_secret_name` (optional `x-webhook-secret` header)
- The restricted psql role cannot read `vault.secrets` or `cron.job`, so the currently stored values could not be inspected from here.

Why the DB needs these at all: pg_cron runs inside Postgres and has no access to the container's `.env`. The only values that belong in Vault are the *outbound caller* credentials the scheduler must present to our own `/api/public/*` endpoints — they mirror the `.env` values, they are not a second source of truth for anything else.

## Naming contract: core vs. customer

Core (instance) secrets get a `core_` prefix so they can never collide with anything an admin configures on `/integrations`. Per-brand vendor credentials (Shopify `client_id`/`client_secret`, Bosta API key) stay encrypted in `public.brand_integrations.credentials_ciphertext` and never enter Vault.

| Vault secret name | Value = which `.env` variable | Used as |
|---|---|---|
| `core_public_base_url` | `PUBLIC_SITE_URL` | base URL for `net.http_post` |
| `core_cron_token_shopify_sync` | `CRON_TOKEN_SHOPIFY_SYNC` | `apikey` header on `/api/public/hooks/shopify-sync` |
| `core_cron_token_bosta_recall` | `CRON_TOKEN_BOSTA_RECALL` | `x-webhook-secret` header on `/api/public/hooks/bosta-recall` |

`app_public_api_key` (the Supabase publishable key) is no longer needed as a default: both hooks pass a dedicated token, so the fallback becomes unnecessary and is removed rather than kept as a vague catch-all.

## Changes

1. **Migration — function only, no values.** Replace `invoke_public_hook` so it reads `core_public_base_url` and requires an explicit `_apikey_secret_name` or `_secret_name`; raise a clear error naming the missing Vault entry. Add `public.core_secret_names()` returning the required-name list so the contract is discoverable from SQL. No `vault.create_secret` calls with literal values in any migration.
2. **Migration — cron jobs re-pointed** to the new names:
   - shopify sync: `invoke_public_hook('/api/public/hooks/shopify-sync','{}'::jsonb, NULL, 'core_cron_token_shopify_sync')`
   - bosta recall: `invoke_public_hook('/api/public/hooks/bosta-recall','{}'::jsonb, 'core_cron_token_bosta_recall', NULL)`
3. **Docs** — add `deploy/VAULT_SECRETS.md` with the table above and the exact three `vault.create_secret` statements for you to paste into the SQL editor with your own values (values live only in your `.env` and in your paste, never in the repo).
4. **Rotate note** — the two values previously hardcoded in `migrations_archive` are public in git history; treat them as compromised and set fresh values for `CRON_TOKEN_SHOPIFY_SYNC` and `CRON_TOKEN_BOSTA_RECALL` in both `.env` and Vault.

## Technical details

- `invoke_public_hook` stays `SECURITY DEFINER` with `search_path = public, extensions, vault` and `REVOKE ALL ... FROM PUBLIC, anon, authenticated`; only the cron/postgres owner calls it.
- The old 4-arg signature is kept (same argument order) so existing job commands do not break during the switch; only the resolved secret names change.
- No application code changes — `.env` names stay exactly as they are today.
