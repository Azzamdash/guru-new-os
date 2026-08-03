import { tr } from "@/lib/i18n";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { getInvestorSummary } from "@/lib/investors.functions";
import {
  PeriodFilter,
  type PeriodValue,
  defaultPeriod,
  resolvePeriod,
} from "@/components/PeriodFilter";
import { usePersistedPeriod } from "@/lib/global-period";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { TrendingUp, Building2 } from "lucide-react";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/investors/$id")({
  component: InvestorDashboard,
  head: () => ({
    meta: [
      { title: tr("داش بورد المستثمر | e-GURUS") },
      { name: "description", content: "نصيب المستثمر من أرباح البراندات" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Math.round(n * 100) / 100);

function InvestorDashboard() {
  const { lang } = useLang();
  const { id } = useParams({ from: "/_authenticated/_app/investors/$id" });
  const fn = useServerFn(getInvestorSummary);
  const [period, setPeriod] = usePersistedPeriod("investors.$id");
  const resolved = resolvePeriod(period);

  const q = useQuery({
    queryKey: ["investor-summary", id, period],
    queryFn: () =>
      fn({
        data: {
          investor_id: id,
          from: resolved.dateFrom ?? undefined,
          to: resolved.dateTo ?? undefined,
        },
      }),
  });

  if (q.isError) {
    return (
      <div className="p-6">
        <EmptyState
          title={lang === "ar" ? "خطأ" : "Error"}
          description={(q.error as Error).message}
        />
      </div>
    );
  }
  const d = q.data;
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" />
            {d?.investor.name ?? (lang === "ar" ? "المستثمر" : "Investor")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {lang === "ar" ? "نصيبك من أرباح البراندات" : "Your share of brand profits"}
          </p>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          title={lang === "ar" ? "إجمالي الإيرادات" : "Total Revenue"}
          value={fmt(d?.totals.revenue ?? 0)}
        />
        <Kpi
          title={lang === "ar" ? "إجمالي التكاليف" : "Total Costs"}
          value={fmt(d?.totals.costs ?? 0)}
        />
        <Kpi
          title={lang === "ar" ? "صافي الأرباح" : "Net Profit"}
          value={fmt(d?.totals.profit ?? 0)}
        />
        <Kpi
          title={lang === "ar" ? "نصيبك من الأرباح" : "Your Profit Share"}
          value={fmt(d?.totals.investor_profit ?? 0)}
          highlight
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{lang === "ar" ? "التفاصيل حسب البراند" : "Details by Brand"}</CardTitle>
        </CardHeader>
        <CardContent>
          {(d?.brands ?? []).length === 0 ? (
            <EmptyState
              title={lang === "ar" ? "لا توجد براندات" : "No brands"}
              description={
                lang === "ar"
                  ? "لم يتم تحديد نسب لأي براند بعد"
                  : "No shares have been set for any brand yet"
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{lang === "ar" ? "البراند" : "Brand"}</TableHead>
                  <TableHead>{lang === "ar" ? "نسبتك" : "Your Share"}</TableHead>
                  <TableHead>{lang === "ar" ? "الإيرادات" : "Revenue"}</TableHead>
                  <TableHead>{lang === "ar" ? "التكاليف" : "Costs"}</TableHead>
                  <TableHead>{lang === "ar" ? "الربح" : "Profit"}</TableHead>
                  <TableHead>{lang === "ar" ? "نصيبك" : "Your Share"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d!.brands.map((b) => (
                  <TableRow key={b.brand_id}>
                    <TableCell className="font-medium">
                      {b.brand_name}{" "}
                      <Badge variant="outline" className="mr-1 text-[10px]">
                        {b.brand_type === "service"
                          ? lang === "ar"
                            ? "خدمي"
                            : "Service"
                          : lang === "ar"
                            ? "منتج"
                            : "Product"}
                      </Badge>
                    </TableCell>
                    <TableCell>{b.share_percentage}%</TableCell>
                    <TableCell>{fmt(b.revenue)}</TableCell>
                    <TableCell>{fmt(b.costs)}</TableCell>
                    <TableCell className={b.profit >= 0 ? "text-green-600" : "text-red-600"}>
                      {fmt(b.profit)}
                    </TableCell>
                    <TableCell className="font-semibold">{fmt(b.investor_profit)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {d?.valuation && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />{" "}
              {lang === "ar" ? "نصيبك من التقييم" : "Your Share of Valuation"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi
                title={
                  lang === "ar" ? "نصيبك من تقييمات البراندات" : "Your Share of Brand Valuations"
                }
                value={fmt(d.valuation.brand_totals.investor_valuation)}
                highlight
              />
              <Kpi
                title={lang === "ar" ? "تقييم كامل الشركة" : "Full Company Valuation"}
                value={fmt(d.valuation.company.total_company_valuation)}
              />
              <Kpi
                title={lang === "ar" ? "نسبتك الفعلية من الشركة" : "Your Effective Company Share"}
                value={`${d.valuation.company.effective_ownership_pct.toFixed(2)}%`}
              />
              <Kpi
                title={lang === "ar" ? "نصيبك من كامل الشركة" : "Your Share of Whole Company"}
                value={fmt(d.valuation.company.investor_company_share)}
                highlight
              />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{lang === "ar" ? "البراند" : "Brand"}</TableHead>
                  <TableHead>{lang === "ar" ? "نسبتك" : "Your Share"}</TableHead>
                  <TableHead>{lang === "ar" ? "إيرادات سنوية" : "Annual Revenue"}</TableHead>
                  <TableHead>{lang === "ar" ? "أصول (صافي)" : "Assets (Net)"}</TableHead>
                  <TableHead>{lang === "ar" ? "تقييم البراند" : "Brand Valuation"}</TableHead>
                  <TableHead>{lang === "ar" ? "نصيبك" : "Your Share"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.valuation.rows.map((r) => (
                  <TableRow key={r.brand_id}>
                    <TableCell className="font-medium">{r.brand_name}</TableCell>
                    <TableCell>{r.share_percentage}%</TableCell>
                    <TableCell>{fmt(r.annual_revenue)}</TableCell>
                    <TableCell>{fmt(r.assets_net)}</TableCell>
                    <TableCell>{fmt(r.brand_valuation)}</TableCell>
                    <TableCell className="font-semibold text-primary">
                      {fmt(r.investor_valuation)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Kpi({ title, value, highlight }: { title: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary" : ""}>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div className={`text-xl font-bold mt-1 ${highlight ? "text-primary" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
