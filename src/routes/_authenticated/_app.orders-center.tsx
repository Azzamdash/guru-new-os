import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { MessageCircle, Truck, Wallet, Activity, Send, RefreshCw, Link2, Unlink } from "lucide-react";
import { PeriodFilter, resolvePeriod } from "@/components/PeriodFilter";
import { usePersistedPeriod } from "@/lib/global-period";
import { queryPresets } from "@/lib/query-presets";
import { listBrands } from "@/lib/internal.functions";
import {
  getOrdersOverview, getOrderTimeline, addShipmentAttempt, recordCollection,
  listWhatsappThreads, getWhatsappThread, sendWhatsappMessage, startWhatsappThread,
  linkThreadToOrder,
} from "@/lib/orders-management.functions";
import { getOrder, listOrders, type OrderRow } from "@/lib/orders.functions";
import { OrderSearchCombobox } from "@/components/orders/OrderSearchCombobox";



export const Route = createFileRoute("/_authenticated/_app/orders-center")({
  head: () => ({ meta: [
    { title: "مركز إدارة الأوردرات — e-GURUS" },
    { name: "description", content: "مؤشرات الأوردرات، الشحنات والتحصيل، وسجل حالات كل أوردر، بالإضافة لصندوق محادثات واتساب." },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
  component: OrdersCenterPage,
});

const nf = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const pct = (n: number) => `${Number(n || 0).toFixed(1)}%`;

function Kpi({ label, value, hint, icon: Icon }: { label: string; value: string; hint?: string; icon: typeof Truck }) {
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
  const qc = useQueryClient();
  const [period, setPeriod] = usePersistedPeriod("orders-center");
  const resolved = useMemo(() => resolvePeriod(period), [period]);
  const [brandId, setBrandId] = useState<string>("all");
  const [tab, setTab] = useState("kpis");
  const [activeOrder, setActiveOrder] = useState("");
  const [activeRow, setActiveRow] = useState<OrderRow | null>(null);

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
    queryFn: () => overviewFn({ data: { dateFrom: resolved.dateFrom, dateTo: resolved.dateTo, brandId: brandId === "all" ? null : brandId } }),
    ...queryPresets.report,
  });

  const waListFn = useServerFn(listWhatsappThreads);
  const waThreads = useQuery({
    queryKey: ["orders-center", "wa-unread"],
    queryFn: () => waListFn({ data: { search: null } }),
    ...queryPresets.live,
  });
  const waUnread = (waThreads.data ?? []).reduce((sum, t) => sum + (t.unread_count || 0), 0);

  const o = overview.data;

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">مركز إدارة الأوردرات</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={brandId} onValueChange={setBrandId}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل البراندات</SelectItem>
              {(brands.data ?? []).map((b: { id: string; name: string }) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <PeriodFilter value={period} onChange={setPeriod} />
          <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["orders-center"] })}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="kpis">المؤشرات</TabsTrigger>
          <TabsTrigger value="orders">الأوردرات</TabsTrigger>
          <TabsTrigger value="ops">الشحن والتحصيل</TabsTrigger>
          <TabsTrigger value="timeline">سجل الأوردر</TabsTrigger>

          <TabsTrigger value="wa" className="relative">
            واتساب
            {waUnread > 0 && (
              <span className="absolute -top-1 -end-1 min-w-4 rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground">
                {waUnread > 9 ? "9+" : waUnread}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kpis" className="space-y-4 pt-4">
          {overview.isLoading ? <Card className="p-6 text-muted-foreground">جارٍ التحميل…</Card> : null}
          {o ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi label="عدد الأوردرات" value={nf(o.totals.orders)} icon={Activity} />
                <Kpi label="إجمالي المبيعات" value={nf(o.totals.revenue)} hint={`متوسط الأوردر ${nf(o.totals.avgOrderValue)}`} icon={Wallet} />
                <Kpi label="نسبة التسليم" value={pct(o.delivery.deliveryRate)} hint={`${nf(o.delivery.delivered)} تم تسليمها`} icon={Truck} />
                <Kpi label="نسبة المرتجع" value={pct(o.delivery.returnRate)} hint={`${nf(o.delivery.returned)} مرتجع`} icon={Truck} />
                <Kpi label="المتوقع تحصيله" value={nf(o.collection.expected)} icon={Wallet} />
                <Kpi label="المحصّل فعليًا" value={nf(o.collection.collected)} hint={pct(o.collection.collectionRate)} icon={Wallet} />
                <Kpi label="المتبقي" value={nf(o.collection.outstanding)} icon={Wallet} />
                <Kpi label="قيد التنفيذ" value={nf(o.delivery.open)} hint={`${nf(o.delivery.cancelled)} ملغي`} icon={Activity} />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="p-4">
                  <div className="font-semibold mb-2">حسب الحالة</div>
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
                  <div className="font-semibold mb-2">أداء شركات الشحن</div>
                  <table className="w-full text-sm">
                    <thead className="text-muted-foreground">
                      <tr><th className="text-start">الشركة</th><th>أوردرات</th><th>تسليم</th><th>مرتجع</th><th>النسبة</th></tr>
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
                  <div className="font-semibold mb-2">التوزيع الجغرافي</div>
                  <table className="w-full text-sm">
                    <thead className="text-muted-foreground">
                      <tr><th className="text-start">المحافظة</th><th>أوردرات</th><th>تم التسليم</th><th>القيمة</th></tr>
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
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="orders" className="pt-4">
          <OrdersListPanel
            dateFrom={resolved.dateFrom ?? ""}
            dateTo={resolved.dateTo ?? ""}
            brandId={brandId}
            statuses={(o?.byStatus ?? []).map((r) => r.status)}
            couriers={(o?.byCourier ?? []).map((r) => r.name)}
            governorates={(o?.byGovernorate ?? []).map((r) => r.name)}
            onOpen={openOrderIn}
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

function OrdersListPanel({ dateFrom, dateTo, brandId, statuses, couriers, governorates, onOpen }: {
  dateFrom: string;
  dateTo: string;
  brandId: string;
  statuses: string[];
  couriers: string[];
  governorates: string[];
  onOpen: (target: "ops" | "timeline", row: OrderRow) => void;
}) {
  const [status, setStatus] = useState("all");
  const [courier, setCourier] = useState("all");
  const [gov, setGov] = useState("all");
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
    queryFn: () => listFn({ data: {
      brandId: brandId === "all" ? null : brandId,
      from: dateFrom,
      to: dateTo,
      orderStatus: status === "all" ? null : status,
      pageSize,
      cursorAt: cursor?.occurredAt ?? null,
      cursorId: cursor?.id ?? null,
    } }),
    placeholderData: keepPreviousData,
    ...queryPresets.listing,
  });

  const rows = useMemo(() => (q.data?.rows ?? []).filter((r) =>
    (courier === "all" || (r.courier_name ?? "—") === courier)
    && (gov === "all" || (r.shipping_governorate ?? "—") === gov)
  ), [q.data, courier, gov]);

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
          <SelectTrigger className="w-44"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {statuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={courier} onValueChange={setCourier}>
          <SelectTrigger className="w-44"><SelectValue placeholder="شركة الشحن" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل شركات الشحن</SelectItem>
            {couriers.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={gov} onValueChange={setGov}>
          <SelectTrigger className="w-44"><SelectValue placeholder="المحافظة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المحافظات</SelectItem>
            {governorates.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-start py-1">رقم الأوردر</th>
              <th className="text-start">العميل</th>
              <th className="text-start">البراند</th>
              <th className="text-start">الحالة</th>
              <th className="text-start">شركة الشحن</th>
              <th className="text-start">المحافظة</th>
              <th className="text-end">المبلغ</th>
              <th className="text-end">التاريخ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-1">{r.external_order_number ?? r.id.slice(0, 8)}</td>
                <td>{r.customer_name ?? "—"}</td>
                <td>{r.brand_name}</td>
                <td><Badge variant="secondary">{r.order_status}</Badge></td>
                <td>{r.courier_name ?? "—"}</td>
                <td>{r.shipping_governorate ?? "—"}</td>
                <td className="text-end tabular-nums">{nf(Number(r.total_amount))}</td>
                <td className="text-end tabular-nums">{new Date(r.occurred_at).toLocaleDateString("en-GB")}</td>
                <td className="text-end whitespace-nowrap">
                  <Button size="sm" variant="outline" className="me-1" onClick={() => onOpen("ops", r)}>
                    <Truck className="h-3 w-3 me-1" /> الشحن والتحصيل
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onOpen("timeline", r)}>
                    <Activity className="h-3 w-3 me-1" /> السجل
                  </Button>
                </td>
              </tr>
            ))}
            {!q.isLoading && rows.length === 0 ? (
              <tr><td colSpan={9} className="py-6 text-center text-muted-foreground">لا توجد أوردرات مطابقة.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{q.isFetching ? "جارٍ التحميل…" : `صفحة ${page + 1}`}</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>السابق</Button>
          <Button size="sm" variant="outline" disabled={!q.data?.hasMore} onClick={goNext}>التالي</Button>
        </div>
      </div>
    </Card>
  );
}


function TimelinePanel({ orderId, setOrderId, row, setRow }: {
  orderId: string;
  setOrderId: (id: string) => void;
  row: OrderRow | null;
  setRow: (row: OrderRow | null) => void;
}) {
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
    ? o.items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.unit_price || 0), 0)
      + Number(o.shipping_amount || 0) - Number(o.discount_amount || 0)
    : selectedRow?.total_amount ?? 0;

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label>ابحث عن الأوردر</Label>
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
            <div className="text-sm text-muted-foreground">جارٍ تحميل بيانات الأوردر…</div>
          ) : order.isError ? (
            <div className="text-sm text-destructive">تعذّر تحميل بيانات الأوردر</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="العميل" value={o?.customer_name ?? selectedRow?.customer_name ?? "—"} />
              <Field label="التليفون" value={o?.customer_phone ?? selectedRow?.customer_phone ?? "—"} />
              <Field label="البراند" value={selectedRow?.brand_name ?? "—"} />
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">الحالة الحالية</div>
                <Badge variant="secondary">{selectedRow?.order_status ?? o?.fulfillment_status ?? "—"}</Badge>
              </div>
              <Field label="إجمالي المبلغ" value={`${Number(total).toLocaleString("en-GB", { maximumFractionDigits: 2 })} ج.م`} />
              <Field label="شركة الشحن" value={selectedRow?.courier_name ?? "—"} />
              {o?.external_order_number ? <Field label="رقم الأوردر" value={o.external_order_number} /> : null}
            </div>
          )}
        </Card>
      ) : null}


      {timeline.data ? (
        <Card className="p-4 space-y-3">
          {timeline.data.entries.length === 0 ? <div className="text-muted-foreground">لا يوجد سجل بعد.</div> : null}
          {timeline.data.entries.map((e) => (
            <div key={e.id} className="flex gap-3 border-b last:border-0 pb-2">
              <Badge variant={e.kind === "collection" ? "default" : e.kind === "shipment" ? "secondary" : "outline"}>
                {e.kind === "collection" ? "تحصيل" : e.kind === "shipment" ? "شحن" : "حالة"}
              </Badge>
              <div className="flex-1">
                <div className="font-medium">{e.title}</div>
                {e.detail ? <div className="text-xs text-muted-foreground">{e.detail}</div> : null}
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">{new Date(e.at).toLocaleString("en-GB")}</div>
            </div>
          ))}
        </Card>
      ) : null}
    </div>
  );
}

