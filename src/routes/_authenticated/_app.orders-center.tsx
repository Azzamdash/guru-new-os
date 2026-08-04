import { formatBusinessDate } from "@/lib/timezone";
import { useLang } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  MessageCircle,
  Truck,
  Wallet,
  Activity,
  Send,
  RefreshCw,
  Link2,
  Unlink,
  AlertTriangle,
  Download,
  Pencil,
} from "lucide-react";
import { exportToCSV } from "@/lib/export-utils";
import { queryPresets } from "@/lib/query-presets";
import { listBrands, listCouriers } from "@/lib/internal.functions";
import { dispatchOrderToBestCourier } from "@/lib/couriers.functions";
import {
  getOrderTimeline,
  addShipmentAttempt,
  recordCollection,
  listWhatsappThreads,
  getWhatsappThread,
  sendWhatsappMessage,
  startWhatsappThread,
  linkThreadToOrder,
  getStuckOrdersAlerts,
  type StuckOrderAlert,
} from "@/lib/orders-management.functions";
import { getOrder, updateOrderStatus, type OrderRow } from "@/lib/orders.functions";
import { OrderSearchCombobox } from "@/components/orders/OrderSearchCombobox";
import { getMyAssignedOrders } from "@/lib/distribution.functions";
import { ORDER_STATUS_LABELS_AR, type OrderWorkflowStatus } from "@/lib/order-lifecycle.shared";
import { OrderEditDialog } from "@/components/orders/OrderEditDialog";
import {
  DispatchDialog,
  type CourierRow,
  type DispatchOrder,
} from "@/components/orders/OrdersListTab";

