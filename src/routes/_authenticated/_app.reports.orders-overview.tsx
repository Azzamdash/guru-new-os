import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Activity, Wallet, Truck, Download, RefreshCw } from "lucide-react";
import { exportToCSV } from "@/lib/export-utils";
import { PeriodFilter, resolvePeriod } from "@/components/PeriodFilter";
import { usePersistedPeriod } from "@/lib/global-period";
import { queryPresets } from "@/lib/query-presets";
import { listBrands } from "@/lib/internal.functions";
import { getOrdersOverview } from "@/lib/orders-management.functions";
import { getEmployeeOrdersPerformance } from "@/lib/distribution.functions";
import { useLang } from "@/lib/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_app/reports/orders-overview")({
  head: () => ({
    meta: [
      { title: "مؤشرات الأوردرات — e-GURUS" },
      {
        name: "description",
        content:
          "مؤشرات الأداء الشاملة للأوردرات: المبيعات، التسليم، التحصيل حسب الحالة والشركة والمحافظة.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OrdersOverviewReport,
});

const nf = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const pct = (n: number) => `${Number(n || 0).toFixed(1)}%`;

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Truck;
}) {
  return (
    <Card className="p-4 space-y-1">
      <div className="flex items-center justify-between text-muted-foreground text-sm">
        <span>{label}</span>
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </Card>
  );
}

function OrdersOverviewReport() {
  const { lang } = useLang();
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const qc = useQueryClient();
  const [period, setPeriod] = usePersistedPeriod("reports-orders-overview");
  const resolved = useMemo(() => resolvePeriod(period), [period]);
  const [brandId, setBrandId] = useState<string>("all");

  const brands = useQuery({
    queryKey: ["brands"],
    queryFn: () => listBrands(),
    ...queryPresets.reference,
  });

  const overviewFn = useServerFn(getOrdersOverview);
  const overview = useQuery({
    queryKey: ["reports-orders-overview", resolved.dateFrom, resolved.dateTo, brandId],
    queryFn: () =>
      overviewFn({
        data: {
          dateFrom: resolved.dateFrom,
          dateTo: resolved.dateTo,
          brandId: brandId === "all" ? null : brandId,
        },
      }),
    ...queryPresets.report,
  });

  const o = overview.data;

  const employeePerfFn = useServerFn(getEmployeeOrdersPerformance);
  const employeePerf = useQuery({
    queryKey: [
      "reports-orders-overview",
      "employee-perf",
      resolved.dateFrom,
      resolved.dateTo,
      brandId,
    ],
    queryFn: () =>
      employeePerfFn({
        data: {
          dateFrom: resolved.dateFrom,
          dateTo: resolved.dateTo,
          brandId: brandId === "all" ? null : brandId,
        },
      }),
    ...queryPresets.report,
  });

  const exportOverviewCsv = () => {
    if (!o) return;
    const rows: Array<Record<string, unknown>> = [];
    const push = (
      c1: unknown,
      c2: unknown = "",
      c3: unknown = "",
      c4: unknown = "",
      c5: unknown = "",
    ) => rows.push({ c1, c2, c3, c4, c5 });

    push(t("حسب الحالة", "By status"));
    push(t("الحالة", "Status"), t("عدد الأوردرات", "Order count"), t("القيمة", "Amount"));
    o.byStatus.forEach((r) => push(r.status, r.count, r.amount));
    push("");

    push(t("أداء شركات الشحن", "Courier performance"));
    push(
      t("الشركة", "Courier"),
      t("أوردرات", "Orders"),
      t("تم التسليم", "Delivered"),
      t("مرتجع", "Returned"),
      t("نسبة التسليم %", "Delivery rate %"),
    );
    o.byCourier.forEach((r) =>
      push(r.name, r.count, r.delivered, r.returned, Number(r.deliveryRate || 0).toFixed(1)),
    );
    push("");

    push(t("التوزيع الجغرافي", "Geographic distribution"));
    push(
      t("المحافظة", "Governorate"),
      t("أوردرات", "Orders"),
      t("تم التسليم", "Delivered"),
      t("القيمة", "Amount"),
    );
    o.byGovernorate.forEach((r) => push(r.name, r.count, r.delivered, r.amount));
    push("");

    if (employeePerf.data && employeePerf.data.length > 0) {
      push(t("أداء الموظفين", "Employee performance"));
      push(
        t("الموظف", "Employee"),
        t("إجمالي الأوردرات", "Total orders"),
        t("تم بنجاح", "Succeeded"),
        t("ملغي", "Cancelled"),
        t("مؤكد", "Confirmed"),
      );
      employeePerf.data.forEach((r) =>
        push(r.employeeName, r.total, r.succeeded, r.cancelled, r.confirmed),
      );
    }

    exportToCSV(`orders-overview-${resolved.dateFrom ?? ""}_${resolved.dateTo ?? ""}`, rows, [
      { key: "c1", label: "" },
      { key: "c2", label: "" },
      { key: "c3", label: "" },
      { key: "c4", label: "" },
      { key: "c5", label: "" },
    ]);
    toast.success(t("تم تصدير المؤشرات", "KPIs exported"));
  };

  return (
    <div className="p-4 md:p-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t("مؤشرات الأوردرات", "Orders KPIs")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={brandId} onValueChange={setBrandId}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("كل البراندات", "All brands")}</SelectItem>
              {(brands.data ?? []).map((b: { id: string; name: string }) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <PeriodFilter value={period} onChange={setPeriod} />
          <Button
            variant="outline"
            size="sm"
            onClick={exportOverviewCsv}
            disabled={!o}
            className="gap-1.5"
          >
            <Download className="h-4 w-4" /> {t("تصدير CSV", "Export CSV")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["reports-orders-overview"] })}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {overview.isLoading ? (
        <Card className="p-6 text-muted-foreground">{t("جارٍ التحميل…", "Loading…")}</Card>
      ) : null}
      {o ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label={t("عدد الأوردرات", "Order count")}
              value={nf(o.totals.orders)}
              icon={Activity}
            />
            <Kpi
              label={t("إجمالي المبيعات", "Total sales")}
              value={nf(o.totals.revenue)}
              hint={t(
                `متوسط الأوردر ${nf(o.totals.avgOrderValue)}`,
                `Avg order ${nf(o.totals.avgOrderValue)}`,
              )}
              icon={Wallet}
            />
            <Kpi
              label={t("نسبة التسليم", "Delivery rate")}
              value={pct(o.delivery.deliveryRate)}
              hint={t(
                `${nf(o.delivery.delivered)} تم تسليمها`,
                `${nf(o.delivery.delivered)} delivered`,
              )}
              icon={Truck}
            />
            <Kpi
              label={t("نسبة المرتجع", "Return rate")}
              value={pct(o.delivery.returnRate)}
              hint={t(`${nf(o.delivery.returned)} مرتجع`, `${nf(o.delivery.returned)} returned`)}
              icon={Truck}
            />
            <Kpi
              label={t("المتوقع تحصيله", "Expected to collect")}
              value={nf(o.collection.expected)}
              icon={Wallet}
            />
            <Kpi
              label={t("المحصّل فعليًا", "Actually collected")}
              value={nf(o.collection.collected)}
              hint={pct(o.collection.collectionRate)}
              icon={Wallet}
            />
            <Kpi
              label={t("المتبقي", "Outstanding")}
              value={nf(o.collection.outstanding)}
              icon={Wallet}
            />
            <Kpi
              label={t("قيد التنفيذ", "In progress")}
              value={nf(o.delivery.open)}
              hint={t(`${nf(o.delivery.cancelled)} ملغي`, `${nf(o.delivery.cancelled)} cancelled`)}
              icon={Activity}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <div className="font-semibold mb-2">{t("حسب الحالة", "By status")}</div>
              <table className="w-full text-sm">
                <tbody>
                  {o.byStatus.map((r) => (
                    <tr key={r.status} className="border-b last:border-0">
                      <td className="py-1">{r.status}</td>
                      <td className="py-1 text-right tabular-nums">{nf(r.count)}</td>
                      <td className="py-1 text-right tabular-nums">{nf(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card className="p-4">
              <div className="font-semibold mb-2">
                {t("أداء شركات الشحن", "Courier performance")}
              </div>
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-start">{t("الشركة", "Courier")}</th>
                    <th>{t("أوردرات", "Orders")}</th>
                    <th>{t("تسليم", "Delivered")}</th>
                    <th>{t("مرتجع", "Returned")}</th>
                    <th>{t("النسبة", "Rate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {o.byCourier.map((r) => (
                    <tr key={r.name} className="border-b last:border-0 text-center">
                      <td className="py-1 text-start">{r.name}</td>
                      <td className="tabular-nums">{nf(r.count)}</td>
                      <td className="tabular-nums">{nf(r.delivered)}</td>
                      <td className="tabular-nums">{nf(r.returned)}</td>
                      <td className="tabular-nums">{pct(r.deliveryRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card className="p-4 lg:col-span-2">
              <div className="font-semibold mb-2">
                {t("التوزيع الجغرافي", "Geographic distribution")}
              </div>
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-start">{t("المحافظة", "Governorate")}</th>
                    <th>{t("أوردرات", "Orders")}</th>
                    <th>{t("تم التسليم", "Delivered")}</th>
                    <th>{t("القيمة", "Amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {o.byGovernorate.map((r) => (
                    <tr key={r.name} className="border-b last:border-0 text-center">
                      <td className="py-1 text-start">{r.name}</td>
                      <td className="tabular-nums">{nf(r.count)}</td>
                      <td className="tabular-nums">{nf(r.delivered)}</td>
                      <td className="tabular-nums">{nf(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          <Card className="p-4">
            <div className="font-semibold mb-2 flex items-center gap-2">
              <Users className="h-4 w-4" /> {t("أداء الموظفين", "Employee performance")}
            </div>
            {employeePerf.isLoading ? (
              <div className="text-sm text-muted-foreground">{t("جارٍ التحميل…", "Loading…")}</div>
            ) : !employeePerf.data || employeePerf.data.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                {t("لا توجد أوردرات موزّعة في هذه الفترة", "No assigned orders in this period")}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-start">{t("الموظف", "Employee")}</th>
                    <th>{t("إجمالي الأوردرات", "Total orders")}</th>
                    <th>{t("تم بنجاح", "Succeeded")}</th>
                    <th>{t("ملغي", "Cancelled")}</th>
                    <th>{t("مؤكد", "Confirmed")}</th>
                    <th>{t("بانتظار التأكيد", "Pending confirmation")}</th>
                  </tr>
                </thead>
                <tbody>
                  {employeePerf.data.map((r) => (
                    <tr key={r.employeeId} className="border-b last:border-0 text-center">
                      <td className="py-1 text-start">{r.employeeName}</td>
                      <td className="tabular-nums">{nf(r.total)}</td>
                      <td className="tabular-nums">{nf(r.succeeded)}</td>
                      <td className="tabular-nums">{nf(r.cancelled)}</td>
                      <td className="tabular-nums">{nf(r.confirmed)}</td>
                      <td className="tabular-nums">{nf(r.pendingConfirmation)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