const COLLECTION_METHODS = [
  { value: "cod", label: "دفع عند الاستلام (COD)" },
  { value: "cash", label: "كاش" },
  { value: "bank_transfer", label: "تحويل بنكي" },
  { value: "vodafone_cash", label: "فودافون كاش" },
  { value: "instapay", label: "إنستاباي" },
  { value: "card", label: "بطاقة / فيزا" },
  { value: "other", label: "أخرى" },
] as const;

function ShipmentsPanel({ orderId, setOrderId }: { orderId: string; setOrderId: (id: string) => void }) {
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
    onSuccess: () => { toast.success("تم تسجيل محاولة شحن جديدة"); setTracking(""); qc.invalidateQueries({ queryKey: ["orders-center", "timeline", active] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const collMut = useMutation({
    mutationFn: () => addColl({ data: { orderId: active, amount: Number(amount), method } }),
    onSuccess: () => { toast.success("تم تسجيل التحصيل"); setAmount(""); qc.invalidateQueries({ queryKey: ["orders-center", "timeline", active] }); },
    onError: (e: Error) => toast.error(e.message),
  });


  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label>ابحث عن الأوردر</Label>
          <OrderSearchCombobox value={active} onSelect={(o) => setActive(o.id)} />
        </div>
      </Card>


      {active ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4 space-y-3">
            <div className="font-semibold">محاولات الشحن</div>
            <table className="w-full text-sm">
              <thead className="text-muted-foreground"><tr><th>#</th><th>الحالة</th><th>التتبع</th><th>المتوقع</th></tr></thead>
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
                <Label>رقم التتبع</Label>
                <Input value={tracking} onChange={(e) => setTracking(e.target.value)} />
              </div>
              <Button onClick={() => shipMut.mutate()} disabled={shipMut.isPending}>
                <Truck className="h-4 w-4 me-1" /> محاولة شحن
              </Button>
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="font-semibold">التحصيلات</div>
            <table className="w-full text-sm">
              <thead className="text-muted-foreground"><tr><th>المبلغ</th><th>الطريقة</th><th>التاريخ</th></tr></thead>
              <tbody>
                {(timeline.data?.collections ?? []).map((c) => (
                  <tr key={c.id} className="border-b last:border-0 text-center">
                    <td className="py-1 tabular-nums">{nf(Number(c.amount))}</td>
                    <td>{c.method}</td>
                    <td className="tabular-nums">{new Date(c.collected_at).toLocaleDateString("en-GB")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1 flex-1 min-w-[120px]">
                <Label>المبلغ المحصّل</Label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-1 min-w-[150px]">
                <Label>طريقة التحصيل</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COLLECTION_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => collMut.mutate()} disabled={collMut.isPending}>
                <Wallet className="h-4 w-4 me-1" /> تسجيل تحصيل
              </Button>
            </div>

          </Card>
        </div>
      ) : null}
    </div>
  );
}

function WhatsappPanel({ brands }: { brands: Array<{ id: string; name: string }> }) {
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
      if (r.status === "sent") toast.success("تم الإرسال");
      else toast.warning(r.error ?? "الرسالة في الانتظار");
      qc.invalidateQueries({ queryKey: ["orders-center", "wa-thread", threadId] });
      qc.invalidateQueries({ queryKey: ["orders-center", "wa"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const start = useMutation({
    mutationFn: () => startFn({ data: { brandId: newBrand, phone: newPhone } }),
    onSuccess: (r) => { setNewPhone(""); setThreadId(r.id); qc.invalidateQueries({ queryKey: ["orders-center", "wa"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const currentThread = (threads.data ?? []).find((t) => t.id === threadId) ?? null;
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
      toast.success(orderId ? "تم ربط المحادثة بالأوردر" : "تم فك الربط");
      qc.invalidateQueries({ queryKey: ["orders-center", "wa"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card className="p-3 space-y-3">
        <Input placeholder="بحث برقم أو اسم" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="space-y-1 max-h-[420px] overflow-auto">
          {(threads.data ?? []).map((t) => (
            <button
              key={t.id}
              onClick={() => setThreadId(t.id)}
              className={`w-full text-start p-2 rounded-md border ${threadId === t.id ? "bg-accent" : ""}`}
            >
              <div className="font-medium text-sm flex items-center gap-1">
                {t.order_id ? <Link2 className="h-3.5 w-3.5 text-primary shrink-0" aria-label="مرتبطة بأوردر" /> : null}
                <span className="truncate">{t.display_name ?? t.phone}</span>
              </div>
              <div className="text-xs text-muted-foreground truncate">{t.last_message_preview ?? "—"}</div>

            </button>
          ))}
          {(threads.data ?? []).length === 0 ? <div className="text-sm text-muted-foreground p-2">لا توجد محادثات.</div> : null}
        </div>
        <div className="space-y-2 border-t pt-3">
          <Label>محادثة جديدة</Label>
          <Select value={newBrand} onValueChange={setNewBrand}>
            <SelectTrigger><SelectValue placeholder="البراند" /></SelectTrigger>
            <SelectContent>
              {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input placeholder="رقم الهاتف" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
            <Button onClick={() => start.mutate()} disabled={!newBrand || !newPhone || start.isPending}>بدء</Button>
          </div>
        </div>
      </Card>

      <Card className="p-4 flex flex-col min-h-[420px]">
        {!threadId ? (
          <div className="m-auto text-muted-foreground flex items-center gap-2">
            <MessageCircle className="h-4 w-4" /> اختر محادثة
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 pb-3 mb-3 border-b">
              {linkedOrderId ? (
                <>
                  <Badge variant="secondary" className="gap-1">
                    <Link2 className="h-3 w-3" />
                    #{linkedOrder.data?.external_order_number ?? linkedOrderId.slice(0, 8)}
                    {linkedOrder.data ? ` • ${linkedOrder.data.fulfillment_status}` : ""}
                  </Badge>
                  <Button variant="ghost" size="sm" onClick={() => linkMut.mutate(null)} disabled={linkMut.isPending}>
                    <Unlink className="h-4 w-4 me-1" /> فك الربط
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-sm text-muted-foreground">ربط بأوردر:</span>
                  <OrderSearchCombobox className="w-[280px]" onSelect={(o) => linkMut.mutate(o.id)} />
                </>
              )}
            </div>
            <div className="flex-1 space-y-2 overflow-auto">

              {(thread.data?.messages ?? []).map((m) => (
                <div key={m.id} className={`max-w-[75%] rounded-lg p-2 text-sm ${m.direction === "out" ? "ms-auto bg-primary/10" : "bg-muted"}`}>
                  <div>{m.body}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(m.sent_at).toLocaleString("en-GB")} • {m.status}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-3 border-t mt-3">
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب رسالة…" />
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
