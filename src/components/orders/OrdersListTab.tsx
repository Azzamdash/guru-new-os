import { formatBusinessDate } from "@/lib/timezone";
import { getTodayInBusinessTimezone } from "@/lib/timezone";
import { businessDateEndUTC, businessDateStartUTC } from "@/lib/timezone";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { queryPresets } from "@/lib/query-presets";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  RefreshCw,
  ShoppingBag,
  Search,
  Plus,
  Pencil,
  Send,
  Truck,
  RotateCw,
  Hash,
} from "lucide-react";
import {
  listOrders,
  getOrdersFilterSummary,
  getOrdersSummary,
  runShopifySyncNow,
  runShopifySyncAll,
  runShopifyBackfillWindow,
  updateOrderStatus,
  transitionOrderLifecycle,
} from "@/lib/orders.functions";
import { dispatchOrderToBestCourier, recommendCourierForOrder } from "@/lib/couriers.functions";
import {
  sendBostaShipment,
  pullBostaShipmentStatus,
  syncAllBostaShipments,
  attachBostaTracking,
} from "@/lib/integrations.functions";
import { listBrands, listCouriers } from "@/lib/internal.functions";
import { useLang, tr } from "@/lib/i18n";
import { OrderEditDialog } from "./OrderEditDialog";
import { CONFIRM } from "./order-form-constants";
import { toast } from "sonner";
import { PaginationBar } from "@/components/PaginationBar";
import { TableSkeleton } from "@/components/TableSkeleton";
import {
  PeriodFilter,
  defaultPeriod,
  resolvePeriod,
  type PeriodValue,
} from "@/components/PeriodFilter";
import { usePersistedPeriod } from "@/lib/global-period";
import { registerReportOrderCount, orderScopeKey } from "@/lib/salesUnify";
import {
  COLLECTION_STATUS_LABELS_AR,
  COLLECTION_STATUSES,
  isCourierAvailableForBrand,
  lifecycleForManualShipmentOutcome,
  ORDER_STATUS_LABELS_AR,
  ORDER_WORKFLOW_STATUSES,
  SHIPMENT_OUTCOMES,
  type CollectionStatus,
  type OrderWorkflowStatus,
  type ShipmentOutcome,
} from "@/lib/order-lifecycle.shared";

