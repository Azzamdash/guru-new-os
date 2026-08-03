import { tr } from "@/lib/i18n";
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
} from "lucide-react";
import { exportToCSV } from "@/lib/export-utils";
import { PeriodFilter, resolvePeriod } from "@/components/PeriodFilter";
import { usePersistedPeriod } from "@/lib/global-period";
import { queryPresets } from "@/lib/query-presets";
import { listBrands } from "@/lib/internal.functions";
import {
  getOrdersOverview,
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
import { getOrder, listOrders, type OrderRow } from "@/lib/orders.functions";
import { OrderSearchCombobox } from "@/components/orders/OrderSearchCombobox";

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

function OrdersCenterPage() {
  const { lang } = useLang();
  const t = (ar: string, en: string) => T(lang, ar, en);
  const qc = useQueryClient();
  const [period, setPeriod] = usePersistedPeriod("orders-center");
  const resolved = useMemo(() => resolvePeriod(period), [period]);
  const [brandId, setBrandId] = useState<string>("all");
  const [tab, setTab] = useState("kpis");
  const [activeOrder, setActiveOrder] = useState("");
  const [activeRow, setActiveRow] = useState<OrderRow | null>(null);
  const [ordersFilter, setOrdersFilter] = useState<OrdersListFilter>({
    status: "all",
    courier: "all",
    gov: "all",
  });
  const ordersTabRef = useRef<HTMLDivElement | null>(null);

  const drillTo = (patch: Partial<OrdersListFilter>) => {
    setOrdersFilter({ status: "all", courier: "all", gov: "all", ...patch });
    setTab("orders");
    setTimeout(
      () => ordersTabRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      50,
    );
  };

  const openOrderIn = (target: "ops" | "timeline", row: OrderRow) => {
    setActiveOrder(row.id);
    setActiveRow(row);
    setTab(target);
  };

  const brands = useQuery({
    queryKey: ["brands"],
    queryFn: () => listBrands(),
    ...queryPresets.reference,
  });

  const overviewFn = useServerFn(getOrdersOverview);
  const overview = useQuery({
    queryKey: ["orders-center", "overview", resolved.dateFrom, resolved.dateTo, brandId],
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

  const o = overview.data;

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
          <PeriodFilter value={period} onChange={setPeriod} />
          {tab === "kpis" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={exportOverviewCsv}
              disabled={!o}
              className="gap-1.5"
            >
              <Download className="h-4 w-4" /> {t("تصدير CSV", "Export CSV")}
            </Button>
          ) : null}
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
          <TabsTrigger value="kpis">{t("المؤشرات", "KPIs")}</TabsTrigger>
          <TabsTrigger value="attention" className="relative">
            {t("يحتاج تدخل", "Needs attention")}
            {stuckCount > 0 && (
              <span className="absolute -top-1 -end-1 min-w-4 rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground">
                {stuckCount > 99 ? "99+" : stuckCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="orders">{t("الأوردرات", "Orders")}</TabsTrigger>
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

        <TabsContent value="kpis" className="space-y-4 pt-4">
          {stuckCount > 0 ? (
            <Card className="border-destructive/50 bg-destructive/5 p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-semibold">
                  {lang === "ar" ? (
                    <>
                      {stuckCount} أوردر يحتاج تدخل عاجل
                      {" — "}
                      {stuck.data?.noShipment.length ?? 0} بدون شحن أكثر من 3 أيام،{" "}
                      {stuck.data?.uncollected.length ?? 0} تم تسليمها بدون تحصيل كامل
                    </>
                  ) : (
                    <>
                      {stuckCount} order(s) need urgent attention
                      {" — "}
                      {stuck.data?.noShipment.length ?? 0} with no shipment for over 3 days,{" "}
                      {stuck.data?.uncollected.length ?? 0} delivered without full collection
                    </>
                  )}
                </span>
              </div>
              <Button size="sm" variant="destructive" onClick={() => setTab("attention")}>
                {t("عرض التفاصيل", "View details")}
              </Button>
            </Card>
          ) : null}
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
                  hint={t(
                    `${nf(o.delivery.returned)} مرتجع`,
                    `${nf(o.delivery.returned)} returned`,
                  )}
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
                  hint={t(
                    `${nf(o.delivery.cancelled)} ملغي`,
                    `${nf(o.delivery.cancelled)} cancelled`,
                  )}
                  icon={Activity}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="p-4">
                  <div className="font-semibold mb-2">{t("حسب الحالة", "By status")}</div>
                  <table className="w-full text-sm">
                    <tbody>
                      {o.byStatus.map((r) => (
                        <tr
                          key={r.status}
                          onClick={() => drillTo({ status: r.status })}
                          title={t(
                            "اضغط لعرض أوردرات هذه الحالة",
                            "Click to view orders with this status",
                          )}
                          className="border-b last:border-0 cursor-pointer transition-colors hover:bg-accent/60"
                        >
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
                        <tr
                          key={r.name}
                          onClick={() => drillTo({ courier: r.name })}
                          title={t(
                            "اضغط لعرض أوردرات شركة الشحن دي",
                            "Click to view orders for this courier",
                          )}
                          className="border-b last:border-0 text-center cursor-pointer transition-colors hover:bg-accent/60"
                        >
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
                        <tr
                          key={r.name}
                          onClick={() => drillTo({ gov: r.name })}
                          title={t(
                            "اضغط لعرض أوردرات المحافظة دي",
                            "Click to view orders for this governorate",
                          )}
                          className="border-b last:border-0 text-center cursor-pointer transition-colors hover:bg-accent/60"
                        >
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
            </>
          ) : null}
        </TabsContent>

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

        <TabsContent value="orders" className="pt-4" ref={ordersTabRef}>
          <OrdersListPanel
            dateFrom={resolved.dateFrom ?? ""}
            dateTo={resolved.dateTo ?? ""}
            brandId={brandId}
            statuses={(o?.byStatus ?? []).map((r) => r.status)}
            couriers={(o?.byCourier ?? []).map((r) => r.name)}
            governorates={(o?.byGovernorate ?? []).map((r) => r.name)}
            onOpen={openOrderIn}
            filter={ordersFilter}
            setFilter={setOrdersFilter}
          />
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

export type OrdersListFilter = { status: string; courier: string; gov: string };

function OrdersListPanel({
  dateFrom,
  dateTo,
  brandId,
  statuses,
  couriers,
  governorates,
  onOpen,
  filter,
  setFilter,
}: {
  dateFrom: string;
  dateTo: string;
  brandId: string;
  statuses: string[];
  couriers: string[];
  governorates: string[];
  onOpen: (target: "ops" | "timeline", row: OrderRow) => void;
  filter: OrdersListFilter;
  setFilter: (next: OrdersListFilter) => void;
}) {
  const { lang } = useLang();
  const t = (ar: string, en: string) => T(lang, ar, en);
  const { status, courier, gov } = filter;
  const setStatus = (v: string) => setFilter({ ...filter, status: v });
  const setCourier = (v: string) => setFilter({ ...filter, courier: v });
  const setGov = (v: string) => setFilter({ ...filter, gov: v });
  const [page, setPage] = useState(0);
  const [cursors, setCursors] = useState<Array<{ occurredAt: string; id: string } | null>>([null]);
  const pageSize = 25;

  useEffect(() => {
    setPage(0);
    setCursors([null]);
  }, [dateFrom, dateTo, brandId, status]);

  const cursor = cursors[page] ?? null;
  const listFn = useServerFn(listOrders);
  const q = useQuery({
    queryKey: ["orders-center", "orders-list", dateFrom, dateTo, brandId, status, cursor],
    queryFn: () =>
      listFn({
        data: {
          brandId: brandId === "all" ? null : brandId,
          from: dateFrom,
          to: dateTo,
          orderStatus: status === "all" ? null : status,
          pageSize,
          cursorAt: cursor?.occurredAt ?? null,
          cursorId: cursor?.id ?? null,
        },
      }),
    placeholderData: keepPreviousData,
    ...queryPresets.listing,
  });

  const rows = useMemo(
    () =>
      (q.data?.rows ?? []).filter(
        (r) =>
          (courier === "all" || (r.courier_name ?? "—") === courier) &&
          (gov === "all" || (r.shipping_governorate ?? "—") === gov),
      ),
    [q.data, courier, gov],
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSelected(new Set());
  }, [dateFrom, dateTo, brandId, status, courier, gov, page]);
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = (on: boolean) => setSelected(on ? new Set(rows.map((r) => r.id)) : new Set());
  const toggleOne = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const exportSelected = () => {
    exportToCSV(`orders-selected-${formatBusinessDate(new Date())}`, selectedRows, [
      {
        key: "customer_name",
        label: t("اسم العميل", "Customer name"),
        fmt: (v) => (v as string) ?? "—",
      },
      { key: "customer_phone", label: t("التليفون", "Phone"), fmt: (v) => (v as string) ?? "—" },
      {
        key: "shipping_governorate",
        label: t("المحافظة", "Governorate"),
        fmt: (v) => (v as string) ?? "—",
      },
      { key: "courier_name", label: t("شركة الشحن", "Courier"), fmt: (v) => (v as string) ?? "—" },
      { key: "total_amount", label: t("المبلغ", "Amount"), fmt: (v) => String(Number(v ?? 0)) },
    ]);
    toast.success(
      t(`تم تصدير ${selectedRows.length} أوردر`, `Exported ${selectedRows.length} order(s)`),
    );
  };

  const goNext = () => {
    const nc = q.data?.nextCursor;
    if (!nc) return;
    setCursors((prev) => {
      const next = [...prev];
      next[page + 1] = nc;
      return next;
    });
    setPage((p) => p + 1);
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t("الحالة", "Status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("كل الحالات", "All statuses")}</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={courier} onValueChange={setCourier}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t("شركة الشحن", "Courier")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("كل شركات الشحن", "All couriers")}</SelectItem>
            {couriers.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={gov} onValueChange={setGov}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t("المحافظة", "Governorate")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("كل المحافظات", "All governorates")}</SelectItem>
            {governorates.map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="w-8 py-1">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(v) => toggleAll(v === true)}
                  aria-label={t("تحديد الكل", "Select all")}
                />
              </th>
              <th className="text-start py-1">{t("رقم الأوردر", "Order #")}</th>
              <th className="text-start">{t("العميل", "Customer")}</th>
              <th className="text-start">{t("البراند", "Brand")}</th>
              <th className="text-start">{t("الحالة", "Status")}</th>
              <th className="text-start">{t("شركة الشحن", "Courier")}</th>
              <th className="text-start">{t("المحافظة", "Governorate")}</th>
              <th className="text-end">{t("المبلغ", "Amount")}</th>
              <th className="text-end">{t("التاريخ", "Date")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-1">
                  <Checkbox
                    checked={selected.has(r.id)}
                    onCheckedChange={(v) => toggleOne(r.id, v === true)}
                    aria-label={t("تحديد الأوردر", "Select order")}
                  />
                </td>
                <td className="py-1">{r.external_order_number ?? r.id.slice(0, 8)}</td>
                <td>{r.customer_name ?? "—"}</td>
                <td>{r.brand_name}</td>
                <td>
                  <Badge variant="secondary">{r.order_status}</Badge>
                </td>
                <td>{r.courier_name ?? "—"}</td>
                <td>{r.shipping_governorate ?? "—"}</td>
                <td className="text-end tabular-nums">{nf(Number(r.total_amount))}</td>
                <td className="text-end tabular-nums">
                  {new Date(r.occurred_at).toLocaleDateString("en-GB")}
                </td>
                <td className="text-end whitespace-nowrap">
                  <Button
                    size="sm"
                    variant="outline"
                    className="me-1"
                    onClick={() => onOpen("ops", r)}
                  >
                    <Truck className="h-3 w-3 me-1" />{" "}
                    {t("الشحن والتحصيل", "Shipping & Collection")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onOpen("timeline", r)}>
                    <Activity className="h-3 w-3 me-1" /> {t("السجل", "Timeline")}
                  </Button>
                </td>
              </tr>
            ))}
            {!q.isLoading && rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-6 text-center text-muted-foreground">
                  {t("لا توجد أوردرات مطابقة.", "No matching orders.")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selectedRows.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <div className="text-sm">
            {t(`تم تحديد ${selectedRows.length} أوردر`, `${selectedRows.length} order(s) selected`)}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
              {t("إلغاء التحديد", "Clear selection")}
            </Button>
            <Button size="sm" onClick={exportSelected}>
              <Download className="h-3 w-3 me-1" /> {t("تصدير المحدد CSV", "Export selected CSV")}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {q.isFetching
            ? t("جارٍ التحميل…", "Loading…")
            : t(`صفحة ${page + 1}`, `Page ${page + 1}`)}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            {t("السابق", "Previous")}
          </Button>
          <Button size="sm" variant="outline" disabled={!q.data?.hasMore} onClick={goNext}>
            {t("التالي", "Next")}
          </Button>
        </div>
      </div>
    </Card>
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
