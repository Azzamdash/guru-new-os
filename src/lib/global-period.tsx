import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { defaultPeriod, resolvePeriod, type PeriodValue, type ResolvedPeriod } from "@/components/PeriodFilter";

type Ctx = {
  period: PeriodValue;
  resolved: ResolvedPeriod;
  setPeriod: (v: PeriodValue) => void;
};

const GlobalPeriodContext = createContext<Ctx | null>(null);

const STORAGE_KEY = "egurus:global-period:v1";

function load(): PeriodValue {
  if (typeof window === "undefined") return defaultPeriod();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPeriod();
    const p = JSON.parse(raw) as PeriodValue;
    if (!p?.preset) return defaultPeriod();
    return p;
  } catch { return defaultPeriod(); }
}

export function GlobalPeriodProvider({ children }: { children: ReactNode }) {
  const [period, setPeriodState] = useState<PeriodValue>(() => defaultPeriod());
  useEffect(() => { setPeriodState(load()); }, []);
  const setPeriod = useCallback((v: PeriodValue) => {
    setPeriodState(v);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch { /* ignore */ }
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
