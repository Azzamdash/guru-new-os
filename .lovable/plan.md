# Secrets audit and cleanup

## What the code actually uses

Configured today: `APP_USER_CONNECTION_KEY_SECRET`, `BOSTA_RECALL_SECRET`, `SHOPIFY_SYNC_HOOK_SECRET`, `LOVABLE_API_KEY` (managed).

| Secret | Used in | Verdict |
|---|---|---|
| `SHOPIFY_SYNC_HOOK_SECRET` | `api/public/hooks/shopify-sync` — `apikey` header check on the scheduled sync job | Works, but **badly named**. It is not a Shopify credential; it's the cron caller token for our own endpoint. |
| `BOSTA_RECALL_SECRET` | `api/public/hooks/bosta-recall` — `x-webhook-secret` on the scheduled recall job | Works. Cron caller token. |
| `BOSTA_WEBHOOK_SECRET` | `api/public/webhooks/bosta/$brandId` and `integrations.functions.ts` (shown in the UI setup card) | **Not configured → inbound Bosta webhooks always return 401.** This is a *different* secret from `BOSTA_RECALL_SECRET`, not a duplicate/typo. |
| `APP_USER_CONNECTION_KEY_SECRET` | `connectionKeyCrypto.ts`, used by `integrations.functions.ts` and `shopifyOAuthCallback.server.ts` | Works, but **misnamed**: it no longer encrypts connector connection keys — it is the AES key for all encrypted integration credentials (Shopify/Bosta tokens) and the Shopify OAuth `state`. |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp settings page, order-ops and order-management send paths | **Missing → all WhatsApp sending is dead** (returns "المفاتيح غير مكتملة"). |
| `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | `api/public/whatsapp` GET handshake + POST HMAC check | **Missing → Meta verification fails (403) and inbound messages return 503.** |
| `PUBLIC_SITE_URL` | WhatsApp settings, to display the webhook URL | Missing; falls back to `https://egurus.info`. Harmless. |

Shopify's real credentials (`client_id` / `client_secret`) are **not** env vars by design: they are entered per brand in the Integrations page, encrypted, and stored in the integrations table; the OAuth callback and webhook HMAC read them from there. That part is correct — the confusion is only the `SHOPIFY_*` name on the cron token.

Duplicates: none of the four configured secrets duplicate each other. The real duplication is at the database layer — the cron jobs read copies of the same values from Vault (`shopify_sync_hook_secret`, `bosta_recall_secret`, `app_public_api_key`), so each token exists in two places and must be rotated in both.

## Proposed changes

1. **Rename the cron caller tokens** to say what they are:
   - `SHOPIFY_SYNC_HOOK_SECRET` -> `CRON_HOOK_TOKEN_SHOPIFY_SYNC`
   - `BOSTA_RECALL_SECRET` -> `CRON_HOOK_TOKEN_BOSTA_RECALL`
   Both handlers accept the new name and fall back to the old one for one release, so nothing breaks while the Vault copies are updated in the same migration.

2. **Rename the encryption key** `APP_USER_CONNECTION_KEY_SECRET` -> `INTEGRATION_ENCRYPTION_KEY`, same dual-read fallback. The *value* must stay identical — rotating it would make every stored Shopify/Bosta credential undecryptable.

3. **Add the missing secrets** so the dead features come alive:
   - `BOSTA_WEBHOOK_SECRET` (rename to `BOSTA_WEBHOOK_TOKEN` while we're here) — the value you paste into Bosta's webhook config.
   - `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` from the Meta app.
   - `PUBLIC_SITE_URL` set to the live domain instead of the hardcoded fallback.

4. **Add a secrets health panel** (admin-only) listing every secret the app reads, which feature depends on it, and whether it is configured — so a missing key shows up as a red row instead of a silent 401/503.

5. **Document it** in `README.md`: one table, env var -> feature -> where the value comes from -> whether a Vault copy must match.

## Technical notes

- Handler pattern for the transition: `process.env["NEW_NAME"] ?? process.env["OLD_NAME"]`, then delete the old secret once the rename is confirmed working.
- The Vault-backed cron rename needs one migration updating `vault.secrets` entries and the `invoke_public_hook` call sites; the existing `invoke_public_hook(text, jsonb, text, text)` signature already supports per-hook secret names, so only the names change.
- No change to Shopify OAuth storage: per-brand `client_id`/`client_secret` stay encrypted in the database.

## Open question

Item 3 needs the actual values from you (Meta app + Bosta dashboard). I can do 1, 2, 4, 5 immediately and request the new secrets when you're ready.
