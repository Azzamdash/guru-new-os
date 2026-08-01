import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { GitCompareArrows } from "lucide-react";
import { getInternalDashboard, listExpenseEntries, listBrands } from "@/lib/internal.functions";
import { PeriodFilter, defaultPeriod, resolvePeriod, type PeriodValue } from "@/components/PeriodFilter";
import { usePersistedPeriod } from "@/lib/global-period";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/reports/brands-comparison")({
  head: () => ({ meta: [
    { title: "مقارنة أداء البراندات — e-GURUS" },
    { name: "description", content: "قارن هامش الربح والـ ROAS والقرارات المقترحة لكل براند." },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
  component: BrandsComparison,
});

type Status = "strong" | "stable" | "watch" | "action";

function statusOf(margin: number, roas: number, netProfit: number): Status {
  if (netProfit < 0 || roas < 1.5) return "action";
  if (margin >= 0.25 && roas >= 3) return "strong";
  if (margin >= 0.1 && roas >= 2) return "stable";
  return "watch";
}

function BrandsComparison() {
  const { lang } = useLang();
  const [period, setPeriod] = usePersistedPeriod("reports.brands-comparison");
  const resolved = resolvePeriod(period);
  const getDash = useServerFn(getInternalDashboard);
  const listExpFn = useServerFn(listExpenseEntries);
  const listBrandsFn = useServerFn(listBrands);

  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listBrandsFn() });
  const dashQ = useQuery({
    queryKey: ["brands-cmp-dash", resolved.year, resolved.dateFrom, resolved.dateTo],
    queryFn: () => getDash({ data: { year: resolved.year, brandId: null, periodType: resolved.periodType, dateFrom: resolved.dateFrom, dateTo: resolved.dateTo } }),
  });

  const brands = brandsQ.data ?? [];
  const mktQ = useQuery({
    queryKey: ["brands-cmp-mkt", resolved.year, brands.map((b) => b.id).join(",")],
    enabled: brands.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        brands.map((b) =>
          Promise.all(Array.from({ length: 12 }, (_, i) => listExpFn({ data: { brandId: b.id, year: resolved.year, month: i + 1 } }))),
        ),
      );
      const map = new Map<string, { spend: number; revenue: number }>();
      brands.forEach((b, i) => {
        let spend = 0, revenue = 0;
        for (const r of results[i].flat()) {
          if (!r.platform) continue;
          spend += Number(r.amount) || 0;
          revenue += Number(r.attributed_revenue) || 0;
        }
        map.set(b.id, { spend, revenue });
      });
      return map;
    },
  });

  const rows = useMemo(() => {
    const per = dashQ.data?.perBrand ?? [];
    return per.map((b) => {
      const mkt = mktQ.data?.get(b.id) ?? { spend: 0, revenue: 0 };
      const roas = mkt.spend > 0 ? b.revenue / mkt.spend : 0;
      const status = statusOf(b.margin, roas, b.netProfit);
      return { ...b, mktSpend: mkt.spend, roas, status };
    }).sort((a, b) => b.netProfit - a.netProfit);
  }, [dashQ.data, mktQ.data]);

  const statusLabel: Record<Status, { ar: string; en: string; variant: "default"|"secondary"|"outline"|"destructive" }> = {
    strong: { ar: "قوي", en: "Strong", variant: "default" },
    stable: { ar: "مستقر", en: "Stable", variant: "secondary" },
    watch: { ar: "تحت المراقبة", en: "Watch", variant: "outline" },
    action: { ar: "محتاج تدخل", en: "Needs action", variant: "destructive" },
  };

  function suggestion(r: typeof rows[number]): string {
    if (r.status === "strong") return lang === "ar" ? `زوّد ميزانية ${r.name} — العائد ممتاز` : `Scale ${r.name} — great returns`;
    if (r.status === "action") return lang === "ar" ? `راجع ${r.name} — العائد ضعيف/سلبي` : `Review ${r.name} — weak/negative return`;
    if (r.status === "watch") return lang === "ar" ? `اضبط تكلفة ${r.name} أو رفع متوسط الطلب` : `Trim ${r.name} costs or lift AOV`;
    return lang === "ar" ? `حافظ على أداء ${r.name}` : `Maintain ${r.name}`;
  }

  const nf = (n: number) => Number(n || 0).toLocaleString("en-US");

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><GitCompareArrows className="w-7 h-7 text-primary" /> {lang === "ar" ? "مقارنة أداء البراندات" : "Brands performance comparison"}</h1>
          <p className="text-muted-foreground text-sm mt-1">{lang === "ar" ? "ترتيب حسب صافي الربح — مع ROAS وقرارات مقترحة." : "Ranked by net profit — with ROAS and suggested actions."}</p>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      <Card className="card-gradient p-5">
        <h3 className="font-semibold mb-4">{lang === "ar" ? "الإيراد مقابل صافي الربح" : "Revenue vs Net Profit"}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
            <Legend />
            <Bar dataKey="revenue" name={lang === "ar" ? "الإيراد" : "Revenue"} fill="hsl(var(--primary))" />
            <Bar dataKey="netProfit" name={lang === "ar" ? "صافي الربح" : "Net Profit"} fill="hsl(var(--chart-2, 145 60% 50%))" />
            <Bar dataKey="mktSpend" name={lang === "ar" ? "إنفاق تسويقي" : "Ad Spend"} fill="hsl(var(--destructive))" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card className="card-gradient overflow-hidden">
        <div className="p-4 border-b border-border font-semibold">{lang === "ar" ? "جدول الأداء الشامل" : "Overall performance"}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-muted-foreground">
              <th className="p-3 text-start">{lang === "ar" ? "البراند" : "Brand"}</th>
              <th className="p-3 text-start">{lang === "ar" ? "الإيراد" : "Revenue"}</th>
              <th className="p-3 text-start">{lang === "ar" ? "المصروفات" : "Expenses"}</th>
              <th className="p-3 text-start">{lang === "ar" ? "صافي الربح" : "Net Profit"}</th>
              <th className="p-3 text-start">{lang === "ar" ? "الهامش" : "Margin"}</th>
              <th className="p-3 text-start">ROAS</th>
              <th className="p-3 text-start">{lang === "ar" ? "الحالة" : "Status"}</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="p-3 font-medium">{r.name}</td>
                  <td className="p-3 num">{nf(Math.round(r.revenue))}</td>
                  <td className="p-3 num">{nf(Math.round(r.expenses))}</td>
                  <td className={`p-3 num font-semibold ${r.netProfit >= 0 ? "text-emerald-500" : "text-destructive"}`}>{nf(Math.round(r.netProfit))}</td>
                  <td className="p-3 num">{(r.margin * 100).toFixed(1)}%</td>
                  <td className={`p-3 num font-semibold ${r.roas >= 2 ? "text-emerald-500" : r.roas > 0 ? "text-amber-500" : "text-muted-foreground"}`}>{r.roas > 0 ? `${r.roas.toFixed(2)}x` : "—"}</td>
                  <td className="p-3"><Badge variant={statusLabel[r.status].variant}>{lang === "ar" ? statusLabel[r.status].ar : statusLabel[r.status].en}</Badge></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">—</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="card-gradient p-5">
        <h3 className="font-semibold mb-3">{lang === "ar" ? "ملاحظات وقرارات مقترحة" : "Notes & suggested decisions"}</h3>
        <ul className="space-y-2 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start gap-3 rounded border border-border/50 p-3 bg-muted/30">
              <Badge variant={statusLabel[r.status].variant}>{lang === "ar" ? statusLabel[r.status].ar : statusLabel[r.status].en}</Badge>
              <span>{suggestion(r)}</span>
            </li>
          ))}
          {rows.length === 0 && <li className="text-muted-foreground">—</li>}
        </ul>
      </Card>
    </div>
  );
}