const ORDER_STATUS_LABELS_EN: Record<OrderWorkflowStatus, string> = {
  new: "New",
  processing: "Processing",
  shipped: "Out for delivery",
  postponed: "Postponed",
  awaiting_response: "Needs attention",
  succeeded: "Succeeded",
  cancelled: "Cancelled",
};
const COLLECTION_STATUS_LABELS_EN: Record<CollectionStatus, string> = {
  processing: "Processing",
  unavailable: "Unavailable",
  paid: "Paid",
  unpaid: "Unpaid",
};
const SHIPMENT_OUTCOME_LABELS_AR: Record<ShipmentOutcome, string> = {
  open: "قيد التنفيذ",
  delivered: "تم التوصيل",
  return_in_transit: "في الطريق إليك",
  customer_returned: "إرجاع بعد الاستلام",
  returned: "تم الإرجاع",
  exchanged: "تم الاستبدال",
  cancelled_before_dispatch: "إلغاء قبل الشحن",
};
const SHIPMENT_OUTCOME_LABELS_EN: Record<ShipmentOutcome, string> = {
  open: "In progress",
  delivered: "Delivered",
  return_in_transit: "Returning to us",
  customer_returned: "Returned after delivery",
  returned: "Return received",
  exchanged: "Exchanged",
  cancelled_before_dispatch: "Cancelled before dispatch",
};
const LIFECYCLE_SOURCE_AR = {
  system: "النظام",
  manual: "يدوي",
  bosta: "بوسطة",
  shopify: "Shopify",
} as const;
const LIFECYCLE_SOURCE_EN = {
  system: "System",
  manual: "Manual",
  bosta: "Bosta",
  shopify: "Shopify",
} as const;
const OPEN_WORKFLOW_STATUSES = ORDER_WORKFLOW_STATUSES.filter(
  (status): status is Exclude<OrderWorkflowStatus, "succeeded" | "cancelled"> =>
    status !== "succeeded" && status !== "cancelled",
);
export function OrdersListTab() {
  const { t, lang } = useLang();
  const qc = useQueryClient();
  const listFn = useServerFn(listOrders);
  const filterSummaryFn = useServerFn(getOrdersFilterSummary);
  const sumFn = useServerFn(getOrdersSummary);
  const brandsFn = useServerFn(listBrands);
  const syncFn = useServerFn(runShopifySyncNow);
  const updFn = useServerFn(updateOrderStatus);
  const listCouriersFn = useServerFn(listCouriers);
  const transitionLifecycleFn = useServerFn(transitionOrderLifecycle);
  const [brandId, setBrandId] = useState<string>("all");
  const [ff, setFf] = useState<string>("all");
  const [q, setQ] = useState("");
  const deferredQuery = useDeferredValue(q);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [pageCursors, setPageCursors] = useState<Array<{ occurredAt: string; id: string } | null>>([
    null,
  ]);
  const [period, setPeriod] = usePersistedPeriod("orders");
  const resolved = useMemo(() => resolvePeriod(period), [period]);
  const from = resolved.dateFrom ?? `${resolved.year}-01-01`;
  const to = resolved.dateTo ?? `${resolved.year}-12-31`;
  const [newOpen, setNewOpen] = useState(false);
  const [editOrderId, setEditOrderId] = useState<string | null>(null);
  const [lifecycleDlg, setLifecycleDlg] = useState<{
    open: boolean;
    orderId: string;
    orderStatus: OrderWorkflowStatus;
    outcome: ShipmentOutcome;
    collectionStatus: CollectionStatus;
  }>({
    open: false,
    orderId: "",
    orderStatus: "processing",
    outcome: "open",
    collectionStatus: "processing",
  });

  const couriersQ = useQuery({
    queryKey: ["couriers"],
    queryFn: () => listCouriersFn(),
    ...queryPresets.reference,
  });

  const brandsQ = useQuery({
    queryKey: ["brands"],
    queryFn: () => brandsFn(),
    ...queryPresets.reference,
  });
  useEffect(() => {
    setPage(0);
    setPageCursors([null]);
  }, [brandId, from, to, ff, deferredQuery, pageSize]);
  const cursor = pageCursors[page] ?? null;
  const ordersArgs = useMemo(
    () => ({
      brandId: brandId === "all" ? null : brandId,
      from,
      to,
      orderStatus: ff === "all" ? null : ff,
      search: deferredQuery,
      pageSize,
    }),
    [brandId, from, to, ff, deferredQuery, pageSize],
  );
  const ordersQ = useQuery({
    queryKey: ["orders", brandId, from, to, ff, deferredQuery, pageSize, cursor],
    queryFn: () =>
      listFn({
        data: {
          ...ordersArgs,
          cursorAt: cursor?.occurredAt ?? null,
          cursorId: cursor?.id ?? null,
        },
      }),
    // Keep the previous page visible while the next one loads instead of
    // blanking the table (this is what made orders "disappear" on slow calls).
    placeholderData: keepPreviousData,
    ...queryPresets.listing,
  });

  // Warm the next page in the background so pagination feels instant.
  const nextCursor = ordersQ.data?.nextCursor ?? null;
  useEffect(() => {
    if (!nextCursor) return;
    void qc.prefetchQuery({
      queryKey: ["orders", brandId, from, to, ff, deferredQuery, pageSize, nextCursor],
      queryFn: () =>
        listFn({
          data: {
            ...ordersArgs,
            cursorAt: nextCursor.occurredAt ?? null,
            cursorId: nextCursor.id ?? null,
          },
        }),
      staleTime: queryPresets.listing.staleTime,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextCursor, brandId, from, to, ff, deferredQuery, pageSize]);

  const sumQ = useQuery({
    queryKey: ["orders-summary", brandId, from, to],
    queryFn: () => sumFn({ data: { brandId: brandId === "all" ? null : brandId, from, to } }),
    placeholderData: keepPreviousData,
    ...queryPresets.report,
  });
  const filterSummaryQ = useQuery({
    queryKey: ["orders", "filter-summary", brandId, from, to, ff, deferredQuery],
    queryFn: () =>
      filterSummaryFn({
        data: {
          brandId: brandId === "all" ? null : brandId,
          from,
          to,
          orderStatus: ff === "all" ? null : ff,
          search: deferredQuery,
        },
      }),
    placeholderData: keepPreviousData,
    ...queryPresets.report,
  });

  const syncAllShopifyFn = useServerFn(runShopifySyncAll);
  const backfillFn = useServerFn(runShopifyBackfillWindow);
  const sync = useMutation({
    mutationFn: (id: string) =>
      id === "all" ? syncAllShopifyFn() : syncFn({ data: { brandId: id } }),
    onSuccess: (r: { upserted: number; fetched: number }) => {
      toast.success(`${t("orders_synced")}: ${r.upserted}/${r.fetched}`);
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["orders-summary"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [backfillFrom, setBackfillFrom] = useState(() =>
    formatBusinessDate(new Date(Date.now() - 7 * 86400000)),
  );
  const [backfillTo, setBackfillTo] = useState(() => getTodayInBusinessTimezone());
  const backfill = useMutation({
    mutationFn: () =>
      backfillFn({
        data: {
          brandId: brandId === "all" ? null : brandId,
          fromISO: businessDateStartUTC(backfillFrom),
          toISO: businessDateEndUTC(backfillTo),
          deleteOutside: false,
        },
      }),
    onSuccess: (r: { upserted: number; fetched: number; brands: number }) => {
      toast.success(
        `${lang === "ar" ? "تم الاسترجاع" : "Backfilled"}: ${r.upserted}/${r.fetched} (${r.brands})`,
      );
      setBackfillOpen(false);
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["orders-summary"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Auto-sync Shopify orders every 30 seconds (silent; toasts only after 3 consecutive failures)
  const consecutiveFailuresRef = useRef(0);
  const hasWarnedRef = useRef(false);
  useEffect(() => {
    const tick = async () => {
      try {
        if (brandId === "all") await syncAllShopifyFn();
        else await syncFn({ data: { brandId } });
        qc.invalidateQueries({ queryKey: ["orders"] });
        qc.invalidateQueries({ queryKey: ["orders-summary"] });
        consecutiveFailuresRef.current = 0;
        hasWarnedRef.current = false;
      } catch {
        consecutiveFailuresRef.current += 1;
        if (consecutiveFailuresRef.current >= 3 && !hasWarnedRef.current) {
          toast.warning(
            lang === "ar"
              ? "تعذّرت مزامنة Shopify، تحقق من الاتصال"
              : "Shopify sync failed, check your connection",
          );
          hasWarnedRef.current = true;
        }
      }
    };
    const iv = setInterval(tick, 30_000);
    return () => clearInterval(iv);
  }, [brandId, syncFn, syncAllShopifyFn, qc, lang]);
  const upd = useMutation({
    mutationFn: (v: {
      id: string;
      fulfillment_status?: string;
      financial_status?: string;
      confirmation_status?: string;
    }) => updFn({ data: v }),
    onSuccess: (r) => {
      if (r.stockWarning) {
        toast.warning(
          lang === "ar"
            ? `الكمية غير كافية للأصناف: ${r.stockWarning}`
            : `Insufficient stock for: ${r.stockWarning}`,
        );
      }
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["orders-summary"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const manualLifecycle = useMutation({
    mutationFn: () => {
      const lifecycle = lifecycleForManualShipmentOutcome(
        lifecycleDlg.outcome,
        lifecycleDlg.collectionStatus,
      );
      return transitionLifecycleFn({
        data: {
          id: lifecycleDlg.orderId,
          orderStatus: lifecycleDlg.orderStatus,
          collectionStatus: lifecycle.collectionStatus,
          shipmentOutcome: lifecycle.shipmentOutcome,
        },
      });
    },
    onSuccess: () => {
      toast.success(
        lang === "ar" ? "تم تعديل حالة الأوردر يدويًا" : "Order status updated manually",
      );
      setLifecycleDlg((current) => ({ ...current, open: false }));
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["orders-summary"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const dispatchFn = useServerFn(dispatchOrderToBestCourier);
  const [dispatchDlg, setDispatchDlg] = useState<{
    open: boolean;
    order: {
      id: string;
      brand_id: string;
      governorate: string | null;
      total_amount: number;
    } | null;
  }>({ open: false, order: null });
  const [pickedCourierId, setPickedCourierId] = useState<string>("");
  const dispatch = useMutation({
    mutationFn: (v: { orderId: string; courierId?: string | null }) => dispatchFn({ data: v }),
    onSuccess: (r) => {
      toast.success(
        (lang === "ar" ? "تم الإسناد إلى: " : "Dispatched to: ") +
          (r.courier?.name ?? "—") +
          (r.externalNote ?? ""),
      );
      setDispatchDlg({ open: false, order: null });
      setPickedCourierId("");
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["orders-summary"] });
      qc.invalidateQueries({ queryKey: ["couriers-dash"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bostaFn = useServerFn(sendBostaShipment);
  const attachFn = useServerFn(attachBostaTracking);
  const [trackDlg, setTrackDlg] = useState<{
    open: boolean;
    orderId: string;
    tracking: string;
    readOnly: boolean;
  }>({ open: false, orderId: "", tracking: "", readOnly: false });
  const bosta = useMutation({
    mutationFn: (id: string) => bostaFn({ data: { order_id: id } }),
    onSuccess: (r, id) => {
      toast.success(lang === "ar" ? "أُرسل إلى بوسطة" : "Sent to Bosta");
      setTrackDlg({ open: true, orderId: id, tracking: r.tracking ?? "", readOnly: true });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const attach = useMutation({
    mutationFn: (v: { order_id: string; tracking: string }) => attachFn({ data: v }),
    onSuccess: () => {
      toast.success(lang === "ar" ? "تم حفظ رقم التتبع" : "Tracking saved");
      setTrackDlg((s) => ({ ...s, open: false }));
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pullFn = useServerFn(pullBostaShipmentStatus);
  const pullOne = useMutation({
    mutationFn: (id: string) => pullFn({ data: { order_id: id } }),
    onSuccess: (r) => {
      toast.success((lang === "ar" ? "تحديث من بوسطة: " : "Bosta: ") + (r.state ?? "—"));
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["orders-summary"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const syncAllFn = useServerFn(syncAllBostaShipments);
  const syncAll = useMutation({
    mutationFn: () => syncAllFn({ data: { brand_id: brandId === "all" ? null : brandId } }),
    onSuccess: (r) => {
      toast.success(
        (lang === "ar" ? "استرجاع بوسطة — تم فحص: " : "Bosta recall — checked: ") +
          `${r.checked} · updated: ${r.updated}${r.failed ? ` · failed: ${r.failed}` : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["orders-summary"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openEdit(id: string) {
    setEditOrderId(id);
    setNewOpen(true);
  }

  const rows = ordersQ.data?.rows ?? [];
  const totalRows = filterSummaryQ.data?.total ?? 0;
  // Runtime audit: publish this page's "orders in scope" count so other
  // reports over the same (brand, period) can be cross-checked.
  useEffect(() => {
    if (!sumQ.data) return;
    registerReportOrderCount(
      "orders_page",
      orderScopeKey({ brandId: brandId === "all" ? null : brandId, from, to }),
      Number(sumQ.data.totalOrders) || 0,
    );
  }, [sumQ.data, brandId, from, to]);

  const nf = (n: number) => Number(n || 0).toLocaleString("en-US");
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const changePage = (value: number | ((previous: number) => number)) => {
    const requested = typeof value === "function" ? value(page) : value;
    const next = Math.max(0, Math.min(requested, pageCount - 1));
    if (next > page && ordersQ.data?.nextCursor) {
      setPageCursors((current) => {
        const copy = current.slice();
        copy[next] = ordersQ.data?.nextCursor ?? null;
        return copy;
      });
    }
    setPage(next);
  };
  const pg = {
    slice: rows,
    total: totalRows,
    page,
    setPage: changePage,
    pageSize,
    setPageSize,
    pageCount,
    start: page * pageSize,
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ShoppingBag className="w-7 h-7" /> {t("orders_title")}
        </h1>
        <div className="flex gap-2 flex-wrap items-center">
          <PeriodFilter value={period} onChange={setPeriod} />
          <Button
            size="sm"
            className="gap-1"
            onClick={() => {
              setEditOrderId(null);
              setNewOpen(true);
            }}
          >
            <Plus className="w-4 h-4" />
            {t("orders_new")}
          </Button>
          <OrderEditDialog open={newOpen} orderId={editOrderId} onOpenChange={setNewOpen} />
          <Select value={brandId} onValueChange={setBrandId}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all_brands")}</SelectItem>
              {(brandsQ.data ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => sync.mutate(brandId)}
            disabled={sync.isPending}
            title={lang === "ar" ? "مزامنة أوردرات Shopify الآن" : "Sync Shopify orders now"}
          >
            <RefreshCw className={`w-4 h-4 me-1 ${sync.isPending ? "animate-spin" : ""}`} />
            {lang === "ar"
              ? brandId === "all"
                ? "مزامنة Shopify (الكل)"
                : "مزامنة Shopify"
              : brandId === "all"
                ? "Sync Shopify (all)"
                : "Sync Shopify"}
          </Button>
          <Dialog open={backfillOpen} onOpenChange={setBackfillOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                title={lang === "ar" ? "مزامنة لفترة محددة" : "Sync custom date range"}
              >
                <RefreshCw className="w-4 h-4 me-1" />
                {lang === "ar" ? "مزامنة فترة" : "Sync range"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {lang === "ar" ? "مزامنة Shopify لفترة محددة" : "Sync Shopify — date range"}
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{lang === "ar" ? "من" : "From"}</Label>
                  <Input
                    type="date"
                    value={backfillFrom}
                    onChange={(e) => setBackfillFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{lang === "ar" ? "إلى" : "To"}</Label>
                  <Input
                    type="date"
                    value={backfillTo}
                    onChange={(e) => setBackfillTo(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {lang === "ar"
                  ? `سيتم جلب/تحديث كل الأوردرات في هذه الفترة${brandId === "all" ? " لكل البراندات المربوطة" : ""}.`
                  : `Fetches/updates all orders in this window${brandId === "all" ? " for every connected brand" : ""}.`}
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBackfillOpen(false)}>
                  {t("cancel")}
                </Button>
                <Button onClick={() => backfill.mutate()} disabled={backfill.isPending}>
                  {backfill.isPending
                    ? lang === "ar"
                      ? "جارٍ..."
                      : "Running…"
                    : lang === "ar"
                      ? "تشغيل"
                      : "Run"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncAll.mutate()}
            disabled={syncAll.isPending}
            title={lang === "ar" ? "استرجاع حالات شحنات بوسطة" : "Recall Bosta shipment statuses"}
          >
            <RotateCw className={`w-4 h-4 me-1 ${syncAll.isPending ? "animate-spin" : ""}`} />
            {lang === "ar" ? "استرجاع بوسطة" : "Recall Bosta"}
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <Kpi label={t("orders_title")} value={nf(sumQ.data?.totalOrders ?? 0)} />
        <Kpi
          label={`${t("ff_delivered")} / ${t("ff_returned")}`}
          value={`${nf(sumQ.data?.delivered ?? 0)} / ${nf(sumQ.data?.returned ?? 0)}`}
        />
      </div>

      {/* Filters */}
      <Card className="card-gradient p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-56">
          <Search className="w-4 h-4 absolute top-3 start-3 text-muted-foreground" />
          <Input
            placeholder={
              lang === "ar" ? "بحث برقم الأوردر/العميل/التليفون" : "Search order/customer/phone"
            }
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="ps-9"
          />
        </div>
        <Select value={ff} onValueChange={setFf}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === "ar" ? "كل الحالات" : "All statuses"}</SelectItem>
            {ORDER_WORKFLOW_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {lang === "ar" ? ORDER_STATUS_LABELS_AR[status] : ORDER_STATUS_LABELS_EN[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground num" dir="ltr">
          {nf(totalRows)} · {nf(Math.round(filterSummaryQ.data?.amount ?? 0))}
        </div>
      </Card>

      {/* Table */}
      <Card className="card-gradient overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="p-3 text-start">{t("date")}</th>
                <th className="p-3 text-start">{t("order_number")}</th>
                <th className="p-3 text-start">{t("order_source")}</th>
                <th className="p-3 text-start">{t("brand")}</th>
                <th className="p-3 text-start">{t("order_customer")}</th>
                <th className="p-3 text-start">{t("order_courier")}</th>
                <th className="p-3 text-start">{lang === "ar" ? "المحافظة" : "Governorate"}</th>
                <th className="p-3 text-start">{lang === "ar" ? "المنتجات" : "Products"}</th>
                <th className="p-3 text-start">{lang === "ar" ? "عدد القطع" : "Qty"}</th>
                <th className="p-3 text-start">{t("order_total")}</th>
                <th className="p-3 text-start">{lang === "ar" ? "رقم التتبع" : "Tracking"}</th>
                <th className="p-3 text-start">
                  {lang === "ar" ? "حالة الشحنة" : "Shipment status"}
                </th>
                <th className="p-3 text-start">
                  {lang === "ar" ? "حالة التحصيل" : "Collection status"}
                </th>
                <th className="p-3 text-start">Shopify</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {ordersQ.isLoading && (
                <tr>
                  <td colSpan={14} className="p-4">
                    <TableSkeleton rows={8} cols={14} />
                  </td>
                </tr>
              )}
              {!ordersQ.isLoading &&
                pg.slice.map((r) => {
                  const products = r.items_summary ?? [];
                  const productsText = products.map((p) => `${p.title} ×${p.qty}`).join(" · ");
                  return (
                    <tr key={r.id} className="border-b border-border/50">
                      <td className="p-3 num text-xs text-muted-foreground" dir="ltr">
                        {r.occurred_at.slice(0, 10)}
                      </td>
                      <td className="p-3 num font-mono text-xs">
                        {r.external_order_number ?? "—"}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="uppercase text-[10px]">
                          {r.source}
                        </Badge>
                      </td>
                      <td className="p-3">{r.brand_name}</td>
                      <td className="p-3">
                        {r.customer_id ? (
                          <Link
                            to="/customers/$id"
                            params={{ id: r.customer_id }}
                            className="text-primary hover:underline"
                          >
                            {r.customer_name || r.customer_phone || "—"}
                          </Link>
                        ) : (
                          r.customer_name || "—"
                        )}
                        {r.customer_phone && (
                          <div className="text-[10px] text-muted-foreground" dir="ltr">
                            {r.customer_phone}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-xs">{r.courier_name ?? "—"}</td>
                      <td className="p-3 text-xs">{r.shipping_governorate ?? "—"}</td>
                      <td className="p-3 text-xs max-w-[240px]">
                        {products.length === 0 ? (
                          "—"
                        ) : (
                          <div className="space-y-0.5 truncate" title={productsText}>
                            {products.slice(0, 2).map((p, i) => (
                              <div key={i} className="truncate">
                                {p.title} <span className="text-muted-foreground">×{p.qty}</span>
                              </div>
                            ))}
                            {products.length > 2 && (
                              <div className="text-[10px] text-muted-foreground">
                                +{products.length - 2}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-3 num">{r.items_qty}</td>
                      <td className="p-3 num">{nf(Math.round(r.total_amount))}</td>
                      <td className="p-3 num font-mono text-[11px]" dir="ltr">
                        {r.bosta_tracking ? (
                          <span
                            className="cursor-pointer text-primary hover:underline"
                            title={r.bosta_tracking}
                            onClick={() =>
                              setTrackDlg({
                                open: true,
                                orderId: r.id,
                                tracking: r.bosta_tracking!,
                                readOnly: true,
                              })
                            }
                          >
                            {r.bosta_tracking}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-3">
                        <button
                          type="button"
                          className="text-start"
                          onClick={() =>
                            setLifecycleDlg({
                              open: true,
                              orderId: r.id,
                              orderStatus: r.order_status,
                              outcome: r.shipment_outcome,
                              collectionStatus: r.collection_status,
                            })
                          }
                          title={lang === "ar" ? "تعديل الحالة يدويًا" : "Edit status manually"}
                        >
                          <Badge
                            variant={
                              r.order_status === "succeeded"
                                ? "default"
                                : r.order_status === "cancelled"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {r.shipment_outcome === "open"
                              ? lang === "ar"
                                ? ORDER_STATUS_LABELS_AR[r.order_status]
                                : ORDER_STATUS_LABELS_EN[r.order_status]
                              : lang === "ar"
                                ? SHIPMENT_OUTCOME_LABELS_AR[r.shipment_outcome]
                                : SHIPMENT_OUTCOME_LABELS_EN[r.shipment_outcome]}
                          </Badge>
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            {lang === "ar"
                              ? `آخر تحديث: ${LIFECYCLE_SOURCE_AR[r.lifecycle_source]}`
                              : `Source: ${LIFECYCLE_SOURCE_EN[r.lifecycle_source]}`}
                          </div>
                        </button>
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={
                            r.collection_status === "paid"
                              ? "default"
                              : r.collection_status === "unpaid"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {lang === "ar"
                            ? COLLECTION_STATUS_LABELS_AR[r.collection_status]
                            : COLLECTION_STATUS_LABELS_EN[r.collection_status]}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Select
                          value={r.confirmation_status ?? "pending"}
                          onValueChange={(v) => upd.mutate({ id: r.id, confirmation_status: v })}
                        >
                          <SelectTrigger className="w-32 h-8">
                            {(() => {
                              const c =
                                CONFIRM.find((x) => x.v === (r.confirmation_status ?? "pending")) ??
                                CONFIRM[0];
                              return (
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
                              );
                            })()}
                          </SelectTrigger>
                          <SelectContent>
                            {CONFIRM.map((c) => (
                              <SelectItem key={c.v} value={c.v}>
                                {lang === "ar" ? c.labelAr : c.labelEn}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-3">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => openEdit(r.id)}
                          title={lang === "ar" ? "تعديل" : "Edit"}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        {(!r.courier_id || r.fulfillment_status === "unfulfilled") && (
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
                                  brand_id: r.brand_id,
                                  governorate: r.shipping_governorate ?? null,
                                  total_amount: Number(r.total_amount ?? 0),
                                },
                              });
                            }}
                            disabled={dispatch.isPending}
                            title={lang === "ar" ? "اختر شركة شحن / مندوب" : "Choose courier / rep"}
                          >
                            <Send className="w-3.5 h-3.5 text-primary" />
                          </Button>
                        )}

                        {!r.bosta_tracking &&
                          r.fulfillment_status !== "delivered" &&
                          r.fulfillment_status !== "returned" &&
                          r.fulfillment_status !== "cancelled" && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() =>
                                setTrackDlg({
                                  open: true,
                                  orderId: r.id,
                                  tracking: "",
                                  readOnly: false,
                                })
                              }
                              title={
                                lang === "ar" ? "إدخال رقم تتبع يدويًا" : "Enter tracking manually"
                              }
                            >
                              <Hash className="w-3.5 h-3.5" />
                            </Button>
                          )}

                        {r.bosta_tracking && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => pullOne.mutate(r.id)}
                            disabled={pullOne.isPending}
                            title={
                              lang === "ar" ? "استرجاع الحالة من بوسطة" : "Recall status from Bosta"
                            }
                          >
                            <RotateCw className="w-3.5 h-3.5 text-primary" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              {!ordersQ.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={13} className="p-8 text-center text-muted-foreground">
                    {lang === "ar"
                      ? "لا يوجد أوردرات في هذا الفلتر."
                      : "No orders match this filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar {...pg} />
      </Card>

      <Dialog
        open={lifecycleDlg.open}
        onOpenChange={(open) => setLifecycleDlg((current) => ({ ...current, open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {lang === "ar" ? "تعديل حالة الأوردر يدويًا" : "Edit order status manually"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{lang === "ar" ? "حالة الأوردر" : "Order status"}</Label>
              <Select
                value={
                  lifecycleDlg.outcome === "open" ? lifecycleDlg.orderStatus : lifecycleDlg.outcome
                }
                onValueChange={(value) => {
                  if (
                    OPEN_WORKFLOW_STATUSES.includes(
                      value as (typeof OPEN_WORKFLOW_STATUSES)[number],
                    )
                  ) {
                    setLifecycleDlg((current) => ({
                      ...current,
                      orderStatus: value as OrderWorkflowStatus,
                      outcome: "open",
                    }));
                    return;
                  }
                  const outcome = value as ShipmentOutcome;
                  const lifecycle = lifecycleForManualShipmentOutcome(
                    outcome,
                    lifecycleDlg.collectionStatus,
                  );
                  setLifecycleDlg((current) => ({
                    ...current,
                    orderStatus: lifecycle.orderStatus,
                    outcome,
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPEN_WORKFLOW_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {lang === "ar"
                        ? ORDER_STATUS_LABELS_AR[status]
                        : ORDER_STATUS_LABELS_EN[status]}
                    </SelectItem>
                  ))}
                  {SHIPMENT_OUTCOMES.filter((outcome) => outcome !== "open").map((outcome) => (
                    <SelectItem key={outcome} value={outcome}>
                      {lang === "ar"
                        ? SHIPMENT_OUTCOME_LABELS_AR[outcome]
                        : SHIPMENT_OUTCOME_LABELS_EN[outcome]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{lang === "ar" ? "حالة التحصيل" : "Collection status"}</Label>
              <Select
                value={lifecycleDlg.collectionStatus}
                onValueChange={(value) =>
                  setLifecycleDlg((current) => ({
                    ...current,
                    collectionStatus: value as CollectionStatus,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLLECTION_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {lang === "ar"
                        ? COLLECTION_STATUS_LABELS_AR[status]
                        : COLLECTION_STATUS_LABELS_EN[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              {lang === "ar"
                ? "التعديل اليدوي مسموح، وتحديثات بوسطة الجديدة ستستمر تلقائيًا. الأحداث القديمة لن تخفّض حالة نهائية."
                : "Manual edits are allowed. New Bosta events keep syncing; stale events cannot downgrade a terminal outcome."}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setLifecycleDlg((current) => ({ ...current, open: false }))}
            >
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button onClick={() => manualLifecycle.mutate()} disabled={manualLifecycle.isPending}>
              {lang === "ar" ? "حفظ الحالة" : "Save status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bosta tracking dialog */}
      <Dialog open={trackDlg.open} onOpenChange={(v) => setTrackDlg((s) => ({ ...s, open: v }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{lang === "ar" ? "رقم تتبع بوسطة" : "Bosta Tracking Number"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{lang === "ar" ? "رقم التتبع" : "Tracking number"}</Label>
            <Input
              value={trackDlg.tracking}
              onChange={(e) => setTrackDlg((s) => ({ ...s, tracking: e.target.value }))}
              placeholder="e.g. 12345678"
              readOnly={trackDlg.readOnly}
              autoFocus
            />
            {trackDlg.readOnly && trackDlg.tracking && (
              <p className="text-xs text-muted-foreground">
                {lang === "ar"
                  ? "تم حفظه تلقائيًا مع الأوردر."
                  : "Saved automatically with the order."}
              </p>
            )}
          </div>
          <DialogFooter>
            {trackDlg.readOnly ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard?.writeText(trackDlg.tracking);
                    toast.success(lang === "ar" ? "تم النسخ" : "Copied");
                  }}
                >
                  {lang === "ar" ? "نسخ" : "Copy"}
                </Button>
                <Button onClick={() => setTrackDlg((s) => ({ ...s, open: false }))}>
                  {lang === "ar" ? "تم" : "Done"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setTrackDlg((s) => ({ ...s, open: false }))}
                >
                  {lang === "ar" ? "إلغاء" : "Cancel"}
                </Button>
                <Button
                  onClick={() =>
                    attach.mutate({
                      order_id: trackDlg.orderId,
                      tracking: trackDlg.tracking.trim(),
                    })
                  }
                  disabled={attach.isPending || !trackDlg.tracking.trim()}
                >
                  {lang === "ar" ? "حفظ" : "Save"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispatch (choose courier / rep) dialog */}
      <DispatchDialog
        open={dispatchDlg.open}
        order={dispatchDlg.order}
        onOpenChange={(v) => {
          if (!v) {
            setDispatchDlg({ open: false, order: null });
            setPickedCourierId("");
          }
        }}
        couriers={couriersQ.data ?? []}
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

function Kpi({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "destructive" | "muted";
}) {
  const cls =
    tone === "success"
      ? "text-emerald-500"
      : tone === "destructive"
        ? "text-destructive"
        : tone === "muted"
          ? "text-muted-foreground"
          : "";
  return (
    <Card className="card-gradient p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-1 num ${cls}`}>{value}</div>
    </Card>
  );
}

export type CourierRow = {
  id: string;
  name: string;
  type: "courier_company" | "rep" | "offline_branch";
  contact: string | null;
  brand_id: string | null;
  brand_ids: string[];
  serves_all_brands: boolean;
  active: boolean;
};
export type DispatchOrder = {
  id: string;
  brand_id: string;
  governorate: string | null;
  total_amount: number;
};

export function DispatchDialog(props: {
  open: boolean;
  order: DispatchOrder | null;
  onOpenChange: (v: boolean) => void;
  couriers: CourierRow[];
  picked: string;
  setPicked: (v: string) => void;
  onConfirm: (courierId: string) => void;
  pending: boolean;
  lang: string;
}) {
  const { open, order, onOpenChange, couriers, picked, setPicked, onConfirm, pending, lang } =
    props;
  const AR = lang === "ar";
  const recFn = useServerFn(recommendCourierForOrder);
  const recQ = useQuery({
    queryKey: ["dispatch-rec", order?.id ?? ""],
    queryFn: () => recFn({ data: { orderId: order!.id } }),
    enabled: open && !!order,
  });
  const brandId = order?.brand_id ?? "";
  const list = (couriers ?? []).filter(
    (courier) =>
      courier.active &&
      courier.type !== "offline_branch" &&
      isCourierAvailableForBrand(
        {
          brandId: courier.brand_id,
          servesAllBrands: courier.serves_all_brands,
          brandIds: courier.brand_ids ?? [],
        },
        brandId,
      ),
  );
  const recId = recQ.data?.courier?.id ?? null;
  const cod = Math.round(order?.total_amount ?? 0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{AR ? tr("اختر شركة شحن أو مندوب") : "Choose courier / rep"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            {AR
              ? `المحافظة: ${order?.governorate ?? "—"} · المبلغ COD: ${cod}`
              : `Governorate: ${order?.governorate ?? "—"} · COD: ${cod}`}
          </div>
          {list.length === 0 && (
            <div className="text-sm text-muted-foreground p-4 text-center border border-dashed rounded">
              {AR
                ? "لا يوجد مندوبين/شركات شحن لهذا البراند. أضِف واحدًا من صفحة المندوبين."
                : "No couriers for this brand. Add one from the Couriers page."}
            </div>
          )}
          <div className="max-h-72 overflow-y-auto space-y-1.5">
            {list.map((c) => {
              const isRec = c.id === recId;
              const isSel = picked === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setPicked(c.id)}
                  className={`w-full flex items-center justify-between p-2.5 rounded border text-start transition ${isSel ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"}`}
                >
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium">{c.name}</div>
                    <Badge variant="outline" className="text-[10px]">
                      {c.type === "rep" ? (AR ? "مندوب" : "Rep") : AR ? "شركة شحن" : "Courier"}
                    </Badge>
                    {isRec && (
                      <Badge className="text-[10px] bg-emerald-500/20 text-emerald-500 border-emerald-500/30">
                        {AR ? tr("الموصى به") : "Recommended"}
                      </Badge>
                    )}
                  </div>
                  {isRec && recQ.data?.courier?.deliveryRate != null && (
                    <div className="text-[10px] text-emerald-500 num">
                      {Math.round((recQ.data.courier.deliveryRate as number) * 100)}%
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {AR
              ? `المبلغ سيُضاف تلقائيًا إلى «المتوقع تحصيله» لهذا المندوب.`
              : `The COD amount will be added to this courier's expected collections automatically.`}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {AR ? "إلغاء" : "Cancel"}
          </Button>
          <Button
            disabled={pending || !picked || list.length === 0}
            onClick={() => onConfirm(picked)}
          >
            {pending ? (AR ? "جاري..." : "Sending…") : AR ? "تأكيد الإسناد" : "Confirm dispatch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
