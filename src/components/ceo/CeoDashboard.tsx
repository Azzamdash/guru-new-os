import { useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { queryPresets } from "@/lib/query-presets";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Banknote,
  TrendingUp,
  Package,
  Users,
  Landmark,
  Boxes,
  Truck,
  ShoppingCart,
  Wallet,
  AlertTriangle,
  Building2,
  Target,
  Gauge,
} from "lucide-react";

import { usePersistedPeriod } from "@/lib/global-period";
import { useLang } from "@/lib/i18n";
import { PeriodFilter, resolvePeriod } from "@/components/PeriodFilter";
import { getInternalDashboard } from "@/lib/internal.functions";
import { getIncomeStatement } from "@/lib/financials.functions";
import { getValuationReport, getAssetsSummary } from "@/lib/assets.functions";
import { getCashSummary } from "@/lib/internal.functions";
import { getReceivablesAging } from "@/lib/receivables.functions";
import { getCustomersSummary } from "@/lib/customers.functions";
import { getCollectedFromCouriers } from "@/lib/reconciliation.functions";
import { calculateHealthScore } from "@/lib/health-score.shared";

import { SectionCard } from "./SectionCard";
import { KpiTile } from "./KpiTile";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const nfCompact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const nfPct = (v: number) => `${(v * 100).toFixed(1)}%`;
const egp = (v: number) => `${nfCompact.format(v)} EGP`;
const egpFull = (v: number) => `${nf0.format(Math.round(v))} EGP`;

const MONTHS_AR = [
  "ينا",
  "فبر",
  "مار",
  "أبر",
  "ماي",
  "يون",
  "يول",
  "أغس",
  "سبت",
  "أكت",
  "نوف",
  "ديس",
];

