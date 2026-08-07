import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Send, Pencil } from "lucide-react";
import { toast } from "sonner";
import { queryPresets } from "@/lib/query-presets";
import { listCouriers } from "@/lib/internal.functions";
import { dispatchOrderToBestCourier } from "@/lib/couriers.functions";
import { getMyAssignedOrders } from "@/lib/distribution.functions";
import { updateOrderStatus } from "@/lib/orders.functions";
import { ORDER_STATUS_LABELS_AR, type OrderWorkflowStatus } from "@/lib/order-lifecycle.shared";
import { OrderEditDialog } from "@/components/orders/OrderEditDialog";
import {
  DispatchDialog,
  type CourierRow,
  type DispatchOrder,
} from "@/components/orders/OrdersListTab";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/my-orders")({
  head: () => ({
    meta: [
      { title: "أوردراتي — e-GURUS" },
      {
        name: "description",
        content: "الأوردرات الموزَّعة عليك: تعديل، تأكيد، وإسناد لشركة شحن.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Page,
});

const nf = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

const ORDER_STATUS_LABELS_EN: Record<OrderWorkflowStatus, string> = {
  new: "New",
  processing: "Processing",
  shipped: "Out for delivery",
  postponed: "Postponed",
  awaiting_response: "Needs attention",
  succeeded: "Succeeded",
  cancelled: "Cancelled",
};

const MY_ORDERS_CONFIRM: Array<{
  v: string;
  labelAr: string;
  labelEn: string;
  tone: "muted" | "success" | "destructive";
}> = [
  { v: "pending", labelAr: "بانتظار التأكيد", labelEn: "Pending", tone: "muted" },
  { v: "confirmed", labelAr: "مؤكد", labelEn: "Confirmed", tone: "success" },
  { v: "cancelled", labelAr: "ملغي", labelEn: "Cancelled", tone: "destructive" },
];

function Page() {
  const { lang } = useLang();
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("all");

  const myOrdersFn = useServerFn(getMyAssignedOrders);
  const myOrders = useQuery({
    queryKey: ["my-orders", status],
    queryFn: () => myOrdersFn({ data: { status: status === "all" ? null : status } }),
    ...queryPresets.live,
  });

  const updFn = useServerFn(updateOrderStatus);
  const upd = useMutation({
    mutationFn: (v: { id: string; confirmation_status?: string }) => updFn({ data: v }),
    onSuccess: (r) => {
      if (r.stockWarning) {
        toast.warning(
          lang === "ar"
            ? `الكمية غير كافية للأصناف: ${r.stockWarning}`
            : `Insufficient stock for: ${r.stockWarning}`,
        );
      }
      qc.invalidateQueries({ queryKey: ["my-orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editOrderId, setEditOrderId] = useState<string | null>(null);

  const listCouriersFn = useServerFn(listCouriers);
  const couriersQ = useQuery({
    queryKey: ["couriers"],
    queryFn: () => listCouriersFn(),
    ...queryPresets.reference,
  });
  const dispatchFn = useServerFn(dispatchOrderToBestCourier);
  const [dispatchDlg, setDispatchDlg] = useState<{ open: boolean; order: DispatchOrder | null }>({
    open: false,
    order: null,
  });
  const [pickedCourierId, setPickedCourierId] = useState("");
  const dispatch = useMutation({
    mutationFn: (v: { orderId: string; courierId?: string | null }) => dispatchFn({ data: v }),
    onSuccess: (r) => {
      toast.success(
        t("تم الإسناد إلى: ", "Dispatched to: ") +
          (r.courier?.name ?? "—") +
          (r.externalNote ?? ""),
      );
      setDispatchDlg({ open: false, order: null });
      setPickedCourierId("");
      qc.invalidateQueries({ queryKey: ["my-orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = myOrders.data ?? [];

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">{t("أوردراتي", "My Orders")}</h1>

      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {t(`عدد الأوردرات: ${rows.length}`, `Orders: ${rows.length}`)}
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("كل الحالات", "All statuses")}</SelectItem>
            {(
              [
                "new",
                "processing",
                "shipped",
                "postponed",
                "awaiting_response",
                "succeeded",
                "cancelled",
              ] as const
            ).map((s) => (
              <SelectItem key={s} value={s}>
                {lang === "ar" ? ORDER_STATUS_LABELS_AR[s] : ORDER_STATUS_LABELS_EN[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-x-auto">
        {myOrders.isLoading ? (
          <div className="p-6 text-muted-foreground">{t("جارٍ التحميل…", "Loading…")}</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-muted-foreground">
            {t("لا توجد أوردرات موزّعة عليك حاليًا", "No orders currently assigned to you")}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-muted-foreground border-b">
              <tr>
                <th className="p-3 text-start">{t("رقم الأوردر", "Order #")}</th>
                <th className="p-3 text-start">{t("العميل", "Customer")}</th>
                <th className="p-3 text-start">{t("البراند", "Brand")}</th>
                <th className="p-3 text-start">{t("الإجمالي", "Total")}</th>
                <th className="p-3 text-start">{t("الحالة", "Status")}</th>
                <th className="p-3 text-start">{t("التأكيد", "Confirmation")}</th>
                <th className="p-3 text-start">{t("شركة الشحن", "Courier")}</th>
                <th className="p-3 text-start">{t("إجراءات", "Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const c =
                  MY_ORDERS_CONFIRM.find((x) => x.v === (r.confirmationStatus ?? "pending")) ??
                  MY_ORDERS_CONFIRM[0];
                return (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="p-3">{r.orderNumber ?? r.id.slice(0, 8)}</td>
                    <td className="p-3">
                      <div>{r.customerName ?? t("بدون اسم", "No name")}</div>
                      <div className="text-xs text-muted-foreground">{r.customerPhone ?? "—"}</div>
                    </td>
                    <td className="p-3">{r.brandName}</td>
                    <td className="p-3 tabular-nums">{nf(r.total)}</td>
                    <td className="p-3">
                      <Badge variant="secondary">
                        {lang === "ar"
                          ? ORDER_STATUS_LABELS_AR[r.orderStatus as OrderWorkflowStatus]
                          : ORDER_STATUS_LABELS_EN[r.orderStatus as OrderWorkflowStatus]}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Select
                        value={r.confirmationStatus ?? "pending"}
                        onValueChange={(v) => upd.mutate({ id: r.id, confirmation_status: v })}
                      >
                        <SelectTrigger className="w-32 h-8">
                          <Badge
                            variant={
                              c.tone === "success"
                                ? "default"
                                : c.tone === "destructive"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {lang === "ar" ? c.labelAr : c.labelEn}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {MY_ORDERS_CONFIRM.map((x) => (
                            <SelectItem key={x.v} value={x.v}>
                              {lang === "ar" ? x.labelAr : x.labelEn}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3">{r.courierName ?? "—"}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => {
                            setEditOrderId(r.id);
                            setEditOpen(true);
                          }}
                          title={t("تعديل", "Edit")}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => {
                            setPickedCourierId("");
                            setDispatchDlg({
                              open: true,
                              order: {
                                id: r.id,
                                brand_id: r.brandId,
                                governorate: r.governorate,
                                total_amount: r.total,
                              },
                            });
                          }}
                          disabled={dispatch.isPending}
                          title={t("اختر شركة شحن / مندوب", "Choose courier / rep")}
                        >
                          <Send className="w-3.5 h-3.5 text-primary" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <OrderEditDialog
        open={editOpen}
        orderId={editOrderId}
        onOpenChange={setEditOpen}
        onSaved={() => qc.invalidateQueries({ queryKey: ["my-orders"] })}
      />
      <DispatchDialog
        open={dispatchDlg.open}
        order={dispatchDlg.order}
        onOpenChange={(v) => {
          if (!v) setDispatchDlg({ open: false, order: null });
        }}
        couriers={(couriersQ.data ?? []) as CourierRow[]}
        picked={pickedCourierId}
        setPicked={setPickedCourierId}
        onConfirm={(cid) => {
          if (!dispatchDlg.order) return;
          dispatch.mutate({ orderId: dispatchDlg.order.id, courierId: cid || null });
        }}
        pending={dispatch.isPending}
        lang={lang}
      />
    </div>
  );
}
