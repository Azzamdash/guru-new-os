import { tr } from "@/lib/i18n";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, TrendingDown } from "lucide-react";
import { listStock } from "@/lib/inventory.functions";
import { getInventoryReports } from "@/lib/inventory.functions";
import { getTodayInBusinessTimezone } from "@/lib/timezone";

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
  const stockFn = useServerFn(listStock);
  const stockQ = useQuery({ queryKey: ["inventory-mgmt", "stock"], queryFn: () => stockFn({ data: {} }) });

  const { from, to } = reportsWindow();
  const reportsFn = useServerFn(getInventoryReports);
  const reportsQ = useQuery({
    queryKey: ["inventory-mgmt", "reports-60d", from, to],
    queryFn: () => reportsFn({ data: { from, to } }),
  });

  const analysis = useMemo(() => {
    const items = stockQ.data?.items ?? [];
    const consumptionByName = new Map((reportsQ.data?.items ?? []).map((i) => [i.item_name, i.avg_daily_consumption]));

    return items.map((i) => {
      const avgDaily = consumptionByName.get(i.name) ?? 0;
      const leadTime = i.lead_time_days ?? DEFAULT_LEAD_TIME_DAYS;
      const daysOfSupply = avgDaily > 0 ? i.on_hand_qty / avgDaily : null;
      const atRisk = daysOfSupply != null && daysOfSupply < leadTime;
      const deadStock = avgDaily === 0 && i.on_hand_qty > 0;
      const suggestedQty = avgDaily > 0
        ? Math.max(0, Math.ceil(avgDaily * (leadTime + SAFETY_DAYS) - i.on_hand_qty))
        : 0;
      return { ...i, avgDaily, leadTime, daysOfSupply, atRisk, deadStock, suggestedQty };
    });
  }, [stockQ.data, reportsQ.data]);

  const itemsAtRisk = analysis.filter((i) => i.atRisk).sort((a, b) => (a.daysOfSupply ?? 0) - (b.daysOfSupply ?? 0));
  const withConsumption = analysis.filter((i) => i.avgDaily > 0 && i.daysOfSupply != null);
  const avgDaysOfSupply = withConsumption.length > 0
    ? withConsumption.reduce((a, i) => a + (i.daysOfSupply ?? 0), 0) / withConsumption.length
    : 0;

  const needsAttention = useMemo(() => {
    const rows: Array<{ key: string; name: string; brand: string; reason: string; tone: "danger" | "warn" | "muted" }> = [];
    for (const i of analysis) {
      if (i.atRisk) rows.push({ key: i.key, name: i.name, brand: i.brand_name, reason: "خطر نفاد قريب", tone: "danger" });
      else if (i.low_stock) rows.push({ key: i.key, name: i.name, brand: i.brand_name, reason: "وشيك على النفاد", tone: "warn" });
      else if (i.deadStock) rows.push({ key: i.key, name: i.name, brand: i.brand_name, reason: "مخزون راكد (60 يوم بلا حركة)", tone: "muted" });
    }
    return rows;
  }, [analysis]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{tr("تحليل ذكي للمخزون")}</h2>
        <p className="text-muted-foreground text-sm mt-1">{tr("مبني على معدل الاستهلاك خلال آخر")} {DEAD_STOCK_WINDOW_DAYS} {tr("يوم وفترة التوريد لكل صنف.")}</p>
      </div>

      {itemsAtRisk.length > 0 && (
        <Card className="p-4 border-destructive/40 bg-destructive/5">
          <div className="flex items-center gap-2 font-semibold text-destructive mb-1">
            <AlertTriangle className="h-4 w-4" /> {itemsAtRisk.length} {tr("صنف في خطر نفاد قبل وصول طلبية جديدة")}
          </div>
          <p className="text-sm text-muted-foreground">{tr("راجع جدول \"أصناف في خطر\" تحت وابدأ بأمر شراء للأصناف الأولى في الترتيب.")}</p>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground text-sm">
            <span>{tr("متوسط أيام التوريد")}</span>
            <Clock className="h-4 w-4" />
          </div>
          <div className="text-2xl font-bold tabular-nums">{avgDaysOfSupply > 0 ? Math.round(avgDaysOfSupply) : "—"}</div>
          <div className="text-xs text-muted-foreground">{tr("عبر الأصناف اللي عندها استهلاك فعلي")}</div>
        </Card>
        <Card className="p-4 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground text-sm">
            <span>{tr("أصناف تحتاج انتباه")}</span>
            <TrendingDown className="h-4 w-4" />
          </div>
          <div className="text-2xl font-bold tabular-nums">{nf(needsAttention.length)}</div>
        </Card>
      </div>

      <Card className="card-gradient overflow-hidden">
        <div className="p-4 border-b border-border font-semibold">{tr("أصناف في خطر — مرتّبة بالأولوية")}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-right border-b border-border">
                <th className="p-3">{tr("الصنف")}</th>
                <th className="p-3">{tr("البراند")}</th>
                <th className="p-3 text-left">{tr("الرصيد الحالي")}</th>
                <th className="p-3 text-left">{tr("أيام متبقية")}</th>
                <th className="p-3 text-left">{tr("فترة التوريد")}</th>
                <th className="p-3 text-left">{tr("الكمية المقترحة")}</th>
              </tr>
            </thead>
            <tbody>
              {itemsAtRisk.map((i) => (
                <tr key={i.key} className="border-b border-border/50">
                  <td className="p-3 font-medium">{i.name}</td>
                  <td className="p-3 text-muted-foreground">{i.brand_name || "—"}</td>
                  <td className="p-3 num text-left">{nf(i.on_hand_qty)}</td>
                  <td className="p-3 num text-left">{i.daysOfSupply != null ? Math.round(i.daysOfSupply) : "—"}</td>
                  <td className="p-3 num text-left">{i.leadTime}</td>
                  <td className="p-3 num text-left font-semibold">{nf(i.suggestedQty)}</td>
                </tr>
              ))}
              {itemsAtRisk.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">{tr("مفيش أصناف في خطر نفاد حاليًا.")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="card-gradient overflow-hidden">
        <div className="p-4 border-b border-border font-semibold">{tr("أصناف تحتاج انتباه")}</div>
        <div className="divide-y divide-border/50">
          {needsAttention.map((r) => (
            <div key={r.key} className="p-3 flex items-center justify-between">
              <div>
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground">{r.brand || "—"}</div>
              </div>
              <Badge variant={r.tone === "danger" ? "destructive" : r.tone === "warn" ? "outline" : "secondary"}>{r.reason}</Badge>
            </div>
          ))}
          {needsAttention.length === 0 && (
            <div className="p-6 text-center text-muted-foreground text-sm">{tr("كل الأصناف في وضع طبيعي.")}</div>
          )}
        </div>
      </Card>
    </div>
  );
}
