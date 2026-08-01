import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from "recharts";
import { Megaphone, TrendingUp, TrendingDown } from "lucide-react";
import { getInternalDashboard, listBrands, listExpenseEntries } from "@/lib/internal.functions";
import { PeriodFilter, defaultPeriod, resolvePeriod, type PeriodValue } from "@/components/PeriodFilter";
import { usePersistedPeriod } from "@/lib/global-period";
import { ReportActions } from "@/components/ReportActions";
import { pctDelta } from "@/lib/export-utils";
import { ChartFrame } from "@/components/EmptyState";

export const Route = createFileRoute("/_authenticated/_app/reports/marketing")({
  head: () => ({ meta: [
    { title: "تقارير التسويق — e-GURUS" },
    { name: "description", content: "تقارير التسويق حسب البراند والمنصات: ميتا، تيك توك، جوجل، واتساب، SMS." },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
  component: MarketingReports,
});

const PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta (فيسبوك/انستغرام)",
  tiktok: "TikTok",
  google: "Google",
  snapchat: "Snapchat",
  whatsapp: "WhatsApp",
  sms: "SMS",
  influencer: "انفلونسر",
  ugc: "UGC",
  media_production: "Media Production",
  other: "أخرى",
};

const COLORS = ["hsl(175 60% 55%)", "hsl(305 55% 65%)", "hsl(30 70% 60%)", "hsl(200 60% 60%)", "hsl(85 65% 60%)", "hsl(340 60% 60%)", "hsl(45 75% 60%)"];

function fmt(n: number) { return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n); }

function MarketingReports() {
  const listBrandsFn = useServerFn(listBrands);
  const getDash = useServerFn(getInternalDashboard);
  const listExpFn = useServerFn(listExpenseEntries);
  const [brandId, setBrandId] = useState<string>("all");
  const [period, setPeriod] = usePersistedPeriod("reports.marketing");
  const resolved = resolvePeriod(period);
  const year = resolved.year;

  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listBrandsFn() });
  const dashQ = useQuery({
    queryKey: ["reports-mkt", year, brandId, period.preset, resolved.dateFrom, resolved.dateTo],
    queryFn: () => getDash({ data: { year, brandId: brandId === "all" ? null : brandId, periodType: resolved.periodType, dateFrom: resolved.dateFrom, dateTo: resolved.dateTo } }),
  });

  // Cross-brand per-platform matrix
  const brands = brandsQ.data ?? [];
  const allBrandsExpQ = useQuery({
    queryKey: ["mkt-matrix", year, brands.map((b) => b.id).join(",")],
    enabled: brands.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        brands.map((b) =>
          Promise.all(Array.from({ length: 12 }, (_, i) => listExpFn({ data: { brandId: b.id, year, month: i + 1 } }))),
        ),
      );
      return brands.map((b, i) => ({ brand: b, rows: results[i].flat() }));
    },
  });

  const platformByBrand = useMemo(() => {
    const rows: Array<{ brand: string; brandId: string; platform: string; spend: number; revenue: number; roi: number }> = [];
    for (const entry of allBrandsExpQ.data ?? []) {
      const agg = new Map<string, { spend: number; revenue: number }>();
      for (const r of entry.rows) {
        if (!r.platform) continue;
        const cur = agg.get(r.platform) ?? { spend: 0, revenue: 0 };
        cur.spend += Number(r.amount) || 0;
        cur.revenue += Number(r.attributed_revenue) || 0;
        agg.set(r.platform, cur);
      }
      for (const [platform, v] of agg) {
        rows.push({
          brand: entry.brand.name, brandId: entry.brand.id, platform,
          spend: v.spend, revenue: v.revenue,
          roi: v.spend > 0 ? (v.revenue - v.spend) / v.spend : 0,
        });
      }
    }
    return rows;
  }, [allBrandsExpQ.data]);

  const filteredMatrix = brandId === "all" ? platformByBrand : platformByBrand.filter((r) => r.brandId === brandId);

  const platformTotals = useMemo(() => {
    const map = new Map<string, { spend: number; revenue: number }>();
    for (const r of filteredMatrix) {
      const cur = map.get(r.platform) ?? { spend: 0, revenue: 0 };
      cur.spend += r.spend; cur.revenue += r.revenue;
      map.set(r.platform, cur);
    }
    return Array.from(map.entries()).map(([platform, v]) => ({
      platform, label: PLATFORM_LABELS[platform] ?? platform,
      spend: v.spend, revenue: v.revenue,
      roi: v.spend > 0 ? (v.revenue - v.spend) / v.spend : 0,
    })).sort((a, b) => b.spend - a.spend);
  }, [filteredMatrix]);

  const d = dashQ.data;
  const totalSpend = platformTotals.reduce((a, p) => a + p.spend, 0);
  const attributedRevenue = platformTotals.reduce((a, p) => a + p.revenue, 0);
  // Total brand revenue (from monthly/daily/etc entries) — sum across the selected brand(s)
  const brandTotalRevenue = d?.totals?.revenue ?? 0;
  // ROI basis toggle: attributed revenue vs total brand revenue
  const [roiBasis, setRoiBasis] = useState<"attributed" | "brand_total">("brand_total");
  const roiRevenue = roiBasis === "brand_total" ? brandTotalRevenue : attributedRevenue;
  const overallRoi = totalSpend > 0 ? (roiRevenue - totalSpend) / totalSpend : 0;
  const overallRoas = totalSpend > 0 ? roiRevenue / totalSpend : 0;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Megaphone className="w-7 h-7 text-primary" /> تقارير التسويق</h1>
          <p className="text-muted-foreground text-sm mt-1">أداء المنصات الإعلانية لكل براند: ميتا، تيك توك، جوجل، واتساب، SMS.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={brandId} onValueChange={setBrandId}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل البراندات</SelectItem>
              {brands.filter((b) => b.active).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={roiBasis} onValueChange={(v) => setRoiBasis(v as "attributed" | "brand_total")}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="brand_total">ROI/ROAS: إيراد البراند الكلي</SelectItem>
              <SelectItem value="attributed">ROI/ROAS: الإيراد المنسوب</SelectItem>
            </SelectContent>
          </Select>
          <PeriodFilter value={period} onChange={setPeriod} />
          <ReportActions
            filename={`marketing-report-${resolved.year}.csv`}
            summaryTitle="تقرير التسويق"
            summaryText={`الفترة: ${resolved.dateFrom ?? resolved.year}${resolved.dateTo ? ` → ${resolved.dateTo}` : ""}`}
            rows={(brandId === "all" ? filteredMatrix : platformTotals.map((p) => ({ brand: "—", platform: p.platform, spend: p.spend, revenue: p.revenue, roi: p.roi }))) as unknown as Array<Record<string, unknown>>}
            columns={[
              { key: "brand", label: "البراند" },
              { key: "platform", label: "المنصة", fmt: (v) => PLATFORM_LABELS[String(v)] ?? String(v) },
              { key: "spend", label: "الإنفاق" },
              { key: "revenue", label: "الإيراد" },
              { key: "roi", label: "ROI %", fmt: (v) => `${((Number(v)||0) * 100).toFixed(1)}%` },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="card-gradient p-5">
          <div className="text-xs text-muted-foreground">إجمالي إنفاق الماركتنج</div>
          <div className="text-2xl font-bold mt-1">{fmt(totalSpend)} جنيه</div>
        </Card>
        <Card className="card-gradient p-5">
          <div className="text-xs text-muted-foreground">الإيراد المنسوب</div>
          <div className="text-2xl font-bold mt-1">{fmt(attributedRevenue)} جنيه</div>
        </Card>
        <Card className="card-gradient p-5">
          <div className="text-xs text-muted-foreground">إيراد البراند الكلي</div>
          <div className="text-2xl font-bold mt-1">{fmt(brandTotalRevenue)} جنيه</div>
        </Card>
        <Card className="card-gradient p-5">
          <div className="text-xs text-muted-foreground">ROI ({roiBasis === "brand_total" ? "إيراد البراند" : "المنسوب"})</div>
          <div className={`text-2xl font-bold mt-1 flex items-center gap-1 ${overallRoi >= 0 ? "text-emerald-500" : "text-destructive"}`}>
            {overallRoi >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            {(overallRoi * 100).toFixed(1)}%
          </div>
        </Card>
        <Card className="card-gradient p-5">
          <div className="text-xs text-muted-foreground">ROAS ({roiBasis === "brand_total" ? "إيراد البراند" : "المنسوب"})</div>
          <div className="text-2xl font-bold mt-1">{overallRoas.toFixed(2)}x</div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="card-gradient p-5">
          <h3 className="font-semibold mb-4">الإنفاق مقابل الإيراد حسب المنصة</h3>
          <ChartFrame
            isLoading={dashQ.isLoading || allBrandsExpQ.isLoading}
            isError={dashQ.isError || allBrandsExpQ.isError}
            error={dashQ.error || allBrandsExpQ.error}
            isEmpty={!dashQ.isLoading && !allBrandsExpQ.isLoading && platformTotals.length === 0}
            emptyTitle="لا مصروفات تسويقية لهذه الفترة"
            emptyDescription="أضف فاتورة مصروف تسويقي وحدّد المنصة (Meta / TikTok / Google …) ليظهر الرسم."
            onRetry={() => { dashQ.refetch(); allBrandsExpQ.refetch(); }}
            height={280}
          >
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={platformTotals}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Legend />
                <Bar dataKey="spend" name="إنفاق" fill="hsl(var(--destructive))" />
                <Bar dataKey="revenue" name="إيراد" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </Card>
        <Card className="card-gradient p-5">
          <h3 className="font-semibold mb-4">توزيع الإنفاق</h3>
          <ChartFrame
            isLoading={dashQ.isLoading || allBrandsExpQ.isLoading}
            isError={dashQ.isError || allBrandsExpQ.isError}
            error={dashQ.error || allBrandsExpQ.error}
            isEmpty={!dashQ.isLoading && !allBrandsExpQ.isLoading && platformTotals.every((p) => p.spend === 0)}
            emptyTitle="لا يوجد إنفاق لتوزيعه"
            onRetry={() => { dashQ.refetch(); allBrandsExpQ.refetch(); }}
            height={280}
          >
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={platformTotals} dataKey="spend" nameKey="label" innerRadius={60} outerRadius={100}>
                  {platformTotals.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartFrame>
        </Card>
      </div>


      <Card className="card-gradient overflow-hidden">
        <div className="p-4 border-b border-border font-semibold">تفاصيل المنصات {brandId === "all" ? "(كل البراندات)" : ""}</div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-right text-muted-foreground">
            <th className="p-3">المنصة</th>
            <th className="p-3">الإنفاق</th>
            <th className="p-3">الإيراد المنسوب</th>
            <th className="p-3">ROI</th>
            <th className="p-3">ROAS</th>
          </tr></thead>
          <tbody>
            {platformTotals.map((p) => (
              <tr key={p.platform} className="border-b border-border/50">
                <td className="p-3 font-medium">{p.label}</td>
                <td className="p-3">{fmt(p.spend)}</td>
                <td className="p-3">{fmt(p.revenue)}</td>
                <td className={`p-3 font-semibold ${p.roi >= 0 ? "text-emerald-500" : "text-destructive"}`}>{(p.roi * 100).toFixed(1)}%</td>
                <td className="p-3 font-semibold">{p.spend > 0 ? (p.revenue / p.spend).toFixed(2) + "x" : "—"}</td>
              </tr>
            ))}
            {platformTotals.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">لا بيانات تسويقية لهذه الفترة.</td></tr>}
          </tbody>
        </table>
      </Card>

      {brandId === "all" && filteredMatrix.length > 0 && (
        <Card className="card-gradient overflow-hidden">
          <div className="p-4 border-b border-border font-semibold">مصفوفة البراند × المنصة</div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-right text-muted-foreground">
              <th className="p-3">البراند</th><th className="p-3">المنصة</th><th className="p-3">الإنفاق</th><th className="p-3">الإيراد</th><th className="p-3">ROI</th>
            </tr></thead>
            <tbody>
              {filteredMatrix.sort((a, b) => b.spend - a.spend).map((r, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="p-3 font-medium">{r.brand}</td>
                  <td className="p-3"><Badge variant="secondary">{PLATFORM_LABELS[r.platform] ?? r.platform}</Badge></td>
                  <td className="p-3">{fmt(r.spend)}</td>
                  <td className="p-3">{fmt(r.revenue)}</td>
                  <td className={`p-3 font-semibold ${r.roi >= 0 ? "text-emerald-500" : "text-destructive"}`}>{(r.roi * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {d && (dashQ.isLoading || allBrandsExpQ.isLoading) && <p className="text-muted-foreground text-sm">جاري التحميل...</p>}
    </div>
  );
}
