import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useLang } from "@/lib/i18n";
import { getTodayInBusinessTimezone } from "@/lib/timezone";

export { defaultPeriod, resolvePeriod } from "@/lib/period-storage";
export type { PeriodPreset, PeriodValue, ResolvedPeriod } from "@/lib/period-storage";
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

export function PeriodFilter({ value, onChange }: { value: PeriodValue; onChange: (v: PeriodValue) => void }) {
  const { t } = useLang();
  const years = useMemo(() => {
    const cy = Number(getTodayInBusinessTimezone().slice(0, 4));
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


