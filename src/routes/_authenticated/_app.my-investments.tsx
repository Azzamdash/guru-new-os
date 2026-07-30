import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { getMyInvestorSummary } from "@/lib/investors.functions";
import { PeriodFilter, type PeriodValue, defaultPeriod, resolvePeriod } from "@/components/PeriodFilter";
import { useGlobalPeriod } from "@/lib/global-period";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { TrendingUp, Building2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_app/my-investments")({
  component: MyInvestments,
  head: () => ({
    meta: [
      { title: "استثماراتي | e-GURUS" },
      { name: "description", content: "نصيبك من أرباح البراندات المستثمر فيها" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Math.round(n * 100) / 100);

function MyInvestments() {
  const fn = useServerFn(getMyInvestorSummary);
  const __gp = useGlobalPeriod();
  const [period, setPeriod] = useState<PeriodValue>(__gp.period);
  useEffect(() => { setPeriod(__gp.period); }, [__gp.period]);
  const resolved = resolvePeriod(period);
  const q = useQuery({
    queryKey: ["my-investments", period],
    queryFn: () => fn({ data: { from: resolved.dateFrom ?? undefined, to: resolved.dateTo ?? undefined } }),
  });

  if (q.isLoading) return <div className="p-6">جارِ التحميل…</div>;
  if (!q.data) {
    return (
      <div className="p-6">
        <EmptyState title="لا يوجد حساب مستثمر مرتبط" description="تواصل مع الإدارة لربط حسابك بملف مستثمر." />
      </div>
    );
  }
  const d = q.data;
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" /> استثماراتي
          </h1>
          <p className="text-sm text-muted-foreground">أهلاً {d.investor?.name}</p>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="الإيرادات" value={fmt(d.totals.revenue)} />
        <Kpi title="التكاليف" value={fmt(d.totals.costs)} />
        <Kpi title="صافي الأرباح" value={fmt(d.totals.profit)} />
        <Kpi title="نصيبك" value={fmt(d.totals.investor_profit)} highlight />
      </div>

      <Card>
        <CardHeader><CardTitle>البراندات ونصيبك</CardTitle></CardHeader>
        <CardContent>
          {d.brands.length === 0 ? (
            <EmptyState title="لا توجد براندات" description="لم يتم تحديد نسب بعد." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>البراند</TableHead>
                  <TableHead>نسبتك</TableHead>
                  <TableHead>الإيرادات</TableHead>
                  <TableHead>التكاليف</TableHead>
                  <TableHead>الربح</TableHead>
                  <TableHead>نصيبك</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.brands.map((b) => (
                  <TableRow key={b.brand_id}>
                    <TableCell className="font-medium">
                      {b.brand_name}{" "}
                      <Badge variant="outline" className="mr-1 text-[10px]">
                        {b.brand_type === "service" ? "خدمي" : "منتج"}
                      </Badge>
                    </TableCell>
                    <TableCell>{b.share_percentage}%</TableCell>
                    <TableCell>{fmt(b.revenue)}</TableCell>
                    <TableCell>{fmt(b.costs)}</TableCell>
                    <TableCell className={b.profit >= 0 ? "text-green-600" : "text-red-600"}>{fmt(b.profit)}</TableCell>
                    <TableCell className="font-semibold">{fmt(b.investor_profit)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {d.valuation && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Building2 className="w-5 h-5 text-primary" /> نصيبك من التقييم</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi title="نصيبك من تقييمات البراندات" value={fmt(d.valuation.brand_totals.investor_valuation)} highlight />
              <Kpi title="تقييم كامل الشركة" value={fmt(d.valuation.company.total_company_valuation)} />
              <Kpi title="نسبتك الفعلية من الشركة" value={`${d.valuation.company.effective_ownership_pct.toFixed(2)}%`} />
              <Kpi title="نصيبك من كامل الشركة" value={fmt(d.valuation.company.investor_company_share)} highlight />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>البراند</TableHead>
                  <TableHead>نسبتك</TableHead>
                  <TableHead>إيرادات سنوية</TableHead>
                  <TableHead>أصول (صافي)</TableHead>
                  <TableHead>تقييم البراند</TableHead>
                  <TableHead>نصيبك</TableHead>
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
                    <TableCell className="font-semibold text-primary">{fmt(r.investor_valuation)}</TableCell>
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
