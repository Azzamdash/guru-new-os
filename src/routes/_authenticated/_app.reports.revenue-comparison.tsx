import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getRevenueComparison, listBrands } from "@/lib/internal.functions";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ReportActions } from "@/components/ReportActions";
import { GitCompareArrows, AlertTriangle, Check } from "lucide-react";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/reports/revenue-comparison")({
  head: () => ({
    meta: [
      { title: "مقارنة الإيرادات — يدوي مقابل فواتير" },
      {
        name: "description",
        content:
          "مقارنة الإيرادات بين إدخالات monthly_entries وفواتير المبيعات (صافية بعد المرتجعات) حسب البراند والشهر.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RevenueComparisonPage,
});

const MONTH_AR = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];
const MONTH_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

function RevenueComparisonPage() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const MONTHS = lang === "ar" ? MONTH_AR : MONTH_EN;
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
    byMonth.push({ month: MONTHS[m - 1], manual, invoices, diff: manual - invoices });
  }

  const csvRows = rows.map((r) => ({
    البراند: r.brandName,
    الشهر: MONTHS[r.month - 1],
    يدوي: r.manual,
    فواتير_صافي: r.invoices,
    الفرق: r.diff,
  }));

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <GitCompareArrows className="w-7 h-7 text-primary" />{" "}
            {T("مقارنة الإيرادات", "Revenue Comparison")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {T(
              "إدخالات يدوية (monthly_entries) مقابل فواتير المبيعات الصافية (بعد المرتجعات).",
              "Manual entries (monthly_entries) vs. net sales invoices (after returns).",
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                now.getFullYear() - 2,
                now.getFullYear() - 1,
                now.getFullYear(),
                now.getFullYear() + 1,
              ].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={brandId} onValueChange={setBrandId}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder={T("البراند", "Brand")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{T("كل البراندات", "All Brands")}</SelectItem>
              {(brandsQ.data ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ReportActions
            filename={`revenue-comparison-${year}.csv`}
            rows={csvRows}
            summaryTitle={T("مقارنة الإيرادات", "Revenue Comparison")}
            summaryText={T(
              `سنة ${year} — الفرق الإجمالي: ${fmt(totals.diff)}`,
              `Year ${year} — Total difference: ${fmt(totals.diff)}`,
            )}
          />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">
            {T("إجمالي يدوي (monthly_entries)", "Total Manual (monthly_entries)")}
          </div>
          <div className="text-2xl font-bold mt-1">{fmt(totals.manual)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">
            {T("إجمالي من الفواتير (بعد المرتجعات)", "Total from Invoices (after returns)")}
          </div>
          <div className="text-2xl font-bold mt-1 text-primary">{fmt(totals.invoices)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{T("الفرق", "Difference")}</div>
          <div
            className={`text-2xl font-bold mt-1 ${Math.abs(totals.diff) > 1 ? "text-destructive" : "text-emerald-500"}`}
          >
            {totals.diff > 0 ? "+" : ""}
            {fmt(totals.diff)}
          </div>
        </Card>
      </div>

      {/* Chart */}
      <Card className="p-4">
        <div className="font-semibold mb-3">{T("اتجاه شهري", "Monthly Trend")}</div>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={byMonth}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
              }}
              formatter={(v: number) => fmt(v)}
            />
            <Legend />
            <Bar dataKey="manual" name={T("يدوي", "Manual")} fill="hsl(200 60% 60%)" />
            <Bar
              dataKey="invoices"
              name={T("فواتير صافي", "Net Invoices")}
              fill="hsl(155 55% 55%)"
            />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Table */}
      <Card className="p-4">
        <div className="font-semibold mb-3">
          {T("تفصيل البراند × الشهر", "Brand × Month Breakdown")}
        </div>
        {cmpQ.isLoading ? (
          <div className="text-sm text-muted-foreground">{T("جاري التحميل...", "Loading...")}</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {T("لا توجد بيانات لهذا العام.", "No data for this year.")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="p-2 text-right">{T("البراند", "Brand")}</th>
                  <th className="p-2 text-right">{T("الشهر", "Month")}</th>
                  <th className="p-2 text-right">{T("يدوي", "Manual")}</th>
                  <th className="p-2 text-right">{T("فواتير صافي", "Net Invoices")}</th>
                  <th className="p-2 text-right">{T("الفرق", "Difference")}</th>
                  <th className="p-2 text-right">{T("الحالة", "Status")}</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((r) => r.manual !== 0 || r.invoices !== 0)
                  .map((r, i) => {
                    const match = r.absDiff <= Math.max(1, Math.abs(r.invoices) * 0.02);
                    return (
                      <tr key={i} className="border-b last:border-0">
                        <td className="p-2 font-medium">{r.brandName}</td>
                        <td className="p-2">{MONTHS[r.month - 1]}</td>
                        <td className="p-2">{fmt(r.manual)}</td>
                        <td className="p-2">{fmt(r.invoices)}</td>
                        <td
                          className={`p-2 font-semibold ${Math.abs(r.diff) > 1 ? "text-destructive" : "text-emerald-500"}`}
                        >
                          {r.diff > 0 ? "+" : ""}
                          {fmt(r.diff)}
                        </td>
                        <td className="p-2">
                          {match ? (
                            <Badge
                              variant="outline"
                              className="gap-1 text-emerald-500 border-emerald-500/30"
                            >
                              <Check className="w-3 h-3" /> {T("متطابق", "Match")}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="gap-1 text-destructive border-destructive/30"
                            >
                              <AlertTriangle className="w-3 h-3" /> {T("فرق", "Diff")}
                            </Badge>
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
