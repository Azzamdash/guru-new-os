import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PeriodFilter, defaultPeriod, resolvePeriod, type PeriodValue } from "@/components/PeriodFilter";
import { useGlobalPeriod } from "@/lib/global-period";
import { getCashFlow } from "@/lib/financials.functions";
import { listBrands } from "@/lib/internal.functions";
import { useLang } from "@/lib/i18n";
import { Wallet, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

export const Route = createFileRoute("/_authenticated/_app/reports/cash-flow")({
  head: () => ({ meta: [
    { title: "تقرير التدفقات النقدية — e-GURUS" },
    { name: "description", content: "تدفقات نقدية: تشغيلية، تمويلية، وصافي التغير في النقد." },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
  component: Page,
});

function Page() {
  const { t, lang } = useLang();
  const brandsFn = useServerFn(listBrands);
  const fn = useServerFn(getCashFlow);
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => brandsFn() });
  const [brandId, setBrandId] = useState<string>("all");
  const __gp = useGlobalPeriod();
  const [period, setPeriod] = useState<PeriodValue>(__gp.period);
  useEffect(() => { setPeriod(__gp.period); }, [__gp.period]);
  const r = resolvePeriod(period);
  const q = useQuery({
    queryKey: ["cash-flow", brandId, r.dateFrom, r.dateTo, r.year],
    queryFn: () => fn({ data: { brandId: brandId === "all" ? null : brandId, from: r.dateFrom ?? `${r.year}-01-01`, to: r.dateTo ?? `${r.year}-12-31` } }),
  });
  const d = q.data;
  const nf = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const L = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const cls = (n: number) => n >= 0 ? "text-emerald-500" : "text-destructive";

  return (
    <div className="p-6 md:p-8 space-y-6">
      <h1 className="text-3xl font-bold flex items-center gap-2"><Wallet className="w-7 h-7" /> {L("التدفقات النقدية", "Cash Flow")}</h1>
      <Card className="card-gradient p-4 flex flex-wrap gap-3 items-center">
        <PeriodFilter value={period} onChange={setPeriod} />
        <Select value={brandId} onValueChange={setBrandId}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all_brands")}</SelectItem>
            {(brandsQ.data ?? []).filter((b) => b.active).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Kpi label={L("النقد التشغيلي", "Operating Cash")} value={nf(d?.operating.net ?? 0)} tone={cls(d?.operating.net ?? 0)} />
        <Kpi label={L("النقد التمويلي", "Financing Cash")} value={nf(d?.financing.net ?? 0)} tone={cls(d?.financing.net ?? 0)} />
        <Kpi label={L("النقد الاستثماري", "Investing Cash")} value={nf(d?.investing.net ?? 0)} tone={cls(d?.investing.net ?? 0)} />
        <Kpi label={L("صافي التغير", "Net Change in Cash")} value={nf(d?.netChange ?? 0)} tone={cls(d?.netChange ?? 0)} big />
      </div>

      <Card className="card-gradient p-5">
        <h3 className="font-semibold mb-4">{L("التدفقات الشهرية", "Monthly Cash Flow")}</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d?.byMonth ?? []}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="month" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Legend />
              <Bar dataKey="operating" name={L("تشغيلي", "Operating")} fill="hsl(var(--primary))" />
              <Bar dataKey="financing" name={L("تمويلي", "Financing")} fill="hsl(var(--muted-foreground))" />
              <Bar dataKey="net" name={L("الصافي", "Net")} fill="hsl(var(--chart-3, 200 90% 60%))" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="card-gradient p-5">
        <h3 className="font-semibold mb-3">{L("تفصيل البنود", "Line-item Breakdown")}</h3>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-muted-foreground">
            <th className="p-2 text-start">{L("البند", "Item")}</th>
            <th className="p-2 text-start">{L("التصنيف", "Category")}</th>
            <th className="p-2 text-start">{L("الاتجاه", "Direction")}</th>
            <th className="p-2 text-end">{L("المبلغ", "Amount")}</th>
          </tr></thead>
          <tbody>
            {(d?.breakdown ?? []).map((b, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="p-2">{lang === "ar" && b.labelAr ? b.labelAr : b.label}</td>
                <td className="p-2 text-xs uppercase text-muted-foreground">{b.category}</td>
                <td className="p-2">
                  {b.direction === "in"
                    ? <span className="inline-flex items-center gap-1 text-emerald-500"><ArrowDownRight className="w-3 h-3" />{L("داخل", "Inflow")}</span>
                    : <span className="inline-flex items-center gap-1 text-destructive"><ArrowUpRight className="w-3 h-3" />{L("خارج", "Outflow")}</span>}
                </td>
                <td className={`p-2 num text-end ${b.direction === "in" ? "text-emerald-500" : "text-destructive"}`}>{b.direction === "in" ? "+" : "-"}{nf(b.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Kpi({ label, value, tone, big }: { label: string; value: string; tone: string; big?: boolean }) {
  return (
    <Card className="card-gradient p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`${big ? "text-3xl" : "text-2xl"} font-bold mt-1 num ${tone}`}>{value}</div>
    </Card>
  );
}