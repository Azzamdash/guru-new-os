import { tr } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import {
  listInvestorSharesAudit,
  listInvestorsPnL,
  listInvestorsValuation,
} from "@/lib/investors.functions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  HandCoins,
  Clock,
  TrendingUp,
  TrendingDown,
  Wallet,
  Trophy,
  Percent,
  Building2,
  Users,
  Landmark,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import {
  PeriodFilter,
  defaultPeriod,
  resolvePeriod,
  type PeriodValue,
} from "@/components/PeriodFilter";
import { usePersistedPeriod } from "@/lib/global-period";
import { ReportActions } from "@/components/ReportActions";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/reports/investors-audit")({
  component: InvestorsAuditPage,
  head: () => ({
    meta: [
      { title: "تدقيق وتحليلات المستثمرين | e-GURUS" },
      {
        name: "description",
        content: "تدقيق نسب المستثمرين وتحليل أرباحهم وخسائرهم لكل براند مع فلاتر مخصصة.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const COLORS = [
  "hsl(175 60% 55%)",
  "hsl(85 65% 60%)",
  "hsl(155 55% 55%)",
  "hsl(305 55% 65%)",
  "hsl(30 70% 60%)",
  "hsl(200 60% 60%)",
  "hsl(45 75% 60%)",
  "hsl(340 60% 60%)",
];

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}
function fmtN(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}
function fmtPct(n: number) {
  return `${n.toFixed(1)}%`;
}

function InvestorsAuditPage() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const auditFn = useServerFn(listInvestorSharesAudit);
  const pnlFn = useServerFn(listInvestorsPnL);
  const valFn = useServerFn(listInvestorsValuation);
  const [period, setPeriod] = usePersistedPeriod("reports.investors-audit");
  const resolved = resolvePeriod(period);

  const auditQ = useQuery({ queryKey: ["investors-shares-audit"], queryFn: () => auditFn() });
  const valQ = useQuery({ queryKey: ["investors-valuation"], queryFn: () => valFn() });
  const pnlQ = useQuery({
    queryKey: ["investors-pnl", resolved.dateFrom, resolved.dateTo, resolved.year],
    queryFn: () =>
      pnlFn({
        data: {
          from: resolved.dateFrom ?? `${resolved.year}-01-01`,
          to: resolved.dateTo ?? `${resolved.year}-12-31`,
        },
      }),
  });

  const [investorFilter, setInvestorFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");

  const auditRows = auditQ.data?.rows ?? [];
  const isAdmin = !!auditQ.data?.isAdmin;
  const pnlRows = pnlQ.data?.rows ?? [];

  // Distinct dropdown values from actual data
  const investorOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of pnlRows)
      if (r.investor_id) m.set(r.investor_id, r.investor_name || r.investor_email || "—");
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [pnlRows]);
  const brandOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of pnlRows) if (r.brand_id) m.set(r.brand_id, r.brand_name || "—");
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [pnlRows]);

  const filteredPnl = useMemo(() => {
    return pnlRows.filter(
      (r) =>
        (investorFilter === "all" || r.investor_id === investorFilter) &&
        (brandFilter === "all" || r.brand_id === brandFilter),
    );
  }, [pnlRows, investorFilter, brandFilter]);

  // Group by investor for KPIs / chart
  const byInvestor = useMemo(() => {
    const m = new Map<
      string,
      {
        name: string;
        email: string;
        profit: number;
        revenue: number;
        costs: number;
        brands: number;
        investorRevenue: number;
        investorCosts: number;
      }
    >();
    for (const r of filteredPnl) {
      const cur = m.get(r.investor_id) ?? {
        name: r.investor_name,
        email: r.investor_email,
        profit: 0,
        revenue: 0,
        costs: 0,
        brands: 0,
        investorRevenue: 0,
        investorCosts: 0,
      };
      cur.profit += r.investor_profit;
      cur.investorRevenue += (r.revenue * r.share_percentage) / 100;
      cur.investorCosts += (r.costs * r.share_percentage) / 100;
      cur.revenue += r.revenue;
      cur.costs += r.costs;
      cur.brands += 1;
      m.set(r.investor_id, cur);
    }
    return Array.from(m.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.profit - a.profit);
  }, [filteredPnl]);

  // Group by brand
  const byBrand = useMemo(() => {
    const m = new Map<
      string,
      {
        name: string;
        type: string;
        revenue: number;
        costs: number;
        profit: number;
        totalShare: number;
        investors: number;
      }
    >();
    for (const r of filteredPnl) {
      const cur = m.get(r.brand_id) ?? {
        name: r.brand_name,
        type: r.brand_type,
        revenue: r.revenue,
        costs: r.costs,
        profit: r.profit,
        totalShare: 0,
        investors: 0,
      };
      cur.totalShare += r.share_percentage;
      cur.investors += 1;
      m.set(r.brand_id, cur);
    }
    return Array.from(m.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.profit - a.profit);
  }, [filteredPnl]);

  const totals = useMemo(() => {
    return byInvestor.reduce(
      (a, r) => ({
        profit: a.profit + r.profit,
        revenue: a.revenue + r.investorRevenue,
        costs: a.costs + r.investorCosts,
        brandRevenue: a.brandRevenue + r.revenue,
      }),
      { profit: 0, revenue: 0, costs: 0, brandRevenue: 0 },
    );
  }, [byInvestor]);

  const topInvestor = byInvestor[0];
  const worstInvestor = byInvestor.length
    ? [...byInvestor].sort((a, b) => a.profit - b.profit)[0]
    : null;
  const topBrand = byBrand[0];
  const margin =
    totals.brandRevenue > 0 ? (totals.profit * 100) / ((totals.brandRevenue * 100) / 100) : 0;

  // Audit summary
  const auditByInvestor = useMemo(() => {
    const m = new Map<
      string,
      { name: string; email: string; total: number; count: number; lastUpdated: string }
    >();
    for (const r of auditRows) {
      const cur = m.get(r.investor_id) ?? {
        name: r.investor_name,
        email: r.investor_email,
        total: 0,
        count: 0,
        lastUpdated: r.updated_at,
      };
      cur.total += r.share_percentage;
      cur.count += 1;
      if (new Date(r.updated_at) > new Date(cur.lastUpdated)) cur.lastUpdated = r.updated_at;
      m.set(r.investor_id, cur);
    }
    return Array.from(m.entries()).map(([id, v]) => ({ id, ...v }));
  }, [auditRows]);

  const csvRows = filteredPnl.map((r) => ({
    investor: r.investor_name,
    brand: r.brand_name,
    share_pct: r.share_percentage,
    brand_revenue: r.revenue,
    brand_costs: r.costs,
    brand_profit: r.profit,
    investor_profit: r.investor_profit,
  }));
  const csvColumns = [
    { key: "investor", label: T("المستثمر", "Investor") },
    { key: "brand", label: T("البراند", "Brand") },
    { key: "share_pct", label: T("النسبة %", "Share %") },
    { key: "brand_revenue", label: T("إيراد البراند", "Brand Revenue") },
    { key: "brand_costs", label: T("تكاليف البراند", "Brand Costs") },
    { key: "brand_profit", label: T("ربح البراند", "Brand Profit") },
    { key: "investor_profit", label: T("نصيب المستثمر", "Investor Share") },
  ];

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <HandCoins className="w-7 h-7 text-primary" />
            {T("تدقيق وتحليلات المستثمرين", "Investor Audit & Analytics")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {T(
              "نسبة كل مستثمر في كل براند، وتاريخ آخر تعديل، بالإضافة إلى تحليل أرباحه/خسائره خلال الفترة المختارة.",
              "Each investor's share in every brand, the last update date, plus an analysis of their profit/loss during the selected period.",
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <PeriodFilter value={period} onChange={setPeriod} />
          <ReportActions
            filename={`investors-pnl-${resolved.year}.csv`}
            rows={csvRows}
            columns={csvColumns}
            summaryTitle={T("تحليلات المستثمرين", "Investor Analytics")}
            summaryText={T(
              `أرباح المستثمرين خلال ${resolved.dateFrom ?? resolved.year} → ${resolved.dateTo ?? ""}`,
              `Investor profits from ${resolved.dateFrom ?? resolved.year} to ${resolved.dateTo ?? ""}`,
            )}
          />
        </div>
      </div>

      {/* Filters — dropdowns from existing data */}
      <Card className="p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[220px]">
          <label className="text-xs text-muted-foreground mb-1 block">
            {T("المستثمر", "Investor")}
          </label>
          <Select value={investorFilter} onValueChange={setInvestorFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {T(
                  `كل المستثمرين (${investorOptions.length})`,
                  `All Investors (${investorOptions.length})`,
                )}
              </SelectItem>
              {investorOptions.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="text-xs text-muted-foreground mb-1 block">
            {T("البراند / الشركة", "Brand / Company")}
          </label>
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {T(`كل البراندات (${brandOptions.length})`, `All Brands (${brandOptions.length})`)}
              </SelectItem>
              {brandOptions.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {(investorFilter !== "all" || brandFilter !== "all") && (
          <button
            className="text-xs text-primary hover:underline"
            onClick={() => {
              setInvestorFilter("all");
              setBrandFilter("all");
            }}
          >
            {T("إعادة الضبط", "Reset")}
          </button>
        )}
      </Card>

      {/* KPIs — expanded */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{T("إجمالي أرباح/خسائر المستثمرين", "Total Investor Profit/Loss")}</span>
            {totals.profit >= 0 ? (
              <TrendingUp className="w-4 h-4 text-success" />
            ) : (
              <TrendingDown className="w-4 h-4 text-destructive" />
            )}
          </div>
          <div
            className={`text-2xl font-bold mt-2 num ${totals.profit >= 0 ? "text-success" : "text-destructive"}`}
          >
            {fmtN(totals.profit)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{T("الإيراد المنسوب", "Attributed Revenue")}</span>
            <Wallet className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-bold mt-2 num">{fmtN(totals.revenue)}</div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {T(
              `من إجمالي براند ${fmtN(totals.brandRevenue)}`,
              `Out of total brand revenue ${fmtN(totals.brandRevenue)}`,
            )}
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{T("التكاليف المنسوبة", "Attributed Costs")}</span>
            <Wallet className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold mt-2 num text-amber-500">{fmtN(totals.costs)}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{T("هامش الربح", "Profit Margin")}</span>
            <Percent className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-bold mt-2 num">
            {totals.revenue > 0 ? fmtPct((totals.profit / totals.revenue) * 100) : "—"}
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{T("عدد المستثمرين", "Number of Investors")}</span>
            <Users className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-bold mt-2 num">{byInvestor.length}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{T("عدد البراندات النشطة", "Active Brands")}</span>
            <Building2 className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-bold mt-2 num">{byBrand.length}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{T("أعلى مستثمر ربحًا", "Top Investor by Profit")}</span>
            <Trophy className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-sm font-bold mt-2 truncate">{topInvestor?.name || "—"}</div>
          <div className="text-xs text-emerald-500 num">
            {topInvestor ? fmtN(topInvestor.profit) : "—"}
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{T("أعلى براند ربحًا", "Top Brand by Profit")}</span>
            <Trophy className="w-4 h-4 text-primary" />
          </div>
          <div className="text-sm font-bold mt-2 truncate">{topBrand?.name || "—"}</div>
          <div className="text-xs text-primary num">{topBrand ? fmtN(topBrand.profit) : "—"}</div>
        </Card>
      </div>

      {pnlQ.isLoading ? (
        <div className="p-8 text-muted-foreground">{T("جاري التحميل...", "Loading...")}</div>
      ) : byInvestor.length === 0 ? (
        <EmptyState
          title={T("لا توجد نتائج", "No Results")}
          description={T(
            "لا توجد استثمارات ضمن الفلاتر أو الفترة الحالية.",
            "There are no investments within the current filters or period.",
          )}
        />
      ) : (
        <>
          {/* Charts row */}
          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <h3 className="font-semibold mb-3">
                {T("أرباح/خسائر كل مستثمر", "Profit/Loss per Investor")}
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={byInvestor
                    .slice(0, 12)
                    .map((r) => ({ name: r.name || "—", value: Math.round(r.profit) }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" />
                  <XAxis
                    dataKey="name"
                    fontSize={11}
                    angle={-20}
                    textAnchor="end"
                    height={60}
                    interval={0}
                  />
                  <YAxis fontSize={11} tickFormatter={(v) => fmtN(v)} />
                  <Tooltip
                    formatter={(v: number) => fmtN(v)}
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="value"
                    name={T("نصيب المستثمر", "Investor Share")}
                    radius={[6, 6, 0, 0]}
                  >
                    {byInvestor.slice(0, 12).map((r, i) => (
                      <Cell
                        key={i}
                        fill={r.profit >= 0 ? COLORS[i % COLORS.length] : "hsl(0 65% 55%)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5">
              <h3 className="font-semibold mb-3">
                {T("توزيع الأرباح على البراندات", "Profit Distribution by Brand")}
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={byBrand
                      .filter((b) => b.profit > 0)
                      .slice(0, 8)
                      .map((b) => ({ name: b.name, value: Math.round(b.profit) }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={95}
                    label={(e: { name: string }) => e.name}
                  >
                    {byBrand.slice(0, 8).map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => fmtN(v)}
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Per-investor totals — expanded columns */}
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border font-semibold text-sm">
              {T("ملخص أرباح كل مستثمر", "Investor Profit Summary")}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{T("المستثمر", "Investor")}</TableHead>
                    <TableHead className="text-right">
                      {T("عدد البراندات", "Number of Brands")}
                    </TableHead>
                    <TableHead className="text-right">
                      {T("الإيراد المنسوب", "Attributed Revenue")}
                    </TableHead>
                    <TableHead className="text-right">
                      {T("التكاليف المنسوبة", "Attributed Costs")}
                    </TableHead>
                    <TableHead className="text-right">
                      {T("نصيبه من الربح", "Share of Profit")}
                    </TableHead>
                    <TableHead className="text-right">{T("الهامش", "Margin")}</TableHead>
                    <TableHead className="text-right">{T("% من الإجمالي", "% of Total")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byInvestor.map((r) => {
                    const m = r.investorRevenue > 0 ? (r.profit / r.investorRevenue) * 100 : 0;
                    const share = totals.profit !== 0 ? (r.profit / totals.profit) * 100 : 0;
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="font-medium">{r.name || "—"}</div>
                          {r.email && (
                            <div className="text-xs text-muted-foreground" dir="ltr">
                              {r.email}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{r.brands}</TableCell>
                        <TableCell className="num">{fmtN(r.investorRevenue)}</TableCell>
                        <TableCell className="num text-muted-foreground">
                          {fmtN(r.investorCosts)}
                        </TableCell>
                        <TableCell className="num">
                          <Badge variant={r.profit >= 0 ? "default" : "destructive"}>
                            {fmtN(r.profit)}
                          </Badge>
                        </TableCell>
                        <TableCell className="num text-xs">
                          {r.investorRevenue > 0 ? fmtPct(m) : "—"}
                        </TableCell>
                        <TableCell className="num text-xs text-muted-foreground">
                          {totals.profit !== 0 ? fmtPct(share) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Per-brand aggregate */}
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border font-semibold text-sm">
              {T("ملخص أداء البراندات (ضمن الفلاتر)", "Brand Performance Summary (within filters)")}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{T("البراند", "Brand")}</TableHead>
                    <TableHead className="text-right">{T("النوع", "Type")}</TableHead>
                    <TableHead className="text-right">
                      {T("عدد المستثمرين", "Number of Investors")}
                    </TableHead>
                    <TableHead className="text-right">{T("مجموع النسب", "Total Share")}</TableHead>
                    <TableHead className="text-right">{T("الإيراد", "Revenue")}</TableHead>
                    <TableHead className="text-right">{T("التكاليف", "Costs")}</TableHead>
                    <TableHead className="text-right">{T("الربح", "Profit")}</TableHead>
                    <TableHead className="text-right">{T("الهامش", "Margin")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byBrand.map((b) => {
                    const m = b.revenue > 0 ? (b.profit / b.revenue) * 100 : 0;
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {b.type === "service"
                              ? T("خدمات", "Services")
                              : T("منتجات", "Products")}
                          </Badge>
                        </TableCell>
                        <TableCell>{b.investors}</TableCell>
                        <TableCell>
                          <Badge variant={b.totalShare > 100 ? "destructive" : "secondary"}>
                            {b.totalShare.toFixed(1)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="num">{fmtN(b.revenue)}</TableCell>
                        <TableCell className="num text-muted-foreground">{fmtN(b.costs)}</TableCell>
                        <TableCell
                          className={`num ${b.profit >= 0 ? "text-success" : "text-destructive"}`}
                        >
                          {fmtN(b.profit)}
                        </TableCell>
                        <TableCell className="num text-xs">
                          {b.revenue > 0 ? fmtPct(m) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Detailed per brand */}
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border font-semibold text-sm">
              {T("تفاصيل الأرباح لكل مستثمر × براند", "Profit Details per Investor × Brand")}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isAdmin && (
                      <TableHead className="text-right">{T("المستثمر", "Investor")}</TableHead>
                    )}
                    <TableHead className="text-right">{T("البراند", "Brand")}</TableHead>
                    <TableHead className="text-right">{T("النوع", "Type")}</TableHead>
                    <TableHead className="text-right">{T("النسبة", "Share")}</TableHead>
                    <TableHead className="text-right">
                      {T("إيراد البراند", "Brand Revenue")}
                    </TableHead>
                    <TableHead className="text-right">
                      {T("تكاليف البراند", "Brand Costs")}
                    </TableHead>
                    <TableHead className="text-right">{T("ربح البراند", "Brand Profit")}</TableHead>
                    <TableHead className="text-right">
                      {T("نصيب المستثمر", "Investor Share")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPnl.map((r) => (
                    <TableRow key={r.share_id}>
                      {isAdmin && (
                        <TableCell>
                          <div className="font-medium">{r.investor_name || "—"}</div>
                          {r.investor_email && (
                            <div className="text-xs text-muted-foreground" dir="ltr">
                              {r.investor_email}
                            </div>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="font-medium">{r.brand_name || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {r.brand_type === "service"
                            ? T("خدمات", "Services")
                            : T("منتجات", "Products")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{r.share_percentage.toFixed(2)}%</Badge>
                      </TableCell>
                      <TableCell className="num">{fmtN(r.revenue)}</TableCell>
                      <TableCell className="num text-muted-foreground">{fmtN(r.costs)}</TableCell>
                      <TableCell
                        className={`num ${r.profit >= 0 ? "text-success" : "text-destructive"}`}
                      >
                        {fmtN(r.profit)}
                      </TableCell>
                      <TableCell className="num">
                        <Badge variant={r.investor_profit >= 0 ? "default" : "destructive"}>
                          {fmtN(r.investor_profit)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {worstInvestor && worstInvestor.profit < 0 && (
            <Card className="p-4 border-destructive/40 bg-destructive/5 flex items-center gap-3">
              <TrendingDown className="w-5 h-5 text-destructive" />
              <div className="text-sm">
                {lang === "ar" ? (
                  <>
                    <span className="font-semibold">{worstInvestor.name}</span> يسجل أعلى خسارة
                    بقيمة{" "}
                    <span className="num font-bold text-destructive">
                      {fmtN(worstInvestor.profit)}
                    </span>{" "}
                    خلال هذه الفترة.
                  </>
                ) : (
                  <>
                    <span className="font-semibold">{worstInvestor.name}</span> recorded the largest
                    loss of{" "}
                    <span className="num font-bold text-destructive">
                      {fmtN(worstInvestor.profit)}
                    </span>{" "}
                    during this period.
                  </>
                )}
              </div>
            </Card>
          )}
        </>
      )}

      {/* Audit / shares history (existing) */}
      {valQ.data && valQ.data.rows.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border font-semibold text-sm flex items-center gap-2">
            <Landmark className="w-4 h-4 text-primary" />{" "}
            {T("نصيب المستثمرين من التقييم الحالي", "Investor Share of Current Valuation")}
            <span className="text-xs text-muted-foreground font-normal ms-2">
              —{" "}
              {T(
                "تقييم كل براند = الإيرادات السنوية × 1.5 + صافي الأصول",
                "Each brand's valuation = annual revenue × 1.5 + net assets",
              )}
            </span>
          </div>
          <div className="p-4 space-y-5">
            {valQ.data.rows.map((row) => (
              <div
                key={row.investor_id}
                className="border border-border/60 rounded-lg overflow-hidden"
              >
                <div className="p-3 flex flex-wrap items-center justify-between gap-3 bg-muted/20">
                  <div>
                    <div className="font-semibold">{row.investor_name || "—"}</div>
                    {row.investor_email && (
                      <div className="text-xs text-muted-foreground" dir="ltr">
                        {row.investor_email}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <span className="text-muted-foreground">
                      {T("إجمالي تقييم الشركة", "Total Company Valuation")}:{" "}
                      <b className="num text-foreground">{fmtN(row.total_company_valuation)}</b>
                    </span>
                    <span className="text-muted-foreground">
                      {T("الملكية الفعلية", "Effective Ownership")}:{" "}
                      <b className="num text-foreground">{fmtPct(row.effective_ownership_pct)}</b>
                    </span>
                    <Badge className="num">
                      {T("نصيب المستثمر", "Investor Share")}: {fmtN(row.investor_company_share)}
                    </Badge>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">{T("البراند", "Brand")}</TableHead>
                        <TableHead className="text-right">{T("النسبة %", "Share %")}</TableHead>
                        <TableHead className="text-right">
                          {T("تقييم البراند", "Brand Valuation")}
                        </TableHead>
                        <TableHead className="text-right">
                          {T("نصيب المستثمر", "Investor Share")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {row.brands.map((b) => (
                        <TableRow key={b.brand_id}>
                          <TableCell className="font-medium">{b.brand_name}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{b.share_percentage.toFixed(2)}%</Badge>
                          </TableCell>
                          <TableCell className="num">{fmtN(b.brand_valuation)}</TableCell>
                          <TableCell className="num font-semibold text-primary">
                            {fmtN(b.investor_valuation)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {auditQ.isLoading ? null : auditRows.length === 0 ? null : (
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border font-semibold text-sm flex items-center gap-2">
            <Clock className="w-4 h-4" /> {T("تدقيق آخر تعديل للنسب", "Audit of Last Share Update")}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">{T("المستثمر", "Investor")}</TableHead>
                <TableHead className="text-right">
                  {T("عدد البراندات", "Number of Brands")}
                </TableHead>
                <TableHead className="text-right">{T("مجموع النسب", "Total Share")}</TableHead>
                <TableHead className="text-right">{T("آخر تعديل", "Last Updated")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditByInvestor.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>
                    <div className="font-medium">{v.name || "—"}</div>
                    {v.email && (
                      <div className="text-xs text-muted-foreground" dir="ltr">
                        {v.email}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{v.count}</TableCell>
                  <TableCell>
                    <Badge variant={v.total > 100 ? "destructive" : "secondary"}>
                      {v.total.toFixed(2)}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(v.lastUpdated)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
