/**
 * Pure, DOM-free helpers for the period filter state.
 * Kept free of React/UI imports so it can be unit tested in a node environment.
 */
import { getTodayInBusinessTimezone } from "@/lib/timezone";

export type PeriodPreset =
  | "today" | "yesterday" | "this_week" | "this_month" | "this_year" | "last_12" | "custom";

export type PeriodValue = {
  preset: PeriodPreset;
  year: number;
  dateFrom: string;
  dateTo: string;
  compare?: boolean;
};

const VALID_PRESETS: readonly PeriodPreset[] = [
  "today", "yesterday", "this_week", "this_month", "this_year", "last_12", "custom",
];

export const PERIOD_STORAGE_PREFIX = "egurus:period:v2:";

export function periodStorageKey(key: string): string {
  return PERIOD_STORAGE_PREFIX + key;
}

/** The default every page starts from when nothing was stored yet: today. */
export function defaultPeriod(): PeriodValue {
  const iso = getTodayInBusinessTimezone();
  return { preset: "today", year: Number(iso.slice(0, 4)), dateFrom: iso, dateTo: iso, compare: false };
}

/** Minimal subset of the Storage interface we depend on (testable with a fake). */
export type PeriodStore = Pick<Storage, "getItem" | "setItem">;

/** Read a previously stored choice. Returns null when absent or malformed. */
export function readStoredPeriod(store: PeriodStore | null | undefined, key: string): PeriodValue | null {
  if (!store) return null;
  try {
    const raw = store.getItem(periodStorageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PeriodValue> | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (!VALID_PRESETS.includes(parsed.preset as PeriodPreset)) return null;
    return { ...defaultPeriod(), ...parsed } as PeriodValue;
  } catch {
    return null;
  }
}

/** Persist the user's choice so it survives a refresh. Never throws. */
export function writeStoredPeriod(store: PeriodStore | null | undefined, key: string, value: PeriodValue): void {
  if (!store) return;
  try {
    store.setItem(periodStorageKey(key), JSON.stringify(value));
  } catch {
    /* storage full / disabled — ignore */
  }
}

/** Value a page should show on open: stored choice when valid, otherwise today. */
export function initialPeriod(store: PeriodStore | null | undefined, key: string): PeriodValue {
  return readStoredPeriod(store, key) ?? defaultPeriod();
}

/**
 * Calendar-only arithmetic on "YYYY-MM-DD" business-date strings, done with
 * the UTC getters/setters on a UTC-midnight Date. This deliberately never
 * touches local (browser) time or `toISOString`'s implicit UTC read on a
 * non-UTC-midnight instant — both of those depend on the browser's own
 * timezone offset and would silently shift the result by up to a day
 * depending on where the page happens to be opened. The Cairo anchor comes
 * from the caller (getTodayInBusinessTimezone()); everything after that is
 * pure date-string math.
 */
function dateOnlyUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(dateStr: string, days: number): string {
  const d = dateOnlyUTC(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateStr(d);
}
function addMonths(dateStr: string, months: number): string {
  const d = dateOnlyUTC(dateStr);
  d.setUTCMonth(d.getUTCMonth() + months);
  return toDateStr(d);
}
function startOfMonth(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}
/** 0 = Sunday, matching Date#getDay/getUTCDay. */
function dayOfWeek(dateStr: string): number {
  return dateOnlyUTC(dateStr).getUTCDay();
}
function daysBetween(fromStr: string, toStr: string): number {
  return Math.round((dateOnlyUTC(toStr).getTime() - dateOnlyUTC(fromStr).getTime()) / 86400000);
}

export type ResolvedPeriod = {
  periodType: "custom" | null;
  dateFrom: string | null;
  dateTo: string | null;
  year: number;
  previous: { dateFrom: string | null; dateTo: string | null; year: number } | null;
};

/**
 * Compute effective { periodType, dateFrom, dateTo, year, previous } to pass
 * to getInternalDashboard. `today` defaults to the real business date; tests
 * pass a fixed "YYYY-MM-DD" to get deterministic results.
 */
export function resolvePeriod(v: PeriodValue, today: string = getTodayInBusinessTimezone()): ResolvedPeriod {
  const y = Number(today.slice(0, 4));
  let cur: { periodType: "custom" | null; dateFrom: string | null; dateTo: string | null; year: number };
  switch (v.preset) {
    case "today":
      cur = { periodType: "custom", dateFrom: today, dateTo: today, year: y }; break;
    case "yesterday": {
      const d = addDays(today, -1);
      cur = { periodType: "custom", dateFrom: d, dateTo: d, year: Number(d.slice(0, 4)) }; break;
    }
    case "this_week": {
      const dow = dayOfWeek(today);
      const diff = dow === 0 ? 6 : dow - 1;
      cur = { periodType: "custom", dateFrom: addDays(today, -diff), dateTo: today, year: y }; break;
    }
    case "this_month":
      cur = { periodType: "custom", dateFrom: startOfMonth(today), dateTo: today, year: y }; break;
    case "this_year":
      cur = { periodType: null, dateFrom: null, dateTo: null, year: v.year || y }; break;
    case "last_12":
      cur = { periodType: "custom", dateFrom: addMonths(today, -12), dateTo: today, year: y }; break;
    case "custom":
      cur = { periodType: "custom", dateFrom: v.dateFrom || null, dateTo: v.dateTo || null, year: v.year || y }; break;
  }
  let previous: ResolvedPeriod["previous"] = null;
  if (v.compare) {
    if (cur.periodType === "custom" && cur.dateFrom && cur.dateTo) {
      const days = Math.max(1, daysBetween(cur.dateFrom, cur.dateTo) + 1);
      const pTo = addDays(cur.dateFrom, -1);
      const pFrom = addDays(pTo, -(days - 1));
      previous = { dateFrom: pFrom, dateTo: pTo, year: Number(pFrom.slice(0, 4)) };
    } else if (cur.periodType === null) {
      previous = { dateFrom: null, dateTo: null, year: cur.year - 1 };
    }
  }
  return { ...cur, previous };
}
