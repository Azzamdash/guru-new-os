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
  const today = new Date();
  const iso = getTodayInBusinessTimezone();
  return { preset: "today", year: today.getFullYear(), dateFrom: iso, dateTo: iso, compare: false };
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
