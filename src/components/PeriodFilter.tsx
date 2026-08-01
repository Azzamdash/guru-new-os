import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useLang } from "@/lib/i18n";

export { defaultPeriod } from "@/lib/period-storage";
export type { PeriodPreset, PeriodValue } from "@/lib/period-storage";
import type { PeriodPreset, PeriodValue } from "@/lib/period-storage";


const PRESET_KEYS: Record<PeriodPreset, string> = {
  today: "period_today",
  yesterday: "period_yesterday",
  this_week: "period_this_week",
  this_month: "period_this_month",
  this_year: "period_this_year",
  last_12: "period_last_12",
  custom: "period_custom",
};
export const PRESET_LABELS = PRESET_KEYS;

function fmtISO(d: Date) { return d.toISOString().slice(0, 10); }

export type ResolvedPeriod = {
  periodType: "custom" | null;
  dateFrom: string | null;
  dateTo: string | null;
  year: number;
  previous: { dateFrom: string | null; dateTo: string | null; year: number } | null;
};

/** Compute effective { periodType, dateFrom, dateTo, year, previous } to pass to getInternalDashboard. */
export function resolvePeriod(v: PeriodValue): ResolvedPeriod {
  const today = new Date();
  const y = today.getFullYear();
  const iso = fmtISO;
  let cur: { periodType: "custom" | null; dateFrom: string | null; dateTo: string | null; year: number };
  switch (v.preset) {
    case "today":
      cur = { periodType: "custom", dateFrom: iso(today), dateTo: iso(today), year: y }; break;
    case "yesterday": {
      const d = new Date(today); d.setDate(d.getDate() - 1);
      cur = { periodType: "custom", dateFrom: iso(d), dateTo: iso(d), year: d.getFullYear() }; break;
    }
    case "this_week": {
      const d = new Date(today);
      const day = d.getDay(); const diff = day === 0 ? 6 : day - 1;
      d.setDate(d.getDate() - diff);
      cur = { periodType: "custom", dateFrom: iso(d), dateTo: iso(today), year: y }; break;
    }
    case "this_month": {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      cur = { periodType: "custom", dateFrom: iso(d), dateTo: iso(today), year: y }; break;
    }
    case "this_year":
      cur = { periodType: null, dateFrom: null, dateTo: null, year: v.year || y }; break;
    case "last_12": {
      const d = new Date(today); d.setMonth(d.getMonth() - 12);
      cur = { periodType: "custom", dateFrom: iso(d), dateTo: iso(today), year: y }; break;
    }
    case "custom":
      cur = { periodType: "custom", dateFrom: v.dateFrom || null, dateTo: v.dateTo || null, year: v.year || y }; break;
  }
  let previous: ResolvedPeriod["previous"] = null;
  if (v.compare) {
    if (cur.periodType === "custom" && cur.dateFrom && cur.dateTo) {
      const df = new Date(cur.dateFrom); const dt = new Date(cur.dateTo);
      const days = Math.max(1, Math.round((dt.getTime() - df.getTime()) / 86400000) + 1);
      const pTo = new Date(df); pTo.setDate(pTo.getDate() - 1);
      const pFrom = new Date(pTo); pFrom.setDate(pFrom.getDate() - (days - 1));
      previous = { dateFrom: iso(pFrom), dateTo: iso(pTo), year: pFrom.getFullYear() };
    } else if (cur.periodType === null) {
      previous = { dateFrom: null, dateTo: null, year: cur.year - 1 };
    }
  }
  return { ...cur, previous };
}

export function PeriodFilter({ value, onChange }: { value: PeriodValue; onChange: (v: PeriodValue) => void }) {
  const { t } = useLang();
  const years = useMemo(() => {
    const cy = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => cy - i);
  }, []);
  return (
    <div className="flex gap-2 flex-wrap items-center">
      <Select value={value.preset} onValueChange={(v) => onChange({ ...value, preset: v as PeriodPreset })}>
        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          {(Object.keys(PRESET_KEYS) as PeriodPreset[]).map((p) => (
            <SelectItem key={p} value={p}>{t(PRESET_KEYS[p])}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value.preset === "custom" && (
        <>
          <Input type="date" className="w-40" value={value.dateFrom}
            onChange={(e) => onChange({ ...value, dateFrom: e.target.value })} />
          <Input type="date" className="w-40" value={value.dateTo}
            onChange={(e) => onChange({ ...value, dateTo: e.target.value })} />
        </>
      )}
      {(value.preset === "this_year" || value.preset === "custom") && (
        <Select value={String(value.year)} onValueChange={(v) => onChange({ ...value, year: parseInt(v, 10) })}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
      )}
      <div className="flex items-center gap-2 px-2 py-1 border rounded-md">
        <Switch id="compare" checked={!!value.compare} onCheckedChange={(c) => onChange({ ...value, compare: c })} />
        <Label htmlFor="compare" className="text-xs cursor-pointer">{t("compare")}</Label>
      </div>
    </div>
  );
}


