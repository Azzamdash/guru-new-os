import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Truck } from "lucide-react";
import { getDistributionBoard } from "@/lib/distribution.functions";
import { useLang } from "@/lib/i18n";
import { PeriodFilter, resolvePeriod } from "@/components/PeriodFilter";
import { usePersistedPeriod } from "@/lib/global-period";

export const Route = createFileRoute("/_authenticated/_app/courier-loads")({
  head: () => ({
    meta: [
      { title: "أحمال شركات الشحن — e-GURUS" },
      {
        name: "description",
        content: "أحمال كل شركة شحن: مفتوحة، تم التسليم، مرتجع، ونسبة التسليم.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Page,
});

function Page() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const boardFn = useServerFn(getDistributionBoard);
  const [period, setPeriod] = usePersistedPeriod("courier-loads");
  const resolved = useMemo(() => resolvePeriod(period), [period]);

  const boardQ = useQuery({
    queryKey: ["distribution-board", "loads", resolved.dateFrom, resolved.dateTo],
    queryFn: () =>
      boardFn({
        data: {
          brandId: null,
          governorate: null,
          onlyUnassigned: false,
          search: null,
          dateFrom: resolved.dateFrom,
          dateTo: resolved.dateTo,
        },
      }),
    staleTime: 30_000,
  });

  const loads = boardQ.data?.loads ?? [];

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Truck className="h-6 w-6 text-primary" /> {T("أحمال شركات الشحن", "Courier Loads")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {T(
            "أحمال كل شركة شحن خلال الفترة: مفتوحة، تم التسليم، مرتجع، ونسبة التسليم.",
            "Each courier's load during the period: open, delivered, returned, and delivery rate.",
          )}
        </p>
      </header>

      <PeriodFilter value={period} onChange={setPeriod} />

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="p-2 text-start">{T("شركة الشحن", "Courier")}</th>
              <th className="p-2 text-start">{T("مفتوحة", "Open")}</th>
              <th className="p-2 text-start">{T("تم التسليم", "Delivered")}</th>
              <th className="p-2 text-start">{T("مرتجع", "Returned")}</th>
              <th className="p-2 text-start">{T("نسبة التسليم", "Delivery rate")}</th>
              <th className="p-2 text-start">{T("تغطية المحافظات", "Governorate coverage")}</th>
            </tr>
          </thead>
          <tbody>
            {boardQ.isLoading && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  {T("جاري التحميل…", "Loading…")}
                </td>
              </tr>
            )}
            {!boardQ.isLoading &&
              loads.map((l) => (
                <tr key={l.courierId} className="border-t">
                  <td className="p-2 font-medium">{l.name}</td>
                  <td className="p-2">{l.open}</td>
                  <td className="p-2">{l.delivered}</td>
                  <td className="p-2">{l.returned}</td>
                  <td className="p-2">{l.deliveryRate.toFixed(1)}%</td>
                  <td className="p-2">{l.governorates}</td>
                </tr>
              ))}
            {!boardQ.isLoading && !loads.length && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  {T("لا توجد بيانات", "No data")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
