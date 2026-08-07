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

## Out of Scope

- No source code changes.
- No migration, seeder, workflow, or deployment modifications.
- No changes to `.github/workflows/`.

## Verification

- Confirm all three files exist and render correctly in markdown preview.
- Confirm `AGENTS.md` still contains the original Lovable git-history warning.
