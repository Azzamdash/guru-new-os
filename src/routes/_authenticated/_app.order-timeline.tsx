import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { queryPresets } from "@/lib/query-presets";
import { getOrder, type OrderRow } from "@/lib/orders.functions";
import { OrderSearchCombobox } from "@/components/orders/OrderSearchCombobox";
import { useLang } from "@/lib/i18n";
import { useOrderTimeline } from "@/lib/order-timeline.shared";

const searchSchema = z.object({
  orderId: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/_app/order-timeline")({
  head: () => ({
    meta: [
      { title: "سجل الأوردر — e-GURUS" },
      {
        name: "description",
        content: "سجل حالات كل أوردر: تحصيلات، محاولات شحن، وتغييرات الحالة.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: searchSchema,
  component: Page,
});

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium break-words">{value}</div>
    </div>
  );
}

function Page() {
  const { lang } = useLang();
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const active = search.orderId ?? "";
  const setActive = (id: string) => navigate({ search: { orderId: id || undefined } });
  const [selectedRow, setSelectedRow] = useState<OrderRow | null>(null);
  const timeline = useOrderTimeline(active);

  const getOrderFn = useServerFn(getOrder);
  const order = useQuery({
    queryKey: ["order-timeline-order", active],
    queryFn: () => getOrderFn({ data: { id: active } }),
    enabled: !!active,
    ...queryPresets.live,
  });

  const o = order.data;
  const total = o
    ? o.items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.unit_price || 0), 0) +
      Number(o.shipping_amount || 0) -
      Number(o.discount_amount || 0)
    : (selectedRow?.total_amount ?? 0);

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">{t("سجل الأوردر", "Order timeline")}</h1>

      <Card className="p-4 flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label>{t("ابحث عن الأوردر", "Search for an order")}</Label>
          <OrderSearchCombobox
            value={active}
            onSelect={(row) => {
              setActive(row.id);
              setSelectedRow(row);
            }}
          />
        </div>
      </Card>

      {active ? (
        <Card className="p-4">
          {order.isLoading ? (
            <div className="text-sm text-muted-foreground">
              {t("جارٍ تحميل بيانات الأوردر…", "Loading order data…")}
            </div>
          ) : order.isError ? (
            <div className="text-sm text-destructive">
              {t("تعذّر تحميل بيانات الأوردر", "Failed to load order data")}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field
                label={t("العميل", "Customer")}
                value={o?.customer_name ?? selectedRow?.customer_name ?? "—"}
              />
              <Field
                label={t("التليفون", "Phone")}
                value={o?.customer_phone ?? selectedRow?.customer_phone ?? "—"}
              />
              <Field label={t("البراند", "Brand")} value={selectedRow?.brand_name ?? "—"} />
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">
                  {t("الحالة الحالية", "Current status")}
                </div>
                <Badge variant="secondary">
                  {selectedRow?.order_status ?? o?.fulfillment_status ?? "—"}
                </Badge>
              </div>
              <Field
                label={t("إجمالي المبلغ", "Total amount")}
                value={`${Number(total).toLocaleString("en-GB", { maximumFractionDigits: 2 })} ${t("ج.م", "EGP")}`}
              />
              <Field label={t("شركة الشحن", "Courier")} value={selectedRow?.courier_name ?? "—"} />
              {o?.external_order_number ? (
                <Field label={t("رقم الأوردر", "Order #")} value={o.external_order_number} />
              ) : null}
            </div>
          )}
        </Card>
      ) : null}

      {timeline.data ? (
        <Card className="p-4 space-y-3">
          {timeline.data.entries.length === 0 ? (
            <div className="text-muted-foreground">
              {t("لا يوجد سجل بعد.", "No timeline entries yet.")}
            </div>
          ) : null}
          {timeline.data.entries.map((e) => (
            <div key={e.id} className="flex gap-3 border-b last:border-0 pb-2">
              <Badge
                variant={
                  e.kind === "collection"
                    ? "default"
                    : e.kind === "shipment"
                      ? "secondary"
                      : "outline"
                }
              >
                {e.kind === "collection"
                  ? t("تحصيل", "Collection")
                  : e.kind === "shipment"
                    ? t("شحن", "Shipment")
                    : t("حالة", "Status")}
              </Badge>
              <div className="flex-1">
                <div className="font-medium">{e.title}</div>
                {e.detail ? <div className="text-xs text-muted-foreground">{e.detail}</div> : null}
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {new Date(e.at).toLocaleString("en-GB")}
              </div>
            </div>
          ))}
        </Card>
      ) : null}
    </div>
  );
}
