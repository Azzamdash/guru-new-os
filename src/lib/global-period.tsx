import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { defaultPeriod, resolvePeriod, type PeriodValue, type ResolvedPeriod } from "@/components/PeriodFilter";

type Ctx = {
  period: PeriodValue;
  resolved: ResolvedPeriod;
  setPeriod: (v: PeriodValue) => void;
};

const GlobalPeriodContext = createContext<Ctx | null>(null);

const STORAGE_PREFIX = "egurus:period:v2:";

function readStored(key: string): PeriodValue | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PeriodValue>;
    if (!parsed || typeof parsed.preset !== "string") return null;
    return { ...defaultPeriod(), ...parsed } as PeriodValue;
  } catch {
    return null;
  }
}

function writeStored(key: string, v: PeriodValue) {
  try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(v)); } catch { /* ignore */ }
}

/**
 * Period state persisted in the browser (per key), so the choice survives reloads.
 * Starts from the stored value after hydration; defaults to "today".
 */
export function usePersistedPeriod(key: string): [PeriodValue, (v: PeriodValue) => void] {
  const [period, setPeriodState] = useState<PeriodValue>(() => defaultPeriod());
  useEffect(() => {
    const stored = readStored(key);
    if (stored) setPeriodState(stored);
  }, [key]);
  const setPeriod = useCallback((v: PeriodValue) => {
    setPeriodState(v);
    writeStored(key, v);
  }, [key]);
  return [period, setPeriod];
}

export function GlobalPeriodProvider({ children }: { children: ReactNode }) {
  const [period, setPeriod] = usePersistedPeriod("global");
  const resolved = useMemo(() => resolvePeriod(period), [period]);
  const value = useMemo(() => ({ period, resolved, setPeriod }), [period, resolved, setPeriod]);
  return <GlobalPeriodContext.Provider value={value}>{children}</GlobalPeriodContext.Provider>;
}

const FALLBACK_PERIOD = defaultPeriod();

/** Read-only access; safe to call outside provider (returns stable defaults). */
export function useGlobalPeriod(): Ctx {
  const ctx = useContext(GlobalPeriodContext);
  const fallback = useMemo<Ctx>(() => ({
    period: FALLBACK_PERIOD,
    resolved: resolvePeriod(FALLBACK_PERIOD),
    setPeriod: () => { /* noop */ },
  }), []);
  return ctx ?? fallback;
}
