import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { getProfitsReport } from "@/lib/profits.functions";
import { listBrands } from "@/lib/internal.functions";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PeriodFilter, defaultPeriod, resolvePeriod, type PeriodValue } from "@/components/PeriodFilter";
import { usePersistedPeriod } from "@/lib/global-period";
import { ReportActions } from "@/components/ReportActions";
import { EmptyState } from "@/components/EmptyState";
import { PiggyBank, DollarSign, Receipt, TrendingUp } from "lucide-react";
import { useLang, tr } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/reports/profits")({
  head: () => ({
    meta: [
      { title: tr("تقرير الأرباح — e-GURUS") },
      { name: "description", content: "الأرباح لكل براند = الإيرادات − تكلفة البضاعة − المصاريف (مرتبات، إعلانات، تشغيل…)." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ProfitsPage,
});

const fmt = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0);

function ProfitsPage() {
  const { t, lang } = useLang();
  const brandsFn = useServerFn(listBrands);
  const fn = useServerFn(getProfitsReport);
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => brandsFn() });
  const [brandId, setBrandId] = useState<string>("all");
  const [period, setPeriod] = usePersistedPeriod("reports.profits");
  const resolved = resolvePeriod(period);
  const q = useQuery({
    queryKey: ["profits-report", brandId, resolved.dateFrom, resolved.dateTo, resolved.year],
    queryFn: () =>
      fn({
        data: {
          brandId: brandId === "all" ? null : brandId,
          from: resolved.dateFrom ?? `${resolved.year}-01-01`,
          to: resolved.dateTo ?? `${resolved.year}-12-31`,
        },
      }),
  });

  const d = q.data;
  const rows = d?.rows ?? [];
  const totals = d?.totals ?? { revenue: 0, cogs: 0, grossProfit: 0, expenses: 0, netProfit: 0 };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <PiggyBank className="w-7 h-7 text-primary" /> {t("profits_title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{t("profits_formula")}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={brandId} onValueChange={setBrandId}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder={t("brand")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all_brands")}</SelectItem>
              {(brandsQ.data ?? []).filter((b) => b.active).map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <PeriodFilter value={period} onChange={setPeriod} />
          <ReportActions
            filename={`profits-${resolved.year}.csv`}
            summaryTitle={t("profits_title")}
            summaryText={`${t("kpi_net_profit")}: ${fmt(totals.netProfit)}`}
            rows={rows as unknown as Record<string, unknown>[]}
            columns={[
              { key: "brand_name", label: t("brand") },
              { key: "revenue", label: t("kpi_revenue"), fmt: (v) => fmt(Number(v)) },
              { key: "cogs", label: t("cogs_cost"), fmt: (v) => fmt(Number(v)) },
              { key: "grossProfit", label: t("cogs_gross_profit"), fmt: (v) => fmt(Number(v)) },
              { key: "expenses", label: t("kpi_expenses"), fmt: (v) => fmt(Number(v)) },
              { key: "netProfit", label: t("kpi_net_profit"), fmt: (v) => fmt(Number(v)) },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi icon={DollarSign} label={t("kpi_revenue")} value={fmt(totals.revenue)} />
        <Kpi icon={Receipt} label={t("cogs_cost")} value={fmt(totals.cogs)} tone="muted" />
        <Kpi icon={TrendingUp} label={t("cogs_gross_profit")} value={fmt(totals.grossProfit)} tone={totals.grossProfit >= 0 ? "success" : "destructive"} />
        <Kpi icon={Receipt} label={t("kpi_expenses")} value={fmt(totals.expenses)} tone="muted" />
        <Kpi icon={PiggyBank} label={t("kpi_net_profit")} value={fmt(totals.netProfit)} tone={totals.netProfit >= 0 ? "success" : "destructive"} highlight />
      </div>

      {q.isLoading ? (
        <Card className="p-8 text-center text-muted-foreground">{t("loading")}</Card>
      ) : rows.length === 0 ? (
        <Card className="card-gradient"><EmptyState title={t("no_data")} description={t("profits_empty")} /></Card>
      ) : (
        <>
          <Card className="card-gradient overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead>
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="p-3 text-start">{t("brand")}</th>
                    <th className="p-3 text-start">{t("kpi_revenue")}</th>
                    <th className="p-3 text-start">{t("cogs_cost")}</th>
                    <th className="p-3 text-start">{t("cogs_gross_profit")}</th>
                    <th className="p-3 text-start">{t("kpi_expenses")}</th>
                    <th className="p-3 text-start">{t("kpi_net_profit")}</th>
                    <th className="p-3 text-start">{t("margin_col")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.brand_id} className="border-b border-border/50">
                      <td className="p-3 font-medium">{r.brand_name}</td>
                      <td className="p-3 num">{fmt(r.revenue)}</td>
                      <td className="p-3 num text-muted-foreground">{fmt(r.cogs)}</td>
                      <td className={`p-3 num ${r.grossProfit >= 0 ? "text-emerald-500" : "text-destructive"}`}>{fmt(r.grossProfit)}</td>
                      <td className="p-3 num text-muted-foreground">{fmt(r.expenses)}</td>
                      <td className={`p-3 num font-bold ${r.netProfit >= 0 ? "text-emerald-500" : "text-destructive"}`}>{fmt(r.netProfit)}</td>
                      <td className="p-3 num text-xs">{r.revenue > 0 ? `${(r.margin * 100).toFixed(1)}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-primary/5 font-bold">
                    <td className="p-3">{lang === "ar" ? "الإجمالي" : "Total"}</td>
                    <td className="p-3 num">{fmt(totals.revenue)}</td>
                    <td className="p-3 num">{fmt(totals.cogs)}</td>
                    <td className="p-3 num text-emerald-500">{fmt(totals.grossProfit)}</td>
                    <td className="p-3 num">{fmt(totals.expenses)}</td>
                    <td className={`p-3 num ${totals.netProfit >= 0 ? "text-emerald-500" : "text-destructive"}`}>{fmt(totals.netProfit)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          {d && d.expenseCategories.length > 0 && (
            <Card className="card-gradient p-5">
              <h3 className="font-semibold mb-3">{t("profits_expense_breakdown")}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border">
                      <th className="p-2 text-start">{lang === "ar" ? "البند" : "Category"}</th>
                      <th className="p-2 text-start">{t("amount")}</th>
                      <th className="p-2 text-start">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.expenseCategories.map((c) => (
                      <tr key={c.name} className="border-b border-border/50">
                        <td className="p-2">{c.name}</td>
                        <td className="p-2 num">{fmt(c.value)}</td>
                        <td className="p-2 num text-xs">{totals.expenses > 0 ? `${((c.value / totals.expenses) * 100).toFixed(1)}%` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone, highlight }: { icon: typeof PiggyBank; label: string; value: string; tone?: "success" | "destructive" | "muted"; highlight?: boolean }) {
  const c = tone === "success" ? "text-emerald-500" : tone === "destructive" ? "text-destructive" : tone === "muted" ? "text-muted-foreground" : "";
  return (
    <Card className={`p-4 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <Icon className="w-4 h-4" />
      </div>
      <div className={`text-2xl font-bold mt-2 num ${c}`}>{value}</div>
    </Card>
  );
}