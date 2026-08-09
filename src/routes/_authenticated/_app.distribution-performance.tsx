import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users } from "lucide-react";
import { listBrands } from "@/lib/internal.functions";
import { getEmployeeOrdersPerformance } from "@/lib/distribution.functions";
import { useLang } from "@/lib/i18n";
import { PeriodFilter, resolvePeriod } from "@/components/PeriodFilter";
import { usePersistedPeriod } from "@/lib/global-period";

export const Route = createFileRoute("/_authenticated/_app/distribution-performance")({
  head: () => ({
    meta: [
      { title: "تقارير الموظفين — e-GURUS" },
      {
        name: "description",
        content: "أداء كل موظف في توزيع الأوردرات: إجمالي، مؤكد، ملغي، وبانتظار التأكيد.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Page,
});

function Page() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const brandsFn = useServerFn(listBrands);
  const employeePerfFn = useServerFn(getEmployeeOrdersPerformance);

  const [brandId, setBrandId] = useState<string>("all");
  const [period, setPeriod] = usePersistedPeriod("distribution-performance");
  const resolved = useMemo(() => resolvePeriod(period), [period]);

  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => brandsFn() });
  const employeePerfQ = useQuery({
    queryKey: ["distribution-employee-perf", brandId, resolved.dateFrom, resolved.dateTo],
    queryFn: () =>
      employeePerfFn({
        data: {
          dateFrom: resolved.dateFrom,
          dateTo: resolved.dateTo,
          brandId: brandId === "all" ? null : brandId,
        },
      }),
    staleTime: 30_000,
  });

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Users className="h-6 w-6 text-primary" /> {T("تقارير الموظفين", "Employee Reports")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {T(
            "أداء كل موظف في متابعة الأوردرات الموزَّعة عليه خلال الفترة.",
            "Each employee's performance on orders assigned to them during the period.",
          )}
        </p>
      </header>

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-40">
          <label className="mb-1 block text-xs text-muted-foreground">
            {T("البراند", "Brand")}
          </label>
          <Select value={brandId} onValueChange={setBrandId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{T("كل البراندات", "All Brands")}</SelectItem>
              {(brandsQ.data ?? []).map((b: { id: string; name: string }) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="p-2 text-start">{T("الموظف", "Employee")}</th>
              <th className="p-2 text-start">{T("إجمالي الأوردرات", "Total orders")}</th>
              <th className="p-2 text-start">{T("تم بنجاح", "Succeeded")}</th>
              <th className="p-2 text-start">{T("ملغي", "Cancelled")}</th>
              <th className="p-2 text-start">{T("مؤكد", "Confirmed")}</th>
              <th className="p-2 text-start">{T("بانتظار التأكيد", "Pending confirmation")}</th>
            </tr>
          </thead>
          <tbody>
            {employeePerfQ.isLoading && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  {T("جاري التحميل…", "Loading…")}
                </td>
              </tr>
            )}
            {(employeePerfQ.data ?? []).map((r) => (
              <tr key={r.employeeId} className="border-t">
                <td className="p-2 font-medium">{r.employeeName}</td>
                <td className="p-2">{r.total}</td>
                <td className="p-2">{r.succeeded}</td>
                <td className="p-2">{r.cancelled}</td>
                <td className="p-2">{r.confirmed}</td>
                <td className="p-2">{r.pendingConfirmation}</td>
              </tr>
            ))}
            {!employeePerfQ.isLoading && !(employeePerfQ.data ?? []).length && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  {T("لا توجد بيانات في هذه الفترة", "No data in this period")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
