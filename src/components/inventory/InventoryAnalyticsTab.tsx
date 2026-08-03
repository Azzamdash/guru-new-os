import { tr } from "@/lib/i18n";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Wallet, Boxes, Gauge, AlertTriangle, RefreshCw } from "lucide-react";
import { PeriodFilter, resolvePeriod } from "@/components/PeriodFilter";
import { usePersistedPeriod } from "@/lib/global-period";
import { getInventoryValuation } from "@/lib/inventory-valuation.functions";
import { getInventoryReports } from "@/lib/inventory.functions";
import { useLang } from "@/lib/i18n";

const nf = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const money = (n: number) => `${nf(n)} EGP`;

function Kpi({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string;
  icon: typeof Wallet;
  hint?: string;
}) {
  return (
    <Card className="p-4 space-y-1">
      <div className="flex items-center justify-between text-muted-foreground text-sm">
        <span>{label}</span>
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </Card>
  );
}

export function InventoryAnalyticsTab() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [period, setPeriod] = usePersistedPeriod("inventory-analytics");
  const resolved = useMemo(() => resolvePeriod(period), [period]);
  const from = resolved.dateFrom ?? `${resolved.year}-01-01`;
  const to = resolved.dateTo ?? `${resolved.year}-12-31`;

  const valuationFn = useServerFn(getInventoryValuation);
  const valuationQ = useQuery({
    queryKey: ["inventory-mgmt", "valuation"],
    queryFn: () => valuationFn({ data: {} }),
  });

  const reportsFn = useServerFn(getInventoryReports);
  const reportsQ = useQuery({
    queryKey: ["inventory-mgmt", "reports", from, to],
    queryFn: () => reportsFn({ data: { from, to } }),
  });

  const valuation = valuationQ.data;
  const report = reportsQ.data;

  const avgStockLevel =
    valuation && valuation.items.length > 0 ? valuation.totals.units / valuation.items.length : 0;
  const turnover =
    valuation && valuation.totals.value > 0 && report
      ? report.totals.out_value / valuation.totals.value
      : 0;

  const reorderAnalysis = useMemo(() => {
    if (!valuation || !report) return [];
    const consumptionByName = new Map(
      report.items.map((i) => [i.item_name, i.avg_daily_consumption]),
    );
    return valuation.items
      .map((i) => {
        const avgDaily = consumptionByName.get(i.name) ?? 0;
        const daysLeft = avgDaily > 0 ? i.on_hand_qty / avgDaily : null;
        return { ...i, avg_daily_consumption: avgDaily, days_left: daysLeft };
      })
      .sort((a, b) => (a.days_left ?? Infinity) - (b.days_left ?? Infinity));
  }, [valuation, report]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">{T("تحليلات المخزون", "Inventory Analytics")}</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {T(
              "قيمة المخزون الحالية، ومعدل الاستهلاك خلال الفترة المختارة.",
              "Current inventory value, and consumption rate over the selected period.",
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodFilter value={period} onChange={setPeriod} />
          <button
            type="button"
            onClick={() => {
              valuationQ.refetch();
              reportsQ.refetch();
            }}
            className="inline-flex items-center justify-center rounded-md border border-border h-9 w-9 hover:bg-muted"
            aria-label={T("تحديث", "Refresh")}
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label={T("إجمالي قيمة المخزون", "Total inventory value")}
          value={money(valuation?.totals.value ?? 0)}
          icon={Wallet}
        />
        <Kpi
          label={T("إجمالي الأصناف", "Total items")}
          value={nf(valuation?.items.length ?? 0)}
          icon={Boxes}
        />
        <Kpi
          label={T("متوسط مستوى المخزون", "Average stock level")}
          value={nf(avgStockLevel)}
          icon={Gauge}
          hint={T("وحدة لكل صنف بالمتوسط", "Units per item on average")}
        />
        <Kpi
          label={T("تحت حد إعادة الطلب", "Below reorder point")}
          value={nf(valuation?.totals.low_stock_count ?? 0)}
          icon={AlertTriangle}
        />
      </div>

      <Card className="p-4 space-y-1">
        <div className="flex items-center justify-between text-muted-foreground text-sm">
          <span>
            {T(
              "معدل دوران المخزون (خلال الفترة المختارة)",
              "Inventory turnover rate (over the selected period)",
            )}
          </span>
          <Gauge className="h-4 w-4" />
        </div>
        <div className="text-2xl font-bold tabular-nums">{turnover.toFixed(2)}×</div>
        <div className="text-xs text-muted-foreground">
          {T(
            "إجمالي قيمة الصادر خلال الفترة ÷ قيمة المخزون الحالية. رقم أعلى = مخزون بيتحرك أسرع.",
            "Total outbound value over the period ÷ current inventory value. A higher number means inventory is moving faster.",
          )}
        </div>
      </Card>

      <Card className="card-gradient overflow-hidden">
        <div className="p-4 border-b border-border font-semibold">
          {T("تحليل إعادة الطلب", "Reorder Analysis")}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-right border-b border-border">
                <th className="p-3">{T("الصنف", "Item")}</th>
                <th className="p-3">{T("البراند", "Brand")}</th>
                <th className="p-3 text-left">{T("الرصيد الحالي", "Current balance")}</th>
                <th className="p-3 text-left">{T("حد إعادة الطلب", "Reorder point")}</th>
                <th className="p-3 text-left">
                  {T("متوسط الاستهلاك اليومي", "Average daily consumption")}
                </th>
                <th className="p-3 text-left">{T("أيام متبقية تقريبًا", "Approx. days left")}</th>
              </tr>
            </thead>
            <tbody>
              {reorderAnalysis.map((i) => (
                <tr key={i.id} className="border-b border-border/50">
                  <td className="p-3 font-medium">{i.name}</td>
                  <td className="p-3 text-muted-foreground">{i.brand_name || "—"}</td>
                  <td className="p-3 num text-left">{nf(i.on_hand_qty)}</td>
                  <td className="p-3 num text-left">{nf(i.reorder_point)}</td>
                  <td className="p-3 num text-left">
                    {i.avg_daily_consumption > 0 ? i.avg_daily_consumption.toFixed(2) : "—"}
                  </td>
                  <td className="p-3 num text-left">
                    {i.days_left != null ? Math.round(i.days_left) : "—"}
                  </td>
                </tr>
              ))}
              {reorderAnalysis.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    {T("لا بيانات كافية.", "Not enough data.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
