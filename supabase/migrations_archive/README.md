# Archived migrations

These 193 files are the historical migration log up to 2026-08-05. They are **not**
executed anymore: the whole schema they produced was squashed into
`supabase/migrations/00000000000000_initial_schema.sql`, which is now the single
baseline for a clean start.

They are kept only as a change-history reference (and a few contract tests read them).

## Rules for new migrations

1. New files go in `supabase/migrations/` with a timestamp **after** the baseline.
2. Always review the baseline + every later migration before writing SQL, so an
   object is never created twice.
3. Every statement must be idempotent, so a replay against an existing database
   never fails with `42P07` / `42710` / duplicate key errors:
   - `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`,
     `CREATE SEQUENCE IF NOT EXISTS`, `CREATE EXTENSION IF NOT EXISTS`
   - `CREATE OR REPLACE FUNCTION` / `VIEW`
   - `DROP POLICY IF EXISTS ...;` before `CREATE POLICY`
   - `DROP TRIGGER IF EXISTS ...;` before `CREATE TRIGGER`
   - enums and constraints wrapped in
     `DO $mig$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $mig$;`
   - seed data with `ON CONFLICT DO NOTHING` (never a bare `INSERT`)
4. Every new `public` table needs `GRANT`s, `ENABLE ROW LEVEL SECURITY`, and policies
   in the same migration.
