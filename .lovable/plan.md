# Create AI Agent Instruction Files

## Goal

Create and update markdown instruction files so any AI agent (Claude, Lovable, Cursor) working on this codebase follows the project's Database-Driven Architecture, migration constraints, seeding architecture, CI/CD boundaries, and TypeScript best practices.

## Proposed Files

1. **`AI_AGENT_INSTRUCTIONS.md`** (new, root-level)
   - The strict source-of-truth document containing all rules from the user's specification.
   - Organized into the four sections:
     1. Core Rule: Migration Constraints (Strictly Schema-Only)
     2. Cron Jobs, Policies, & Functions Seeding Architecture
     3. CI/CD Pipeline Protection
     4. General Guidelines & Best Practices for AI Agents

2. **`CLAUDE.md`** (new, root-level)
   - Short pointer file for Claude/Claude Code that loads `AI_AGENT_INSTRUCTIONS.md` as the active system instruction set.
   - Includes a brief reminder to read the full instructions before modifying migrations, seeders, workflows, or Supabase-related code.

3. **`AGENTS.md`** (update existing)
   - Keep the existing Lovable git-history warning.
   - Add a prominent section directing Lovable agents to read and enforce `AI_AGENT_INSTRUCTIONS.md` before any code change.

## Code Changes In Scope

Source code changes are expected so the rules are actually true of the repo:

- **Migrations become schema-only.** Audit `supabase/migrations/` (the squashed baseline plus later files) and move anything that is not DDL — vault secret writes, `cron.schedule` calls, seed/config `INSERT`s — out of SQL. What stays: tables, columns, indexes, constraints, types, plus the DDL for functions/triggers/RLS the schema needs to exist at all. Everything stays idempotent (`IF NOT EXISTS`, `DROP ... IF EXISTS` before `CREATE POLICY`/`CREATE TRIGGER`), so a brand-new empty Supabase project migrates cleanly in one pass.
- **App-level seeding stays the single provisioning path.** Extend the existing boot seeder (`src/server/coreSecretsSeed.server.ts`, invoked once per container from `src/server.ts`) so vault secrets, cron jobs, and any required seed/config rows are provisioned from `.env` on every deploy — created when absent, updated when different, untouched when identical, and reported per-item without ever logging values.
- **Any behaviour relocated out of a migration must land in the seeder** in the same change, so nothing is lost when a fresh database is provisioned.

## Out of Scope

- No changes to `.github/workflows/` or any CI/CD or deployment configuration.
- No raw SQL run against a production database.


## Verification

- Confirm all three files exist and render correctly in markdown preview.
- Confirm `AGENTS.md` still contains the original Lovable git-history warning.
