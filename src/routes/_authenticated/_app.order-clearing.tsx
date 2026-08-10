import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Scale, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  PeriodFilter,
  defaultPeriod,
  resolvePeriod,
  type PeriodValue,
} from "@/components/PeriodFilter";
import { usePersistedPeriod } from "@/lib/global-period";
import { listBrands, listCouriers } from "@/lib/internal.functions";
import {
  clearOrderCollections,
  getOrderClearing,
  postOrderClearing,
  type ClearingStatus,
} from "@/lib/order-clearing.functions";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/order-clearing")({
  head: () => ({
    meta: [
      { title: "تصفيات الأوردرات — e-GURUS" },
      {
        name: "description",
        content: "مراجعة تحصيل أوردرات شركة الشحن أوردر أوردر وترحيل المحصَّل للخزنة.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OrderClearingPage,
});

const money = (n: number, currency: string) =>
  `${Math.round(n).toLocaleString("en-US")} ${currency}`;

function statusBadge(status: ClearingStatus, T: (ar: string, en: string) => string) {
  if (status === "paid")
    return <Badge className="bg-emerald-500/15 text-emerald-500">{T("مدفوع", "Paid")}</Badge>;
  if (status === "partial")
    return <Badge className="bg-amber-500/15 text-amber-500">{T("جزئي", "Partial")}</Badge>;
  return <Badge variant="destructive">{T("غير مدفوع", "Unpaid")}</Badge>;
}

function OrderClearingPage() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const currency = T("ج", "EGP");
  const qc = useQueryClient();

  const [period, setPeriod] = usePersistedPeriod("order-clearing");
  const resolved = useMemo(() => resolvePeriod(period), [period]);
  const from = resolved.dateFrom ?? `${resolved.year}-01-01`;
  const to = resolved.dateTo ?? `${resolved.year}-12-31`;
  const [courierId, setCourierId] = useState<string>("");
  const [brandId, setBrandId] = useState<string>("all");
  const [status, setStatus] = useState<ClearingStatus | "all">("all");
  const [note, setNote] = useState("");

  /** orderId -> amount the accountant is confirming for this batch. */
  const [picked, setPicked] = useState<Record<string, number>>({});

  const couriersFn = useServerFn(listCouriers);
  const couriersQ = useQuery({ queryKey: ["couriers"], queryFn: () => couriersFn() });
  const brandsFn = useServerFn(listBrands);
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => brandsFn() });

  const clearingFn = useServerFn(getOrderClearing);
  const clearingQ = useQuery({
    queryKey: ["order-clearing", courierId, brandId, from, to, status],
    queryFn: () =>
      clearingFn({
        data: {
          courierId,
          brandId: brandId === "all" ? null : brandId,
          from,
          to,
          status,
        },
      }),
    enabled: Boolean(courierId),
  });

  const rows = clearingQ.data?.rows ?? [];
  const [deductFees, setDeductFees] = useState(true);

  // Pre-tick what the courier already reported as collected, once per result
  // set, so the accountant reviews a filled-in sheet instead of starting from
  // scratch. Keyed on the filters so re-selecting never wipes edits in progress.
  const autoFilledKey = useRef<string>("");
  const filterKey = `${courierId}|${brandId}|${from}|${to}|${status}`;
  useEffect(() => {
    if (!clearingQ.data || autoFilledKey.current === filterKey) return;
    autoFilledKey.current = filterKey;
    const suggested: Record<string, number> = {};
    for (const r of clearingQ.data.rows) {
      if (r.courierSaysPaid && r.outstanding > 0.01) {
        suggested[r.orderId] = Number(r.outstanding.toFixed(2));
      }
    }
    setPicked(suggested);
  }, [clearingQ.data, filterKey]);

  const pickedEntries = Object.entries(picked).filter(([, amount]) => amount > 0);
  const pickedTotal = pickedEntries.reduce((s, [, amount]) => s + amount, 0);
  const feeById = new Map(rows.map((r) => [r.orderId, r.courierFee]));
  const pickedFees = deductFees
    ? pickedEntries.reduce((s, [orderId]) => s + (feeById.get(orderId) ?? 0), 0)
    : 0;
  const pickedNet = pickedTotal - pickedFees;
  const suggestedCount = rows.filter((r) => r.courierSaysPaid && r.outstanding > 0.01).length;

  const postFn = useServerFn(postOrderClearing);
  const postM = useMutation({
    mutationFn: () =>
      postFn({
        data: {
          courierId,
          lines: pickedEntries.map(([orderId, amount]) => ({ orderId, amount })),
          occurredAt: to.slice(0, 10),
          note: note.trim() || null,
          deductFees,
        },
      }),
    onSuccess: (r) => {
      toast.success(
        r.fees > 0
          ? T(
              `تم تحصيل ${r.postedOrders} أوردر: ${money(r.gross, currency)} ناقص رسوم ${money(r.fees, currency)} = ${money(r.amount, currency)} في الخزنة`,
              `Collected ${r.postedOrders} order(s): ${money(r.gross, currency)} less ${money(r.fees, currency)} fees = ${money(r.amount, currency)} to the treasury`,
            )
          : T(
              `تم تحصيل ${r.postedOrders} أوردر بإجمالي ${money(r.amount, currency)} وترحيلها للخزنة`,
              `Collected ${r.postedOrders} order(s) totalling ${money(r.amount, currency)} and posted to the treasury`,
            ),
      );
      setPicked({});
      setNote("");
      qc.invalidateQueries({ queryKey: ["order-clearing"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const undoFn = useServerFn(clearOrderCollections);
  const undoM = useMutation({
    mutationFn: (orderId: string) => undoFn({ data: { orderId } }),
    onSuccess: (r) => {
      toast.success(
        T(
          `تم إلغاء تحصيل ${money(r.amount, currency)}${
            r.deletedCashTransactions > 0
              ? " وحذف حركة الخزنة المرتبطة"
              : r.adjustedCashTransactions > 0
                ? " وتعديل حركة الخزنة المرتبطة"
                : ""
          }`,
          `Reversed ${money(r.amount, currency)}${
            r.deletedCashTransactions > 0
              ? " and removed the linked treasury movement"
              : r.adjustedCashTransactions > 0
                ? " and adjusted the linked treasury movement"
                : ""
          }`,
        ),
      );
      qc.invalidateQueries({ queryKey: ["order-clearing"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (orderId: string, outstanding: number, on: boolean) => {
    setPicked((prev) => {
      const next = { ...prev };
      if (on) next[orderId] = Math.max(0, Number(outstanding.toFixed(2)));
      else delete next[orderId];
      return next;
    });
  };

  const selectAllUnpaid = () => {
    const next: Record<string, number> = {};
    for (const r of rows) {
      if (r.outstanding > 0.01) next[r.orderId] = Number(r.outstanding.toFixed(2));
    }
    setPicked(next);
  };

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Scale className="h-6 w-6 text-primary" /> {T("تصفيات الأوردرات", "Order Clearing")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {T(
            "راجع أوردرات شركة الشحن أوردر أوردر، علّم اللي اتحصّل فعلاً، وارحّلهم للخزنة بحركة واحدة.",
            "Review a courier's orders line by line, tick what was actually collected, and post them to the treasury as one movement.",
          )}
        </p>
      </div>

      <Card className="flex flex-wrap items-center gap-2 p-4">
        <Select
          value={courierId}
          onValueChange={(v) => {
            setCourierId(v);
            setPicked({});
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder={T("اختر شركة الشحن", "Select courier")} />
          </SelectTrigger>
          <SelectContent>
            {(couriersQ.data ?? [])
              .filter((c) => c.active)
              .map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select
          value={brandId}
          onValueChange={(v) => {
            setBrandId(v);
            setPicked({});
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{T("كل البراندات", "All brands")}</SelectItem>
            {(brandsQ.data ?? []).map((b: { id: string; name: string }) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as ClearingStatus | "all");
            setPicked({});
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{T("كل الحالات", "All statuses")}</SelectItem>
            <SelectItem value="unpaid">{T("غير مدفوع", "Unpaid")}</SelectItem>
            <SelectItem value="partial">{T("جزئي", "Partial")}</SelectItem>
            <SelectItem value="paid">{T("مدفوع", "Paid")}</SelectItem>
          </SelectContent>
        </Select>
        <PeriodFilter value={period} onChange={setPeriod} />
      </Card>

      {!courierId ? (
        <Card className="p-8 text-center text-muted-foreground">
          {T("اختر شركة شحن عشان تبدأ التصفية.", "Pick a courier to start clearing.")}
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">{T("أوردرات", "Orders")}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {clearingQ.data?.totals.orders ?? 0}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">
                {T("إجمالي القيمة", "Total value")}
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {money(clearingQ.data?.totals.totalAmount ?? 0, currency)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">{T("محصَّل", "Collected")}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-500">
                {money(clearingQ.data?.totals.collected ?? 0, currency)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">{T("متبقي", "Outstanding")}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-destructive">
                {money(clearingQ.data?.totals.outstanding ?? 0, currency)}
              </div>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b p-3">
              <Button size="sm" variant="outline" onClick={selectAllUnpaid}>
                {T("تحديد كل المتبقي", "Select all outstanding")}
              </Button>
              {pickedEntries.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setPicked({})}>
                  {T("مسح التحديد", "Clear selection")}
                </Button>
              )}
              {suggestedCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  {T(
                    `✅ ${suggestedCount} أوردر شركة الشحن مؤكدة تحصيلها — متعلّمين لك مبدئيًا`,
                    `✅ ${suggestedCount} order(s) the courier reports as collected — pre-ticked for you`,
                  )}
                </span>
              )}
              <span className="ms-auto text-sm text-muted-foreground">
                {T(
                  `محدَّد: ${pickedEntries.length} أوردر — ${money(pickedTotal, currency)}`,
                  `Selected: ${pickedEntries.length} order(s) — ${money(pickedTotal, currency)}`,
                )}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs">
                  <tr>
                    <th className="p-2 w-10"></th>
                    <th className="p-2 text-start">{T("الأوردر", "Order")}</th>
                    <th className="p-2 text-start">{T("العميل", "Customer")}</th>
                    <th className="p-2 text-start">{T("القيمة", "Total")}</th>
                    <th className="p-2 text-start">{T("محصَّل", "Collected")}</th>
                    <th className="p-2 text-start">{T("متبقي", "Outstanding")}</th>
                    <th className="p-2 text-start">{T("رسوم الشحن", "Courier fee")}</th>
                    <th className="p-2 text-start">{T("الحالة", "Status")}</th>
                    <th className="p-2 text-start">{T("مبلغ التحصيل", "Amount to collect")}</th>
                    <th className="p-2 text-start"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isPicked = picked[r.orderId] !== undefined;
                    return (
                      <tr key={r.orderId} className="border-t">
                        <td className="p-2">
                          <Checkbox
                            checked={isPicked}
                            disabled={r.outstanding <= 0.01}
                            onCheckedChange={(v) => toggle(r.orderId, r.outstanding, Boolean(v))}
                          />
                        </td>
                        <td className="p-2">
                          <Link
                            to="/order-view/$id"
                            params={{ id: r.orderId }}
                            className="text-primary hover:underline"
                          >
                            #{r.orderNumber ?? r.orderId.slice(0, 8)}
                          </Link>
                          <div className="text-[11px] text-muted-foreground">
                            {r.occurredAt.slice(0, 10)}
                          </div>
                        </td>
                        <td className="p-2">{r.customerName ?? "—"}</td>
                        <td className="p-2 tabular-nums">{money(r.totalAmount, currency)}</td>
                        <td className="p-2 tabular-nums text-emerald-500">
                          {money(r.collected, currency)}
                        </td>
                        <td className="p-2 tabular-nums text-destructive">
                          {money(r.outstanding, currency)}
                        </td>
                        <td className="p-2 tabular-nums text-muted-foreground">
                          {r.courierFee > 0 ? money(r.courierFee, currency) : "—"}
                        </td>
                        <td className="p-2">
                          <div className="flex items-center gap-1">
                            {statusBadge(r.status, T)}
                            {r.courierSaysPaid && (
                              <span
                                className="text-[10px]"
                                title={T(
                                  "شركة الشحن مؤكدة التحصيل من العميل",
                                  "Courier confirmed collection from the customer",
                                )}
                              >
                                ✅
                              </span>
                            )}
                            {r.postedToTreasury && (
                              <span
                                className="text-[10px] text-muted-foreground"
                                title={T("مرحَّل للخزنة", "Posted to treasury")}
                              >
                                🏦
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2">
                          {isPicked ? (
                            <Input
                              type="number"
                              className="h-8 w-28"
                              value={picked[r.orderId]}
                              onChange={(e) =>
                                setPicked((prev) => ({
                                  ...prev,
                                  [r.orderId]: Math.max(0, Number(e.target.value) || 0),
                                }))
                              }
                            />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-2">
                          {r.collected > 0.01 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={undoM.isPending}
                              onClick={() => undoM.mutate(r.orderId)}
                              title={T("إلغاء التحصيل", "Reverse collection")}
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-muted-foreground">
                        {clearingQ.isLoading
                          ? T("جارٍ التحميل…", "Loading…")
                          : T("لا توجد أوردرات بالفلاتر دي.", "No orders match these filters.")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="flex flex-wrap items-end gap-3 p-4">
            <div className="flex-1 min-w-[220px] space-y-1.5">
              <label htmlFor="clearing-note" className="text-sm font-medium">
                {T("ملاحظة / رقم التحويل", "Note / transfer reference")}
              </label>
              <Input
                id="clearing-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={T("اختياري", "Optional")}
              />
            </div>
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={deductFees} onCheckedChange={(v) => setDeductFees(Boolean(v))} />
                {T(
                  "شركة الشحن بتخصم رسومها من التحويل",
                  "Courier deducts its fees from the transfer",
                )}
              </label>
              <div className="text-xs text-muted-foreground">
                {deductFees
                  ? T(
                      `${money(pickedTotal, currency)} تحصيل − ${money(pickedFees, currency)} رسوم`,
                      `${money(pickedTotal, currency)} collected − ${money(pickedFees, currency)} fees`,
                    )
                  : T(
                      "الرسوم هتفضل مفتوحة وتقفلها من كشف الحساب",
                      "Fees stay open, settle them from the statement",
                    )}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">
                {T("هيتسجل في الخزنة", "Will post to treasury")}
              </div>
              <div className="text-2xl font-bold tabular-nums text-emerald-500">
                {money(pickedNet, currency)}
              </div>
            </div>
            <Button
              disabled={pickedEntries.length === 0 || postM.isPending}
              onClick={() => postM.mutate()}
            >
              {postM.isPending
                ? T("جارٍ الترحيل…", "Posting…")
                : T("تسجيل التحصيل وترحيله للخزنة", "Collect & post to treasury")}
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}
