import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { PackageCheck, Clock, Users } from "lucide-react";
import { getInternalDashboard, listBrands } from "@/lib/internal.functions";
import { getPrepStaffPerformance } from "@/lib/operations.functions";
import {
  PeriodFilter,
  defaultPeriod,
  resolvePeriod,
  type PeriodValue,
} from "@/components/PeriodFilter";
import { usePersistedPeriod } from "@/lib/global-period";
import { fmtNum } from "@/lib/export-utils";
import { ChartFrame } from "@/components/EmptyState";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/prep-performance")({
  head: () => ({
    meta: [
      { title: "أداء التحضير والمخزن — e-GURUS" },
      {
        name: "description",
        content: "أداء موظفي تحضير الأوردرات وخط التجهيز.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PrepPerformancePage,
});

function Kpi({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof PackageCheck;
  label: string;
  value: string;
}) {
  return (
    <Card className="card-gradient p-5">
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </Card>
  );
}

function PrepPerformancePage() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const listBrandsFn = useServerFn(listBrands);
  const getDash = useServerFn(getInternalDashboard);
  const getPrepPerf = useServerFn(getPrepStaffPerformance);
  const [brandId, setBrandId] = useState<string>("all");
  const [period, setPeriod] = usePersistedPeriod("prep-performance");
  const resolved = resolvePeriod(period);

  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listBrandsFn() });
  const prepQ = useQuery({
    queryKey: ["prep-staff-perf", brandId, resolved.dateFrom, resolved.dateTo],
    queryFn: () =>
      getPrepPerf({
        data: {
          brandId: brandId === "all" ? null : brandId,
          dateFrom: resolved.dateFrom,
          dateTo: resolved.dateTo,
        },
      }),
  });
  const dashQ = useQuery({
    queryKey: [
      "prep-performance-dash",
      resolved.year,
      brandId,
      period.preset,
      resolved.dateFrom,
      resolved.dateTo,
    ],
    queryFn: () =>
      getDash({
        data: {
          year: resolved.year,
          brandId: brandId === "all" ? null : brandId,
          periodType: resolved.periodType,
          dateFrom: resolved.dateFrom,
          dateTo: resolved.dateTo,
        },
      }),
  });

  const d = dashQ.data;
  const fulfillment = d?.fulfillment?.employees ?? [];
  const totalPrepared = d?.fulfillment?.totalPrepared ?? 0;
  const prepRows = prepQ.data?.rows ?? [];
  const fulfillChart = [...prepRows]
    .sort((a, b) => b.handedOff - a.handedOff)
    .slice(0, 10)
    .map((r) => ({ name: r.email, handedOff: r.handedOff, total: r.total }));
  const totalPrepOrders = prepRows.reduce((s, r) => s + r.total, 0);
  const weightedAvgLead =
    totalPrepOrders > 0
      ? prepRows.reduce((s, r) => s + r.avgLeadHours * r.total, 0) / totalPrepOrders
      : 0;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <PackageCheck className="w-6 h-6 text-primary" />
            {T("أداء التحضير والمخزن", "Prep & Warehouse Performance")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {T(
              "أداء موظفي تحضير الأوردرات وخط التجهيز.",
              "Order prep and fulfillment-line staff performance.",
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Select value={brandId} onValueChange={setBrandId}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{T("كل البراندات", "All brands")}</SelectItem>
              {(brandsQ.data ?? [])
                .filter((b) => b.active)
                .map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <PeriodFilter value={period} onChange={setPeriod} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          icon={PackageCheck}
          label={T("تحضير الأوردرات", "Orders prepared")}
          value={fmtNum(totalPrepared)}
        />
        <Kpi
          icon={Clock}
          label={T("متوسط وقت التجهيز", "Avg prep time")}
          value={`${weightedAvgLead.toFixed(1)}h`}
        />
        <Kpi
          icon={Users}
          label={T("عدد موظفي التحضير", "Fulfillment staff count")}
          value={String(prepQ.data?.prepStaffCount ?? prepRows.length)}
        />
      </div>

      <Card className="card-gradient p-5">
        <h3 className="font-semibold mb-1">{T("أعلى موظفي التحضير", "Top fulfillment staff")}</h3>
        <p className="text-xs text-muted-foreground mb-3">
          {T(
            "يُحتسب تلقائياً بمجرد تسليم الأوردر للمندوب من خط تجهيز الأوردرات.",
            "Calculated automatically once the order is handed off to the rep from the fulfillment line.",
          )}
        </p>
        <ChartFrame
          isLoading={dashQ.isLoading}
          isError={dashQ.isError}
          error={dashQ.error}
          isEmpty={!dashQ.isLoading && fulfillChart.length === 0}
          emptyTitle={T("لا يوجد أوردرات مُكتملة بعد", "No completed orders yet")}
          emptyDescription={T(
            'يتم احتساب الترتيب تلقائياً من "مهمة تحضير الأوردر" حسب عدد الأوردرات المُسلَّمة لكل موظف.',
            'Ranking is calculated automatically from the "order fulfillment task" based on the number of orders delivered per employee.',
          )}
          onRetry={() => dashQ.refetch()}
          height={320}
        >
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={fulfillChart} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                }}
              />
              <Legend />
              <Bar
                dataKey="handedOff"
                name={T("مُسلَّم للمندوب", "Handed off to rep")}
                fill="hsl(var(--primary))"
              />
              <Bar
                dataKey="total"
                name={T("إجمالي المُسنَد", "Total assigned")}
                fill="hsl(var(--muted-foreground))"
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
      </Card>

      <Card className="card-gradient overflow-hidden">
        <div className="p-4 border-b border-border font-semibold flex items-center gap-2">
          <PackageCheck className="w-4 h-4 text-primary" />
          {T("أداء موظفي التحضير", "Fulfillment staff performance")}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-right text-muted-foreground">
              <th className="p-3">{T("الموظف", "Employee")}</th>
              <th className="p-3">{T("إجمالي التحضير", "Total prepared")}</th>
              <th className="p-3">{T("أيام العمل", "Work days")}</th>
              <th className="p-3">{T("متوسط/يوم", "Avg / day")}</th>
              <th className="p-3">{T("نصيبه %", "Share %")}</th>
            </tr>
          </thead>
          <tbody>
            {fulfillment.map((f) => (
              <tr key={f.name} className="border-b border-border/50">
                <td className="p-3 font-medium">{f.name}</td>
                <td className="p-3 font-semibold">{fmtNum(f.prepared)}</td>
                <td className="p-3">{f.days}</td>
                <td className="p-3">{fmtNum(Math.round(f.avgPerDay))}</td>
                <td className="p-3">
                  {totalPrepared > 0 ? ((f.prepared / totalPrepared) * 100).toFixed(1) : 0}%
                </td>
              </tr>
            ))}
            {fulfillment.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  {T(
                    'لا بيانات تحضير. سجّل من صفحة "تحضير الأوردرات".',
                    'No fulfillment data. Record it from the "Order Fulfillment" page.',
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="card-gradient overflow-hidden">
        <div className="p-4 border-b border-border font-semibold flex items-center gap-2">
          <PackageCheck className="w-4 h-4 text-primary" />
          {T(
            "أداء موظفي تحضير الأوردرات (من خط التجهيز)",
            "Order fulfillment staff performance (from prep line)",
          )}
        </div>
        <p className="p-3 text-xs text-muted-foreground border-b border-border/50">
          {T(
            "يعتمد على الأوردرات المُسنَدة لكل موظف داخل خط تجهيز الأوردرات — عدد الأوردرات، المُسلَّم، المتأخر عن SLA، ومتوسط وقت التجهيز.",
            "Based on the orders assigned to each employee within the order fulfillment line — order count, delivered, overdue on SLA, and average prep time.",
          )}
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-right text-muted-foreground">
              <th className="p-3">{T("الموظف", "Employee")}</th>
              <th className="p-3">{T("إجمالي الأوردرات", "Total orders")}</th>
              <th className="p-3">{T("مُسلَّم للمندوب", "Handed off to rep")}</th>
              <th className="p-3">{T("تم تسليمه للعميل", "Delivered to customer")}</th>
              <th className="p-3">{T("قيد التجهيز", "In progress")}</th>
              <th className="p-3">{T("متأخر SLA", "SLA breached")}</th>
              <th className="p-3">{T("ملغي", "Cancelled")}</th>
              <th className="p-3">{T("معدل الإنجاز", "Completion rate")}</th>
              <th className="p-3">{T("متوسط وقت التجهيز", "Avg prep time")}</th>
              <th className="p-3">{T("قيمة الأوردرات", "Orders value")}</th>
            </tr>
          </thead>
          <tbody>
            {(prepQ.data?.rows ?? []).map((r) => (
              <tr key={r.assigneeId} className="border-b border-border/50">
                <td className="p-3 font-medium" dir="ltr">
                  {r.email}
                </td>
                <td className="p-3 font-semibold">{fmtNum(r.total)}</td>
                <td className="p-3 text-primary font-semibold">{fmtNum(r.handedOff)}</td>
                <td className="p-3 text-emerald-500 font-semibold">{fmtNum(r.delivered)}</td>
                <td className="p-3">{fmtNum(r.active)}</td>
                <td className={`p-3 font-semibold ${r.breached > 0 ? "text-destructive" : ""}`}>
                  {fmtNum(r.breached)}
                </td>
                <td className="p-3 text-amber-500">{fmtNum(r.cancelled)}</td>
                <td className="p-3 font-semibold">{(r.deliveryRate * 100).toFixed(1)}%</td>
                <td className="p-3">{r.avgLeadHours.toFixed(1)}h</td>
                <td className="p-3">
                  {fmtNum(Math.round(r.revenue))} {T("ج", "EGP")}
                </td>
              </tr>
            ))}
            {(prepQ.data?.rows ?? []).length === 0 && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-muted-foreground">
                  {T("لا يوجد موظفو تحضير مسجَّلون بعد.", "No fulfillment staff registered yet.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