const MONTHS_EN = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function CeoDashboard() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [period, setPeriod] = usePersistedPeriod("ceo-dashboard");
  const resolved = useMemo(() => resolvePeriod(period), [period]);
  const year = resolved.year;
  const from = resolved.dateFrom ?? `${year}-01-01`;
  const to = resolved.dateTo ?? `${year}-12-31`;

  const getDash = useServerFn(getInternalDashboard);
  const getIS = useServerFn(getIncomeStatement);
  const getVal = useServerFn(getValuationReport);
  const getAssets = useServerFn(getAssetsSummary);
  const getCash = useServerFn(getCashSummary);
  const getAging = useServerFn(getReceivablesAging);
  const getCust = useServerFn(getCustomersSummary);
  const getCollected = useServerFn(getCollectedFromCouriers);

  const periodKey = [resolved.periodType ?? "year", resolved.dateFrom, resolved.dateTo, year].join(
    "|",
  );

  // Tier 1 — period KPIs. These block the first meaningful paint, so they run
  // immediately and in parallel.
  const dashQ = useQuery({
    queryKey: ["ceo-dash", periodKey],
    queryFn: () =>
      getDash({
        data: {
          year,
          periodType: resolved.periodType,
          dateFrom: resolved.dateFrom,
          dateTo: resolved.dateTo,
        },
      }),
    placeholderData: keepPreviousData,
    ...queryPresets.report,
  });
  const isQ = useQuery({
    queryKey: ["ceo-is", from, to],
    queryFn: () => getIS({ data: { from, to } }),
    placeholderData: keepPreviousData,
    ...queryPresets.report,
  });

  // Tier 2 — heavy, period-independent reports. Deferred until the KPI tier has
  // settled so the dashboard is interactive instead of waiting on 7 parallel
  // aggregate queries. Cached far longer since they barely change.
  const tier1Settled = !dashQ.isLoading && !isQ.isLoading;
  const cashQ = useQuery({
    queryKey: ["ceo-cash", from, to],
    queryFn: () => getCash({ data: { from, to } }),
    enabled: tier1Settled,
    placeholderData: keepPreviousData,
    ...queryPresets.report,
  });
  const valQ = useQuery({
    queryKey: ["ceo-valuation"],
    queryFn: () => getVal(),
    enabled: tier1Settled,
    ...queryPresets.reference,
  });
  const assetsQ = useQuery({
    queryKey: ["ceo-assets"],
    queryFn: () => getAssets({ data: {} }),
    enabled: tier1Settled,
    ...queryPresets.reference,
  });
  const agingQ = useQuery({
    queryKey: ["ceo-aging"],
    queryFn: () => getAging(),
    enabled: tier1Settled,
    ...queryPresets.reference,
  });
  const custQ = useQuery({
    queryKey: ["ceo-cust"],
    queryFn: () => getCust(),
    enabled: tier1Settled,
    ...queryPresets.reference,
  });
  const collectedQ = useQuery({
    queryKey: ["ceo-collected", from, to],
    queryFn: () => getCollected({ data: { from, to } }),
    enabled: tier1Settled,
    placeholderData: keepPreviousData,
    ...queryPresets.report,
  });

  const dash = dashQ.data;
  const is = isQ.data;
  const valuation = valQ.data;
  const assets = assetsQ.data;
  const cash = cashQ.data;
  const aging = agingQ.data;
  const cust = custQ.data;
  const collected = collectedQ.data;

  // Growth series from internal monthly (12 months of current year)
  const monthly = dash?.monthly ?? [];
  const growthSeries = useMemo(
    () =>
      monthly.map((m, i) => ({
        label: lang === "ar" ? MONTHS_AR[i] : MONTHS_EN[i],
        revenue: Math.round(m.revenue),
        profit: Math.round(m.netProfit),
        orders: m.ordersTotal,
        cogs: Math.round(m.cogs),
        expenses: Math.round(m.expenses),
      })),
    [monthly, lang],
  );

  // Growth deltas (last month vs previous month with data)
  const growthDeltas = useMemo(() => {
    const monthsWithRev = monthly.filter((m) => m.revenue > 0);
    if (monthsWithRev.length < 2) return { revenue: null, profit: null, orders: null };
    const cur = monthsWithRev[monthsWithRev.length - 1];
    const prev = monthsWithRev[monthsWithRev.length - 2];
    const g = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null);
    return {
      revenue: g(cur.revenue, prev.revenue),
      profit: g(cur.netProfit, prev.netProfit),
      orders: g(cur.ordersTotal, prev.ordersTotal),
    };
  }, [monthly]);

  const ordersTotal = dash?.totals.ordersTotal ?? 0;
  const confirmedRate = ordersTotal > 0 ? dash!.totals.ordersConfirmed / ordersTotal : 0;
  const deliveredRate = ordersTotal > 0 ? dash!.totals.ordersDelivered / ordersTotal : 0;
  const returnedRate = ordersTotal > 0 ? dash!.totals.ordersReturned / ordersTotal : 0;
  const healthScore = calculateHealthScore({
    revenue: is?.netRevenue ?? 0,
    netMargin: is?.netMargin ?? 0,
    periodCashNet: cash?.periodNet ?? 0,
    ordersDelivered: dash?.totals.ordersDelivered ?? 0,
    ordersReturned: dash?.totals.ordersReturned ?? 0,
    supplierOverdueCount: dash?.supplierDebt.overdueCount ?? 0,
    lowStockCount: dash?.inventory.lowStock.length ?? 0,
  });
  const healthStatusLabel = {
    healthy: T("صحي", "Healthy"),
    watch: T("يحتاج متابعة", "Needs attention"),
    critical: T("خطر", "Critical"),
    insufficient: T("بيانات غير كافية", "Insufficient data"),
  }[healthScore.status];
  const aov = ordersTotal > 0 ? dash!.totals.revenue / ordersTotal : 0;
  const marketingSpend = dash?.marketing.total ?? 0;
  const marketingRoas = useMemo(() => {
    const rows = dash?.marketing.byPlatform ?? [];
    const spend = rows.reduce((s, r) => s + r.spend, 0);
    const rev = rows.reduce((s, r) => s + r.revenue, 0);
    return spend > 0 ? rev / spend : 0;
  }, [dash]);

  const receivables = aging?.grandTotal ?? 0;
  const payables = dash?.supplierDebt.totalOutstanding ?? 0;
  const cashBalance = cash?.balance ?? 0;
  const assetsNet = assets?.totalNet ?? 0;
  const assetsCost = assets?.totalCost ?? 0;
  const bookValue = assetsNet + cashBalance + receivables - payables;
  const enterpriseVal = valuation?.totals?.valuation ?? 0;

  // Salespeople productivity — proxy: fulfillment prepared per person (data available today)
  const topSales = useMemo(() => (dash?.fulfillment.employees ?? []).slice(0, 5), [dash]);
  // Repeat rate + geo — from customers
  const repeatRate = cust?.repeatRate ?? 0;
  const totalCustomers = cust?.total ?? 0;
  const atRisk = cust?.atRisk ?? 0;
  const topCustomers = cust?.top ?? [];

  const failedQueries = [
    { label: T("مؤشرات الفترة", "Period KPIs"), q: dashQ },
    { label: T("قائمة الدخل", "Income statement"), q: isQ },
    { label: T("التقييم", "Valuation"), q: valQ },
    { label: T("الأصول", "Assets"), q: assetsQ },
    { label: T("الخزنة", "Cash/Treasury"), q: cashQ },
    { label: T("أعمار الديون", "Receivables aging"), q: agingQ },
    { label: T("العملاء", "Customers"), q: custQ },
    { label: T("التحصيل من الشحن", "Courier collections"), q: collectedQ },
  ].filter((x) => x.q.isError);

  return (
    <div className="space-y-6">
      {failedQueries.length > 0 && (
        <div
          role="alert"
          className="rounded-lg border-2 border-destructive/60 bg-destructive/10 p-4 space-y-3"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-destructive">
                {T(
                  "تعذّر تحميل بعض بيانات اللوحة، جرّب تحديث الصفحة",
                  "Some dashboard data failed to load — try refreshing the page",
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {T(
                  `الأقسام المتأثرة: ${failedQueries.map((x) => x.label).join("، ")} — الأرقام الظاهرة فيها غير مكتملة (ليست صفرًا فعليًا).`,
                  `Affected sections: ${failedQueries.map((x) => x.label).join(", ")} — the numbers shown there are incomplete (not actually zero).`,
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {failedQueries.map((x) => (
              <Button
                key={x.label}
                size="sm"
                variant="destructive"
                disabled={x.q.isFetching}
                onClick={() => void x.q.refetch()}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${x.q.isFetching ? "animate-spin" : ""}`} />
                {T(`إعادة المحاولة — ${x.label}`, `Retry — ${x.label}`)}
              </Button>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/60 p-3">
        <span className="text-xs text-muted-foreground me-1">
          {T("فترة لوحة الـCEO", "CEO dashboard period")}
        </span>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>
      {/* A — Financial */}
      <SectionCard title={T("الملخّص المالي", "Financial summary")} subtitle={`${from} → ${to}`}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiTile
            label={T("الإيراد الصافي", "Net revenue")}
            value={egp(is?.netRevenue ?? 0)}
            hint={egpFull(is?.netRevenue ?? 0)}
            icon={<Banknote className="w-4 h-4" />}
          />
          <KpiTile
            label={T("تكلفة البضاعة (COGS)", "Cost of goods (COGS)")}
            value={egp(is?.cogs ?? 0)}
            hint={egpFull(is?.cogs ?? 0)}
            tone="warning"
            icon={<Boxes className="w-4 h-4" />}
          />
          <KpiTile
            label={T("مجمل الربح", "Gross profit")}
            value={egp(is?.grossProfit ?? 0)}
            hint={T(`هامش ${nfPct(is?.grossMargin ?? 0)}`, `Margin ${nfPct(is?.grossMargin ?? 0)}`)}
            icon={<TrendingUp className="w-4 h-4" />}
          />
          <KpiTile
            label={T("المصروفات التشغيلية", "Operating expenses")}
            value={egp(is?.operatingExpensesTotal ?? 0)}
            tone="warning"
            icon={<Wallet className="w-4 h-4" />}
          />
          <KpiTile
            label={T("صافي الربح", "Net profit")}
            value={egp(is?.netProfit ?? 0)}
            tone={(is?.netProfit ?? 0) >= 0 ? "positive" : "negative"}
            icon={<Target className="w-4 h-4" />}
          />
          <KpiTile
            label={T("هامش الصافي", "Net margin")}
            value={nfPct(is?.netMargin ?? 0)}
            tone={(is?.netMargin ?? 0) >= 0.05 ? "positive" : "warning"}
          />
          <KpiTile
            label={T("الخصومات", "Discounts")}
            value={egp(is?.discounts ?? 0)}
            hint={egpFull(is?.discounts ?? 0)}
            tone="warning"
            icon={<Wallet className="w-4 h-4" />}
          />
          <KpiTile
            label={T("متوقع تحصيله", "Expected to collect")}
            value={egp(is?.projectedNetRevenue ?? 0)}
            hint={T("أوردرات لسه ما اتسلمتش", "Orders not yet delivered")}
            icon={<Banknote className="w-4 h-4" />}
          />
          <KpiTile
            label={T("إيراد التحصيل", "Collection revenue")}
            value={egp(collected?.total ?? 0)}
            hint={T("اللي اتحصّل فعليًا من شركات الشحن", "Actually collected from couriers")}
            tone="positive"
            icon={<Wallet className="w-4 h-4" />}
          />
        </div>
        <div className="mt-3 max-w-sm">
          <KpiTile
            label={T("صحة النشاط", "Business health")}
            value={healthScore.status === "insufficient" ? "—" : `${healthScore.score}/100`}
            hint={T(
              `${healthStatusLabel} · اكتمال البيانات ${healthScore.coverage}%`,
              `${healthStatusLabel} · Data coverage ${healthScore.coverage}%`,
            )}
            tone={
              healthScore.status === "healthy"
                ? "positive"
                : healthScore.status === "critical"
                  ? "negative"
                  : healthScore.status === "watch"
                    ? "warning"
                    : "default"
            }
            icon={<Gauge className="w-4 h-4" />}
          />
        </div>
        {is && is.operatingExpenses.length > 0 && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {is.operatingExpenses.slice(0, 6).map((e) => {
              const pct = is.operatingExpensesTotal > 0 ? e.amount / is.operatingExpensesTotal : 0;
              return (
                <div
                  key={e.name}
                  className="rounded-xl border border-border/60 bg-background/40 p-3"
                >
                  <div className="text-xs text-muted-foreground truncate">{e.name}</div>
                  <div className="font-bold">{egp(e.amount)}</div>
                  <div className="text-xs text-muted-foreground">
                    {T(`${nfPct(pct)} من المصروفات`, `${nfPct(pct)} of expenses`)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {isQ.isLoading && <Skeleton className="h-16 w-full" />}
      </SectionCard>

      {/* B — Operations */}
      <SectionCard
        title={T("العمليات", "Operations")}
        subtitle={T("الاوردرات وحالتها خلال الفترة", "Orders and their status during the period")}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiTile
            label={T("إجمالي الاوردرات", "Total orders")}
            value={nf0.format(ordersTotal)}
            icon={<ShoppingCart className="w-4 h-4" />}
          />
          <KpiTile
            label={T("نسبة التأكيد", "Confirmation rate")}
            value={nfPct(confirmedRate)}
            hint={nf0.format(dash?.totals.ordersConfirmed ?? 0)}
            tone={confirmedRate >= 0.7 ? "positive" : "warning"}
          />
          <KpiTile
            label={T("نسبة التسليم", "Delivery rate")}
            value={nfPct(deliveredRate)}
            hint={nf0.format(dash?.totals.ordersDelivered ?? 0)}
            tone={deliveredRate >= 0.6 ? "positive" : "warning"}
          />
          <KpiTile
            label={T("نسبة الارتجاع", "Return rate")}
            value={nfPct(returnedRate)}
            hint={nf0.format(dash?.totals.ordersReturned ?? 0)}
            tone={returnedRate <= 0.1 ? "positive" : "negative"}
          />
          <KpiTile
            label={T("متوسط قيمة الاوردر (AOV)", "Average order value (AOV)")}
            value={egp(aov)}
            icon={<Truck className="w-4 h-4" />}
          />
          <KpiTile
            label={T("مُحضَّر (Fulfillment)", "Prepared (Fulfillment)")}
            value={nf0.format(dash?.fulfillment.totalPrepared ?? 0)}
            hint={T(
              `${dash?.fulfillment.employees.length ?? 0} موظف`,
              `${dash?.fulfillment.employees.length ?? 0} employees`,
            )}
          />
        </div>
      </SectionCard>

      {/* C — Valuation */}
      <SectionCard
        title={T("التقييم والقيمة الدفترية", "Valuation & book value")}
        subtitle={T("الأصول + النقد + المديونيات", "Assets + cash + debts")}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiTile
            label={T("الأصول (التكلفة)", "Assets (cost)")}
            value={egp(assetsCost)}
            icon={<Building2 className="w-4 h-4" />}
          />
          <KpiTile
            label={T("الأصول (القيمة الدفترية)", "Assets (book value)")}
            value={egp(assetsNet)}
            hint={T("بعد الإهلاك", "After depreciation")}
          />
          <KpiTile
            label={T("النقدية في الخزنة", "Cash in treasury")}
            value={egp(cashBalance)}
            tone={cashBalance >= 0 ? "positive" : "negative"}
            icon={<Wallet className="w-4 h-4" />}
          />
          <KpiTile
            label={T("مستحقات على العملاء", "Customer receivables")}
            value={egp(receivables)}
            hint={T(
              `${aging?.byCustomer.length ?? 0} عميل`,
              `${aging?.byCustomer.length ?? 0} customers`,
            )}
          />
          <KpiTile
            label={T("مديونيات الموردين", "Supplier debts")}
            value={egp(payables)}
            tone={payables > 0 ? "warning" : "default"}
            hint={T(
              `${dash?.supplierDebt.overdueCount ?? 0} متأخرة`,
              `${dash?.supplierDebt.overdueCount ?? 0} overdue`,
            )}
          />
          <KpiTile
            label={T("القيمة الدفترية (Equity)", "Book value (Equity)")}
            value={egp(bookValue)}
            tone={bookValue >= 0 ? "positive" : "negative"}
            icon={<Landmark className="w-4 h-4" />}
          />
        </div>
        <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">
              {T(
                "تقييم الشركة التقديري (إيراد آخر ١٢ شهر × 1.5 + صافي الأصول)",
                "Estimated company valuation (last 12 months' revenue × 1.5 + net assets)",
              )}
            </div>
            <div className="text-2xl font-black text-primary">{egpFull(enterpriseVal)}</div>
          </div>
          <div className="text-xs text-muted-foreground max-w-xs">
            {T(
              "تقييم إرشادي، وليس تقييمًا اكتواريًا. للتفاصيل حسب البراند: تقرير التقييم في المستثمرين.",
              "An indicative estimate, not an actuarial valuation. For a per-brand breakdown, see the valuation report under Investors.",
            )}
          </div>
        </div>
      </SectionCard>

      {/* D — Growth */}
      <SectionCard
        title={T("النمو", "Growth")}
        subtitle={T(
          "الاتجاه الشهري خلال السنة والمعدل الشهري",
          "Monthly trend across the year and month-over-month rate",
        )}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <KpiTile
            label={T("نمو الإيراد الشهري", "Monthly revenue growth")}
            value={growthDeltas.revenue == null ? "—" : `${growthDeltas.revenue.toFixed(1)}%`}
            tone={(growthDeltas.revenue ?? 0) >= 0 ? "positive" : "negative"}
            delta={growthDeltas.revenue}
            deltaSuffix="pt"
          />
          <KpiTile
            label={T("نمو صافي الربح", "Net profit growth")}
            value={growthDeltas.profit == null ? "—" : `${growthDeltas.profit.toFixed(1)}%`}
            tone={(growthDeltas.profit ?? 0) >= 0 ? "positive" : "negative"}
            delta={growthDeltas.profit}
            deltaSuffix="pt"
          />
          <KpiTile
            label={T("نمو عدد الاوردرات", "Order count growth")}
            value={growthDeltas.orders == null ? "—" : `${growthDeltas.orders.toFixed(1)}%`}
            tone={(growthDeltas.orders ?? 0) >= 0 ? "positive" : "negative"}
            delta={growthDeltas.orders}
            deltaSuffix="pt"
          />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64 rounded-xl border border-border/60 p-3">
            <div className="text-xs text-muted-foreground mb-2">
              {T("الإيراد مقابل التكلفة والمصروفات", "Revenue vs. cost and expenses")}
            </div>
            <ResponsiveContainer width="100%" height="90%">
              <AreaChart data={growthSeries}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => nfCompact.format(v as number)}
                />
                <Tooltip formatter={(v: number) => egpFull(v)} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="hsl(var(--primary))"
                  fill="url(#rev)"
                  name={T("الإيراد", "Revenue")}
                />
                <Line
                  type="monotone"
                  dataKey="cogs"
                  stroke="hsl(var(--destructive))"
                  name="COGS"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="expenses"
                  stroke="hsl(var(--muted-foreground))"
                  name={T("مصروفات", "Expenses")}
                  dot={false}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="h-64 rounded-xl border border-border/60 p-3">
            <div className="text-xs text-muted-foreground mb-2">
              {T("صافي الربح والاوردرات", "Net profit and orders")}
            </div>
            <ResponsiveContainer width="100%" height="90%">
              <BarChart data={growthSeries}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis
                  yAxisId="l"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => nfCompact.format(v as number)}
                />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar
                  yAxisId="l"
                  dataKey="profit"
                  fill="hsl(var(--primary))"
                  name={T("صافي الربح", "Net profit")}
                  radius={[6, 6, 0, 0]}
                />
                <Line
                  yAxisId="r"
                  type="monotone"
                  dataKey="orders"
                  stroke="hsl(var(--destructive))"
                  name={T("اوردرات", "Orders")}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </SectionCard>

      {/* E — Analytics */}
      <SectionCard
        title={T("تحليلات", "Analytics")}
        subtitle={T("موردين، تسويق، عمال وبائعين", "Suppliers, marketing, workers and salespeople")}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Supplier debts */}
          <div className="rounded-xl border border-border/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold">{T("أعلى مديونيات الموردين", "Top supplier debts")}</div>
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
            <div className="space-y-2">
              {(dash?.supplierDebt.topSuppliers ?? []).slice(0, 5).map((s) => (
                <div key={s.name} className="flex items-center justify-between text-sm">
                  <div className="truncate">{s.name}</div>
                  <div className="font-mono font-bold shrink-0">{egp(s.outstanding)}</div>
                </div>
              ))}
              {(!dash || dash.supplierDebt.topSuppliers.length === 0) && (
                <div className="text-xs text-muted-foreground">
                  {T("لا توجد مديونيات مفتوحة.", "No open debts.")}
                </div>
              )}
            </div>
          </div>

          {/* Marketing */}
          <div className="rounded-xl border border-border/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold">
                {T("التسويق (Spend vs Revenue)", "Marketing (Spend vs Revenue)")}
              </div>
              <div className="text-xs text-muted-foreground">
                {T(
                  `ROAS إجمالي ${marketingRoas.toFixed(2)}×`,
                  `Overall ROAS ${marketingRoas.toFixed(2)}×`,
                )}
              </div>
            </div>
            <div className="space-y-2">
              {(dash?.marketing.byPlatform ?? []).slice(0, 6).map((m) => (
                <div
                  key={m.platform}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 text-sm items-center"
                >
                  <div className="truncate capitalize">{m.platform}</div>
                  <div className="font-mono text-muted-foreground shrink-0">{egp(m.spend)}</div>
                  <div
                    className={`font-mono font-bold shrink-0 ${m.roi >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
                  >
                    ROI {(m.roi * 100).toFixed(0)}%
                  </div>
                </div>
              ))}
              {(!dash || dash.marketing.byPlatform.length === 0) && (
                <div className="text-xs text-muted-foreground">
                  {T("لا توجد مصروفات تسويق مسجّلة.", "No marketing spend recorded.")}
                </div>
              )}
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              {T(
                `إجمالي الإنفاق: ${egpFull(marketingSpend)}`,
                `Total spend: ${egpFull(marketingSpend)}`,
              )}
            </div>
          </div>

          {/* Top workers */}
          <div className="rounded-xl border border-border/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold">{T("إنتاجية العمال", "Worker productivity")}</div>
              <Package className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              {(dash?.workers ?? []).slice(0, 5).map((w) => (
                <div key={w.name} className="flex items-center justify-between text-sm">
                  <div className="truncate">{w.name}</div>
                  <div className="font-mono shrink-0">
                    {T(
                      `${nf0.format(w.produced)} قطعة · ${w.productCount} منتج`,
                      `${nf0.format(w.produced)} pcs · ${w.productCount} products`,
                    )}
                  </div>
                </div>
              ))}
              {(!dash || dash.workers.length === 0) && (
                <div className="text-xs text-muted-foreground">
                  {T(
                    "لا توجد بيانات إنتاج خلال هذه الفترة.",
                    "No production data for this period.",
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Salespeople / fulfillment */}
          <div className="rounded-xl border border-border/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold">
                {T("إنتاجية البائعين / التحضير", "Salespeople / fulfillment productivity")}
              </div>
              <Users className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              {topSales.map((e) => (
                <div
                  key={e.name}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-sm items-center"
                >
                  <div className="truncate">{e.name}</div>
                  <div className="font-mono shrink-0">
                    {T(
                      `${nf0.format(e.prepared)} اوردر · ${e.avgPerDay.toFixed(1)}/يوم`,
                      `${nf0.format(e.prepared)} orders · ${e.avgPerDay.toFixed(1)}/day`,
                    )}
                  </div>
                </div>
              ))}
              {topSales.length === 0 && (
                <div className="text-xs text-muted-foreground">
                  {T(
                    "لا توجد بيانات تحضير خلال هذه الفترة.",
                    "No fulfillment data for this period.",
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Receivables aging + reorder */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border/60 p-4">
            <div className="font-bold mb-3">
              {T("مستحقات على العملاء (Aging)", "Customer receivables (Aging)")}
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              {(["b0_30", "b31_60", "b61_90", "b90_plus"] as const).map((b) => {
                const val = aging?.totals[b] ?? 0;
                const labels: Record<string, string> = {
                  b0_30: "0-30",
                  b31_60: "31-60",
                  b61_90: "61-90",
                  b90_plus: "+90",
                };
                return (
                  <div key={b} className="rounded-lg bg-muted/30 p-2">
                    <div className="text-[10px] text-muted-foreground">
                      {T(`${labels[b]} يوم`, `${labels[b]} days`)}
                    </div>
                    <div className="text-sm font-bold">{egp(val)}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-xl border border-border/60 p-4">
            <div className="font-bold mb-3">
              {T("إعادة الطلب / نقص المخزون", "Reorder / low stock")}
            </div>
            <div className="space-y-2">
              {(dash?.inventory.lowStock ?? []).slice(0, 5).map((p) => (
                <div
                  key={p.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-sm items-center"
                >
                  <div className="truncate">{p.name}</div>
                  <div
                    className={`font-mono shrink-0 ${p.stock <= 0 ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}
                  >
                    {T(
                      `${nf0.format(p.stock)} / حد ${nf0.format(p.reorderPoint)}`,
                      `${nf0.format(p.stock)} / threshold ${nf0.format(p.reorderPoint)}`,
                    )}
                  </div>
                </div>
              ))}
              {(!dash || dash.inventory.lowStock.length === 0) && (
                <div className="text-xs text-muted-foreground">
                  {T(
                    "لا توجد منتجات تحت حد إعادة الطلب.",
                    "No products under the reorder threshold.",
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* F — Customers */}
      <SectionCard
        title={T("العملاء", "Customers")}
        subtitle={T("القيمة، الاحتفاظ، والأعلى إنفاقًا", "Value, retention, and top spenders")}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <KpiTile
            label={T("إجمالي العملاء", "Total customers")}
            value={nf0.format(totalCustomers)}
            icon={<Users className="w-4 h-4" />}
          />
          <KpiTile
            label={T("متوسط قيمة العميل (LTV)", "Average customer value (LTV)")}
            value={egp(cust?.avgLtv ?? 0)}
          />
          <KpiTile
            label={T("نسبة العملاء المتكررين", "Repeat customer rate")}
            value={nfPct(repeatRate)}
            tone={repeatRate >= 0.2 ? "positive" : "warning"}
          />
          <KpiTile
            label={T("عملاء غير نشطين (90 يوم+)", "Inactive customers (90 days+)")}
            value={nf0.format(atRisk)}
            tone={atRisk > totalCustomers * 0.4 ? "warning" : "default"}
          />
        </div>
        <div className="rounded-xl border border-border/60 p-4">
          <div className="font-bold mb-3">
            {T("أعلى العملاء إنفاقًا", "Top spending customers")}
          </div>
          <div className="space-y-2">
            {topCustomers.map((c) => (
              <div
                key={c.id}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 text-sm items-center"
              >
                <div className="truncate">{c.name}</div>
                <div className="font-mono text-muted-foreground shrink-0">
                  {T(`${nf0.format(c.orders)} اوردر`, `${nf0.format(c.orders)} orders`)}
                </div>
                <div className="font-mono font-bold shrink-0">{egp(c.ltv)}</div>
              </div>
            ))}
            {topCustomers.length === 0 && (
              <div className="text-xs text-muted-foreground">
                {T("لا توجد بيانات عملاء بعد.", "No customer data yet.")}
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {dashQ.isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      )}
    </div>
  );
}
