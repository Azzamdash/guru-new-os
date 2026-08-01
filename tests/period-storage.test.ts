import { describe, expect, it } from "vitest";
import {
  defaultPeriod,
  initialPeriod,
  periodStorageKey,
  readStoredPeriod,
  writeStoredPeriod,
  type PeriodValue,
} from "../src/lib/period-storage";

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
    const iso = new Date().toISOString().slice(0, 10);
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
    expect(restored?.dateFrom).toBe(new Date().toISOString().slice(0, 10));
  });

  it("never throws when storage rejects writes", () => {
    const throwing = {
      getItem: () => null,
      setItem: () => { throw new Error("QuotaExceeded"); },
    };
    expect(() => writeStoredPeriod(throwing, "orders", monthChoice)).not.toThrow();
  });
});
