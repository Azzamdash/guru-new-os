import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
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
import { usePersistedPeriod } from "@/lib/global-period";
import { getExecutiveSnapshot } from "@/lib/executive.functions";
import { listBrands } from "@/lib/internal.functions";
import { useLang, tr } from "@/lib/i18n";
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  Wallet,
  Scale,
  Boxes,
  AlertTriangle,
  AlertCircle,
  Info,
  ArrowRight,
  Truck,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";

export const Route = createFileRoute("/_authenticated/_app/reports/executive")({
  head: () => ({
    meta: [
      { title: "Financial Dashboard — e-GURUS" },
      { name: "description", content: "ملخص تنفيذي شامل لأرقام الأداء المالي والتشغيلي." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Page,
});

function nf(n: number, d = 0) {
  return Number(n || 0).toLocaleString("en-US", {
    maximumFractionDigits: d,
    minimumFractionDigits: d,
  });
}

function Page() {
  const { lang } = useLang();
  const L = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const fn = useServerFn(getExecutiveSnapshot);
  const brandsFn = useServerFn(listBrands);
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => brandsFn() });
  const [brandId, setBrandId] = useState("all");
  const [period, setPeriod] = usePersistedPeriod("reports.executive");
  const r = resolvePeriod(period);
  const q = useQuery({
    queryKey: ["exec", brandId, r.dateFrom, r.dateTo, r.year],
    queryFn: () =>
      fn({
        data: {
          brandId: brandId === "all" ? null : brandId,
          from: r.dateFrom ?? `${r.year}-01-01`,
          to: r.dateTo ?? `${r.year}-12-31`,
        },
      }),
  });
  const d = q.data;

  const pnlChart = d
    ? [
        { name: L("إيراد صافي", "Net Rev"), value: d.income.netRevenue },
        { name: L("COGS", "COGS"), value: d.income.cogs },
        { name: L("شحن", "Shipping"), value: d.income.shippingCost },
        { name: L("مصاريف", "OpEx"), value: d.income.opex },
        { name: L("صافي الربح", "Net Profit"), value: d.income.netProfit },
      ]
    : [];

  const cashChart = d
    ? [
        { name: L("داخل", "In"), value: d.cashFlow.inflow },
        { name: L("خارج", "Out"), value: d.cashFlow.outflow },
        { name: L("صافي", "Net"), value: d.cashFlow.net },
      ]
    : [];

  const alertIcon = (level: string) =>
    level === "critical" ? (
      <AlertCircle className="w-4 h-4 text-destructive" />
    ) : level === "warning" ? (
      <AlertTriangle className="w-4 h-4 text-amber-500" />
    ) : (
      <Info className="w-4 h-4 text-primary" />
    );

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
              Financial Dashboard
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {L(tr("ملخص شامل للأداء المالي والتشغيلي"), "Full financial & operational snapshot")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <PeriodFilter value={period} onChange={setPeriod} />
          <Select value={brandId} onValueChange={setBrandId}>
            <SelectTrigger className="min-w-[180px] h-9 rounded-full bg-card/60 backdrop-blur-md border-border/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{L(tr("كل البراندات"), "All brands")}</SelectItem>
              {(brandsQ.data ?? [])
                .filter((b) => b.active)
                .map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {(d?.alerts?.length ?? 0) > 0 && (
        <Card className="p-4 rounded-3xl border-border/60 bg-card/60 backdrop-blur-xl shadow-2xl shadow-black/10">
          <div className="sticky top-0 z-10 mb-3 rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 to-amber-500/0 px-3 py-2 flex items-center gap-2">
            <span className="w-1.5 h-5 rounded-full bg-amber-500" />
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-bold tracking-wide">
              {L(tr("تنبيهات تلقائية"), "Automated Alerts")}
            </span>
          </div>
          <div className="space-y-2">
            {(d?.alerts ?? []).map((a, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 p-2.5 rounded-2xl border text-sm backdrop-blur-sm ${
                  a.level === "critical"
                    ? "border-destructive/40 bg-destructive/10"
                    : a.level === "warning"
                      ? "border-amber-500/40 bg-amber-500/10"
                      : "border-primary/30 bg-primary/10"
                }`}
              >
                {alertIcon(a.level)}
                <span className="text-xs font-mono opacity-70 uppercase w-16">{a.category}</span>
                <span className="flex-1">{a.message}</span>
                {a.link && (
                  <Link
                    to={a.link}
                    className="text-primary hover:underline text-xs flex items-center gap-1"
                  >
                    {L(tr("افتح"), "Open")} <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi
          icon={TrendingUp}
          label={L(tr("الإيراد الصافي"), "Net Revenue")}
          value={nf(d?.income.netRevenue ?? 0)}
          sub="EGP"
        />
        <Kpi
          icon={Truck}
          label={L(
            tr("إيراد الشحن (محصَّل للعميل، مش لينا)"),
            "Shipping revenue (customer-charged, not ours)",
          )}
          value={nf(d?.income.shippingRevenue ?? 0)}
          sub="EGP"
        />
        <Kpi
          icon={Truck}
          label={L(tr("تكلفة الشحن (مستحقة لشركات الشحن)"), "Shipping cost (owed to couriers)")}
          value={nf(d?.income.shippingCost ?? 0)}
          sub="EGP"
          tone="text-amber-500"
        />
        <Kpi
          icon={TrendingDown}
          label={L(tr("تكلفة البضاعة (COGS)"), "COGS")}
          value={nf(d?.income.cogs ?? 0)}
          sub="EGP"
          tone="text-amber-500"
        />
        <Kpi
          icon={TrendingDown}
          label={L(tr("الربح الإجمالي"), "Gross Profit")}
          value={nf(d?.income.grossProfit ?? 0)}
          sub={`${((d?.income.grossMargin ?? 0) * 100).toFixed(1)}%`}
          tone="text-emerald-500"
        />
        <Kpi
          icon={TrendingUp}
          label={L(tr("صافي الربح"), "Net Profit")}
          value={nf(d?.income.netProfit ?? 0)}
          sub={`${((d?.income.netMargin ?? 0) * 100).toFixed(1)}%`}
          tone={(d?.income.netProfit ?? 0) >= 0 ? "text-emerald-500" : "text-destructive"}
        />
        <Kpi
          icon={Wallet}
          label={L(tr("صافي التدفق النقدي"), "Net Cash Flow")}
          value={nf(d?.cashFlow.net ?? 0)}
          sub="EGP"
          tone={(d?.cashFlow.net ?? 0) >= 0 ? "text-emerald-500" : "text-destructive"}
        />
        <Kpi
          icon={Scale}
          label={L(tr("متوقع تحصيله (شركات الشحن)"), "Expected to collect (couriers)")}
          value={nf(d?.reconciliation.expected ?? 0)}
          sub="EGP"
        />
        <Kpi
          icon={Scale}
          label={L(tr("ما تم تحصيله (شركات الشحن)"), "Collected (couriers)")}
          value={nf(d?.reconciliation.deposited ?? 0)}
          sub="EGP"
          tone="text-emerald-500"
        />
        <Kpi
          icon={AlertTriangle}
          label={L(tr("فرق التسوية"), "Recon Variance")}
          value={nf(d?.reconciliation.variance ?? 0)}
          sub={`${((d?.reconciliation.variancePct ?? 0) * 100).toFixed(1)}%`}
          tone={
            Math.abs(d?.reconciliation.variance ?? 0) < 1 ? "text-emerald-500" : "text-destructive"
          }
        />
        <Kpi
          icon={Boxes}
          label={L(tr("قيمة المخزون"), "Inventory Value")}
          value={nf(d?.inventory.valuation ?? 0)}
          sub={`${nf(d?.inventory.units ?? 0)} ${L(tr("قطعة"), "units")}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5 rounded-3xl border-border/60 bg-card/60 backdrop-blur-xl shadow-2xl shadow-black/10">
          <div className="mb-3 rounded-2xl border border-border/60 bg-gradient-to-r from-primary/15 to-primary/0 px-3 py-2 flex items-center gap-2">
            <span className="w-1.5 h-5 rounded-full bg-primary" />
            <h3 className="text-sm font-bold tracking-wide">
              {L(tr("قائمة الدخل (ملخص)"), "P&L Summary")}
            </h3>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pnlChart}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => nf(v)} />
                <Tooltip formatter={(v: number) => nf(v)} />
                <Bar dataKey="value">
                  {pnlChart.map((row, i) => (
                    <Cell key={i} fill={row.value >= 0 ? "hsl(160 84% 39%)" : "hsl(0 84% 60%)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5 rounded-3xl border-border/60 bg-card/60 backdrop-blur-xl shadow-2xl shadow-black/10">
          <div className="mb-3 rounded-2xl border border-border/60 bg-gradient-to-r from-sky-500/15 to-sky-500/0 px-3 py-2 flex items-center gap-2">
            <span className="w-1.5 h-5 rounded-full bg-sky-500" />
            <h3 className="text-sm font-bold tracking-wide">
              {L(tr("التدفق النقدي"), "Cash Flow")}
            </h3>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cashChart}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => nf(v)} />
                <Tooltip formatter={(v: number) => nf(v)} />
                <Bar dataKey="value">
                  {cashChart.map((row, i) => (
                    <Cell key={i} fill={row.value >= 0 ? "hsl(217 91% 60%)" : "hsl(0 84% 60%)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-5 rounded-3xl border-border/60 bg-card/60 backdrop-blur-xl shadow-2xl shadow-black/10">
        <div className="mb-3 rounded-2xl border border-border/60 bg-gradient-to-r from-emerald-500/15 to-emerald-500/0 px-3 py-2 flex items-center gap-2">
          <span className="w-1.5 h-5 rounded-full bg-emerald-500" />
          <h3 className="text-sm font-bold tracking-wide">
            {L(tr("روابط سريعة للتقارير التفصيلية"), "Quick Links to Detailed Reports")}
          </h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <QuickLink
            to="/reports/income-statement"
            label={L(tr("قائمة الدخل"), "Income Statement")}
          />
          <QuickLink to="/reports/cash-flow" label={L(tr("التدفقات النقدية"), "Cash Flow")} />
          <QuickLink
            to="/reports/reconciliation"
            label={L(tr("تسوية شركات الشحن"), "Reconciliation")}
          />
          <QuickLink
            to="/reports/inventory-valuation"
            label={L(tr("تقييم المخزون"), "Inventory Valuation")}
          />
          <QuickLink to="/reports/profits" label={L(tr("الأرباح"), "Profits")} />
          <QuickLink to="/courier-reports" label={L(tr("شركات الشحن"), "Couriers")} />
          <QuickLink to="/reports/audit" label={L(tr("سجل التدقيق"), "Audit Log")} />
          <QuickLink
            to="/reports/brands-comparison"
            label={L(tr("مقارنة البراندات"), "Brands Comparison")}
          />
        </div>
      </Card>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <Card className="p-4 rounded-3xl border-border/60 bg-card/50 backdrop-blur-xl shadow-lg shadow-black/10 hover:border-primary/40 hover:bg-card/70 transition-all">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-primary/0 border border-primary/20 flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary" />
        </div>
      </div>
      <div className={`text-2xl font-bold mt-1 num ${tone ?? ""}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5 num">{sub}</div>}
    </Card>
  );
}

function QuickLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="p-3 rounded-2xl border border-border/60 bg-background/30 backdrop-blur-sm hover:border-primary/50 hover:bg-card/60 transition text-sm flex items-center justify-between"
    >
      <span>{label}</span>
      <ArrowRight className="w-4 h-4 text-primary" />
    </Link>
  );
}
