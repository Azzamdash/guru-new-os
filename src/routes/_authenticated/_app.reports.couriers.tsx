import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Truck } from "lucide-react";
import { PeriodFilter, defaultPeriod, resolvePeriod, type PeriodValue } from "@/components/PeriodFilter";
import { useGlobalPeriod } from "@/lib/global-period";
import { getCouriersDashboard } from "@/lib/couriers.functions";
import { listBrands } from "@/lib/internal.functions";
import { useLang } from "@/lib/i18n";
import { registerReportOrderCount, orderScopeKey } from "@/lib/salesUnify";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated/_app/reports/couriers")({
  head: () => ({ meta: [
    { title: "لوحة شركات الشحن — e-GURUS" },
    { name: "description", content: "تحليل أداء المناديب وشركات الشحن حسب البراند والمدة والمحافظة." },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
  component: CouriersReport,
});

function CouriersReport() {
  const { t, lang } = useLang();
  const __gp = useGlobalPeriod();
  const [period, setPeriod] = useState<PeriodValue>(__gp.period);
  useEffect(() => { setPeriod(__gp.period); }, [__gp.period]);
  const [brandId, setBrandId] = useState<string>("all");
  const [courierId, setCourierId] = useState<string>("all");
  const resolved = useMemo(() => resolvePeriod(period), [period]);
  const from = resolved.dateFrom ?? `${resolved.year}-01-01`;
  const to = resolved.dateTo ?? `${resolved.year}-12-31`;

  const brandsFn = useServerFn(listBrands);
  const dashFn = useServerFn(getCouriersDashboard);
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => brandsFn() });
  const dashQ = useQuery({
    queryKey: ["couriers-dash", from, to, brandId, courierId],
    queryFn: () => dashFn({ data: { from, to, brandId: brandId === "all" ? null : brandId, courierId: courierId === "all" ? null : courierId } }),
  });
  const d = dashQ.data;
  useEffect(() => {
    if (!d) return;
    registerReportOrderCount(
      "reports_couriers",
      orderScopeKey({ brandId: brandId === "all" ? null : brandId, from, to }),
      d.totals.orders ?? 0,
    );
  }, [d, brandId, from, to]);
  const nf = (n: number) => Number(n || 0).toLocaleString("en-US");
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const AR = lang === "ar";

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center gap-2">
        <Truck className="w-7 h-7" />
        <h1 className="text-3xl font-bold">{AR ? "لوحة شركات الشحن والمناديب" : "Couriers Dashboard"}</h1>
      </div>

      <Card className="card-gradient p-4 flex flex-wrap items-center gap-3">
        <PeriodFilter value={period} onChange={setPeriod} />
        <Select value={brandId} onValueChange={setBrandId}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all_brands")}</SelectItem>
            {(brandsQ.data ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={courierId} onValueChange={setCourierId}>
          <SelectTrigger className="w-56"><SelectValue placeholder={AR ? "كل المناديب" : "All couriers"} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{AR ? "كل المناديب" : "All couriers"}</SelectItem>
            {(d?.couriersList ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-8 gap-3">
        <Kpi label={AR ? "الأوردرات" : "Orders"} value={nf(d?.totals.orders ?? 0)} />
        <Kpi label={AR ? "مسلَّم (أوردرات)" : "Delivered (orders)"} value={nf(d?.totals.delivered ?? 0)} tone="success" />
        <Kpi label={AR ? "مسلَّم (قطع)" : "Delivered (pieces)"} value={nf(d?.totals.deliveredPieces ?? 0)} tone="success" />
        <Kpi label={AR ? "مرتجع" : "Returned"} value={nf(d?.totals.returned ?? 0)} tone="destructive" />
        <Kpi label={AR ? "في الطريق" : "In transit"} value={nf(d?.totals.inTransit ?? 0)} />
        <Kpi label={AR ? "نسبة التسليم" : "Delivery rate"} value={pct(d?.totals.deliveryRate ?? 0)} tone="success" />
        <Kpi label={AR ? "متوقع تحصيله" : "Expected COD"} value={nf(Math.round(d?.totals.expectedCod ?? 0))} />
        <Kpi label={AR ? "التحصيل" : "Collected"} value={nf(Math.round(d?.totals.collected ?? 0))} />
      </div>


      {/* Couriers table */}
      <Card className="card-gradient overflow-hidden">
        <div className="p-4 font-semibold">{AR ? "أداء كل مندوب / شركة" : "Per courier performance"}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-muted-foreground">
              <th className="p-3 text-start">{AR ? "الاسم" : "Name"}</th>
              <th className="p-3 text-start">{AR ? "النوع" : "Type"}</th>
              <th className="p-3 text-start">{AR ? "الأوردرات" : "Orders"}</th>
              <th className="p-3 text-start">{AR ? "مسلَّم (أوردرات)" : "Delivered (orders)"}</th>
              <th className="p-3 text-start">{AR ? "مسلَّم (قطع)" : "Delivered (pieces)"}</th>
              <th className="p-3 text-start">{AR ? "مرتجع" : "Returned"}</th>
              <th className="p-3 text-start">{AR ? "في الطريق" : "In transit"}</th>
              <th className="p-3 text-start">{AR ? "نسبة التسليم" : "Delivery %"}</th>
              <th className="p-3 text-start">{AR ? "نسبة الارتجاع" : "Return %"}</th>
              <th className="p-3 text-start">{AR ? "متوقع تحصيله" : "Expected COD"}</th>
              <th className="p-3 text-start">{AR ? "التحصيل" : "Collected"}</th>
              <th className="p-3 text-start">{AR ? "الشحن" : "Shipping"}</th>
            </tr></thead>
            <tbody>
              {(d?.couriers ?? []).map((c) => (
                <tr key={c.courier_id ?? "none"} className="border-b border-border/50">
                  <td className="p-3">{c.name}</td>
                  <td className="p-3 text-xs"><Badge variant="outline">{c.type}</Badge></td>
                  <td className="p-3 num">{nf(c.orders)}</td>
                  <td className="p-3 num text-emerald-500">{nf(c.delivered)}</td>
                  <td className="p-3 num text-emerald-500">{nf(c.deliveredPieces)}</td>
                  <td className="p-3 num text-destructive">{nf(c.returned)}</td>
                  <td className="p-3 num">{nf(c.inTransit)}</td>
                  <td className="p-3 num text-emerald-500">{pct(c.deliveryRate)}</td>
                  <td className="p-3 num text-destructive">{pct(c.returnRate)}</td>
                  <td className="p-3 num text-amber-500">{nf(Math.round(c.expectedCod))}</td>
                  <td className="p-3 num">{nf(Math.round(c.collected))}</td>
                  <td className="p-3 num text-muted-foreground">{nf(Math.round(c.shipping))}</td>
                </tr>
              ))}
              {(d?.couriers ?? []).length === 0 && (
                <tr><td colSpan={13} className="p-8 text-center text-muted-foreground">{AR ? "لا توجد بيانات في هذه المدة." : "No data in this period."}</td></tr>
              )}
            </tbody>

          </table>
        </div>
      </Card>

      {/* Per-brand + Per-governorate side by side */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="card-gradient overflow-hidden">
          <div className="p-4 font-semibold">{AR ? "حسب البراند" : "Per brand"}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-muted-foreground">
                <th className="p-2 text-start">{t("brand")}</th>
                <th className="p-2 text-start">{AR ? "أوردرات" : "Orders"}</th>
                <th className="p-2 text-start">{AR ? "تسليم" : "Deliv."}</th>
                <th className="p-2 text-start">{AR ? "ارتجاع" : "Return"}</th>
                <th className="p-2 text-start">{AR ? "نسبة" : "Rate"}</th>
              </tr></thead>
              <tbody>
                {(d?.brands ?? []).map((b) => (
                  <tr key={b.brand_id} className="border-b border-border/50">
                    <td className="p-2">{b.name}</td>
                    <td className="p-2 num">{nf(b.orders)}</td>
                    <td className="p-2 num text-emerald-500">{nf(b.delivered)}</td>
                    <td className="p-2 num text-destructive">{nf(b.returned)}</td>
                    <td className="p-2 num">{pct(b.deliveryRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="card-gradient overflow-hidden">
          <div className="p-4 font-semibold">{AR ? "حسب المحافظة + أفضل شركة شحن" : "Per governorate + best courier"}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-muted-foreground">
                <th className="p-2 text-start">{AR ? "المحافظة" : "Governorate"}</th>
                <th className="p-2 text-start">{AR ? "أوردرات" : "Orders"}</th>
                <th className="p-2 text-start">{AR ? "نسبة التسليم" : "Delivery %"}</th>
                <th className="p-2 text-start">{AR ? "أفضل شركة" : "Best courier"}</th>
              </tr></thead>
              <tbody>
                {(d?.governorates ?? []).map((g) => (
                  <tr key={g.governorate} className="border-b border-border/50">
                    <td className="p-2">{g.governorate}</td>
                    <td className="p-2 num">{nf(g.orders)}</td>
                    <td className="p-2 num">{pct(g.deliveryRate)}</td>
                    <td className="p-2 text-xs">
                      {g.bestCourier
                        ? <span><span className="font-semibold">{g.bestCourier.name}</span> <span className="text-emerald-500 num">({pct(g.bestCourier.deliveryRate)})</span></span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone = "default" }: { label: string; value: string; tone?: "default"|"success"|"destructive"|"muted" }) {
  const cls = tone === "success" ? "text-emerald-500" : tone === "destructive" ? "text-destructive" : tone === "muted" ? "text-muted-foreground" : "";
  return (
    <Card className="card-gradient p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-1 num ${cls}`}>{value}</div>
    </Card>
  );
}
