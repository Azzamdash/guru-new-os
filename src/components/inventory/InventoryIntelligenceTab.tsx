import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, TrendingDown } from "lucide-react";
import { listStock } from "@/lib/inventory.functions";
import { getInventoryReports } from "@/lib/inventory.functions";
import { getTodayInBusinessTimezone } from "@/lib/timezone";
import { useLang } from "@/lib/i18n";

const nf = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

const DEFAULT_LEAD_TIME_DAYS = 7;
const SAFETY_DAYS = 7;
const DEAD_STOCK_WINDOW_DAYS = 60;

function reportsWindow() {
  const to = getTodayInBusinessTimezone();
  const from = new Date(Date.now() - DEAD_STOCK_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

export function InventoryIntelligenceTab() {
  const { lang } = useLang();
  const stockFn = useServerFn(listStock);
  const stockQ = useQuery({
    queryKey: ["inventory-mgmt", "stock"],
    queryFn: () => stockFn({ data: {} }),
  });

  const { from, to } = reportsWindow();
  const reportsFn = useServerFn(getInventoryReports);
  const reportsQ = useQuery({
    queryKey: ["inventory-mgmt", "reports-60d", from, to],
    queryFn: () => reportsFn({ data: { from, to } }),
  });

  const analysis = useMemo(() => {
    const items = stockQ.data?.items ?? [];
    const consumptionByName = new Map(
      (reportsQ.data?.items ?? []).map((i) => [i.item_name, i.avg_daily_consumption]),
    );

    return items.map((i) => {
      const avgDaily = consumptionByName.get(i.name) ?? 0;
      const leadTime = i.lead_time_days ?? DEFAULT_LEAD_TIME_DAYS;
      const daysOfSupply = avgDaily > 0 ? i.on_hand_qty / avgDaily : null;
      const atRisk = daysOfSupply != null && daysOfSupply < leadTime;
      const deadStock = avgDaily === 0 && i.on_hand_qty > 0;
      const suggestedQty =
        avgDaily > 0
          ? Math.max(0, Math.ceil(avgDaily * (leadTime + SAFETY_DAYS) - i.on_hand_qty))
          : 0;
      return { ...i, avgDaily, leadTime, daysOfSupply, atRisk, deadStock, suggestedQty };
    });
  }, [stockQ.data, reportsQ.data]);

  const itemsAtRisk = analysis
    .filter((i) => i.atRisk)
    .sort((a, b) => (a.daysOfSupply ?? 0) - (b.daysOfSupply ?? 0));
  const withConsumption = analysis.filter((i) => i.avgDaily > 0 && i.daysOfSupply != null);
  const avgDaysOfSupply =
    withConsumption.length > 0
      ? withConsumption.reduce((a, i) => a + (i.daysOfSupply ?? 0), 0) / withConsumption.length
      : 0;

  const needsAttention = useMemo(() => {
    const rows: Array<{
      key: string;
      name: string;
      brand: string;
      reason: string;
      tone: "danger" | "warn" | "muted";
    }> = [];
    for (const i of analysis) {
      if (i.atRisk)
        rows.push({
          key: i.key,
          name: i.name,
          brand: i.brand_name,
          reason: lang === "ar" ? "خطر نفاد قريب" : "Risk of running out soon",
          tone: "danger",
        });
      else if (i.low_stock)
        rows.push({
          key: i.key,
          name: i.name,
          brand: i.brand_name,
          reason: lang === "ar" ? "وشيك على النفاد" : "Low stock",
          tone: "warn",
        });
      else if (i.deadStock)
        rows.push({
          key: i.key,
          name: i.name,
          brand: i.brand_name,
          reason:
            lang === "ar" ? "مخزون راكد (60 يوم بلا حركة)" : "Dead stock (60 days no movement)",
          tone: "muted",
        });
    }
    return rows;
  }, [analysis, lang]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">
          {lang === "ar" ? "تحليل ذكي للمخزون" : "Smart Inventory Analysis"}
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          {lang === "ar"
            ? `مبني على معدل الاستهلاك خلال آخر ${DEAD_STOCK_WINDOW_DAYS} يوم وفترة التوريد لكل صنف.`
            : `Based on consumption rate over the last ${DEAD_STOCK_WINDOW_DAYS} days and each item's lead time.`}
        </p>
      </div>

      {itemsAtRisk.length > 0 && (
        <Card className="p-4 border-destructive/40 bg-destructive/5">
          <div className="flex items-center gap-2 font-semibold text-destructive mb-1">
            <AlertTriangle className="h-4 w-4" />{" "}
            {lang === "ar"
              ? `${itemsAtRisk.length} صنف في خطر نفاد قبل وصول طلبية جديدة`
              : `${itemsAtRisk.length} item(s) at risk of running out before a new order arrives`}
          </div>
          <p className="text-sm text-muted-foreground">
            {lang === "ar"
              ? `راجع جدول "أصناف في خطر" تحت وابدأ بأمر شراء للأصناف الأولى في الترتيب.`
              : `Check the "Items at Risk" table below and start a purchase order for the top-ranked items.`}
          </p>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground text-sm">
            <span>{lang === "ar" ? "متوسط أيام التوريد" : "Avg. Days of Supply"}</span>
            <Clock className="h-4 w-4" />
          </div>
          <div className="text-2xl font-bold tabular-nums">
            {avgDaysOfSupply > 0 ? Math.round(avgDaysOfSupply) : "—"}
          </div>
          <div className="text-xs text-muted-foreground">
            {lang === "ar"
              ? "عبر الأصناف اللي عندها استهلاك فعلي"
              : "Across items with actual consumption"}
          </div>
        </Card>
        <Card className="p-4 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground text-sm">
            <span>{lang === "ar" ? "أصناف تحتاج انتباه" : "Items Needing Attention"}</span>
            <TrendingDown className="h-4 w-4" />
          </div>
          <div className="text-2xl font-bold tabular-nums">{nf(needsAttention.length)}</div>
        </Card>
      </div>

      <Card className="card-gradient overflow-hidden">
        <div className="p-4 border-b border-border font-semibold">
          {lang === "ar" ? "أصناف في خطر — مرتّبة بالأولوية" : "Items at Risk — Sorted by Priority"}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-right border-b border-border">
                <th className="p-3">{lang === "ar" ? "الصنف" : "Item"}</th>
                <th className="p-3">{lang === "ar" ? "البراند" : "Brand"}</th>
                <th className="p-3 text-left">
                  {lang === "ar" ? "الرصيد الحالي" : "Current Balance"}
                </th>
                <th className="p-3 text-left">{lang === "ar" ? "أيام متبقية" : "Days Left"}</th>
                <th className="p-3 text-left">{lang === "ar" ? "فترة التوريد" : "Lead Time"}</th>
                <th className="p-3 text-left">
                  {lang === "ar" ? "الكمية المقترحة" : "Suggested Qty"}
                </th>
              </tr>
            </thead>
            <tbody>
              {itemsAtRisk.map((i) => (
                <tr key={i.key} className="border-b border-border/50">
                  <td className="p-3 font-medium">{i.name}</td>
                  <td className="p-3 text-muted-foreground">{i.brand_name || "—"}</td>
                  <td className="p-3 num text-left">{nf(i.on_hand_qty)}</td>
                  <td className="p-3 num text-left">
                    {i.daysOfSupply != null ? Math.round(i.daysOfSupply) : "—"}
                  </td>
                  <td className="p-3 num text-left">{i.leadTime}</td>
                  <td className="p-3 num text-left font-semibold">{nf(i.suggestedQty)}</td>
                </tr>
              ))}
              {itemsAtRisk.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    {lang === "ar"
                      ? "مفيش أصناف في خطر نفاد حاليًا."
                      : "No items are currently at risk of running out."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="card-gradient overflow-hidden">
        <div className="p-4 border-b border-border font-semibold">
          {lang === "ar" ? "أصناف تحتاج انتباه" : "Items Needing Attention"}
        </div>
        <div className="divide-y divide-border/50">
          {needsAttention.map((r) => (
            <div key={r.key} className="p-3 flex items-center justify-between">
              <div>
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground">{r.brand || "—"}</div>
              </div>
              <Badge
                variant={
                  r.tone === "danger" ? "destructive" : r.tone === "warn" ? "outline" : "secondary"
                }
              >
                {r.reason}
              </Badge>
            </div>
          ))}
          {needsAttention.length === 0 && (
            <div className="p-6 text-center text-muted-foreground text-sm">
              {lang === "ar" ? "كل الأصناف في وضع طبيعي." : "All items are in a normal state."}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
