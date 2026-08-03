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
import { getIncomeStatement } from "@/lib/financials.functions";
import { listBrands } from "@/lib/internal.functions";
import { useLang, tr } from "@/lib/i18n";
import { FileBarChart } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_app/reports/income-statement")({
  head: () => ({
    meta: [
      { title: tr("قائمة الدخل — e-GURUS") },
      {
        name: "description",
        content:
          "قائمة دخل احترافية: إيرادات، مرتجعات، خصومات، تكلفة البضاعة، مصاريف تشغيلية، صافي الربح.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Page,
});

function Page() {
  const { t, lang } = useLang();
  const brandsFn = useServerFn(listBrands);
  const fn = useServerFn(getIncomeStatement);
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => brandsFn() });
  const [brandId, setBrandId] = useState<string>("all");
  const [period, setPeriod] = usePersistedPeriod("reports.income-statement");
  const r = resolvePeriod(period);
  const q = useQuery({
    queryKey: ["income-statement", brandId, r.dateFrom, r.dateTo, r.year],
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
  const nf = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const L = (ar: string, en: string) => (lang === "ar" ? ar : en);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <FileBarChart className="w-7 h-7" /> {L(tr("قائمة الدخل"), "Income Statement")}
        </h1>
      </div>
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

      <Card className="card-gradient p-6">
        <div className="text-xs text-muted-foreground mb-3" dir="ltr">
          {d?.from} → {d?.to}
        </div>
        <table className="w-full text-sm">
          <tbody>
            <Row
              label={L(tr("إجمالي الإيرادات"), "Gross Revenue")}
              val={nf(d?.grossRevenue ?? 0)}
              bold
            />
            <Row
              label={L(tr("(−) المرتجعات"), "(−) Returns")}
              val={`(${nf(d?.returns ?? 0)})`}
              negative
            />
            <Row
              label={L(tr("(−) الخصومات"), "(−) Discounts")}
              val={`(${nf(d?.discounts ?? 0)})`}
              negative
            />
            <Row
              label={L(tr("صافي الإيرادات"), "Net Revenue")}
              val={nf(d?.netRevenue ?? 0)}
              bold
              divider
            />
            <Row
              label={L(tr("(−) تكلفة البضاعة المباعة (COGS)"), "(−) Cost of Goods Sold")}
              val={`(${nf(d?.cogs ?? 0)})`}
              negative
            />
            <Row
              label={L(tr("مجمل الربح (Gross Profit)"), "Gross Profit")}
              val={nf(d?.grossProfit ?? 0)}
              bold
              divider
              extra={pct(d?.grossMargin ?? 0)}
            />
            <tr>
              <td colSpan={3} className="pt-4 pb-1 text-xs uppercase text-muted-foreground">
                {L(tr("مصاريف التشغيل"), "Operating Expenses")}
              </td>
            </tr>
            {(d?.operatingExpenses ?? []).map((e) => (
              <Row key={e.name} label={`  ${e.name}`} val={`(${nf(e.amount)})`} negative small />
            ))}
            <Row
              label={L(tr("إجمالي مصاريف التشغيل"), "Total Operating Expenses")}
              val={`(${nf(d?.operatingExpensesTotal ?? 0)})`}
              negative
              bold
            />
            <Row
              label={L(tr("الربح التشغيلي"), "Operating Profit")}
              val={nf(d?.operatingProfit ?? 0)}
              bold
              divider
              extra={pct(d?.operatingMargin ?? 0)}
            />
            <Row
              label={L(tr("صافي الربح"), "Net Profit")}
              val={nf(d?.netProfit ?? 0)}
              bold
              big
              extra={pct(d?.netMargin ?? 0)}
            />
          </tbody>
        </table>
      </Card>

      {(d?.perBrand ?? []).length > 0 && (
        <Card className="card-gradient p-5">
          <h3 className="font-semibold mb-3">{L(tr("تفصيل حسب البراند"), "By Brand")}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="p-2 text-start">{L(tr("البراند"), "Brand")}</th>
                  <th className="p-2 text-start">{L(tr("صافي الإيرادات"), "Net Revenue")}</th>
                  <th className="p-2 text-start">COGS</th>
                  <th className="p-2 text-start">{L(tr("مجمل الربح"), "Gross Profit")}</th>
                  <th className="p-2 text-start">OpEx</th>
                  <th className="p-2 text-start">{L(tr("صافي الربح"), "Net Profit")}</th>
                  <th className="p-2 text-start">{L(tr("هامش"), "Margin")}</th>
                </tr>
              </thead>
              <tbody>
                {(d?.perBrand ?? []).map((r) => (
                  <tr key={r.brand_id} className="border-b border-border/50">
                    <td className="p-2 font-medium">{r.brand_name}</td>
                    <td className="p-2 num">{nf(r.netRevenue)}</td>
                    <td className="p-2 num text-muted-foreground">{nf(r.cogs)}</td>
                    <td className="p-2 num">{nf(r.grossProfit)}</td>
                    <td className="p-2 num text-muted-foreground">{nf(r.opex)}</td>
                    <td
                      className={`p-2 num ${r.netProfit >= 0 ? "text-emerald-500" : "text-destructive"}`}
                    >
                      {nf(r.netProfit)}
                    </td>
                    <td className="p-2 num">{pct(r.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Row({
  label,
  val,
  bold,
  big,
  negative,
  small,
  divider,
  extra,
}: {
  label: string;
  val: string;
  bold?: boolean;
  big?: boolean;
  negative?: boolean;
  small?: boolean;
  divider?: boolean;
  extra?: string;
}) {
  return (
    <tr className={divider ? "border-t border-border" : ""}>
      <td
        className={`py-2 ${bold ? "font-semibold" : ""} ${small ? "text-xs text-muted-foreground" : ""}`}
      >
        {label}
      </td>
      <td
        className={`py-2 num text-end ${bold ? "font-semibold" : ""} ${big ? "text-lg" : ""} ${negative ? "text-destructive" : ""}`}
      >
        {val}
      </td>
      <td className="py-2 num text-end text-xs text-muted-foreground w-20">{extra ?? ""}</td>
    </tr>
  );
}
