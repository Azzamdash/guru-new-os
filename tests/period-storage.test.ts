import { describe, expect, it } from "vitest";
import {
  defaultPeriod,
  initialPeriod,
  periodStorageKey,
  readStoredPeriod,
  resolvePeriod,
  writeStoredPeriod,
  type PeriodValue,
} from "../src/lib/period-storage";
import { getTodayInBusinessTimezone } from "../src/lib/timezone";

const basePeriod = (preset: PeriodValue["preset"]): PeriodValue => ({
  preset, year: 2026, dateFrom: "", dateTo: "", compare: false,
});

/** In-memory stand-in for window.localStorage (survives across simulated reloads). */
function fakeStore(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
  };
}

const monthChoice: PeriodValue = {
  preset: "this_month",
  year: 2026,
  dateFrom: "2026-08-01",
  dateTo: "2026-08-31",
  compare: true,
};

describe("period default", () => {
  it("defaults to today", () => {
    const d = defaultPeriod();
    const iso = getTodayInBusinessTimezone();
    expect(d.preset).toBe("today");
    expect(d.dateFrom).toBe(iso);
    expect(d.dateTo).toBe(iso);
  });

  it("a first-time page open starts from today", () => {
    expect(initialPeriod(fakeStore(), "dashboard").preset).toBe("today");
  });

  it("each page key is independent: choosing on one page does not change another", () => {
    const store = fakeStore();
    writeStoredPeriod(store, "orders", monthChoice);
    expect(initialPeriod(store, "orders").preset).toBe("this_month");
    expect(initialPeriod(store, "reports.sales").preset).toBe("today");
  });

  it("falls back to today when nothing is persisted or storage is unavailable", () => {
    expect(initialPeriod(null, "orders").preset).toBe("today");
    expect(readStoredPeriod(fakeStore(), "orders")).toBeNull();
  });
});

describe("period persistence across refresh", () => {
  it("restores the user's choice after a reload", () => {
    const store = fakeStore();
    writeStoredPeriod(store, "orders", monthChoice);

    // Simulated reload: fresh read from the same storage.
    const afterReload = initialPeriod(store, "orders");
    expect(afterReload).toEqual(monthChoice);
  });

  it("keeps a custom date range intact after a reload", () => {
    const store = fakeStore();
    const custom: PeriodValue = {
      preset: "custom", year: 2026, dateFrom: "2026-01-05", dateTo: "2026-03-09", compare: false,
    };
    writeStoredPeriod(store, "reports.profits", custom);
    expect(initialPeriod(store, "reports.profits")).toEqual(custom);
  });

  it("stores under a namespaced key", () => {
    const store = fakeStore();
    writeStoredPeriod(store, "orders", monthChoice);
    expect(store.data.has(periodStorageKey("orders"))).toBe(true);
  });

  it("overwrites the previous choice", () => {
    const store = fakeStore();
    writeStoredPeriod(store, "orders", monthChoice);
    writeStoredPeriod(store, "orders", { ...monthChoice, preset: "this_year" });
    expect(initialPeriod(store, "orders").preset).toBe("this_year");
  });

  it("ignores corrupted or unknown values and returns today", () => {
    expect(readStoredPeriod(fakeStore({ [periodStorageKey("orders")]: "{not json" }), "orders")).toBeNull();
    expect(readStoredPeriod(fakeStore({ [periodStorageKey("orders")]: '{"preset":"bogus"}' }), "orders")).toBeNull();
    expect(readStoredPeriod(fakeStore({ [periodStorageKey("orders")]: "null" }), "orders")).toBeNull();
    expect(initialPeriod(fakeStore({ [periodStorageKey("orders")]: "{not json" }), "orders").preset).toBe("today");
  });

  it("fills missing fields from the today default", () => {
    const store = fakeStore({ [periodStorageKey("orders")]: '{"preset":"this_week"}' });
    const restored = readStoredPeriod(store, "orders");
    expect(restored?.preset).toBe("this_week");
    expect(restored?.dateFrom).toBe(getTodayInBusinessTimezone());
  });

  it("never throws when storage rejects writes", () => {
    const throwing = {
      getItem: () => null,
      setItem: () => { throw new Error("QuotaExceeded"); },
    };
    expect(() => writeStoredPeriod(throwing, "orders", monthChoice)).not.toThrow();
  });
});

