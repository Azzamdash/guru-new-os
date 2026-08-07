import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Truck } from "lucide-react";
import { queryPresets } from "@/lib/query-presets";
import { listBrands } from "@/lib/internal.functions";
import { getStuckOrdersAlerts, type StuckOrderAlert } from "@/lib/orders-management.functions";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/orders-attention")({
  head: () => ({
    meta: [
      { title: "يحتاج تدخل — e-GURUS" },
      {
        name: "description",
        content: "أوردرات بدون شحنة، وأوردرات تم تسليمها بدون تحصيل كامل.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Page,
});

const nf = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

function Page() {
  const { lang } = useLang();
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [brandId, setBrandId] = useState<string>("all");

  const brands = useQuery({
    queryKey: ["brands"],
    queryFn: () => listBrands(),
    ...queryPresets.reference,
  });

  const stuckFn = useServerFn(getStuckOrdersAlerts);
  const stuck = useQuery({
    queryKey: ["orders-attention", "stuck", brandId],
    queryFn: () => stuckFn({ data: { brandId: brandId === "all" ? null : brandId } }),
    ...queryPresets.report,
  });
  const stuckCount = stuck.data?.total ?? 0;

  const section = (title: string, hint: string, rows: StuckOrderAlert[]) => (
    <Card className="p-4 space-y-3">
      <div>
        <div className="font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" /> {title}
          <Badge variant="secondary">{rows.length}</Badge>
        </div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          {t("لا توجد حالات هنا. 👌", "No cases here. 👌")}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b last:border-0 pb-2"
            >
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {r.externalNumber ?? r.id.slice(0, 8)} —{" "}
                  {r.customerName ?? t("بدون اسم", "No name")}
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.customerPhone ?? "—"} ·{" "}
                  {t(`منذ ${r.daysStuck} يوم`, `${r.daysStuck} day(s) ago`)}
                  {r.kind === "uncollected"
                    ? ` · ${t(`متبقٍ ${nf(r.outstanding)} من ${nf(r.totalAmount)}`, `${nf(r.outstanding)} outstanding of ${nf(r.totalAmount)}`)}`
                    : ` · ${nf(r.totalAmount)} ${t("ج.م", "EGP")}`}
                </div>
              </div>
              <Button size="sm" variant="outline" asChild>
                <Link to="/order-shipping" search={{ orderId: r.id }}>
                  <Truck className="h-3 w-3 me-1" /> {t("الشحن والتحصيل", "Shipping & Collection")}
                </Link>
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          {t("يحتاج تدخل", "Needs attention")}
          {stuckCount > 0 && <Badge variant="destructive">{stuckCount}</Badge>}
        </h1>
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
      </div>

      {stuck.isLoading ? (
        <Card className="p-6 text-muted-foreground">
          {t("جارٍ فحص الأوردرات…", "Checking orders…")}
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {section(
            t("بدون شحنة", "No shipment"),
            t(
              "أوردرات قيد الشحن ومر عليها أكثر من 3 أيام بدون أي محاولة شحن مسجلة",
              "Orders in shipping for more than 3 days with no recorded shipment attempt",
            ),
            stuck.data?.noShipment ?? [],
          )}
          {section(
            t("تسليم بدون تحصيل كامل", "Delivered without full collection"),
            t(
              "أوردرات تم تسليمها ومر عليها أكثر من 5 أيام والمبلغ المحصّل أقل من إجمالي الأوردر",
              "Orders delivered more than 5 days ago where the collected amount is less than the order total",
            ),
            stuck.data?.uncollected ?? [],
          )}
        </div>
      )}
    </div>
  );
}