export const Route = createFileRoute("/_authenticated/_app/orders-center")({
  head: () => ({
    meta: [
      { title: "مركز إدارة الأوردرات — e-GURUS" },
      {
        name: "description",
        content:
          "مؤشرات الأوردرات، الشحنات والتحصيل، وسجل حالات كل أوردر، بالإضافة لصندوق محادثات واتساب.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OrdersCenterPage,
});

const nf = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const pct = (n: number) => `${Number(n || 0).toFixed(1)}%`;
const T = (lang: "ar" | "en", ar: string, en: string) => (lang === "ar" ? ar : en);

function OrdersCenterPage() {
  const { lang } = useLang();
  const t = (ar: string, en: string) => T(lang, ar, en);
  const qc = useQueryClient();
  const [brandId, setBrandId] = useState<string>("all");
  const [tab, setTab] = useState("attention");
  const [activeOrder, setActiveOrder] = useState("");
  const [activeRow, setActiveRow] = useState<OrderRow | null>(null);

  const brands = useQuery({
    queryKey: ["brands"],
    queryFn: () => listBrands(),
    ...queryPresets.reference,
  });

  const stuckFn = useServerFn(getStuckOrdersAlerts);
  const stuck = useQuery({
    queryKey: ["orders-center", "stuck", brandId],
    queryFn: () => stuckFn({ data: { brandId: brandId === "all" ? null : brandId } }),
    ...queryPresets.report,
  });
  const stuckCount = stuck.data?.total ?? 0;

  const waListFn = useServerFn(listWhatsappThreads);
  const waThreads = useQuery({
    queryKey: ["orders-center", "wa-unread"],
    queryFn: () => waListFn({ data: { search: null } }),
    ...queryPresets.live,
  });
  const waUnread = (waThreads.data ?? []).reduce((sum, t) => sum + (t.unread_count || 0), 0);

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t("مركز إدارة الأوردرات", "Orders Center")}</h1>
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["orders-center"] })}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="attention" className="relative">
            {t("يحتاج تدخل", "Needs attention")}
            {stuckCount > 0 && (
              <span className="absolute -top-1 -end-1 min-w-4 rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground">
                {stuckCount > 99 ? "99+" : stuckCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="myorders">{t("أوردراتي", "My Orders")}</TabsTrigger>
          <TabsTrigger value="ops">{t("الشحن والتحصيل", "Shipping & Collection")}</TabsTrigger>
          <TabsTrigger value="timeline">{t("سجل الأوردر", "Order timeline")}</TabsTrigger>

          <TabsTrigger value="wa" className="relative">
            {t("واتساب", "WhatsApp")}
            {waUnread > 0 && (
              <span className="absolute -top-1 -end-1 min-w-4 rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground">
                {waUnread > 9 ? "9+" : waUnread}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="attention" className="pt-4">
          <AttentionPanel
            loading={stuck.isLoading}
            noShipment={stuck.data?.noShipment ?? []}
            uncollected={stuck.data?.uncollected ?? []}
            onOpen={(id) => {
              setActiveOrder(id);
              setActiveRow(null);
              setTab("ops");
            }}
          />
        </TabsContent>

        <TabsContent value="myorders" className="pt-4">
          <MyOrdersPanel />
        </TabsContent>

        <TabsContent value="ops" className="pt-4">
          <ShipmentsPanel orderId={activeOrder} setOrderId={setActiveOrder} />
        </TabsContent>

        <TabsContent value="timeline" className="pt-4">
          <TimelinePanel
            orderId={activeOrder}
            setOrderId={setActiveOrder}
            row={activeRow}
            setRow={setActiveRow}
          />
        </TabsContent>

        <TabsContent value="wa" className="pt-4">
          <WhatsappPanel brands={(brands.data ?? []) as Array<{ id: string; name: string }>} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function useOrderTimeline(orderId: string) {
  const fn = useServerFn(getOrderTimeline);
  return useQuery({
    queryKey: ["orders-center", "timeline", orderId],
    queryFn: () => fn({ data: { orderId } }),
    enabled: !!orderId,
    ...queryPresets.live,
  });
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium break-words">{value}</div>
    </div>
  );
}

function AttentionPanel({
  loading,
  noShipment,
  uncollected,
  onOpen,
}: {
  loading: boolean;
  noShipment: StuckOrderAlert[];
  uncollected: StuckOrderAlert[];
  onOpen: (orderId: string) => void;
}) {
  const { lang } = useLang();
  const t = (ar: string, en: string) => T(lang, ar, en);
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
              <Button size="sm" variant="outline" onClick={() => onOpen(r.id)}>
                <Truck className="h-3 w-3 me-1" /> {t("الشحن والتحصيل", "Shipping & Collection")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );

  if (loading)
    return (
      <Card className="p-6 text-muted-foreground">
        {t("جارٍ فحص الأوردرات…", "Checking orders…")}
      </Card>
    );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {section(
        t("بدون شحنة", "No shipment"),
        t(
          "أوردرات قيد الشحن ومر عليها أكثر من 3 أيام بدون أي محاولة شحن مسجلة",
          "Orders in shipping for more than 3 days with no recorded shipment attempt",
        ),
        noShipment,
      )}
      {section(
        t("تسليم بدون تحصيل كامل", "Delivered without full collection"),
        t(
          "أوردرات تم تسليمها ومر عليها أكثر من 5 أيام والمبلغ المحصّل أقل من إجمالي الأوردر",
          "Orders delivered more than 5 days ago where the collected amount is less than the order total",
        ),
        uncollected,
      )}
    </div>
  );
}

const ORDER_STATUS_LABELS_EN: Record<OrderWorkflowStatus, string> = {
  new: "New",
  processing: "Processing",
  postponed: "Postponed",
  awaiting_response: "Awaiting your response",
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

function MyOrdersPanel() {
  const { lang } = useLang();
  const t = (ar: string, en: string) => T(lang, ar, en);
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("all");

  const myOrdersFn = useServerFn(getMyAssignedOrders);
  const myOrders = useQuery({
    queryKey: ["orders-center", "my-orders", status],
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
      qc.invalidateQueries({ queryKey: ["orders-center", "my-orders"] });
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
      qc.invalidateQueries({ queryKey: ["orders-center", "my-orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = myOrders.data ?? [];

  return (
    <div className="space-y-3">
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
        onSaved={() => qc.invalidateQueries({ queryKey: ["orders-center", "my-orders"] })}
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

function TimelinePanel({
  orderId,
  setOrderId,
  row,
  setRow,
}: {
  orderId: string;
  setOrderId: (id: string) => void;
  row: OrderRow | null;
  setRow: (row: OrderRow | null) => void;
}) {
  const { lang } = useLang();
  const t = (ar: string, en: string) => T(lang, ar, en);
  const active = orderId;
  const setActive = setOrderId;
  const selectedRow = row;
  const setSelectedRow = setRow;
  const timeline = useOrderTimeline(active);

  const getOrderFn = useServerFn(getOrder);
  const order = useQuery({
    queryKey: ["orders-center", "timeline-order", active],
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
    <div className="space-y-4">
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

const COLLECTION_METHODS = [
  { value: "cod", label: "دفع عند الاستلام (COD)", labelEn: "Cash on delivery (COD)" },
  { value: "cash", label: "كاش", labelEn: "Cash" },
  { value: "bank_transfer", label: "تحويل بنكي", labelEn: "Bank transfer" },
  { value: "vodafone_cash", label: "فودافون كاش", labelEn: "Vodafone Cash" },
  { value: "instapay", label: "إنستاباي", labelEn: "InstaPay" },
  { value: "card", label: "بطاقة / فيزا", labelEn: "Card / Visa" },
  { value: "other", label: "أخرى", labelEn: "Other" },
] as const;

function ShipmentsPanel({
  orderId,
  setOrderId,
}: {
  orderId: string;
  setOrderId: (id: string) => void;
}) {
  const { lang } = useLang();
  const t = (ar: string, en: string) => T(lang, ar, en);
  const qc = useQueryClient();

  const active = orderId;
  const setActive = setOrderId;

  const [tracking, setTracking] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("cod");
  const timeline = useOrderTimeline(active);

  const addShip = useServerFn(addShipmentAttempt);
  const addColl = useServerFn(recordCollection);

  const shipMut = useMutation({
    mutationFn: () => addShip({ data: { orderId: active, tracking: tracking || null } }),
    onSuccess: () => {
      toast.success(t("تم تسجيل محاولة شحن جديدة", "New shipment attempt recorded"));
      setTracking("");
      qc.invalidateQueries({ queryKey: ["orders-center", "timeline", active] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const collMut = useMutation({
    mutationFn: () => addColl({ data: { orderId: active, amount: Number(amount), method } }),
    onSuccess: () => {
      toast.success(t("تم تسجيل التحصيل", "Collection recorded"));
      setAmount("");
      qc.invalidateQueries({ queryKey: ["orders-center", "timeline", active] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label>{t("ابحث عن الأوردر", "Search for an order")}</Label>
          <OrderSearchCombobox value={active} onSelect={(o) => setActive(o.id)} />
        </div>
      </Card>

      {active ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4 space-y-3">
            <div className="font-semibold">{t("محاولات الشحن", "Shipment attempts")}</div>
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th>#</th>
                  <th>{t("الحالة", "Status")}</th>
                  <th>{t("التتبع", "Tracking")}</th>
                  <th>{t("المتوقع", "Expected")}</th>
                </tr>
              </thead>
              <tbody>
                {(timeline.data?.shipments ?? []).map((s) => (
                  <tr key={s.id} className="border-b last:border-0 text-center">
                    <td className="py-1">{s.attempt_no}</td>
                    <td>{s.status}</td>
                    <td>{s.tracking ?? "—"}</td>
                    <td className="tabular-nums">{nf(Number(s.expected_cod))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-end gap-2">
              <div className="space-y-1 flex-1">
                <Label>{t("رقم التتبع", "Tracking number")}</Label>
                <Input value={tracking} onChange={(e) => setTracking(e.target.value)} />
              </div>
              <Button onClick={() => shipMut.mutate()} disabled={shipMut.isPending}>
                <Truck className="h-4 w-4 me-1" /> {t("محاولة شحن", "Shipment attempt")}
              </Button>
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="font-semibold">{t("التحصيلات", "Collections")}</div>
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th>{t("المبلغ", "Amount")}</th>
                  <th>{t("الطريقة", "Method")}</th>
                  <th>{t("التاريخ", "Date")}</th>
                </tr>
              </thead>
              <tbody>
                {(timeline.data?.collections ?? []).map((c) => (
                  <tr key={c.id} className="border-b last:border-0 text-center">
                    <td className="py-1 tabular-nums">{nf(Number(c.amount))}</td>
                    <td>{c.method}</td>
                    <td className="tabular-nums">
                      {new Date(c.collected_at).toLocaleDateString("en-GB")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1 flex-1 min-w-[120px]">
                <Label>{t("المبلغ المحصّل", "Amount collected")}</Label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-1 min-w-[150px]">
                <Label>{t("طريقة التحصيل", "Collection method")}</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLLECTION_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {t(m.label, m.labelEn)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => collMut.mutate()} disabled={collMut.isPending}>
                <Wallet className="h-4 w-4 me-1" /> {t("تسجيل تحصيل", "Record collection")}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function WhatsappPanel({ brands }: { brands: Array<{ id: string; name: string }> }) {
  const { lang } = useLang();
  const t = (ar: string, en: string) => T(lang, ar, en);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [threadId, setThreadId] = useState("");
  const [text, setText] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newBrand, setNewBrand] = useState<string>(brands[0]?.id ?? "");

  const listFn = useServerFn(listWhatsappThreads);
  const threadFn = useServerFn(getWhatsappThread);
  const sendFn = useServerFn(sendWhatsappMessage);
  const startFn = useServerFn(startWhatsappThread);

  const threads = useQuery({
    queryKey: ["orders-center", "wa", search],
    queryFn: () => listFn({ data: { search: search || null } }),
    ...queryPresets.live,
  });
  const thread = useQuery({
    queryKey: ["orders-center", "wa-thread", threadId],
    queryFn: () => threadFn({ data: { threadId } }),
    enabled: !!threadId,
    ...queryPresets.live,
  });

  const send = useMutation({
    mutationFn: () => sendFn({ data: { threadId, body: text } }),
    onSuccess: (r) => {
      setText("");
      if (r.status === "sent") toast.success(t("تم الإرسال", "Sent"));
      else toast.warning(r.error ?? t("الرسالة في الانتظار", "Message pending"));
      qc.invalidateQueries({ queryKey: ["orders-center", "wa-thread", threadId] });
      qc.invalidateQueries({ queryKey: ["orders-center", "wa"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const start = useMutation({
    mutationFn: () => startFn({ data: { brandId: newBrand, phone: newPhone } }),
    onSuccess: (r) => {
      setNewPhone("");
      setThreadId(r.id);
      qc.invalidateQueries({ queryKey: ["orders-center", "wa"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const currentThread = (threads.data ?? []).find((th) => th.id === threadId) ?? null;
  const linkedOrderId = currentThread?.order_id ?? null;

  const getOrderFn = useServerFn(getOrder);
  const linkedOrder = useQuery({
    queryKey: ["orders-center", "wa-linked-order", linkedOrderId],
    queryFn: () => getOrderFn({ data: { id: linkedOrderId as string } }),
    enabled: !!linkedOrderId,
  });

  const linkFn = useServerFn(linkThreadToOrder);
  const linkMut = useMutation({
    mutationFn: (orderId: string | null) => linkFn({ data: { threadId, orderId } }),
    onSuccess: (_r, orderId) => {
      toast.success(
        orderId
          ? t("تم ربط المحادثة بالأوردر", "Chat linked to order")
          : t("تم فك الربط", "Link removed"),
      );
      qc.invalidateQueries({ queryKey: ["orders-center", "wa"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const linkedTimeline = useOrderTimeline(linkedOrderId ?? "");

  const lo = linkedOrder.data;
  const linkedTotal = lo
    ? lo.items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.unit_price || 0), 0) +
      Number(lo.shipping_amount || 0) -
      Number(lo.discount_amount || 0)
    : 0;
  const linkedCollected = (linkedTimeline.data?.collections ?? []).reduce(
    (s, c) => s + Number(c.amount || 0),
    0,
  );
  const linkedOutstanding = Math.max(0, linkedTotal - linkedCollected);
  const lastShipment = (linkedTimeline.data?.shipments ?? []).slice(-1)[0] ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card className="p-3 space-y-3">
        <Input
          placeholder={t("بحث برقم أو اسم", "Search by number or name")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="space-y-1 max-h-[420px] overflow-auto">
          {(threads.data ?? []).map((th) => (
            <button
              key={th.id}
              onClick={() => setThreadId(th.id)}
              className={`w-full text-start p-2 rounded-md border ${threadId === th.id ? "bg-accent" : ""}`}
            >
              <div className="font-medium text-sm flex items-center gap-1">
                {th.order_id ? (
                  <Link2
                    className="h-3.5 w-3.5 text-primary shrink-0"
                    aria-label={t("مرتبطة بأوردر", "Linked to order")}
                  />
                ) : null}
                <span className="truncate">{th.display_name ?? th.phone}</span>
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {th.last_message_preview ?? "—"}
              </div>
            </button>
          ))}
          {(threads.data ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground p-2">
              {t("لا توجد محادثات.", "No chats.")}
            </div>
          ) : null}
        </div>
        <div className="space-y-2 border-t pt-3">
          <Label>{t("محادثة جديدة", "New chat")}</Label>
          <Select value={newBrand} onValueChange={setNewBrand}>
            <SelectTrigger>
              <SelectValue placeholder={t("البراند", "Brand")} />
            </SelectTrigger>
            <SelectContent>
              {brands.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input
              placeholder={t("رقم الهاتف", "Phone number")}
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
            />
            <Button
              onClick={() => start.mutate()}
              disabled={!newBrand || !newPhone || start.isPending}
            >
              {t("بدء", "Start")}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-4 flex flex-col min-h-[420px]">
        {!threadId ? (
          <div className="m-auto text-muted-foreground flex items-center gap-2">
            <MessageCircle className="h-4 w-4" /> {t("اختر محادثة", "Select a chat")}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 pb-3 mb-3 border-b">
              {linkedOrderId ? (
                <>
                  <Badge variant="secondary" className="gap-1">
                    <Link2 className="h-3 w-3" />#
                    {linkedOrder.data?.external_order_number ?? linkedOrderId.slice(0, 8)}
                    {linkedOrder.data ? ` • ${linkedOrder.data.fulfillment_status}` : ""}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => linkMut.mutate(null)}
                    disabled={linkMut.isPending}
                  >
                    <Unlink className="h-4 w-4 me-1" /> {t("فك الربط", "Unlink")}
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-sm text-muted-foreground">
                    {t("ربط بأوردر:", "Link to order:")}
                  </span>
                  <OrderSearchCombobox
                    className="w-[280px]"
                    onSelect={(o) => linkMut.mutate(o.id)}
                  />
                </>
              )}
            </div>
            {linkedOrderId ? (
              <div className="mb-3 rounded-lg border bg-muted/40 p-3">
                {linkedOrder.isLoading || linkedTimeline.isLoading ? (
                  <div className="text-xs text-muted-foreground">
                    {t("جارٍ تحميل بيانات الأوردر…", "Loading order data…")}
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-4 text-sm">
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">{t("الحالة", "Status")}</div>
                      <Badge variant="secondary">{lo?.fulfillment_status ?? "—"}</Badge>
                    </div>
                    <Field
                      label={t("المبلغ الإجمالي", "Total amount")}
                      value={`${nf(linkedTotal)} ${t("ج.م", "EGP")}`}
                    />
                    <Field
                      label={t("المتوقع تحصيله", "Expected to collect")}
                      value={`${nf(linkedOutstanding)} ${t("ج.م", "EGP")}`}
                    />
                    <Field
                      label={t("آخر محاولة شحن", "Last shipment attempt")}
                      value={
                        lastShipment
                          ? `#${lastShipment.attempt_no} • ${lastShipment.status}${lastShipment.tracking ? ` • ${lastShipment.tracking}` : ""}`
                          : t("لا توجد", "None")
                      }
                    />
                  </div>
                )}
              </div>
            ) : null}
            <div className="flex-1 space-y-2 overflow-auto">
              {(thread.data?.messages ?? []).map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[75%] rounded-lg p-2 text-sm ${m.direction === "out" ? "ms-auto bg-primary/10" : "bg-muted"}`}
                >
                  <div>{m.body}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(m.sent_at).toLocaleString("en-GB")} • {m.status}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-3 border-t mt-3">
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("اكتب رسالة…", "Type a message…")}
              />
              <Button onClick={() => send.mutate()} disabled={!text.trim() || send.isPending}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
