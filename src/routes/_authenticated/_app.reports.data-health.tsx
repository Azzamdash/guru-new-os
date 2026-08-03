import { tr } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getDataHealth } from "@/lib/data-health.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, XCircle, Activity } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_app/reports/data-health")({
  component: DataHealthPage,
  head: () => ({
    meta: [
      { title: "Data Health — E-GURUS" },
      { name: "description", content: "Monitor integration syncs, COGS gaps, and reconciliation drift across the system." },
    ],
  }),
});

function Kpi({ label, value, tone = "neutral" }: { label: string; value: string | number; tone?: "good" | "warn" | "bad" | "neutral" }) {
  const color =
    tone === "good" ? "text-emerald-600" :
    tone === "warn" ? "text-amber-600" :
    tone === "bad" ? "text-red-600" : "text-foreground";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function DataHealthPage() {
  const fetchHealth = useServerFn(getDataHealth);
  const { data, isLoading, error } = useQuery({
    queryKey: ["data-health"],
    queryFn: () => fetchHealth(),
    refetchInterval: 60_000,
  });

  if (isLoading) return <div className="p-6">{tr("جاري تحميل حالة البيانات...")}</div>;
  if (error || !data) return <div className="p-6 text-red-600">{tr("تعذّر جلب البيانات:")} {String((error as Error)?.message ?? "")}</div>;

  const hasCogsGap = data.cogsZero.orderItems > 0 || data.cogsZero.ordersWithZeroCost > 0;
  const staleIntegs = data.integrations.filter((i) => (i.minutesSinceSync ?? 0) > 60 || i.status === "error");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Activity className="w-6 h-6" /> {tr("صحة البيانات")}</h1>
          <p className="text-sm text-muted-foreground">
            {tr("آخر تحديث:")} {new Date(data.generatedAt).toLocaleString("en-US")} {tr("— تحديث تلقائي كل دقيقة")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label={tr("عناصر أوردر بتكلفة صفر")} value={data.cogsZero.orderItems} tone={data.cogsZero.orderItems > 0 ? "warn" : "good"} />
        <Kpi label={tr("اوردرات cost = 0")} value={data.cogsZero.ordersWithZeroCost} tone={data.cogsZero.ordersWithZeroCost > 0 ? "warn" : "good"} />
        <Kpi label={tr("منتجات بدون COGS")} value={data.cogsZero.products} tone={data.cogsZero.products > 0 ? "warn" : "good"} />
        <Kpi label={tr("إجمالي COD مفتوح")} value={data.couriers.totalOpenCod.toLocaleString("en-US", { maximumFractionDigits: 0 })} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label={tr("اوردرات بدون فاتورة")} value={data.orphans.ordersMissingInvoice} tone={data.orphans.ordersMissingInvoice > 0 ? "bad" : "good"} />
        <Kpi label={tr("فواتير بدون براند")} value={data.orphans.invoicesMissingBrand} tone={data.orphans.invoicesMissingBrand > 0 ? "bad" : "good"} />
        <Kpi label={tr("Webhooks ناجحة (24س)")} value={data.webhooks.last24hSuccess} tone="good" />
        <Kpi label={tr("Webhooks فاشلة (24س)")} value={data.webhooks.last24hFailures} tone={data.webhooks.last24hFailures > 0 ? "bad" : "good"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {staleIntegs.length === 0
              ? <><CheckCircle2 className="w-5 h-5 text-emerald-600" /> {tr("كل التكاملات محدَّثة")}</>
              : <><AlertTriangle className="w-5 h-5 text-amber-600" /> {staleIntegs.length} {tr("تكامل يحتاج انتباه")}</>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.integrations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tr("لا توجد تكاملات مربوطة بعد.")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-right p-2">{tr("البراند")}</th>
                    <th className="text-right p-2">{tr("المزوّد")}</th>
                    <th className="text-right p-2">{tr("الحالة")}</th>
                    <th className="text-right p-2">{tr("آخر مزامنة")}</th>
                    <th className="text-right p-2">{tr("آخر خطأ")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.integrations.map((i, k) => (
                    <tr key={k} className="border-b">
                      <td className="p-2">{i.brand}</td>
                      <td className="p-2">{i.provider}</td>
                      <td className="p-2">
                        <Badge variant={i.status === "connected" ? "default" : i.status === "error" ? "destructive" : "secondary"}>
                          {i.status === "connected" ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                          {i.status}
                        </Badge>
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {i.minutesSinceSync == null ? "لم تتم" : `منذ ${i.minutesSinceSync} د`}
                      </td>
                      <td className="p-2 text-xs text-red-600 max-w-md truncate" title={i.lastError ?? ""}>
                        {i.lastError ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {hasCogsGap && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-amber-700 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> {tr("فجوات COGS")}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>{tr("يوجد")} {data.cogsZero.orderItems} {tr("صف order_item بتكلفة صفر رغم وجود منتج مربوط.")}</p>
            <p>{tr("الحل الفوري: من صفحة المنتجات، اضغط")} <b>{tr("استيراد من Shopify")}</b> {tr("لكل براند لجلب تكلفة الـ variants،\n               ثم من هذه الصفحة راقب انخفاض الرقم.")}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
