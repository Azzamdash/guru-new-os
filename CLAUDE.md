# Claude instructions

**Read [`AI_AGENT_INSTRUCTIONS.md`](./AI_AGENT_INSTRUCTIONS.md) before making any change.** It is
the strict source of truth for this repository and overrides general defaults.

Quick reminders — the full rules and rationale live in that file:

- Migrations under `supabase/migrations/` are **schema-only and idempotent**. No seed data, no
  secrets, no `cron.schedule`, no `vault.create_secret`. Audit existing migrations before adding
  one.
- Vault secrets, cron jobs, and configuration rows are provisioned by the **TypeScript boot
  seeder** (`src/server/coreSecretsSeed.server.ts`, invoked from `src/server.ts`) so any empty
  Supabase project works from `.env` alone.
- Never run raw SQL against a production database.
- Do not touch `.github/workflows/`, the `Dockerfile`, `docker-compose.yml`, `Caddyfile`, or
  `deploy/`.
- Strict TypeScript, generated Supabase `Database` types, no `any`, no hardcoded project URLs or
  keys, no silently swallowed errors.

Run `bun test` after touching migrations or the seeder.
