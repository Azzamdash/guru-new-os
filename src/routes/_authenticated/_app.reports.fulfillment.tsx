import { tr } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Truck, Package, RotateCcw, Wallet, PackageCheck, Users, Clock } from "lucide-react";
import { getInternalDashboard, listBrands } from "@/lib/internal.functions";
import { getPrepStaffPerformance } from "@/lib/operations.functions";
import { getCouriersDashboard } from "@/lib/couriers.functions";
import { PeriodFilter, defaultPeriod, resolvePeriod, type PeriodValue } from "@/components/PeriodFilter";
import { usePersistedPeriod } from "@/lib/global-period";
import { ReportActions } from "@/components/ReportActions";
import { fmtNum, pctDelta } from "@/lib/export-utils";
import { ChartFrame } from "@/components/EmptyState";
import { registerReportOrderCount, orderScopeKey } from "@/lib/salesUnify";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated/_app/reports/fulfillment")({
  head: () => ({ meta: [
    { title: "Operation & Fulfillment — e-GURUS" },
    { name: "description", content: "Operation & Fulfillment reports: couriers, delivery/confirmation rates and prep staff." },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
  component: FulfillmentReports,
});

const TYPE_LABEL: Record<string, string> = {
  courier_company: "شركة شحن",
  rep: "مندوب",
  offline_branch: "فرع أوفلاين",
};

function FulfillmentReports() {
  const listBrandsFn = useServerFn(listBrands);
  const getDash = useServerFn(getInternalDashboard);
  const getCourDash = useServerFn(getCouriersDashboard);
  const [brandId, setBrandId] = useState<string>("all");
  const [confirm, setConfirm] = useState<string>("all");
  const [period, setPeriod] = usePersistedPeriod("reports.fulfillment");
  const resolved = resolvePeriod(period);
  const from = resolved.dateFrom ?? `${resolved.year}-01-01`;
  const to = resolved.dateTo ?? `${resolved.year}-12-31`;

  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listBrandsFn() });
  const getPrepPerf = useServerFn(getPrepStaffPerformance);
  const prepQ = useQuery({
    queryKey: ["prep-staff-perf", brandId, resolved.dateFrom, resolved.dateTo],
    queryFn: () => getPrepPerf({ data: { brandId: brandId === "all" ? null : brandId, dateFrom: resolved.dateFrom, dateTo: resolved.dateTo } }),
  });
  const dashQ = useQuery({
    queryKey: ["reports-fulfillment", resolved.year, brandId, period.preset, resolved.dateFrom, resolved.dateTo],
    queryFn: () => getDash({ data: {
      year: resolved.year, brandId: brandId === "all" ? null : brandId,
      periodType: resolved.periodType, dateFrom: resolved.dateFrom, dateTo: resolved.dateTo,
    } }),
  });
  // Unified source of truth for courier metrics = orders (same as /reports/couriers).
  const courDashQ = useQuery({
    queryKey: ["reports-fulfillment-couriers", brandId, from, to, confirm],
    queryFn: () => getCourDash({ data: { brandId: brandId === "all" ? null : brandId, from, to, confirmationStatus: confirm } }),
  });
  const prevQ = useQuery({
    queryKey: ["reports-fulfillment-prev", resolved.previous?.year, brandId, resolved.previous?.dateFrom, resolved.previous?.dateTo],
    enabled: !!resolved.previous,
    queryFn: () => getDash({ data: {
      year: resolved.previous!.year, brandId: brandId === "all" ? null : brandId,
      periodType: resolved.previous!.dateFrom ? "custom" : null,
      dateFrom: resolved.previous!.dateFrom, dateTo: resolved.previous!.dateTo,
    } }),
  });

  const d = dashQ.data;
  const cd = courDashQ.data;
  const p = prevQ.data;
  const couriers = cd?.couriers ?? [];
  const fulfillment = d?.fulfillment?.employees ?? [];
  const totalOrdersCouriers = cd?.totals.orders ?? 0;
  const totalConfirmed = cd?.totals.confirmed ?? 0;
  const totalDelivered = cd?.totals.delivered ?? 0;
  const totalReturned = cd?.totals.returned ?? 0;
  const totalCollected = cd?.totals.collected ?? 0;
  const totalPrepared = d?.fulfillment?.totalPrepared ?? 0;
  const overallDelivery = cd?.totals.deliveryRate ?? 0;
  const overallConfirmation = cd?.totals.confirmationRate ?? 0;

  // Previous-period comparison still uses the legacy dashboard aggregator; both sources
  // count 1 invoice = 1 order (verified at runtime by registerReportOrderCount below).
  const prevDelivered = (p?.couriers ?? []).reduce((a, c) => a + c.delivered, 0);
  const prevReturned = (p?.couriers ?? []).reduce((a, c) => a + c.returned, 0);
  const prevCollected = (p?.couriers ?? []).reduce((a, c) => a + c.collected, 0);
  const prevPrepared = p?.fulfillment?.totalPrepared ?? 0;

  useEffect(() => {
    if (!cd) return;
    registerReportOrderCount(
      "reports_fulfillment",
      orderScopeKey({ brandId: brandId === "all" ? null : brandId, from, to }),
      totalOrdersCouriers,
    );
  }, [cd, brandId, from, to, totalOrdersCouriers]);

  const chartData = couriers.slice(0, 10).map((c) => ({ name: c.name, delivered: c.delivered, returned: c.returned }));
  const prepRows = prepQ.data?.rows ?? [];
  const fulfillChart = [...prepRows]
    .sort((a, b) => b.handedOff - a.handedOff)
    .slice(0, 10)
    .map((r) => ({ name: r.email, handedOff: r.handedOff, total: r.total }));
  const totalPrepOrders = prepRows.reduce((s, r) => s + r.total, 0);
  const weightedAvgLead = totalPrepOrders > 0
    ? prepRows.reduce((s, r) => s + r.avgLeadHours * r.total, 0) / totalPrepOrders
    : 0;

  const summaryText = [
    `المسلَّم: ${fmtNum(totalDelivered)}`,
    `المرتجع: ${fmtNum(totalReturned)}`,
    `التحصيل: ${fmtNum(totalCollected)} جنيه`,
    `تحضير أوردرات: ${fmtNum(totalPrepared)}`,
    `معدل التسليم: ${(overallDelivery * 100).toFixed(1)}%`,
  ].join("\n");

  return (
    <div className="p-6 md:p-8 space-y-6" id="report-root">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2" dir="ltr"><Truck className="w-7 h-7 text-primary" /> Operation &amp; Fulfillment</h1>
          <p className="text-muted-foreground text-sm mt-1">{tr("شركات الشحن، المناديب، معدلات التأكيد والتسليم، التحصيل، وأداء موظفي تحضير الأوردرات.")}</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Select value={brandId} onValueChange={setBrandId}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr("كل البراندات")}</SelectItem>
              {(brandsQ.data ?? []).filter((b) => b.active).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={confirm} onValueChange={setConfirm}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr("كل حالات الأوردر")}</SelectItem>
              <SelectItem value="pending">{tr("بانتظار التأكيد")}</SelectItem>
              <SelectItem value="confirmed">{tr("مؤكد")}</SelectItem>
              <SelectItem value="cancelled">{tr("ملغي")}</SelectItem>
            </SelectContent>
          </Select>
          <PeriodFilter value={period} onChange={setPeriod} />
          <ReportActions
            filename={`fulfillment-report-${resolved.year}.csv`}
            summaryTitle={tr("تقرير Fulfillment")}
            summaryText={summaryText}
            rows={couriers as unknown as Array<Record<string, unknown>>}
            columns={[
              { key: "name", label: tr("الاسم") },
              { key: "type", label: tr("النوع"), fmt: (v) => TYPE_LABEL[String(v)] ?? String(v) },
              { key: "delivered", label: tr("مُسلَّم") },
              { key: "returned", label: tr("مُرتجع") },
              { key: "collected", label: tr("التحصيل") },
              { key: "deliveryRate", label: tr("معدل التسليم %"), fmt: (v) => `${((Number(v)||0) * 100).toFixed(1)}%` },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={Package} label={tr("الأوردرات")} value={fmtNum(totalOrdersCouriers)} />
        <Kpi icon={PackageCheck} label={tr("المُؤكَّد")} value={fmtNum(totalConfirmed)} />
        <Kpi icon={Package} label={tr("المُسلَّم")} value={fmtNum(totalDelivered)} delta={p ? pctDelta(totalDelivered, prevDelivered).label : null} />
        <Kpi icon={RotateCcw} label={tr("المُرتجع")} value={fmtNum(totalReturned)} tone="warn" delta={p ? pctDelta(totalReturned, prevReturned).label : null} />
        <Kpi icon={Wallet} label={tr("التحصيل")} value={`${fmtNum(totalCollected)} ج`} delta={p ? pctDelta(totalCollected, prevCollected).label : null} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={PackageCheck} label={tr("تحضير الأوردرات")} value={fmtNum(totalPrepared)} delta={p ? pctDelta(totalPrepared, prevPrepared).label : null} />
        <Kpi icon={Clock} label={tr("متوسط وقت التجهيز")} value={`${weightedAvgLead.toFixed(1)}h`} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="card-gradient p-5">
          <div className="text-xs text-muted-foreground">Confirmation Rate</div>
          <div className="text-2xl font-bold mt-1 text-primary">{(overallConfirmation * 100).toFixed(1)}%</div>
          <div className="text-[11px] text-muted-foreground mt-1">{tr("المؤكَّد ÷ إجمالي الأوردرات")}</div>
        </Card>
        <Card className="card-gradient p-5">
          <div className="text-xs text-muted-foreground">Delivery Rate</div>
          <div className="text-2xl font-bold mt-1 text-emerald-500">{(overallDelivery * 100).toFixed(1)}%</div>
          <div className="text-[11px] text-muted-foreground mt-1">{tr("المُسلَّم ÷ المُؤكَّد")}</div>
        </Card>
        <Card className="card-gradient p-5">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {tr("عدد المناديب/الشركات النشطة")}</div>
          <div className="text-2xl font-bold mt-1">{couriers.length}</div>
        </Card>
        <Card className="card-gradient p-5">
          <div className="text-xs text-muted-foreground">{tr("عدد موظفي التحضير")}</div>
          <div className="text-2xl font-bold mt-1">{prepQ.data?.prepStaffCount ?? prepRows.length}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{tr("حسب المستخدمين بدور \"موظف تحضير أوردرات\"")}</div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="card-gradient p-5">
          <h3 className="font-semibold mb-4">{tr("أداء أعلى 10 مناديب/شركات")}</h3>
          <ChartFrame
            isLoading={dashQ.isLoading}
            isError={dashQ.isError}
            error={dashQ.error}
            isEmpty={!dashQ.isLoading && chartData.length === 0}
            emptyTitle={tr("لا بيانات شحن لهذه الفترة")}
            emptyDescription={tr("أضف حركات مناديب أو شركات شحن لتظهر النتائج.")}
            onRetry={() => dashQ.refetch()}
            height={320}
          >
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Legend />
                <Bar dataKey="delivered" name={tr("مُسلَّم")} fill="hsl(var(--primary))" />
                <Bar dataKey="returned" name={tr("مُرتجع")} fill="hsl(var(--destructive))" />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </Card>
        <Card className="card-gradient p-5">
          <h3 className="font-semibold mb-1">{tr("أعلى موظفي التحضير")}</h3>
          <p className="text-xs text-muted-foreground mb-3">{tr("يُحتسب تلقائياً بمجرد تسليم الأوردر للمندوب من خط تجهيز الأوردرات.")}</p>
          <ChartFrame
            isLoading={dashQ.isLoading}
            isError={dashQ.isError}
            error={dashQ.error}
            isEmpty={!dashQ.isLoading && fulfillChart.length === 0}
            emptyTitle={tr("لا يوجد أوردرات مُكتملة بعد")}
            emptyDescription={tr("يتم احتساب الترتيب تلقائياً من \"مهمة تحضير الأوردر\" حسب عدد الأوردرات المُسلَّمة لكل موظف.")}
            onRetry={() => dashQ.refetch()}
            height={320}
          >
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={fulfillChart} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Legend />
                <Bar dataKey="handedOff" name={tr("مُسلَّم للمندوب")} fill="hsl(var(--primary))" />
                <Bar dataKey="total" name={tr("إجمالي المُسنَد")} fill="hsl(var(--muted-foreground))" />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </Card>
      </div>


      <Card className="card-gradient overflow-hidden">
        <div className="p-4 border-b border-border font-semibold">{tr("تفاصيل المناديب وشركات الشحن")}</div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-right text-muted-foreground">
            <th className="p-3">{tr("الاسم")}</th><th className="p-3">{tr("النوع")}</th>
            <th className="p-3">{tr("مُسلَّم")}</th><th className="p-3">{tr("مُرتجع")}</th>
            <th className="p-3">{tr("معدل التسليم")}</th><th className="p-3">{tr("معدل الإرجاع")}</th>
            <th className="p-3">{tr("التحصيل")}</th>
          </tr></thead>
          <tbody>
            {couriers.map((c) => (
              <tr key={c.courier_id ?? "unassigned"} className="border-b border-border/50">
                <td className="p-3 font-medium">{c.name}</td>
                <td className="p-3"><Badge variant="secondary">{TYPE_LABEL[c.type] ?? c.type}</Badge></td>
                <td className="p-3">{fmtNum(c.delivered)}</td>
                <td className="p-3 text-amber-500">{fmtNum(c.returned)}</td>
                <td className="p-3 font-semibold text-emerald-500">{(c.deliveryRate * 100).toFixed(1)}%</td>
                <td className={`p-3 font-semibold ${c.returnRate > 0.05 ? "text-destructive" : ""}`}>{(c.returnRate * 100).toFixed(1)}%</td>
                <td className="p-3">{fmtNum(c.collected)}</td>
              </tr>
            ))}
            {couriers.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">{tr("لا بيانات لهذه الفترة.")}</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card className="card-gradient overflow-hidden">
        <div className="p-4 border-b border-border font-semibold flex items-center gap-2">
          <PackageCheck className="w-4 h-4 text-primary" /> {tr("أداء موظفي التحضير")}
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-right text-muted-foreground">
            <th className="p-3">{tr("الموظف")}</th>
            <th className="p-3">{tr("إجمالي التحضير")}</th>
            <th className="p-3">{tr("أيام العمل")}</th>
            <th className="p-3">{tr("متوسط/يوم")}</th>
            <th className="p-3">{tr("نصيبه %")}</th>
          </tr></thead>
          <tbody>
            {fulfillment.map((f) => (
              <tr key={f.name} className="border-b border-border/50">
                <td className="p-3 font-medium">{f.name}</td>
                <td className="p-3 font-semibold">{fmtNum(f.prepared)}</td>
                <td className="p-3">{f.days}</td>
                <td className="p-3">{fmtNum(Math.round(f.avgPerDay))}</td>
                <td className="p-3">{totalPrepared > 0 ? ((f.prepared / totalPrepared) * 100).toFixed(1) : 0}%</td>
              </tr>
            ))}
            {fulfillment.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">{tr("لا بيانات تحضير. سجّل من صفحة \"تحضير الأوردرات\".")}</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card className="card-gradient overflow-hidden">
        <div className="p-4 border-b border-border font-semibold flex items-center gap-2">
          <PackageCheck className="w-4 h-4 text-primary" /> {tr("أداء موظفي تحضير الأوردرات (من خط التجهيز)")}
        </div>
        <p className="p-3 text-xs text-muted-foreground border-b border-border/50">
          {tr("يعتمد على الأوردرات المُسنَدة لكل موظف داخل خط تجهيز الأوردرات — عدد الأوردرات، المُسلَّم، المتأخر عن SLA، ومتوسط وقت التجهيز.")}
        </p>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-right text-muted-foreground">
            <th className="p-3">{tr("الموظف")}</th>
            <th className="p-3">{tr("إجمالي الأوردرات")}</th>
            <th className="p-3">{tr("مُسلَّم للمندوب")}</th>
            <th className="p-3">{tr("تم تسليمه للعميل")}</th>
            <th className="p-3">{tr("قيد التجهيز")}</th>
            <th className="p-3">{tr("متأخر SLA")}</th>
            <th className="p-3">{tr("ملغي")}</th>
            <th className="p-3">{tr("معدل الإنجاز")}</th>
            <th className="p-3">{tr("متوسط وقت التجهيز")}</th>
            <th className="p-3">{tr("قيمة الأوردرات")}</th>
          </tr></thead>
          <tbody>
            {(prepQ.data?.rows ?? []).map((r) => (
              <tr key={r.assigneeId} className="border-b border-border/50">
                <td className="p-3 font-medium" dir="ltr">{r.email}</td>
                <td className="p-3 font-semibold">{fmtNum(r.total)}</td>
                <td className="p-3 text-primary font-semibold">{fmtNum(r.handedOff)}</td>
                <td className="p-3 text-emerald-500 font-semibold">{fmtNum(r.delivered)}</td>
                <td className="p-3">{fmtNum(r.active)}</td>
                <td className={`p-3 font-semibold ${r.breached > 0 ? "text-destructive" : ""}`}>{fmtNum(r.breached)}</td>
                <td className="p-3 text-amber-500">{fmtNum(r.cancelled)}</td>
                <td className="p-3 font-semibold">{(r.deliveryRate * 100).toFixed(1)}%</td>
                <td className="p-3">{r.avgLeadHours.toFixed(1)}h</td>
                <td className="p-3">{fmtNum(Math.round(r.revenue))} {tr("ج")}</td>
              </tr>
            ))}
            {(prepQ.data?.rows ?? []).length === 0 && <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">{tr("لا يوجد موظفو تحضير مسجَّلون بعد.")}</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, delta, tone }: { icon: typeof Package; label: string; value: string; delta?: string | null; tone?: "warn" }) {
  const color = tone === "warn" ? "text-amber-500" : "";
  return (
    <Card className="card-gradient p-5">
      <div className="text-xs text-muted-foreground flex items-center gap-1"><Icon className="w-3.5 h-3.5" /> {label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
      {delta != null && <div className="text-[11px] mt-1 text-muted-foreground">{tr("مقارنة بالفترة السابقة:")} <span className="font-semibold">{delta}</span></div>}
    </Card>
  );
}
