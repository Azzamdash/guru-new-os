<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Read this before any change

[`AI_AGENT_INSTRUCTIONS.md`](./AI_AGENT_INSTRUCTIONS.md) is the strict source of truth for this
repository and overrides general defaults. Every agent — Lovable, Claude, Cursor — must follow it.

Non-negotiables:

- **Migrations are schema-only and idempotent.** No seed data, no secrets, no `cron.schedule`, no
  `vault.create_secret` in `supabase/migrations/`. Audit existing migrations before writing a new
  one, and guard every statement (`IF NOT EXISTS`, `DROP ... IF EXISTS` before
  `CREATE POLICY`/`CREATE TRIGGER`).
- **Runtime provisioning happens in the app.** Vault secrets, `pg_cron` jobs, and configuration
  rows are seeded at boot by `src/server/coreSecretsSeed.server.ts` (called from `src/server.ts`),
  so a brand-new empty Supabase project plus a filled `.env` plus a deploy is enough.
- **Never run raw SQL against a production database.**
- **Do not modify** `.github/workflows/`, `Dockerfile`, `docker-compose.yml`, `Caddyfile`, or
  `deploy/`.
- Strict TypeScript with generated Supabase `Database` types, no `any`, no hardcoded project URLs
  or keys, and no silently swallowed errors.
