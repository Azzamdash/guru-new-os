import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";

const DIR = "supabase/migrations";
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

const strip = (sql: string) =>
  sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");

describe("migration history", () => {
  it("starts from the squashed baseline", () => {
    expect(files[0]).toBe("00000000000000_initial_schema.sql");
  });

  it("keeps filenames in ascending timestamp order and unique", () => {
    const stamps = files.map((f) => f.split("_")[0]);
    expect(new Set(stamps).size).toBe(stamps.length);
    expect([...stamps].sort()).toEqual(stamps);
  });

  for (const file of files) {
    it(`${file} only creates objects idempotently`, async () => {
      const sql = strip(await Bun.file(`${DIR}/${file}`).text());

      expect(sql).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/i);
      expect(sql).not.toMatch(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS|CONCURRENTLY IF NOT EXISTS)/i);
      expect(sql).not.toMatch(/CREATE SEQUENCE (?!IF NOT EXISTS)/i);
      expect(sql).not.toMatch(/CREATE EXTENSION (?!IF NOT EXISTS)/i);
      expect(sql).not.toMatch(/CREATE (VIEW|FUNCTION|PROCEDURE) /i);

      // every CREATE POLICY / TRIGGER must be preceded by a matching DROP ... IF EXISTS
      for (const m of sql.matchAll(/CREATE POLICY "?([^"\n]+?)"? ON (\S+)/gi)) {
        expect(sql).toContain(`DROP POLICY IF EXISTS "${m[1]}" ON ${m[2]};`);
      }
      for (const m of sql.matchAll(/CREATE (?:CONSTRAINT )?TRIGGER (\S+)[\s\S]*?\sON\s+(\S+)/gi)) {
        expect(sql).toContain(`DROP TRIGGER IF EXISTS ${m[1]} ON ${m[2]};`);
      }

      // enums must be guarded
      for (const m of sql.matchAll(/CREATE TYPE (\S+)/gi)) {
        const before = sql.slice(0, m.index ?? 0);
        expect(before.lastIndexOf("DO $")).toBeGreaterThan(before.lastIndexOf("END $"));
      }
    });
  }
});
