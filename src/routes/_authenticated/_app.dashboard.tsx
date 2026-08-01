import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getMyRole } from "@/lib/admin.functions";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { getInternalDashboard, listBrands } from "@/lib/internal.functions";
import { getAssetsSummary } from "@/lib/assets.functions";
import { listInvestorsPnL } from "@/lib/investors.functions";
import { getCustomersSummary } from "@/lib/customers.functions";
import { getInvoiceCogsSummary } from "@/lib/orders.functions";
import { getBranchesReport } from "@/lib/pos.functions";

import { SupplierDebtAnalytics } from "@/components/SupplierDebtAnalytics";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PeriodFilter,
  defaultPeriod,
  resolvePeriod,
  type PeriodValue,
} from "@/components/PeriodFilter";
import { useGlobalPeriod } from "@/lib/global-period";
import { ReportActions } from "@/components/ReportActions";
import { fmtNum, pctDelta } from "@/lib/export-utils";
import { useLang, monthName } from "@/lib/i18n";
import {
  TrendingUp,
  DollarSign,
  Wallet,
  PiggyBank,
  Receipt,
  CheckCircle2,
  Truck,
  RotateCcw,
  Users,
  Briefcase,
  AlertTriangle,
  FileWarning,
  Megaphone,
  PackageX,
  HardHat,
  ShoppingCart,
  Factory,
  PackageCheck,
  Building2,
  FileSearch,
  PackageSearch,
  Banknote,
  FileText,
  Scale,
  LayoutDashboard,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_app/dashboard")({
  head: () => ({
    meta: [
      { title: "e-Gurus Dashboard" },
      { name: "description", content: "مؤشرات مالية وتشغيلية حية لكل البراندات." },
    ],
  }),
  component: DashboardPage,
});

const CHART_COLORS = [
  "hsl(175 60% 55%)",
  "hsl(85 65% 60%)",
  "hsl(155 55% 55%)",
  "hsl(305 55% 65%)",
  "hsl(30 70% 60%)",
  "hsl(200 60% 60%)",
  "hsl(45 75% 60%)",
  "hsl(340 60% 60%)",
];

function fmt(n: number, opts: { compact?: boolean; percent?: boolean } = {}) {
  if (opts.percent) return `${(n * 100).toFixed(1)}%`;
  return new Intl.NumberFormat("en-US", {
    notation: opts.compact ? "compact" : "standard",
    maximumFractionDigits: opts.compact ? 1 : 0,
  }).format(n);
}

