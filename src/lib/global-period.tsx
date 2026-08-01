import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { defaultPeriod, resolvePeriod, type PeriodValue, type ResolvedPeriod } from "@/components/PeriodFilter";

type Ctx = {
  period: PeriodValue;
  resolved: ResolvedPeriod;
  setPeriod: (v: PeriodValue) => void;
};

const GlobalPeriodContext = createContext<Ctx | null>(null);

const STORAGE_KEY = "egurus:global-period:v1";

export function GlobalPeriodProvider({ children }: { children: ReactNode }) {
  // Always start from the default period ("today") on every fresh load.
  // The choice is kept in memory while navigating, but never persisted.
  const [period, setPeriodState] = useState<PeriodValue>(() => defaultPeriod());
  useEffect(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);
  const setPeriod = useCallback((v: PeriodValue) => {
    setPeriodState(v);
  }, []);

  const resolved = useMemo(() => resolvePeriod(period), [period]);
  const value = useMemo(() => ({ period, resolved, setPeriod }), [period, resolved, setPeriod]);
  return <GlobalPeriodContext.Provider value={value}>{children}</GlobalPeriodContext.Provider>;
}

/** Read-only access; safe to call outside provider (returns defaults). */
export function useGlobalPeriod(): Ctx {
  const ctx = useContext(GlobalPeriodContext);
  if (ctx) return ctx;
  const period = defaultPeriod();
  return { period, resolved: resolvePeriod(period), setPeriod: () => { /* noop */ } };
}
