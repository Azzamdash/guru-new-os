import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getRevenueComparison, listBrands } from "@/lib/internal.functions";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { ReportActions } from "@/components/ReportActions";
import { GitCompareArrows, AlertTriangle, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_app/reports/revenue-comparison")({
  head: () => ({ meta: [
    { title: "مقارنة الإيرادات — يدوي مقابل فواتير" },
    { name: "description", content: "مقارنة الإيرادات بين إدخالات monthly_entries وفواتير المبيعات (صافية بعد المرتجعات) حسب البراند والشهر." },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
  component: RevenueComparisonPage,
});

const MONTH_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
function fmt(n: number) { return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n); }

function RevenueComparisonPage() {
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [brandId, setBrandId] = useState<string>("all");
  const listBrandsFn = useServerFn(listBrands);
  const cmpFn = useServerFn(getRevenueComparison);
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listBrandsFn() });
  const cmpQ = useQuery({
    queryKey: ["revenue-comparison", year, brandId],
    queryFn: () => cmpFn({ data: { year, brandId: brandId === "all" ? null : brandId } }),
  });

  const rows = cmpQ.data?.rows ?? [];
  const totals = cmpQ.data?.totals ?? { manual: 0, invoices: 0, diff: 0 };

  // Aggregate by month across selected scope
  const byMonth: Array<{ month: string; manual: number; invoices: number; diff: number }> = [];
  for (let m = 1; m <= 12; m++) {
    const monthRows = rows.filter((r) => r.month === m);
    const manual = monthRows.reduce((s, r) => s + r.manual, 0);
    const invoices = monthRows.reduce((s, r) => s + r.invoices, 0);
    byMonth.push({ month: MONTH_AR[m - 1], manual, invoices, diff: manual - invoices });
  }

  const csvRows = rows.map((r) => ({
    البراند: r.brandName, الشهر: MONTH_AR[r.month - 1],
    يدوي: r.manual, فواتير_صافي: r.invoices, الفرق: r.diff,
  }));

  return (
    <div className="p-6 md:p-8 space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><GitCompareArrows className="w-7 h-7 text-primary" /> مقارنة الإيرادات</h1>
          <p className="text-muted-foreground text-sm mt-1">إدخالات يدوية (monthly_entries) مقابل فواتير المبيعات الصافية (بعد المرتجعات).</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={brandId} onValueChange={setBrandId}>
            <SelectTrigger className="w-52"><SelectValue placeholder="البراند" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل البراندات</SelectItem>
              {(brandsQ.data ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ReportActions filename={`revenue-comparison-${year}.csv`} rows={csvRows} summaryTitle="مقارنة الإيرادات" summaryText={`سنة ${year} — الفرق الإجمالي: ${fmt(totals.diff)}`} />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">إجمالي يدوي (monthly_entries)</div>
          <div className="text-2xl font-bold mt-1">{fmt(totals.manual)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">إجمالي من الفواتير (بعد المرتجعات)</div>
          <div className="text-2xl font-bold mt-1 text-primary">{fmt(totals.invoices)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">الفرق</div>
          <div className={`text-2xl font-bold mt-1 ${Math.abs(totals.diff) > 1 ? "text-destructive" : "text-emerald-500"}`}>
            {totals.diff > 0 ? "+" : ""}{fmt(totals.diff)}
          </div>
        </Card>
      </div>

      {/* Chart */}
      <Card className="p-4">
        <div className="font-semibold mb-3">اتجاه شهري</div>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={byMonth}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} formatter={(v: number) => fmt(v)} />
            <Legend />
            <Bar dataKey="manual" name="يدوي" fill="hsl(200 60% 60%)" />
            <Bar dataKey="invoices" name="فواتير صافي" fill="hsl(155 55% 55%)" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Table */}
      <Card className="p-4">
        <div className="font-semibold mb-3">تفصيل البراند × الشهر</div>
        {cmpQ.isLoading ? (
          <div className="text-sm text-muted-foreground">جاري التحميل...</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">لا توجد بيانات لهذا العام.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="p-2 text-right">البراند</th>
                  <th className="p-2 text-right">الشهر</th>
                  <th className="p-2 text-right">يدوي</th>
                  <th className="p-2 text-right">فواتير صافي</th>
                  <th className="p-2 text-right">الفرق</th>
                  <th className="p-2 text-right">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {rows.filter((r) => r.manual !== 0 || r.invoices !== 0).map((r, i) => {
                  const match = r.absDiff <= Math.max(1, Math.abs(r.invoices) * 0.02);
                  return (
                    <tr key={i} className="border-b last:border-0">
                      <td className="p-2 font-medium">{r.brandName}</td>
                      <td className="p-2">{MONTH_AR[r.month - 1]}</td>
                      <td className="p-2">{fmt(r.manual)}</td>
                      <td className="p-2">{fmt(r.invoices)}</td>
                      <td className={`p-2 font-semibold ${Math.abs(r.diff) > 1 ? "text-destructive" : "text-emerald-500"}`}>
                        {r.diff > 0 ? "+" : ""}{fmt(r.diff)}
                      </td>
                      <td className="p-2">
                        {match ? (
                          <Badge variant="outline" className="gap-1 text-emerald-500 border-emerald-500/30"><Check className="w-3 h-3" /> متطابق</Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-destructive border-destructive/30"><AlertTriangle className="w-3 h-3" /> فرق</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
