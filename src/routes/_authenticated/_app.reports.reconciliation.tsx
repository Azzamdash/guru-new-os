import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
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
import { getCourierReconciliation } from "@/lib/reconciliation.functions";
import { getIncomeStatement } from "@/lib/financials.functions";
import { listBrands } from "@/lib/internal.functions";
import { useLang, tr } from "@/lib/i18n";
import { Scale, AlertTriangle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_app/reports/reconciliation")({
  head: () => ({
    meta: [
      { title: tr("تسوية شركات الشحن (COD) — e-GURUS") },
      { name: "description", content: "مطابقة المحصّل الفعلي مع المودَع في الخزنة لكل شركة شحن." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Page,
});

function Page() {
  const { t, lang } = useLang();
  const brandsFn = useServerFn(listBrands);
  const fn = useServerFn(getCourierReconciliation);
  const isFn = useServerFn(getIncomeStatement);
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => brandsFn() });
  const [brandId, setBrandId] = useState<string>("all");
  const [period, setPeriod] = usePersistedPeriod("reports.reconciliation");
  const r = resolvePeriod(period);
  const from = r.dateFrom ?? `${r.year}-01-01`;
  const to = r.dateTo ?? `${r.year}-12-31`;
  const q = useQuery({
    queryKey: ["recon", brandId, from, to],
    queryFn: () =>
      fn({
        data: {
          brandId: brandId === "all" ? null : brandId,
          from,
          to,
        },
      }),
  });
  const isQ = useQuery({
    queryKey: ["recon-is", brandId, from, to],
    queryFn: () => isFn({ data: { from, to, brandId: brandId === "all" ? null : brandId } }),
  });
  const d = q.data;
  const is = isQ.data;
  const nf = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const L = (ar: string, en: string) => (lang === "ar" ? ar : en);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <h1 className="text-3xl font-bold flex items-center gap-2">
        <Scale className="w-7 h-7" />{" "}
        {L(tr("تسوية شركات الشحن (COD)"), "Courier COD Reconciliation")}
      </h1>
      <Card className="card-gradient p-4 flex flex-wrap gap-3 items-center">
        <PeriodFilter value={period} onChange={setPeriod} />
        <Select value={brandId} onValueChange={setBrandId}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all_brands")}</SelectItem>
            {(brandsQ.data ?? [])
              .filter((b) => b.active)
              .map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Kpi
          label={L(tr("إيراد متوقع (أوردرات لسه ما اتسلمتش)"), "Projected revenue (not yet delivered)")}
          value={nf(is?.projectedNetRevenue ?? 0)}
        />
        <Kpi
          label={L(tr("المتوقع تحصيله"), "Expected COD")}
          value={nf(d?.totals.expected_cod ?? 0)}
        />
        <Kpi
          label={L(tr("المودَع فعليًا"), "Actually Deposited")}
          value={nf(d?.totals.deposited ?? 0)}
          tone="text-emerald-500"
        />
        <Kpi
          label={L(tr("الفرق"), "Variance")}
          value={nf(d?.totals.variance ?? 0)}
          tone={(d?.totals.variance ?? 0) === 0 ? "text-emerald-500" : "text-destructive"}
        />
        <Kpi
          label={L(tr("نسبة الفرق"), "Variance %")}
          value={pct(d?.totals.variance_pct ?? 0)}
          tone={(d?.totals.variance_pct ?? 0) === 0 ? "text-emerald-500" : "text-destructive"}
        />
      </div>

      <Card className="card-gradient p-5">
        <h3 className="font-semibold mb-3">{L(tr("تفصيل حسب شركة الشحن"), "By Courier")}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="p-2 text-start">{L(tr("شركة الشحن"), "Courier")}</th>
                <th className="p-2 text-end">{L(tr("مسلَّم"), "Delivered")}</th>
                <th className="p-2 text-end">{L(tr("مرتجع"), "Returned")}</th>
                <th className="p-2 text-end">{L(tr("المتوقع"), "Expected")}</th>
                <th className="p-2 text-end">{L(tr("المودَع"), "Deposited")}</th>
                <th className="p-2 text-end">{L(tr("الفرق"), "Variance")}</th>
                <th className="p-2 text-end">%</th>
                <th className="p-2 text-center">{L(tr("الحالة"), "Status")}</th>
              </tr>
            </thead>
            <tbody>
              {(d?.rows ?? []).map((r) => {
                const ok = Math.abs(r.variance) < 1;
                return (
                  <tr key={r.courier_id ?? "none"} className="border-b border-border/50">
                    <td className="p-2 font-medium">{r.courier_name}</td>
                    <td className="p-2 num text-end">{nf(r.delivered_orders)}</td>
                    <td className="p-2 num text-end text-muted-foreground">
                      {nf(r.returned_orders)}
                    </td>
                    <td className="p-2 num text-end">{nf(r.expected_cod)}</td>
                    <td className="p-2 num text-end text-emerald-500">{nf(r.deposited)}</td>
                    <td
                      className={`p-2 num text-end font-semibold ${ok ? "text-emerald-500" : "text-destructive"}`}
                    >
                      {nf(r.variance)}
                    </td>
                    <td
                      className={`p-2 num text-end ${ok ? "text-muted-foreground" : "text-destructive"}`}
                    >
                      {pct(r.variance_pct)}
                    </td>
                    <td className="p-2 text-center">
                      {ok ? (
                        <span className="inline-flex items-center gap-1 text-emerald-500">
                          <CheckCircle2 className="w-4 h-4" />
                          {L(tr("مطابق"), "Matched")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <AlertTriangle className="w-4 h-4" />
                          {L(tr("فرق"), "Variance")}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {(d?.rows ?? []).length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    {L(tr("لا توجد بيانات"), "No data")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          {L(
            tr(
              "المتوقع = مجموع فواتير المبيعات المُسلَّمة (Delivered) لكل شركة شحن. المودَع = مجموع تحصيلات الخزنة من نوع «تحصيل» المسجَّلة على شركة الشحن.",
            ),
            "Expected = total of delivered sales invoices per courier. Deposited = sum of treasury 'collection' entries recorded against that courier.",
          )}
        </p>
      </Card>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card className="card-gradient p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-1 num ${tone ?? ""}`}>{value}</div>
    </Card>
  );
}
