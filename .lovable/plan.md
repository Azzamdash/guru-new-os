# Finalize deployment environment variables

## What the code already expects

The rename-only changes from the previous discussion are already in place. The code now reads the new names with fallbacks to the old names, so the app works as soon as the GitHub secrets / server `.env` use the new names.

| New name | Old name | Used by |
|---|---|---|
| `CRON_TOKEN_SHOPIFY_SYNC` | `SHOPIFY_SYNC_HOOK_SECRET` | `apikey` header on `POST /api/public/hooks/shopify-sync` |
| `CRON_TOKEN_BOSTA_RECALL` | `BOSTA_RECALL_SECRET` | `x-webhook-secret` header on `POST /api/public/hooks/bosta-recall` |
| `BOSTA_WEBHOOK_TOKEN` | `BOSTA_WEBHOOK_SECRET` | inbound Bosta webhooks (`/api/public/webhooks/bosta/:brandId`) and shown on `/integrations` |
| `INTEGRATION_ENCRYPTION_KEY` | `APP_USER_CONNECTION_KEY_SECRET` | AES-256-GCM key for `brand_integrations.credentials_ciphertext` and Shopify OAuth `state` |

## Required `.env` on the server

These are the variables the running container actually reads:

```text
GITHUB_REPOSITORY=<owner>/<repo>
VERSION=<release-tag>
DOMAIN=<your-domain>
SUPABASE_SERVICE_ROLE_KEY=<service-role>
SUPABASE_URL=<supabase-url>
SUPABASE_PUBLISHABLE_KEY=<supabase-anon-key>
WHATSAPP_TOKEN=<meta-permanent-token>
WHATSAPP_PHONE_NUMBER_ID=<meta-phone-number-id>
WHATSAPP_VERIFY_TOKEN=<your-invented-verify-token>
WHATSAPP_APP_SECRET=<meta-app-secret>
PUBLIC_SITE_URL=https://<your-domain>
INTEGRATION_ENCRYPTION_KEY=<carry-over-unchanged-from-APP_USER_CONNECTION_KEY_SECRET>
CRON_TOKEN_SHOPIFY_SYNC=<random-cron-password>
CRON_TOKEN_BOSTA_RECALL=<random-cron-password>
BOSTA_WEBHOOK_TOKEN=<random-webhook-password>
```

## Build-time variables (also required)

The Docker build (`docker-compose.yml` / `.github/workflows/build.yml`) injects these at build time for the browser bundle:

```text
VITE_SUPABASE_URL=<same-as-SUPABASE_URL>
VITE_SUPABASE_PUBLISHABLE_KEY=<same-as-SUPABASE_PUBLISHABLE_KEY>
VITE_SUPABASE_PROJECT_ID=<supabase-project-ref>
```

`src/start.ts` falls back `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_PROJECT_ID` from the `VITE_*` variants at runtime, but the build itself needs the `VITE_*` values.

## Issues in the pasted snippet

1. **Missing `WHATSAPP_TOKEN`** — outbound WhatsApp messages will fail with "المفاتيح غير مكتملة".
2. **Missing `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`** — the build step needs them.
3. **Duplicate `INTEGRATION_ENCRYPTION_KEY`** — appears twice in the snippet.
4. **Line breaks are collapsed** — `SUPABASE_PUBLISHABLE_KEY=...  WHATSAPP_PHONE_NUMBER_ID=...` and several other joins must each be on their own line, otherwise the shell here-doc writes a malformed `.env`.
5. **`SERVICE_NAME`** is not needed in `.env` — the workflow already computes it as `steps.repo.outputs.name` and uses it for the `/opt/` path.

## What is NOT in `.env`

- **Shopify `client_id` / `client_secret`** — per-brand credentials entered in the UI, encrypted with `INTEGRATION_ENCRYPTION_KEY`, stored in `public.brand_integrations.credentials_ciphertext`. They do not belong in `.env`.
- **Bosta API key** — also per-brand, stored encrypted in the same table.

## Proposed change

Update `.github/workflows/deploy.yml` so the `cat > .env` block writes the corrected, fully-expanded list above. No code changes are required — the code already reads the new names with fallbacks.
