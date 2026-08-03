import { tr } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { ComposedChart, Line } from "recharts";
import { ShoppingCart, TrendingUp, TrendingDown, ArrowUp, ArrowDown, Minus, Truck, PackageCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { getInternalDashboard, listBrands } from "@/lib/internal.functions";
import { PeriodFilter, defaultPeriod, resolvePeriod, type PeriodValue } from "@/components/PeriodFilter";
import { usePersistedPeriod } from "@/lib/global-period";
import { ReportActions } from "@/components/ReportActions";
import { registerReportOrderCount, orderScopeKey } from "@/lib/salesUnify";
import { useEffect } from "react";

import { ChartFrame } from "@/components/EmptyState";

export const Route = createFileRoute("/_authenticated/_app/reports/sales")({
  head: () => ({ meta: [
    { title: "تقارير الأوردرات — e-GURUS" },
    { name: "description", content: "أداء الأوردرات: الأكثر مبيعًا، والإيراد، ومقارنات شهرية/تراكمية." },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
  component: SalesReports,
});

function fmt(n: number) { return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n); }
const MONTHS = ["ينا","فبر","مار","أبر","ماي","يون","يول","أغس","سبت","أكت","نوف","ديس"];

function SalesReports() {
  const listBrandsFn = useServerFn(listBrands);
  const getDash = useServerFn(getInternalDashboard);
  const [brandId, setBrandId] = useState<string>("all");
  const [period, setPeriod] = usePersistedPeriod("reports.sales");
  const resolved = resolvePeriod(period);

  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listBrandsFn() });
  const dashQ = useQuery({
    queryKey: ["reports-sales", resolved.year, brandId, period.preset, resolved.dateFrom, resolved.dateTo],
    queryFn: () => getDash({ data: {
      year: resolved.year, brandId: brandId === "all" ? null : brandId,
      periodType: resolved.periodType, dateFrom: resolved.dateFrom, dateTo: resolved.dateTo,
    } }),
  });

  const d = dashQ.data;
  const allProducts = d?.inventory.allProducts ?? [];
  const soldProducts = allProducts.filter((p) => p.sold > 0);
  // Money-based enrichment: revenue = sold * sellPrice, returned value = returned * sellPrice
  const withMoney = allProducts.map((p) => ({
    ...p,
    revenue: p.sold * p.sellPrice,
    returnedValue: p.returned * p.sellPrice,
    netRevenue: (p.sold - p.returned) * p.sellPrice,
  }));
  const topSellingQty = [...soldProducts].sort((a, b) => b.sold - a.sold).slice(0, 10);
  const topSellingMoney = [...withMoney].filter((p) => p.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  const leastSelling = [...withMoney].filter((p) => p.sold > 0).sort((a, b) => a.sold - b.sold).slice(0, 10);
  const noSales = withMoney.filter((p) => p.sold === 0 && p.stock > 0).slice(0, 10);
  const totalSold = allProducts.reduce((a, p) => a + p.sold, 0);
  const totalReturned = allProducts.reduce((a, p) => a + p.returned, 0);
  const totalRevenue = withMoney.reduce((a, p) => a + p.revenue, 0);
  const totalReturnedValue = withMoney.reduce((a, p) => a + p.returnedValue, 0);
  const netRevenue = totalRevenue - totalReturnedValue;
  // Unified rule: 1 invoice = 1 order (from dashboard aggregate).
  // Use ordersTotal (every sale invoice counted once) — not ordersDelivered,
  // which represents delivered fulfillment status only.
  const totalOrders = (d?.monthly ?? []).reduce((a, m) => a + (m.ordersTotal ?? 0), 0);
  const totalReturnOrders = (d?.monthly ?? []).reduce((a, m) => a + (m.ordersReturned ?? 0), 0);
  // Runtime audit: cross-check with other reports over same (brand, period).
  useEffect(() => {
    if (!d) return;
    registerReportOrderCount(
      "reports_sales",
      orderScopeKey({ brandId: brandId === "all" ? null : brandId, from: resolved.dateFrom ?? `${resolved.year}-01-01`, to: resolved.dateTo ?? `${resolved.year}-12-31` }),
      totalOrders,
    );
  }, [d, brandId, resolved.dateFrom, resolved.dateTo, resolved.year, totalOrders]);
  const avgOrderValue = totalOrders > 0 ? netRevenue / totalOrders : 0;
  const monthlySales = (d?.monthly ?? []).map((m, i) => ({
    month: MONTHS[i], revenue: m.revenue, orders: m.ordersTotal ?? 0,
  }));
  // Monthly orders comparison + cumulative (YTD)
  let cum = 0;
  const monthlyOrdersCmp = (d?.monthly ?? []).map((m, i) => {
    const orders = m.ordersTotal ?? 0;
    cum += orders;
    return { month: MONTHS[i], orders, cumulative: cum, idx: i };
  });
  const now = new Date();
  const currentMonthIdx = resolved.year === now.getFullYear() ? now.getMonth() : 11;
  const currentMonthOrders = monthlyOrdersCmp[currentMonthIdx]?.orders ?? 0;
  const prevMonthOrders = monthlyOrdersCmp[currentMonthIdx - 1]?.orders ?? 0;
  const momDelta = currentMonthOrders - prevMonthOrders;
  const momPct = prevMonthOrders > 0 ? (momDelta / prevMonthOrders) * 100 : (currentMonthOrders > 0 ? 100 : 0);
  const ytdOrders = monthlyOrdersCmp.slice(0, currentMonthIdx + 1).reduce((a, m) => a + m.orders, 0);
  const returnRate = totalOrders + totalReturnOrders > 0 ? totalReturnOrders / (totalOrders + totalReturnOrders) : 0;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><ShoppingCart className="w-7 h-7 text-primary" /> ت{tr("تقارير الأوردرات")}/h1>
          <p className="text-muted-foreground text-sm mt-1">{tr("كل الأوردرات (شوبي فاي واليدوي) — أعلى وأقل المنتجات، والإيراد، ومقارنة شهرية/تراكمية.")}</p>
          <div className="flex flex-wrap gap-2 mt-3 text-xs">
            <Link to="/reports/fulfillment" className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border hover:bg-muted"><PackageCheck className="w-3.5 h-3.5" /> ت{tr("تقارير الـ Fulfillment")}/Link>
            <Link to="/reports/couriers" className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border hover:bg-muted"><Truck className="w-3.5 h-3.5" /> ت{tr("تقارير شركات الشحن والمناديب")}/Link>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={brandId} onValueChange={setBrandId}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr("كل البراندات")}</SelectItem>
              {(brandsQ.data ?? []).filter((b) => b.active).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <PeriodFilter value={period} onChange={setPeriod} />
          <ReportActions
            filename={`sales-report-${resolved.year}.csv`}
            summaryTitle={tr("تقرير المبيعات")}
            summaryText={`الفترة: ${resolved.dateFrom ?? resolved.year}${resolved.dateTo ? ` → ${resolved.dateTo}` : ""} — صافي الإيراد: ${fmt(netRevenue)}`}
            rows={withMoney as unknown as Array<Record<string, unknown>>}
            columns={[
              { key: "name", label: "المنتج" },
              { key: "sold", label: "مباع (قطع)" },
              { key: "returned", label: "مرتجع" },
              { key: "stock", label: "المخزون" },
              { key: "sellPrice", label: "سعر البيع" },
              { key: "revenue", label: "إجمالي الإيراد" },
              { key: "returnedValue", label: "قيمة المرتجعات" },
              { key: "netRevenue", label: "صافي الإيراد" },
              { key: "produced", label: "إنتاج" },
            ]}
          />
        </div>
      </div>

      {/* Money-based KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="card-gradient p-5 border-primary/30">
          <div className="text-xs text-muted-foreground">{tr("إجمالي الإيراد")}</div>
          <div className="text-2xl font-bold mt-1 text-primary num">{fmt(totalRevenue)}</div>
          <div className="text-[10px] text-muted-foreground mt-1">{tr("قبل خصم المرتجعات")}</div>
        </Card>
        <Card className="card-gradient p-5">
          <div className="text-xs text-muted-foreground">{tr("صافي الإيراد (بعد المرتجعات)")}</div>
          <div className="text-2xl font-bold mt-1 num text-emerald-500">{fmt(netRevenue)}</div>
        </Card>
        <Card className="card-gradient p-5">
          <div className="text-xs text-muted-foreground">{tr("قيمة المرتجعات")}</div>
          <div className="text-2xl font-bold mt-1 text-amber-500 num">{fmt(totalReturnedValue)}</div>
        </Card>
        <Card className="card-gradient p-5">
          <div className="text-xs text-muted-foreground">{tr("متوسط قيمة الأوردر (AOV)")}</div>
          <div className="text-2xl font-bold mt-1 num">{fmt(avgOrderValue)}</div>
        </Card>
      </div>

      {/* Order-based KPIs (1 فاتورة = 1 أوردر) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="card-gradient p-5">
          <div className="text-xs text-muted-foreground">{tr("إجمالي الأوردرات")}</div>
          <div className="text-2xl font-bold mt-1">{fmt(totalOrders)}</div>
          <div className="text-[10px] text-muted-foreground mt-1">{tr("فاتورة/أوردر واحد لكل صف")}</div>
        </Card>
        <Card className="card-gradient p-5">
          <div className="text-xs text-muted-foreground">{tr("مرتجعات (أوردرات)")}</div>
          <div className="text-2xl font-bold mt-1 text-amber-500">{fmt(totalReturnOrders)}</div>
        </Card>
        <Card className="card-gradient p-5">
          <div className="text-xs text-muted-foreground">{tr("نسبة الإرجاع")}</div>
          <div className="text-2xl font-bold mt-1">{(returnRate * 100).toFixed(1)}%</div>
        </Card>
        <Card className="card-gradient p-5">
          <div className="text-xs text-muted-foreground">{tr("إجمالي القطع المُباعة")}</div>
          <div className="text-2xl font-bold mt-1">{fmt(totalSold)}</div>
          <div className="text-[10px] text-muted-foreground mt-1">{tr("مؤشر تشغيل فقط — ليس عدد الأوردرات")}</div>
        </Card>
      </div>

      {/* Orders — monthly & cumulative comparison */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="card-gradient p-5 border-primary/30">
          <div className="text-xs text-muted-foreground">{tr("أوردرات الشهر الحالي")}</div>
          <div className="text-2xl font-bold mt-1 num text-primary">{fmt(currentMonthOrders)}</div>
          <div className="text-[10px] text-muted-foreground mt-1">{MONTHS[currentMonthIdx]} {resolved.year}</div>
        </Card>
        <Card className="card-gradient p-5">
          <div className="text-xs text-muted-foreground">{tr("الشهر السابق")}</div>
          <div className="text-2xl font-bold mt-1 num">{fmt(prevMonthOrders)}</div>
          <div className="text-[10px] text-muted-foreground mt-1">{MONTHS[Math.max(0, currentMonthIdx - 1)]}</div>
        </Card>
        <Card className="card-gradient p-5">
          <div className="text-xs text-muted-foreground">{tr("التغير الشهري (MoM)")}</div>
          <div className={`text-2xl font-bold mt-1 num flex items-center gap-1 ${momDelta > 0 ? "text-emerald-500" : momDelta < 0 ? "text-red-500" : ""}`}>
            {momDelta > 0 ? <ArrowUp className="w-5 h-5" /> : momDelta < 0 ? <ArrowDown className="w-5 h-5" /> : <Minus className="w-5 h-5" />}
            {momPct >= 0 ? "+" : ""}{momPct.toFixed(1)}%
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">{momDelta >= 0 ? "+" : ""}{fmt(momDelta)} أ{tr("أوردر")}/div>
        </Card>
        <Card className="card-gradient p-5">
          <div className="text-xs text-muted-foreground">{tr("التراكمي حتى تاريخه (YTD)")}</div>
          <div className="text-2xl font-bold mt-1 num text-emerald-500">{fmt(ytdOrders)}</div>
          <div className="text-[10px] text-muted-foreground mt-1">{tr("من يناير حتى")} {MONTHS[currentMonthIdx]}</div>
        </Card>
      </div>

      <Card className="card-gradient p-5">
        <h3 className="font-semibold mb-4">{tr("عدد الأوردرات — شهري وتراكمي")}</h3>
        <ChartFrame
          isLoading={dashQ.isLoading}
          isError={dashQ.isError}
          error={dashQ.error}
          isEmpty={!dashQ.isLoading && monthlyOrdersCmp.every((m) => m.orders === 0)}
          emptyTitle={tr("لا أوردرات مسجّلة")}
          emptyDescription={tr("ستظهر المقارنة الشهرية والتراكمية بمجرد تسجيل أوردرات.")}
          onRetry={() => dashQ.refetch()}
          height={280}
        >
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={monthlyOrdersCmp}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
              <Legend />
              <Bar yAxisId="left" dataKey="orders" name={tr("أوردرات الشهر")} fill="hsl(var(--primary))" />
              <Line yAxisId="right" type="monotone" dataKey="cumulative" name={tr("التراكمي (YTD)")} stroke="hsl(var(--chart-2, 175 60% 55%))" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartFrame>
      </Card>


      <Card className="card-gradient p-5">
        <h3 className="font-semibold mb-4">{tr("أداء المبيعات الشهري")}</h3>
        <ChartFrame
          isLoading={dashQ.isLoading}
          isError={dashQ.isError}
          error={dashQ.error}
          isEmpty={!dashQ.isLoading && monthlySales.every((m) => (m.revenue ?? 0) === 0 && (m.orders ?? 0) === 0)}
          emptyTitle={tr("لا مبيعات مسجّلة لهذه الفترة")}
          emptyDescription={tr("ابدأ بإضافة فواتير مبيعات ليظهر الأداء الشهري.")}
          onRetry={() => dashQ.refetch()}
          height={280}
        >
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlySales}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
              <Legend />
              <Bar dataKey="revenue" name={tr("الإيراد")} fill="hsl(var(--primary))" />
              <Bar dataKey="orders" name={tr("الأوردرات")} fill="hsl(var(--chart-2, 175 60% 55%))" />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
      </Card>


      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="card-gradient overflow-hidden">
          <div className="p-4 border-b border-border font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-500" /> ا{tr("الأكثر مبيعًا (بالقطع)")}/div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-right text-muted-foreground">
                <th className="p-3">{tr("المنتج")}</th><th className="p-3">{tr("مباع")}</th><th className="p-3">{tr("سعر")}</th><th className="p-3">{tr("إيراد")}</th>
              </tr></thead>
              <tbody>
                {topSellingQty.map((p) => (
                  <tr key={p.id} className="border-b border-border/50">
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3"><Badge>{fmt(p.sold)}</Badge></td>
                    <td className="p-3 text-muted-foreground num">{fmt(p.sellPrice)}</td>
                    <td className="p-3 num text-emerald-500">{fmt(p.sold * p.sellPrice)}</td>
                  </tr>
                ))}
                {topSellingQty.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">{tr("لا مبيعات بعد.")}</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="card-gradient overflow-hidden">
          <div className="p-4 border-b border-border font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" /> ا{tr("الأكثر مبيعًا (بالفلوس)")}/div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-right text-muted-foreground">
                <th className="p-3">{tr("المنتج")}</th><th className="p-3">{tr("إيراد")}</th><th className="p-3">{tr("قطع")}</th><th className="p-3">{tr("صافي")}</th>
              </tr></thead>
              <tbody>
                {topSellingMoney.map((p) => (
                  <tr key={p.id} className="border-b border-border/50">
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3 num text-primary font-semibold">{fmt(p.revenue)}</td>
                    <td className="p-3">{fmt(p.sold)}</td>
                    <td className="p-3 num text-emerald-500">{fmt(p.netRevenue)}</td>
                  </tr>
                ))}
                {topSellingMoney.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">{tr("لا مبيعات بعد.")}</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="card-gradient overflow-hidden lg:col-span-2">
          <div className="p-4 border-b border-border font-semibold flex items-center gap-2"><TrendingDown className="w-4 h-4 text-amber-500" /> ا{tr("الأقل مبيعًا")}/div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-right text-muted-foreground">
                <th className="p-3">{tr("المنتج")}</th><th className="p-3">{tr("مباع")}</th><th className="p-3">{tr("إيراد")}</th><th className="p-3">{tr("المخزون")}</th>
              </tr></thead>
              <tbody>
                {leastSelling.map((p) => (
                  <tr key={p.id} className="border-b border-border/50">
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3">{fmt(p.sold)}</td>
                    <td className="p-3 num text-muted-foreground">{fmt(p.revenue)}</td>
                    <td className="p-3">{fmt(p.stock)}</td>
                  </tr>
                ))}
                {leastSelling.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">{tr("لا بيانات.")}</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>


      {noSales.length > 0 && (
        <Card className="card-gradient overflow-hidden">
          <div className="p-4 border-b border-border font-semibold text-amber-500">{tr("منتجات في المخزون بلا مبيعات")}</div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-right text-muted-foreground">
              <th className="p-3">{tr("المنتج")}</th><th className="p-3">{tr("المخزون")}</th><th className="p-3">{tr("سعر البيع")}</th>
            </tr></thead>
            <tbody>
              {noSales.map((p) => (
                <tr key={p.id} className="border-b border-border/50">
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3">{fmt(p.stock)}</td>
                  <td className="p-3">{fmt(p.sellPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
