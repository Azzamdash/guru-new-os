import { tr } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getValuationReport } from "@/lib/assets.functions";
import { getMyRole } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReportActions } from "@/components/ReportActions";
import { EmptyState } from "@/components/EmptyState";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Building2, TrendingUp, Lock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_app/reports/valuation")({
  head: () => ({
    meta: [
      { title: tr("تقييم الشركات — e-GURUS") },
      { name: "description", content: "تقييم كل براند بناءً على إيرادات آخر ١٢ شهر والأصول." },
    ],
  }),
  component: ValuationPage,
});

const fmt = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0);

function ValuationPage() {
  const roleQ = useQuery({ queryKey: ["my-role"], queryFn: useServerFn(getMyRole) });
  const isPrivileged = !!(roleQ.data?.isAdmin || roleQ.data?.isManager);
  const fn = useServerFn(getValuationReport);
  const q = useQuery({ queryKey: ["valuation-report"], queryFn: () => fn(), enabled: isPrivileged });

  if (roleQ.data && !isPrivileged) {
    return (
      <div className="p-10 max-w-2xl mx-auto">
        <Card className="p-8 text-center card-gradient">
          <Lock className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h2 className="text-xl font-bold">{tr("مقصور على المدير والمشرف")}</h2>
        </Card>
      </div>
    );
  }

  const data = q.data;
  const rows = data?.rows ?? [];
  const chartData = rows.map((r) => ({ name: r.brand_name, valuation: r.valuation, revenue: r.annual_revenue, assets: r.assets_net }));

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Building2 className="w-7 h-7 text-primary" /> {tr("تقييم الشركات")}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {tr("المعادلة: قيمة البراند = (إيرادات آخر ١٢ شهر × 1.5) + القيمة الدفترية للأصول الخاصة بالبراند.")}
          </p>
        </div>
        <ReportActions
          filename="valuation-report"
          summaryTitle={tr("تقييم الشركات")}
          summaryText={data ? `التقييم الكلي: ${fmt(data.totalCompanyValuation)}` : tr("تقرير تقييم البراندات")}
          rows={rows as unknown as Record<string, unknown>[]}
          columns={[
            { key: "brand_name", label: tr("البراند") },
            { key: "annual_revenue", label: tr("إيرادات آخر ١٢ شهر"), fmt: (v) => fmt(Number(v)) },
            { key: "assets_net", label: tr("القيمة الدفترية للأصول"), fmt: (v) => fmt(Number(v)) },
            { key: "valuation", label: tr("التقييم"), fmt: (v) => fmt(Number(v)) },
          ]}
        />
      </div>

      {q.isLoading ? (
        <Card className="p-10 text-center text-muted-foreground">{tr("جارٍ الحساب…")}</Card>
      ) : !data || rows.length === 0 ? (
        <Card className="card-gradient"><EmptyState title={tr("لا توجد بيانات كافية")} description={tr("أضف براندات وفواتير مبيعات وأصول لبدء الحساب.")} /></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label={tr("عدد البراندات")} value={String(rows.length)} />
            <Kpi label={tr("إجمالي إيرادات آخر ١٢ شهر")} value={fmt(data.totals.annual_revenue)} />
            <Kpi label={tr("أصول عامة للشركة (صافي)")} value={fmt(data.companyWide.net)} />
            <Kpi label={tr("التقييم الإجمالي للشركة")} value={fmt(data.totalCompanyValuation)} highlight />
          </div>

          <Card className="card-gradient p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h3 className="font-semibold">{tr("تقييم البراندات")}</h3>
            </div>
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Bar dataKey="valuation" name={tr("التقييم")} fill="hsl(175 60% 55%)" />
                  <Bar dataKey="revenue" name={tr("الإيرادات")} fill="hsl(85 65% 60%)" />
                  <Bar dataKey="assets" name={tr("الأصول")} fill="hsl(305 55% 65%)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="card-gradient overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-muted-foreground text-right border-b border-border">
                    <th className="p-3">{tr("البراند")}</th>
                    <th className="p-3">{tr("النوع")}</th>
                    <th className="p-3">{tr("إيرادات آخر ١٢ شهر")}</th>
                    <th className="p-3">× 1.5</th>
                    <th className="p-3">{tr("أصول (صافي)")}</th>
                    <th className="p-3">{tr("التقييم")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.brand_id} className="border-b border-border/50">
                      <td className="p-3 font-medium">{r.brand_name}</td>
                      <td className="p-3"><Badge variant="outline">{r.brand_type === "service" ? tr("خدمات") : tr("منتجات")}</Badge></td>
                      <td className="p-3 num">{fmt(r.annual_revenue)}</td>
                      <td className="p-3 num text-muted-foreground">{fmt(r.annual_revenue * 1.5)}</td>
                      <td className="p-3 num">{fmt(r.assets_net)}</td>
                      <td className="p-3 num font-bold text-primary">{fmt(r.valuation)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/30 font-semibold">
                    <td className="p-3">{tr("الإجمالي")}</td>
                    <td></td>
                    <td className="p-3 num">{fmt(data.totals.annual_revenue)}</td>
                    <td></td>
                    <td className="p-3 num">{fmt(data.totals.assets_net)}</td>
                    <td className="p-3 num text-primary">{fmt(data.totals.valuation)}</td>
                  </tr>
                  <tr className="bg-primary/5">
                    <td className="p-3 text-xs text-muted-foreground" colSpan={5}>{tr("+ أصول عامة للشركة (لا تخص براند)")}</td>
                    <td className="p-3 num">{fmt(data.companyWide.net)}</td>
                  </tr>
                  <tr className="bg-primary/10 font-bold">
                    <td className="p-3" colSpan={5}>{tr("التقييم الإجمالي للشركة")}</td>
                    <td className="p-3 num text-primary">{fmt(data.totalCompanyValuation)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={`p-4 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-1 num ${highlight ? "text-primary" : ""}`}>{value}</div>
    </Card>
  );
}
