import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { resolvePeriod, type PeriodValue, type ResolvedPeriod } from "@/components/PeriodFilter";
import { defaultPeriod, readStoredPeriod, writeStoredPeriod } from "@/lib/period-storage";

type Ctx = {
  period: PeriodValue;
  resolved: ResolvedPeriod;
  setPeriod: (v: PeriodValue) => void;
};

const GlobalPeriodContext = createContext<Ctx | null>(null);

function browserStore() {
  return typeof window === "undefined" ? null : window.localStorage;
}

/**
 * Period state persisted in the browser (per key), so the choice survives reloads.
 * Starts from the stored value after hydration; defaults to "today".
 */
export function usePersistedPeriod(key: string): [PeriodValue, (v: PeriodValue) => void] {
  const [period, setPeriodState] = useState<PeriodValue>(() => defaultPeriod());
  useEffect(() => {
    const stored = readStoredPeriod(browserStore(), key);
    if (stored) setPeriodState(stored);
  }, [key]);
  const setPeriod = useCallback((v: PeriodValue) => {
    setPeriodState(v);
    writeStoredPeriod(browserStore(), key, v);
  }, [key]);
  return [period, setPeriod];
}


export function GlobalPeriodProvider({ children }: { children: ReactNode }) {
  const [period, setPeriod] = usePersistedPeriod("global");
  const resolved = useMemo(() => resolvePeriod(period), [period]);
  const value = useMemo(() => ({ period, resolved, setPeriod }), [period, resolved, setPeriod]);
  return <GlobalPeriodContext.Provider value={value}>{children}</GlobalPeriodContext.Provider>;
}

/** Read-only access; safe to call outside provider (returns stable defaults, recomputed each call). */
export function useGlobalPeriod(): Ctx {
  const ctx = useContext(GlobalPeriodContext);
  if (ctx) return ctx;
  const period = defaultPeriod();
  return {
    period,
    resolved: resolvePeriod(period),
    setPeriod: () => { /* noop */ },
  };
}
