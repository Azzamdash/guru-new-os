import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";

const DIR = "supabase/migrations";
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

/**
 * Migrations already applied before AI_AGENT_INSTRUCTIONS.md existed. Migration files are
 * immutable once applied, so their legacy content is grandfathered — new files are not.
 */
const LEGACY = new Set(["20260806203146_01300d5e-900b-4e12-a506-ab64bfd27090.sql"]);

/** Remove function bodies: DML inside a function definition is part of its DDL. */
function schemaLevelOnly(sql: string): string {
  return sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .replace(/CREATE (?:OR REPLACE )?FUNCTION[\s\S]*?\n\$\$;/g, "");
}

const FORBIDDEN: Array<{ label: string; pattern: RegExp }> = [
  { label: "cron scheduling", pattern: /cron\.(schedule|alter_job|unschedule)/i },
  { label: "vault secret writes", pattern: /vault\.(create_secret|update_secret)/i },
  { label: "top-level data seeding", pattern: /^\s*(INSERT INTO|UPDATE |DELETE FROM)/im },
];

describe("migrations are schema-only (AI_AGENT_INSTRUCTIONS.md §1)", () => {
  for (const file of files) {
    if (LEGACY.has(file)) continue;

    it(`${file} contains no runtime state manipulation`, async () => {
      const sql = schemaLevelOnly(await Bun.file(`${DIR}/${file}`).text());
      for (const { label, pattern } of FORBIDDEN) {
        expect({ file, label, matched: pattern.test(sql) }).toEqual({
          file,
          label,
          matched: false,
        });
      }
    });
  }
});

describe("runtime provisioning lives in the app seeder (AI_AGENT_INSTRUCTIONS.md §2)", () => {
  it("boots the seeder from the server entry", async () => {
    const server = await Bun.file("src/server.ts").text();
    expect(server).toContain("ensureCoreSecretsSynced");
  });

  it("seeds secrets and cron jobs through service-role-only RPCs", async () => {
    const seeder = await Bun.file("src/server/coreSecretsSeed.server.ts").text();
    expect(seeder).toContain("sync_core_vault_secret");
    expect(seeder).toContain("sync_core_cron_jobs");
    expect(seeder).toContain("CORE_SECRET_MAP");
    expect(seeder).toContain("CORE_CRON_JOBS");
    // values come from the environment, never from a literal in code
    expect(seeder).toContain("process.env[");
  });
});