function DashboardPage() {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const roleFn = useServerFn(getMyRole);
  const roleQ = useQuery({ queryKey: ["my-role"], queryFn: () => roleFn() });
  const isPrivileged = !!(roleQ.data?.isAdmin || roleQ.data?.isManager);

  useEffect(() => {
    if (roleQ.data && !isPrivileged) navigate({ to: "/tasks", replace: true });
  }, [roleQ.data, isPrivileged, navigate]);

  const listBrandsFn = useServerFn(listBrands);
  const getDash = useServerFn(getInternalDashboard);
  const global = useGlobalPeriod();
  const [brandId, setBrandId] = useState<string>("all");
  const period = global.period;
  const setPeriod = global.setPeriod;
  const resolved = resolvePeriod(period);
  const year = resolved.year;

  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listBrandsFn() });
  const dashQ = useQuery({
    queryKey: [
      "internal-dashboard",
      year,
      brandId,
      period.preset,
      resolved.dateFrom,
      resolved.dateTo,
    ],
    queryFn: () =>
      getDash({
        data: {
          year,
          brandId: brandId === "all" ? null : brandId,
          periodType: resolved.periodType,
          dateFrom: resolved.dateFrom,
          dateTo: resolved.dateTo,
        },
      }),
  });
  const assetsFn = useServerFn(getAssetsSummary);
  const assetsQ = useQuery({
    queryKey: ["assets-summary", brandId],
    queryFn: () => assetsFn({ data: { brandId: brandId === "all" ? null : brandId } }),
    enabled: isPrivileged,
  });
  const investorsPnlFn = useServerFn(listInvestorsPnL);
  const investorsPnlQ = useQuery({
    queryKey: ["investors-pnl-dash", resolved.dateFrom, resolved.dateTo, resolved.year],
    queryFn: () =>
      investorsPnlFn({
        data: {
          from: resolved.dateFrom ?? `${resolved.year}-01-01`,
          to: resolved.dateTo ?? `${resolved.year}-12-31`,
        },
      }),
    enabled: isPrivileged,
  });
  const customersFn = useServerFn(getCustomersSummary);
  const customersQ = useQuery({
    queryKey: ["customers-summary-dash"],
    queryFn: () => customersFn(),
    enabled: isPrivileged,
  });
  const cogsFn = useServerFn(getInvoiceCogsSummary);
  const cogsQ = useQuery({
    queryKey: ["cogs-summary-dash", brandId, resolved.dateFrom, resolved.dateTo, resolved.year],
    queryFn: () =>
      cogsFn({
        data: {
          brandId: brandId === "all" ? null : brandId,
          from: resolved.dateFrom ?? `${resolved.year}-01-01`,
          to: resolved.dateTo ?? `${resolved.year}-12-31`,
        },
      }),
    enabled: isPrivileged,
  });

  const branchesFn = useServerFn(getBranchesReport);
  const branchesQ = useQuery({
    queryKey: ["branches-report-dash", resolved.dateFrom, resolved.dateTo, resolved.year],
    queryFn: () =>
      branchesFn({
        data: {
          startDate: resolved.dateFrom ?? `${resolved.year}-01-01`,
          endDate: resolved.dateTo ?? `${resolved.year}-12-31`,
        },
      }),
    enabled: isPrivileged,
  });

  if (dashQ.isError) {
    return (
      <div className="p-10 max-w-2xl mx-auto">
        <Card className="p-6 border-destructive/40 bg-destructive/5">
          <div className="flex items-center gap-2 text-destructive font-semibold mb-2">
            <AlertTriangle className="w-5 h-5" /> {t("error_loading")}
          </div>
          <p className="text-sm text-muted-foreground">
            {dashQ.error instanceof Error ? dashQ.error.message : t("unknown_error")}
          </p>
        </Card>
      </div>
    );
  }

  if (!dashQ.data) {
    return <div className="p-10 text-muted-foreground">{t("loading")}</div>;
  }

  const d = dashQ.data;
  const totals = d.totals;
  const scoped = d.scopeBrand;
  const isService = scoped?.type === "service";
  const monthlyChart = d.monthly.map((m) => ({
    month: monthName(lang, m.month),
    revenue: m.revenue,
    netProfit: m.netProfit,
    expenses: m.expenses,
    margin: m.revenue > 0 ? (m.netProfit / m.revenue) * 100 : 0,
  }));
  const branchBar = d.perBrand.map((b) => ({ name: b.name, value: b.revenue }));

  // operational rates
  const confirmRate = totals.ordersTotal > 0 ? totals.ordersConfirmed / totals.ordersTotal : 0;
  const completedOrders = totals.ordersDelivered + totals.ordersReturned;
  const deliveryRate = completedOrders > 0 ? totals.ordersDelivered / completedOrders : 0;
  const returnRate = completedOrders > 0 ? totals.ordersReturned / completedOrders : 0;

  return (
    <div className="relative p-4 md:p-6 space-y-5">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed top-[-10%] right-[-10%] w-72 h-72 rounded-full bg-primary/10 blur-[120px] -z-10" />
      <div className="pointer-events-none fixed bottom-[-5%] left-[-10%] w-72 h-72 rounded-full bg-primary/5 blur-[120px] -z-10" />

      {/* Header — Obsidian Glass */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="w-11 h-11 shrink-0 rounded-2xl bg-gradient-to-br from-primary/25 to-primary/0 border border-primary/30 flex items-center justify-center">
            <LayoutDashboard className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl sm:text-2xl font-extrabold leading-tight">
              {t("dash_title")}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {scoped
                ? `${t("dash_view_of")} ${scoped.name}`
                : `${t("dash_view_of")} ${t("all_brands")}`}{" "}
              · {t("dash_year")} {year}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <Select value={brandId} onValueChange={setBrandId}>
            <SelectTrigger className="min-w-[180px] h-9 rounded-full bg-card/60 backdrop-blur-md border-border/60">
              <SelectValue placeholder={t("brand")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all_brands")}</SelectItem>
              {(brandsQ.data ?? [])
                .filter((b) => b.active)
                .map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} {b.type === "service" ? `· ${t("services")}` : ""}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <PeriodFilter value={period} onChange={setPeriod} />
          <ReportActions
            filename={`dashboard-${resolved.year}.csv`}
            summaryTitle={t("dash_period_summary")}
            summaryText={`${t("dash_period_label")} ${resolved.dateFrom ?? resolved.year}${resolved.dateTo ? ` → ${resolved.dateTo}` : ""}`}
          />
        </div>
      </header>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <QuickLink to="/orders" icon={Receipt} label={t("ql_sale")} />
        <QuickLink to="/purchases" icon={ShoppingCart} label={t("ql_purchase")} />
        <QuickLink to="/expenses" icon={Wallet} label={t("ql_expense")} />
        <QuickLink to="/production" icon={Factory} label={t("ql_production")} />
        <QuickLink to="/fulfillment" icon={PackageCheck} label={t("ql_fulfillment")} />
        <QuickLink to="/tasks" icon={CheckCircle2} label={t("ql_tasks")} />
      </div>

      {/* Quick report links */}
      <Card className="p-4 rounded-3xl border-border/60 bg-card/60 backdrop-blur-xl shadow-2xl shadow-black/10">
        <div className="mb-3 rounded-2xl border border-border/60 bg-gradient-to-r from-primary/15 to-primary/0 px-3 py-2 flex items-center gap-2">
          <span className="w-1.5 h-5 rounded-full bg-primary" />
          <FileText className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold tracking-wide">{t("quick_reports_title")}</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          <QuickLink to="/reports/audit" icon={FileSearch} label={t("qr_audit")} />
          <QuickLink
            to="/reports/inventory-valuation"
            icon={PackageSearch}
            label={t("qr_inventory")}
          />
          <QuickLink to="/reports/cash-flow" icon={Banknote} label={t("qr_cash_flow")} />
          <QuickLink
            to="/reports/income-statement"
            icon={FileText}
            label={t("qr_income_statement")}
          />
          <QuickLink to="/reports/reconciliation" icon={Scale} label={t("qr_reconciliation")} />
        </div>
      </Card>

      {/* Financial KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <Link to="/reports/sales">
          <KpiCard icon={DollarSign} label={t("kpi_revenue")} value={fmt(totals.revenue)} />
        </Link>
        <Link to="/reports/profits">
          <KpiCard
            icon={TrendingUp}
            label={t("kpi_gross_profit")}
            value={fmt(totals.grossProfit)}
            tone={totals.grossProfit >= 0 ? "success" : "destructive"}
            sub={`${t("cogs_cost")}: ${fmt(totals.cogs)}`}
          />
        </Link>
        <Link to="/reports/profits">
          <KpiCard
            icon={PiggyBank}
            label={t("kpi_net_profit")}
            value={fmt(totals.netProfit)}
            tone={totals.netProfit >= 0 ? "success" : "destructive"}
            sub={`${t("kpi_margin")} ${totals.revenue > 0 ? fmt(totals.netProfit / totals.revenue, { percent: true }) : "—"}`}
          />
        </Link>
        <Link to="/expenses">
          <KpiCard
            icon={Receipt}
            label={t("kpi_expenses")}
            value={fmt(totals.expenses)}
            tone="muted"
          />
        </Link>
        <Link to="/treasury">
          <KpiCard
            icon={Wallet}
            label={t("kpi_cash_position")}
            value={fmt(totals.cash)}
            tone={totals.cash >= 0 ? "default" : "destructive"}
          />
        </Link>
      </div>

      {/* (Cash center removed — full detail in /treasury) */}

      {/* COGS/Gross profit merged into top KPIs above */}

      {/* Operational totals */}
      {!isService && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Link to="/orders">
            <KpiCard icon={Receipt} label={t("kpi_orders_total")} value={fmt(totals.ordersTotal)} />
          </Link>
          <Link to="/operations">
            <KpiCard
              icon={CheckCircle2}
              label={t("kpi_confirmed")}
              value={fmt(totals.ordersConfirmed)}
              tone="success"
            />
          </Link>
          <Link to="/reports/fulfillment">
            <KpiCard
              icon={Truck}
              label={t("kpi_delivered")}
              value={fmt(totals.ordersDelivered)}
              tone="success"
            />
          </Link>
          <Link to="/reports/fulfillment">
            <KpiCard
              icon={RotateCcw}
              label={t("kpi_returned")}
              value={fmt(totals.ordersReturned)}
              tone={totals.ordersReturned > 0 ? "destructive" : "muted"}
            />
          </Link>
        </div>
      )}

      {/* Operational KPIs */}
      {!isService && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Link to="/reports/fulfillment">
            <KpiCard
              icon={CheckCircle2}
              label={t("kpi_confirm_rate")}
              value={fmt(confirmRate, { percent: true })}
              sub={`${fmt(totals.ordersConfirmed)} / ${fmt(totals.ordersTotal)}`}
              tone="success"
            />
          </Link>
          <Link to="/reports/fulfillment">
            <KpiCard
              icon={Truck}
              label={t("kpi_delivery_rate")}
              value={fmt(deliveryRate, { percent: true })}
              sub={`${fmt(totals.ordersDelivered)} / ${fmt(completedOrders)}`}
              tone="success"
            />
          </Link>
          <Link to="/reports/fulfillment">
            <KpiCard
              icon={RotateCcw}
              label={t("kpi_return_rate")}
              value={fmt(returnRate, { percent: true })}
              sub={`${fmt(totals.ordersReturned)} / ${fmt(completedOrders)}`}
              tone={returnRate > 0.05 ? "destructive" : "default"}
            />
          </Link>
          <Link to="/suppliers">
            <KpiCard
              icon={FileWarning}
              label={t("kpi_supplier_debt")}
              value={fmt(d.supplierDebt.totalOutstanding, { compact: true })}
              sub={
                d.supplierDebt.overdueCount > 0
                  ? `${d.supplierDebt.overdueCount} ${t("kpi_supplier_overdue")}`
                  : t("kpi_supplier_none")
              }
              tone={d.supplierDebt.overdueCount > 0 ? "destructive" : "muted"}
            />
          </Link>
        </div>
      )}
      {isService && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiCard
            icon={Users}
            label={t("kpi_clients")}
            value={fmt(totals.clients)}
            tone="success"
          />
          <KpiCard
            icon={Briefcase}
            label={t("kpi_projects")}
            value={fmt(totals.projects)}
            tone="success"
          />
          <KpiCard
            icon={DollarSign}
            label={t("kpi_avg_project_revenue")}
            value={fmt(totals.projects > 0 ? totals.revenue / totals.projects : 0, {
              compact: true,
            })}
          />
        </div>
      )}

      {/* Assets summary */}
      {assetsQ.data && assetsQ.data.count > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Link to="/assets">
            <KpiCard
              icon={Building2}
              label={t("kpi_assets")}
              value={fmt(assetsQ.data.count)}
              sub={t("kpi_assets_count")}
            />
          </Link>
          <Link to="/assets">
            <KpiCard
              icon={Building2}
              label={t("kpi_assets_cost")}
              value={fmt(assetsQ.data.totalCost, { compact: true })}
              tone="muted"
            />
          </Link>
          <Link to="/assets">
            <KpiCard
              icon={Building2}
              label={t("kpi_assets_net")}
              value={fmt(assetsQ.data.totalNet, { compact: true })}
              tone="success"
            />
          </Link>
          <Link to="/assets">
            <KpiCard
              icon={Building2}
              label={t("kpi_assets_dep")}
              value={fmt(assetsQ.data.annualDepreciation, { compact: true })}
              tone="destructive"
            />
          </Link>
        </div>
      )}

      {/* Charts row 1 */}
      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard title={t("chart_trend")}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={monthlyChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" />
              <XAxis dataKey="month" fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis
                fontSize={11}
                stroke="hsl(var(--muted-foreground))"
                tickFormatter={(v) => fmt(v, { compact: true })}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="revenue"
                name={t("kpi_revenue")}
                stroke={CHART_COLORS[0]}
                strokeWidth={2.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="netProfit"
                name={t("kpi_net_profit")}
                stroke={CHART_COLORS[2]}
                strokeWidth={2.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="expenses"
                name={t("kpi_expenses")}
                stroke={CHART_COLORS[4]}
                strokeWidth={2}
                dot={false}
                strokeDasharray="4 4"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {!scoped && (
          <ChartCard title={t("chart_brand_revenue")}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={branchBar} margin={{ bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" />
                <XAxis
                  dataKey="name"
                  fontSize={10}
                  angle={-25}
                  textAnchor="end"
                  height={60}
                  interval={0}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  fontSize={11}
                  tickFormatter={(v) => fmt(v, { compact: true })}
                  stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" name={t("kpi_revenue")} radius={[6, 6, 0, 0]}>
                  {branchBar.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {scoped && (
          <ChartCard title={t("chart_monthly_margin")}>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={monthlyChart}>
                <defs>
                  <linearGradient id="mg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS[0]} stopOpacity={0.6} />
                    <stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" />
                <XAxis dataKey="month" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis
                  fontSize={11}
                  stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(v) => `${v.toFixed(0)}%`}
                />
                <Tooltip
                  formatter={(v: number) => `${v.toFixed(1)}%`}
                  contentStyle={tooltipStyle}
                />
                <Area
                  type="monotone"
                  dataKey="margin"
                  name={t("margin_col")}
                  stroke={CHART_COLORS[0]}
                  strokeWidth={2}
                  fill="url(#mg)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      {/* Charts row 2 */}
      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard title={t("chart_expense_split")}>
          {d.expensesByCategory.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
              {t("chart_no_expenses")}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={d.expensesByCategory.slice(0, 6)}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  innerRadius={45}
                  paddingAngle={2}
                >
                  {d.expensesByCategory.slice(0, 6).map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <Card className="p-5 rounded-3xl border-border/60 bg-card/60 backdrop-blur-xl shadow-2xl shadow-black/10">
          <h3 className="font-semibold mb-3">{t("chart_top_cat_per_brand")}</h3>
          {d.perBrand.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("no_data")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-right border-b border-border">
                    <th className="p-2">{t("brand")}</th>
                    <th className="p-2">{t("top_category")}</th>
                    <th className="p-2 text-left">{t("amount")}</th>
                    <th className="p-2 text-left">{t("of_total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.perBrand.map((b) => (
                    <tr key={b.id} className="border-b border-border/50">
                      <td className="p-2 font-medium">{b.name}</td>
                      <td className="p-2">{b.topCategory?.name ?? "—"}</td>
                      <td className="p-2 num text-left">
                        {b.topCategory ? fmt(b.topCategory.amount, { compact: true }) : "—"}
                      </td>
                      <td className="p-2 num text-left">
                        {b.topCategory ? (
                          <Badge variant="secondary">
                            {fmt(b.topCategory.pct, { percent: true })}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Supplier debts analytics */}
      {!isService && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">{t("supplier_debt_analytics")}</h3>
            <a href="/suppliers" className="text-xs text-primary hover:underline">
              {t("manage_suppliers")}
            </a>
          </div>
          <SupplierDebtAnalytics brandFilter={brandId} />
        </div>
      )}

      {/* Investors P&L snapshot */}
      {investorsPnlQ.data &&
        investorsPnlQ.data.rows.length > 0 &&
        (() => {
          const rows = investorsPnlQ.data.rows;
          // aggregate per investor
          const m = new Map<string, { name: string; profit: number; brands: number }>();
          for (const r of rows) {
            const c = m.get(r.investor_id) ?? { name: r.investor_name, profit: 0, brands: 0 };
            c.profit += r.investor_profit;
            c.brands += 1;
            m.set(r.investor_id, c);
          }
          const list = Array.from(m.values()).sort((a, b) => b.profit - a.profit);
          const totalProfit = list.reduce((s, r) => s + r.profit, 0);
          return (
            <Card className="p-5 rounded-3xl border-border/60 bg-card/60 backdrop-blur-xl shadow-2xl shadow-black/10">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-semibold">{t("investors_share_title")}</h3>
                  <p className="text-xs text-muted-foreground">
                    {t("investors_total_share")}{" "}
                    <span
                      className={`num font-semibold ${totalProfit >= 0 ? "text-success" : "text-destructive"}`}
                    >
                      {fmt(totalProfit, { compact: true })}
                    </span>
                  </p>
                </div>
                <a href="/reports/investors-audit" className="text-xs text-primary hover:underline">
                  {t("full_report")}
                </a>
              </div>
              <div className="space-y-2">
                {list.slice(0, 6).map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">
                        {i + 1}
                      </span>
                      <div>
                        <div className="font-medium">{r.name || "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.brands} {t("brand_count")}
                        </div>
                      </div>
                    </div>
                    <Badge variant={r.profit >= 0 ? "default" : "destructive"} className="num">
                      {fmt(r.profit, { compact: true })}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          );
        })()}

      {/* Marketing ROI */}
      {d.marketing.byPlatform.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-4">
          <ChartCard title={t("marketing_by_platform")}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={d.marketing.byPlatform}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" />
                <XAxis dataKey="platform" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis
                  fontSize={11}
                  tickFormatter={(v) => fmt(v, { compact: true })}
                  stroke="hsl(var(--muted-foreground))"
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="spend"
                  name={t("marketing_spend")}
                  fill={CHART_COLORS[4]}
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="revenue"
                  name={t("marketing_attr_revenue")}
                  fill={CHART_COLORS[0]}
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <Card className="p-5 rounded-3xl border-border/60 bg-card/60 backdrop-blur-xl shadow-2xl shadow-black/10">
            <div className="flex items-center gap-2 mb-3">
              <Megaphone className="w-4 h-4 text-primary" />
              <h3 className="font-semibold">{t("marketing_channel_roi")}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-right border-b border-border">
                    <th className="p-2">{t("platform")}</th>
                    <th className="p-2 text-left">{t("marketing_spend")}</th>
                    <th className="p-2 text-left">{t("revenue")}</th>
                    <th className="p-2 text-left">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {d.marketing.byPlatform.map((p) => {
                    const roi = p.spend > 0 ? (p.revenue - p.spend) / p.spend : 0;
                    return (
                      <tr key={p.platform} className="border-b border-border/50">
                        <td className="p-2 font-medium">{p.platform}</td>
                        <td className="p-2 num text-left">{fmt(p.spend, { compact: true })}</td>
                        <td className="p-2 num text-left">{fmt(p.revenue, { compact: true })}</td>
                        <td className="p-2 num text-left">
                          <Badge
                            variant={roi >= 1 ? "default" : roi >= 0 ? "secondary" : "destructive"}
                          >
                            {fmt(roi, { percent: true })}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Low stock alerts + Workers */}
      {!isService && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="p-5 rounded-3xl border-border/60 bg-card/60 backdrop-blur-xl shadow-2xl shadow-black/10">
            <div className="flex items-center gap-2 mb-3">
              <PackageX className="w-4 h-4 text-destructive" />
              <h3 className="font-semibold">{t("low_stock_alerts")}</h3>
            </div>
            {d.inventory.lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("low_stock_none")}</p>
            ) : (
              <div className="space-y-2">
                {d.inventory.lowStock.slice(0, 8).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                  >
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {t("reorder_threshold")} {fmt(p.reorderPoint)} {p.unit}
                      </div>
                    </div>
                    <Badge variant="destructive">
                      {t("remaining")} {fmt(p.stock)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="p-5 rounded-3xl border-border/60 bg-card/60 backdrop-blur-xl shadow-2xl shadow-black/10">
            <div className="flex items-center gap-2 mb-3">
              <HardHat className="w-4 h-4 text-primary" />
              <h3 className="font-semibold">{t("top_workers")}</h3>
            </div>
            {d.workers.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("no_worker_output")}</p>
            ) : (
              <div className="space-y-2">
                {d.workers.map((w, i) => (
                  <div
                    key={w.name}
                    className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">
                        {i + 1}
                      </span>
                      <div>
                        <div className="font-medium">{w.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {w.productCount} {t("products_short")}
                        </div>
                      </div>
                    </div>
                    <span className="num font-semibold">{fmt(w.produced)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Brand details */}
      {!scoped && d.perBrand.length > 0 && (
        <>
          {customersQ.data && customersQ.data.total > 0 && (
            <Card className="rounded-3xl border-border/60 bg-card/60 backdrop-blur-xl shadow-2xl shadow-black/10 overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold">{t("customers_overview")}</h3>
                </div>
                <Link to="/customers" className="text-xs text-primary hover:underline">
                  {t("full_report")}
                </Link>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4">
                <MiniStat
                  label={lang === "ar" ? "عدد العملاء" : "Customers"}
                  value={fmt(customersQ.data.total)}
                />
                <MiniStat
                  label={lang === "ar" ? "متوسط LTV" : "Avg LTV"}
                  value={fmt(customersQ.data.avgLtv, { compact: true })}
                />
                <MiniStat
                  label={lang === "ar" ? "معدل التكرار" : "Repeat rate"}
                  value={fmt(customersQ.data.repeatRate, { percent: true })}
                />
                <MiniStat
                  label={lang === "ar" ? "معرضون للفقد" : "At risk"}
                  value={fmt(customersQ.data.atRisk)}
                  tone={customersQ.data.atRisk > 0 ? "danger" : undefined}
                />
              </div>
              {customersQ.data.top.length > 0 && (
                <div className="border-t border-border">
                  <div className="p-3 text-xs text-muted-foreground">
                    {lang === "ar" ? "أعلى العملاء إنفاقًا" : "Top customers by spend"}
                  </div>
                  <div className="divide-y divide-border/50">
                    {customersQ.data.top.map((c, i) => (
                      <Link
                        key={c.id}
                        to="/customers/$id"
                        params={{ id: c.id }}
                        className="flex items-center justify-between px-4 py-2 hover:bg-muted/40"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">
                            {i + 1}
                          </span>
                          <span className="font-medium text-sm">{c.name}</span>
                          <span className="text-xs text-muted-foreground">
                            · {c.orders} {lang === "ar" ? "طلب" : "orders"}
                          </span>
                        </div>
                        <span className="num font-semibold text-sm">
                          {fmt(c.ltv, { compact: true })}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
          {branchesQ.data &&
            (branchesQ.data.branches.length > 0 || branchesQ.data.topSellers.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="rounded-3xl border-border/60 bg-card/60 backdrop-blur-xl shadow-2xl shadow-black/10 overflow-hidden">
                  <div className="p-4 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-primary" />
                      <h3 className="font-semibold">
                        {lang === "ar"
                          ? "أعلى الفروع الأوفلاين — مبيعًا وأرباحًا"
                          : "Top offline branches — sales & profit"}
                      </h3>
                    </div>
                    <Link to="/reports/branches" className="text-xs text-primary hover:underline">
                      {t("full_report")}
                    </Link>
                  </div>
                  <div className="divide-y divide-border/50">
                    {branchesQ.data.branches.slice(0, 5).map((b, i) => (
                      <div key={b.id} className="flex items-center justify-between px-4 py-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold shrink-0">
                            {i + 1}
                          </span>
                          <span className="font-medium text-sm truncate">{b.name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-muted-foreground">
                            {lang === "ar" ? "مبيعات" : "Sales"}:{" "}
                            <span className="num font-semibold text-foreground">
                              {fmt(b.revenue, { compact: true })}
                            </span>
                          </span>
                          <span
                            className={`num font-semibold ${b.profit >= 0 ? "text-success" : "text-destructive"}`}
                          >
                            {lang === "ar" ? "ربح" : "Profit"}: {fmt(b.profit, { compact: true })}
                          </span>
                        </div>
                      </div>
                    ))}
                    {branchesQ.data.branches.length === 0 && (
                      <div className="p-4 text-center text-xs text-muted-foreground">
                        {lang === "ar" ? "لا فروع أوفلاين نشطة." : "No active offline branches."}
                      </div>
                    )}
                  </div>
                </Card>
                <Card className="rounded-3xl border-border/60 bg-card/60 backdrop-blur-xl shadow-2xl shadow-black/10 overflow-hidden">
                  <div className="p-4 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary" />
                      <h3 className="font-semibold">
                        {lang === "ar" ? "أعلى مندوبي المبيعات" : "Top salesmen"}
                      </h3>
                    </div>
                    <Link to="/reports/branches" className="text-xs text-primary hover:underline">
                      {t("full_report")}
                    </Link>
                  </div>
                  <div className="divide-y divide-border/50">
                    {branchesQ.data.topSellers.slice(0, 5).map((s, i) => (
                      <div key={s.userId} className="flex items-center justify-between px-4 py-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold shrink-0">
                            {i + 1}
                          </span>
                          <span className="font-medium text-sm truncate" dir="ltr">
                            {s.email || s.userId.slice(0, 8)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            · {s.orders} {lang === "ar" ? "فاتورة" : "invoices"}
                          </span>
                        </div>
                        <span className="num font-semibold text-sm">
                          {fmt(s.revenue, { compact: true })}
                        </span>
                      </div>
                    ))}
                    {branchesQ.data.topSellers.length === 0 && (
                      <div className="p-4 text-center text-xs text-muted-foreground">
                        {lang === "ar" ? "لا مبيعات مسجلة." : "No sales yet."}
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            )}
          <Card className="rounded-3xl border-border/60 bg-card/60 backdrop-blur-xl shadow-2xl shadow-black/10 overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold">{t("brands_details")}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-right">
                    <th className="p-3">{t("brand")}</th>
                    <th className="p-3">{t("type")}</th>
                    <th className="p-3 text-left">{t("kpi_revenue")}</th>
                    <th className="p-3 text-left">{t("kpi_net_profit")}</th>
                    <th className="p-3 text-left">{t("kpi_expenses")}</th>
                    <th className="p-3 text-left">{t("margin_col")}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.perBrand.map((b) => (
                    <tr key={b.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="p-3 font-medium">{b.name}</td>
                      <td className="p-3">
                        <Badge variant="outline">
                          {b.type === "service" ? t("services") : t("products")}
                        </Badge>
                      </td>
                      <td className="p-3 num text-left">{fmt(b.revenue, { compact: true })}</td>
                      <td
                        className={`p-3 num text-left ${b.netProfit >= 0 ? "text-success" : "text-destructive"}`}
                      >
                        {fmt(b.netProfit, { compact: true })}
                      </td>
                      <td className="p-3 num text-left text-muted-foreground">
                        {fmt(b.expenses, { compact: true })}
                      </td>
                      <td className="p-3 num text-left">
                        <Badge
                          variant={
                            b.margin >= 0.1
                              ? "default"
                              : b.margin >= 0
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {fmt(b.margin, { percent: true })}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {d.perBrand.length === 0 && (
        <Card className="p-8 text-center rounded-3xl border-border/60 bg-card/60 backdrop-blur-xl shadow-2xl shadow-black/10">
          <TrendingUp className="w-10 h-10 mx-auto text-primary mb-3" />
          <h3 className="font-semibold mb-1">{t("empty_start_title")}</h3>
          <p className="text-sm text-muted-foreground mb-3">{t("empty_start_sub")}</p>
        </Card>
      )}
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
};

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "success" | "destructive" | "muted";
}) {
  const color =
    tone === "success"
      ? "text-success"
      : tone === "destructive"
        ? "text-destructive"
        : tone === "muted"
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <Card className="p-4 rounded-3xl border-border/60 bg-card/50 backdrop-blur-xl shadow-lg shadow-black/10 hover:border-primary/40 hover:bg-card/70 transition-all">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-primary/0 border border-primary/20 flex items-center justify-center">
          <Icon className={`w-4 h-4 ${color === "text-foreground" ? "text-primary" : color}`} />
        </div>
      </div>
      <div className={`num text-2xl font-bold mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5 num">{sub}</div>}
    </Card>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5 rounded-3xl border-border/60 bg-card/60 backdrop-blur-xl shadow-2xl shadow-black/10">
      <div className="mb-3 rounded-2xl border border-border/60 bg-gradient-to-r from-primary/15 to-primary/0 px-3 py-2 flex items-center gap-2">
        <span className="w-1.5 h-5 rounded-full bg-primary" />
        <h3 className="text-sm font-bold tracking-wide">{title}</h3>
      </div>
      {children}
    </Card>
  );
}

function QuickLink({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: typeof DollarSign;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 p-3 rounded-2xl border border-border/60 bg-background/30 backdrop-blur-sm hover:border-primary/50 hover:bg-card/60 transition text-sm"
    >
      <Icon className="w-4 h-4 text-primary shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div
      className={`rounded-2xl border p-3 backdrop-blur-sm ${tone === "danger" ? "border-destructive/40 bg-destructive/10" : "border-border/60 bg-background/30"}`}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`num text-xl font-bold mt-1 ${tone === "danger" ? "text-destructive" : ""}`}>
        {value}
      </div>
    </div>
  );
}
