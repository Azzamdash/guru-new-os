import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
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
import { BarChart3, Factory, Users, Package } from "lucide-react";
import { getInternalDashboard, listBrands } from "@/lib/internal.functions";
import {
  PeriodFilter,
  defaultPeriod,
  resolvePeriod,
  type PeriodValue,
} from "@/components/PeriodFilter";
import { usePersistedPeriod } from "@/lib/global-period";
import { ReportActions } from "@/components/ReportActions";
import { pctDelta } from "@/lib/export-utils";
import { ChartFrame } from "@/components/EmptyState";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/reports/production")({
  head: () => ({
    meta: [
      { title: "تقارير الإنتاج — e-GURUS" },
      { name: "description", content: "أداء العمال والمنتجات الأكثر إنتاجًا." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ProductionReports,
});

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

function ProductionReports() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const listBrandsFn = useServerFn(listBrands);
  const getDash = useServerFn(getInternalDashboard);
  const [brandId, setBrandId] = useState<string>("all");
  const [period, setPeriod] = usePersistedPeriod("reports.production");
  const resolved = resolvePeriod(period);

  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listBrandsFn() });
  const dashQ = useQuery({
    queryKey: [
      "reports-prod",
      resolved.year,
      brandId,
      period.preset,
      resolved.dateFrom,
      resolved.dateTo,
    ],
    queryFn: () =>
      getDash({
        data: {
          year: resolved.year,
          brandId: brandId === "all" ? null : brandId,
          periodType: resolved.periodType,
          dateFrom: resolved.dateFrom,
          dateTo: resolved.dateTo,
        },
      }),
  });

  const d = dashQ.data;
  const topProduced = (d?.inventory.allProducts ?? [])
    .filter((p) => p.produced > 0)
    .sort((a, b) => b.produced - a.produced)
    .slice(0, 10);
  const workers = d?.workers ?? [];
  const totalProduced = d?.inventory.totalProduced ?? 0;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-primary" />{" "}
            {T("تقارير الإنتاج", "Production Reports")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {T(
              "أداء العمال والموظفين والمنتجات الأكثر إنتاجًا.",
              "Worker and staff performance, and the most produced products.",
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={brandId} onValueChange={setBrandId}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{T("كل البراندات", "All brands")}</SelectItem>
              {(brandsQ.data ?? [])
                .filter((b) => b.active)
                .map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <PeriodFilter value={period} onChange={setPeriod} />
          <ReportActions
            filename={`production-report-${resolved.year}.csv`}
            summaryTitle={T("تقرير الإنتاج", "Production report")}
            summaryText={`${T("الفترة", "Period")}: ${resolved.dateFrom ?? resolved.year}${resolved.dateTo ? ` → ${resolved.dateTo}` : ""}`}
            rows={
              workers.map((w) => ({
                ...w,
                share: totalProduced > 0 ? w.produced / totalProduced : 0,
              })) as unknown as Array<Record<string, unknown>>
            }
            columns={[
              { key: "name", label: T("العامل", "Worker") },
              { key: "produced", label: T("إجمالي الإنتاج", "Total produced") },
              { key: "productCount", label: T("عدد المنتجات", "Product count") },
              {
                key: "share",
                label: T("نصيبه %", "Share %"),
                fmt: (v) => `${((Number(v) || 0) * 100).toFixed(1)}%`,
              },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="card-gradient p-5">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Factory className="w-3.5 h-3.5" /> {T("إجمالي الإنتاج", "Total production")}
          </div>
          <div className="text-2xl font-bold mt-1">{fmt(totalProduced)}</div>
        </Card>
        <Card className="card-gradient p-5">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Users className="w-3.5 h-3.5" /> {T("عدد العمال النشطين", "Active workers")}
          </div>
          <div className="text-2xl font-bold mt-1">{workers.length}</div>
        </Card>
        <Card className="card-gradient p-5">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Package className="w-3.5 h-3.5" /> {T("منتجات مُنتجة", "Products produced")}
          </div>
          <div className="text-2xl font-bold mt-1">{topProduced.length}</div>
        </Card>
        <Card className="card-gradient p-5">
          <div className="text-xs text-muted-foreground">
            {T("متوسط إنتاج العامل", "Avg production per worker")}
          </div>
          <div className="text-2xl font-bold mt-1">
            {workers.length > 0 ? fmt(totalProduced / workers.length) : 0}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="card-gradient p-5">
          <h3 className="font-semibold mb-4">
            {T("أفضل العمال إنتاجًا", "Top producing workers")}
          </h3>
          <ChartFrame
            isLoading={dashQ.isLoading}
            isError={dashQ.isError}
            error={dashQ.error}
            isEmpty={!dashQ.isLoading && workers.length === 0}
            emptyTitle={T("لا بيانات عمال بعد", "No worker data yet")}
            emptyDescription={T(
              "سجّل حركات الإنتاج لتظهر أسماء العمال وأداؤهم.",
              "Record production activity to see worker names and performance.",
            )}
            onRetry={() => dashQ.refetch()}
            height={280}
          >
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={workers} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                  }}
                />
                <Legend />
                <Bar
                  dataKey="produced"
                  name={T("إنتاج", "Production")}
                  fill="hsl(var(--primary))"
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </Card>

        <Card className="card-gradient p-5">
          <h3 className="font-semibold mb-4">
            {T("أكثر المنتجات إنتاجًا", "Most produced products")}
          </h3>
          <ChartFrame
            isLoading={dashQ.isLoading}
            isError={dashQ.isError}
            error={dashQ.error}
            isEmpty={!dashQ.isLoading && topProduced.length === 0}
            emptyTitle={T("لا حركات إنتاج بعد", "No production activity yet")}
            emptyDescription={T(
              "سجّل إنتاج المنتجات من صفحة الإنتاج.",
              "Record product production from the Production page.",
            )}
            onRetry={() => dashQ.refetch()}
            height={280}
          >
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topProduced} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                  }}
                />
                <Bar
                  dataKey="produced"
                  name={T("إنتاج", "Production")}
                  fill="hsl(var(--chart-2, 175 60% 55%))"
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </Card>
      </div>

      <Card className="card-gradient overflow-hidden">
        <div className="p-4 border-b border-border font-semibold">
          {T("تفاصيل العمال", "Worker details")}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-right text-muted-foreground">
              <th className="p-3">{T("العامل", "Worker")}</th>
              <th className="p-3">{T("إجمالي الإنتاج", "Total produced")}</th>
              <th className="p-3">{T("عدد المنتجات", "Product count")}</th>
              <th className="p-3">{T("نصيبه %", "Share %")}</th>
            </tr>
          </thead>
          <tbody>
            {workers.map((w) => (
              <tr key={w.name} className="border-b border-border/50">
                <td className="p-3 font-medium">{w.name}</td>
                <td className="p-3">{fmt(w.produced)}</td>
                <td className="p-3">{w.productCount}</td>
                <td className="p-3">
                  {totalProduced > 0 ? ((w.produced / totalProduced) * 100).toFixed(1) : 0}%
                </td>
              </tr>
            ))}
            {workers.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-muted-foreground">
                  {T("لا بيانات.", "No data.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="card-gradient overflow-hidden">
        <div className="p-4 border-b border-border font-semibold">
          {T("أكثر المنتجات إنتاجًا", "Most produced products")}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-right text-muted-foreground">
              <th className="p-3">{T("المنتج", "Product")}</th>
              <th className="p-3">{T("إنتاج", "Produced")}</th>
              <th className="p-3">{T("مباع", "Sold")}</th>
              <th className="p-3">{T("مرتجع", "Returned")}</th>
              <th className="p-3">{T("المخزون", "Stock")}</th>
            </tr>
          </thead>
          <tbody>
            {topProduced.map((p) => (
              <tr key={p.id} className="border-b border-border/50">
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3">
                  <Badge>{fmt(p.produced)}</Badge>
                </td>
                <td className="p-3">{fmt(p.sold)}</td>
                <td className="p-3 text-amber-500">{fmt(p.returned)}</td>
                <td className="p-3">{fmt(p.stock)}</td>
              </tr>
            ))}
            {topProduced.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  {T("لا منتجات مُنتجة بعد.", "No products produced yet.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
