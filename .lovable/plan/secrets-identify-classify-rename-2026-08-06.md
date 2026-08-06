# Secrets: identify, classify, rename

## Answering the two questions first

**"Shown in the UI setup card"** — on `/integrations`, the Bosta card calls `getBostaWebhookInfo`, which reads `BOSTA_WEBHOOK_SECRET` from the environment and renders the full webhook URL with `?secret=...` appended for the admin to copy into the Bosta dashboard. So it is *not* a per-brand value stored in the database; it is one instance-level secret we generate, kept in `.env`, and merely displayed for copying. It is a completely different value from `BOSTA_RECALL_SECRET` and the two must stay separate.

**"Cron caller token"** — `/api/public/hooks/shopify-sync` and `/api/public/hooks/bosta-recall` are *our own* endpoints, and `/api/public/*` bypasses site auth so anyone on the internet can POST to them. They exist so a scheduler can periodically trigger a full Shopify catalog/order sync and a Bosta shipment-status recall. The secret is just a password on our own endpoint proving the caller is our scheduler, nothing to do with Shopify or Bosta as vendors. Shopify's real credentials are the per-brand `client_id`/`client_secret` the admin enters on the Integrations page, encrypted into `brand_integrations.credentials_ciphertext` — correctly *not* in `.env`. Only the misleading `SHOPIFY_` prefix on the cron token is wrong.

Noted on the Vault migration: agreed, dropping it. The scheduler will send the header value directly, so the token lives only in `.env` and in whatever schedules the call.

## Classification

### A. Ours — random values we generate, put in `.env`

| New name | Old name in code | Purpose |
|---|---|---|
| `CRON_TOKEN_SHOPIFY_SYNC` | `SHOPIFY_SYNC_HOOK_SECRET` | `apikey` header on `POST /api/public/hooks/shopify-sync` |
| `CRON_TOKEN_BOSTA_RECALL` | `BOSTA_RECALL_SECRET` | `x-webhook-secret` header on `POST /api/public/hooks/bosta-recall` |
| `BOSTA_WEBHOOK_TOKEN` | `BOSTA_WEBHOOK_SECRET` | `?secret=` / `x-webhook-secret` on inbound Bosta webhooks; shown in the Integrations card to paste into Bosta |
| `INTEGRATION_ENCRYPTION_KEY` | `APP_USER_CONNECTION_KEY_SECRET` | AES-256-GCM key for `brand_integrations.credentials_ciphertext` and the Shopify OAuth `state`. **Value must be carried over unchanged** — a new value makes every stored integration credential undecryptable. |

`BOSTA_WEBHOOK_TOKEN` is a shared secret in the sense that you paste it into Bosta, but you invent the value; Bosta does not issue it.

### B. From third parties — you collect these

| Name | Source | Used by |
|---|---|---|
| `WHATSAPP_TOKEN` | Meta app -> WhatsApp -> permanent system-user access token | all outbound WhatsApp sending |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta app -> WhatsApp -> API setup | all outbound WhatsApp sending |
| `WHATSAPP_VERIFY_TOKEN` | you invent it, then paste the same value into Meta's webhook config | `GET /api/public/whatsapp` verification handshake |
| `WHATSAPP_APP_SECRET` | Meta app -> Settings -> Basic -> App secret | `X-Hub-Signature-256` HMAC on inbound WhatsApp messages |

All four are currently unset, which is why WhatsApp send returns "المفاتيح غير مكتملة" and the inbound webhook returns 503.

Not secrets, but same file: `PUBLIC_SITE_URL` — plain config, the live origin used to display the WhatsApp webhook URL (currently falls back to a hardcoded `https://egurus.info`).

### C. Already correct, no action

`LOVABLE_API_KEY` (managed), `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` (platform-injected), and the per-brand Shopify/Bosta credentials in the database.

### Duplicates

None. Every configured secret has exactly one distinct role. The only near-collision is `BOSTA_RECALL_SECRET` vs `BOSTA_WEBHOOK_SECRET`, which the rename to `CRON_TOKEN_BOSTA_RECALL` vs `BOSTA_WEBHOOK_TOKEN` makes unambiguous.

## Code changes (rename only)

Swap the `process.env` key names in these files, nothing else:

- `src/routes/api/public/hooks/shopify-sync.ts` — `CRON_TOKEN_SHOPIFY_SYNC`
- `src/routes/api/public/hooks/bosta-recall.ts` — `CRON_TOKEN_BOSTA_RECALL`
- `src/routes/api/public/webhooks/bosta.$brandId.ts` and `src/lib/integrations.functions.ts` — `BOSTA_WEBHOOK_TOKEN`
- `src/server/connectionKeyCrypto.ts` — `INTEGRATION_ENCRYPTION_KEY`

Each reads the new name with a fallback to the old one (`process.env["NEW"] ?? process.env["OLD"]`) so the app keeps working until you finish editing `.env`; the fallbacks can be dropped in a later pass. WhatsApp names stay as they are — they are already correctly named, just unset.

No database migration, no Vault entries, no new UI.