// Regression coverage for the resolvePeriod rewrite: every preset used to
// mix browser-local Date getters/setters with a UTC-only toISOString() read,
// which silently shifted "yesterday"/"this week"/"this month"/"last 12
// months" by up to a day depending on the browser's own timezone offset —
// the same class of bug fixed for the server-side query bounds, just at the
// client. resolvePeriod's optional `today` override makes this deterministic
// regardless of the machine running the test.
describe("resolvePeriod (business-timezone-anchored, independent of local/browser tz)", () => {
  it("today: dateFrom and dateTo are both the given business date", () => {
    const r = resolvePeriod(basePeriod("today"), "2026-08-08");
    expect(r).toMatchObject({ periodType: "custom", dateFrom: "2026-08-08", dateTo: "2026-08-08", year: 2026 });
  });

  it("yesterday: exactly one calendar day before, including a month rollover", () => {
    expect(resolvePeriod(basePeriod("yesterday"), "2026-08-08").dateFrom).toBe("2026-08-07");
    expect(resolvePeriod(basePeriod("yesterday"), "2026-08-01").dateFrom).toBe("2026-07-31");
    expect(resolvePeriod(basePeriod("yesterday"), "2026-01-01")).toMatchObject({
      dateFrom: "2025-12-31", dateTo: "2025-12-31", year: 2025,
    });
  });

  it("this_week: starts on Monday regardless of which weekday 'today' is", () => {
    expect(resolvePeriod(basePeriod("this_week"), "2026-08-08").dateFrom).toBe("2026-08-03"); // Saturday -> Monday
    expect(resolvePeriod(basePeriod("this_week"), "2026-08-03").dateFrom).toBe("2026-08-03"); // Monday -> itself
    expect(resolvePeriod(basePeriod("this_week"), "2026-08-02").dateFrom).toBe("2026-07-27"); // Sunday -> prior Monday
    expect(resolvePeriod(basePeriod("this_week"), "2026-08-08").dateTo).toBe("2026-08-08");
  });

  it("this_month: starts on the 1st of the given date's month", () => {
    expect(resolvePeriod(basePeriod("this_month"), "2026-08-08")).toMatchObject({
      dateFrom: "2026-08-01", dateTo: "2026-08-08",
    });
  });

  it("last_12: exactly 12 calendar months before, including a year rollover", () => {
    expect(resolvePeriod(basePeriod("last_12"), "2026-08-08").dateFrom).toBe("2025-08-08");
    expect(resolvePeriod(basePeriod("last_12"), "2026-01-01").dateFrom).toBe("2025-01-01");
  });

  it("this_year: no date bounds, year falls back to the given date's year", () => {
    const v = basePeriod("this_year");
    v.year = 0 as unknown as number; // falsy -> falls back to today's year
    expect(resolvePeriod(v, "2026-08-08")).toMatchObject({
      periodType: null, dateFrom: null, dateTo: null, year: 2026,
    });
  });

  it("custom: passes dateFrom/dateTo through untouched", () => {
    const v = { ...basePeriod("custom"), dateFrom: "2026-03-01", dateTo: "2026-03-15" };
    expect(resolvePeriod(v, "2026-08-08")).toMatchObject({ dateFrom: "2026-03-01", dateTo: "2026-03-15" });
  });

  it("compare: the previous period is the same length, immediately before", () => {
    const v: PeriodValue = { ...basePeriod("custom"), dateFrom: "2026-08-01", dateTo: "2026-08-08", compare: true };
    const r = resolvePeriod(v, "2026-08-08");
    expect(r.previous).toEqual({ dateFrom: "2026-07-24", dateTo: "2026-07-31", year: 2026 });
  });

  it("compare with a null-bound period (this_year) shifts only the year back by one", () => {
    const v = { ...basePeriod("this_year"), compare: true };
    const r = resolvePeriod(v, "2026-08-08");
    expect(r.previous).toEqual({ dateFrom: null, dateTo: null, year: 2025 });
  });

  it("defaults to the real business date when no override is given", () => {
    expect(resolvePeriod(basePeriod("today")).dateFrom).toBe(getTodayInBusinessTimezone());
  });
});
