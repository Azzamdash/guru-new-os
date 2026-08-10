import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Banknote, Upload, AlertTriangle, Wallet, Truck } from "lucide-react";
import { toast } from "sonner";
import {
  PeriodFilter,
  defaultPeriod,
  resolvePeriod,
  type PeriodValue,
} from "@/components/PeriodFilter";
import { usePersistedPeriod } from "@/lib/global-period";
import { listBrands } from "@/lib/internal.functions";
import { getCouriersDashboard } from "@/lib/couriers.functions";
import { getIncomeStatement } from "@/lib/financials.functions";
import {
  getCollectionGaps,
  getSettlementLines,
  importSettlement,
  listSettlements,
  postSettlement,
} from "@/lib/orders-ops.functions";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/courier-finance")({
  head: () => ({
    meta: [
      { title: "الشحن والتحصيل: الماليات — e-GURUS" },
      {
        name: "description",
        content:
          "تحصيل وتسوية شركات الشحن: المتوقع، المحصَّل، تكلفة الشحن، وإيراد الشحن مقابل الإيراد الصافي.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CourierFinancePage,
});

const money = (n: number, currency: string) =>
  `${Math.round(n).toLocaleString("en-US")} ${currency}`;

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  tone?: "success" | "destructive" | "muted";
}) {
  const color =
    tone === "success"
      ? "text-emerald-500"
      : tone === "destructive"
        ? "text-destructive"
        : tone === "muted"
          ? "text-muted-foreground"
          : "";
  return (
    <Card className="p-4 space-y-1">
      <div className="flex items-center justify-between text-muted-foreground text-sm">
        <span>{label}</span>
        <Icon className="h-4 w-4" />
      </div>
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
    </Card>
  );
}

function CourierFinancePage() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const currency = T("ج", "EGP");
  const qc = useQueryClient();

  const [period, setPeriod] = usePersistedPeriod("courier-finance");
  const resolved = useMemo(() => resolvePeriod(period), [period]);
  const from = resolved.dateFrom ?? `${resolved.year}-01-01`;
  const to = resolved.dateTo ?? `${resolved.year}-12-31`;
  const [brandId, setBrandId] = useState<string>("all");

  const brandsFn = useServerFn(listBrands);
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => brandsFn() });

  const dashFn = useServerFn(getCouriersDashboard);
  const dashQ = useQuery({
    queryKey: ["courier-finance", "dash", from, to, brandId],
    queryFn: () => dashFn({ data: { from, to, brandId: brandId === "all" ? null : brandId } }),
  });
  const d = dashQ.data;

  const incomeFn = useServerFn(getIncomeStatement);
  const incomeQ = useQuery({
    queryKey: ["courier-finance", "income", from, to, brandId],
    queryFn: () => incomeFn({ data: { from, to, brandId: brandId === "all" ? null : brandId } }),
  });
  const inc = incomeQ.data;

  const listFn = useServerFn(listSettlements);
  const importFn = useServerFn(importSettlement);
  const linesFn = useServerFn(getSettlementLines);
  const postFn = useServerFn(postSettlement);

  const [settleBrandId, setSettleBrandId] = useState("");
  const [reference, setReference] = useState("");
  const [csv, setCsv] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [lineFilter, setLineFilter] = useState("all");

  const listQ = useQuery({
    queryKey: ["courier-settlements"],
    queryFn: () => listFn({ data: {} }),
    staleTime: 30_000,
  });
  const gapsFn = useServerFn(getCollectionGaps);
  const gapsQ = useQuery({
    queryKey: ["courier-settlements", "collection-gaps", brandId],
    queryFn: () => gapsFn({ data: { brandId: brandId === "all" ? null : brandId } }),
    staleTime: 30_000,
  });
  const linesQ = useQuery({
    queryKey: ["settlement-lines", openId, lineFilter],
    queryFn: () => linesFn({ data: { settlementId: openId as string, matchStatus: lineFilter } }),
    enabled: Boolean(openId),
  });

  const importM = useMutation({
    mutationFn: () =>
      importFn({ data: { brandId: settleBrandId, reference: reference.trim() || null, csv } }),
    onSuccess: (r) => {
      toast.success(
        T(
          `تم رفع الكشف: ${r.matched} مطابق من ${r.total}`,
          `Statement uploaded: ${r.matched} matched out of ${r.total}`,
        ),
      );
      setCsv("");
      setReference("");
      setOpenId(r.id);
      qc.invalidateQueries({ queryKey: ["courier-settlements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const postM = useMutation({
    mutationFn: (id: string) => postFn({ data: { settlementId: id } }),
    onSuccess: (r) => {
      toast.success(
        T(`تم ترحيل ${r.posted} بند للتحصيل`, `${r.posted} line(s) posted to collections`),
      );
      if (r.skipped > 0) {
        toast.warning(
          T(
            `${r.skipped} بند اتخطى المتبقي من قيمة الأوردر ولم يُرحّل — راجعه يدويًا`,
            `${r.skipped} line(s) exceeded the order's remaining balance and were not posted — review manually`,
          ),
        );
      }
      qc.invalidateQueries({ queryKey: ["courier-settlements"] });
      qc.invalidateQueries({ queryKey: ["settlement-lines"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nf = (n: number) => Number(n || 0).toLocaleString("en-US");

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Banknote className="h-6 w-6 text-primary" />
          {T("الشحن والتحصيل: الماليات", "Couriers — Finance")}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodFilter value={period} onChange={setPeriod} />
          <Select value={brandId} onValueChange={setBrandId}>
            <SelectTrigger className="w-48">
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
        </div>
      </div>

      {/* Financial KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Kpi icon={Truck} label={T("الأوردرات", "Orders")} value={nf(d?.totals.orders ?? 0)} />
        <Kpi
          icon={Wallet}
          label={T("متوقع تحصيله", "Expected COD")}
          value={money(d?.totals.expectedCod ?? 0, currency)}
        />
        <Kpi
          icon={Wallet}
          label={T("التحصيل", "Collected")}
          value={money(d?.totals.collected ?? 0, currency)}
          tone="success"
        />
        <Kpi
          icon={Truck}
          label={T("تكلفة الشحن (لينا على شركة الشحن)", "Shipping cost (owed to courier)")}
          value={money(d?.totals.shippingCost ?? 0, currency)}
          tone="destructive"
        />
        <Kpi
          icon={Truck}
          label={T(
            "إيراد الشحن (محصَّل للعميل، مش لينا)",
            "Shipping revenue (customer-charged, not ours)",
          )}
          value={money(inc?.shippingRevenue ?? 0, currency)}
          tone="muted"
        />
        <Kpi
          icon={Wallet}
          label={T("الإيراد الصافي بعد خصم الشحن", "Net revenue after shipping")}
          value={money(inc?.netRevenue ?? 0, currency)}
          tone="success"
        />
      </div>

      {/* Per-courier financial breakdown */}
      <Card className="overflow-hidden">
        <div className="p-4 font-semibold">
          {T("الموقف المالي لكل شركة شحن", "Financial position per courier")}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="p-2 text-start">{T("الاسم", "Name")}</th>
                <th className="p-2 text-start">{T("الأوردرات", "Orders")}</th>
                <th className="p-2 text-start">{T("متوقع تحصيله", "Expected COD")}</th>
                <th className="p-2 text-start">{T("التحصيل", "Collected")}</th>
                <th className="p-2 text-start">{T("تكلفة الشحن", "Shipping cost")}</th>
              </tr>
            </thead>
            <tbody>
              {(d?.couriers ?? []).map((c) => (
                <tr key={c.courier_id ?? "none"} className="border-t">
                  <td className="p-2 font-medium">{c.name}</td>
                  <td className="p-2 num">{nf(c.orders)}</td>
                  <td className="p-2 num text-amber-500">{nf(Math.round(c.expectedCod))}</td>
                  <td className="p-2 num text-emerald-500">{nf(Math.round(c.collected))}</td>
                  <td className="p-2 num text-destructive">{nf(Math.round(c.shippingCost))}</td>
                </tr>
              ))}
              {(d?.couriers ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    {T("لا توجد بيانات في هذه المدة.", "No data in this period.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Settlement statements */}
      <Card className="space-y-3 p-4">
        <div className="font-semibold">
          {T("كشوف تحصيل شركات الشحن", "Courier Settlement Statements")}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={settleBrandId} onValueChange={setSettleBrandId}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder={T("اختر البراند", "Select brand")} />
            </SelectTrigger>
            <SelectContent>
              {(brandsQ.data ?? []).map((b: { id: string; name: string }) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={T("رقم الكشف / المرجع", "Statement number / reference")}
            className="w-56"
          />
          <Button
            size="sm"
            disabled={!settleBrandId || !csv.trim() || importM.isPending}
            onClick={() => importM.mutate()}
          >
            <Upload className="ml-1 h-4 w-4" /> {T("رفع ومطابقة", "Upload & Match")}
          </Button>
        </div>
        <Textarea
          dir="ltr"
          rows={6}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={T(
            "الصق بنود الكشف: رقم التتبع, المبلغ, رسوم الشحن\n12345678, 850, 60",
            "Paste statement lines: tracking number, amount, shipping fee\n12345678, 850, 60",
          )}
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          {T(
            "المطابقة بتتم على رقم تتبع بوسطة أو رقم التتبع اليدوي أو رقم الأوردر. البنود المطابقة فقط هي اللي بتترحّل للتحصيل.",
            "Matching is done using the courier tracking number, the manual tracking number, or the order number. Only matched lines get posted to collections.",
          )}
        </p>
      </Card>

      <div className="space-y-2">
        {(listQ.data ?? []).map((s) => (
          <Card key={s.id} className="p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{s.reference ?? s.id.slice(0, 8)}</span>
              {s.courier_name && <Badge variant="outline">{s.courier_name}</Badge>}
              <Badge>{s.status === "posted" ? T("مُرحّل", "Posted") : T("مسودة", "Draft")}</Badge>
              <span className="text-sm text-muted-foreground">
                {T(
                  `مطابق ${s.matched_lines}/${s.lines} — معلن ${money(s.declared_total, currency)} — مطابق ${money(s.matched_total, currency)}`,
                  `Matched ${s.matched_lines}/${s.lines} — Declared ${money(s.declared_total, currency)} — Matched ${money(s.matched_total, currency)}`,
                )}
              </span>
              <div className="ms-auto flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setOpenId(openId === s.id ? null : s.id)}
                >
                  {openId === s.id
                    ? T("إخفاء البنود", "Hide Lines")
                    : T("عرض البنود", "Show Lines")}
                </Button>
                <Button
                  size="sm"
                  disabled={s.status === "posted" || postM.isPending}
                  onClick={() => postM.mutate(s.id)}
                >
                  {T("ترحيل المطابق", "Post Matched")}
                </Button>
              </div>
            </div>

            {openId === s.id && (
              <div className="mt-3 space-y-2 border-t pt-3">
                <Select value={lineFilter} onValueChange={setLineFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{T("كل البنود", "All Lines")}</SelectItem>
                    <SelectItem value="matched">{T("مطابق", "Matched")}</SelectItem>
                    <SelectItem value="amount_mismatch">
                      {T("فرق مبلغ", "Amount Mismatch")}
                    </SelectItem>
                    <SelectItem value="unmatched">{T("غير مطابق", "Unmatched")}</SelectItem>
                  </SelectContent>
                </Select>
                <div className="max-h-96 overflow-auto rounded border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs">
                      <tr>
                        <th className="p-2 text-right">{T("التتبع", "Tracking")}</th>
                        <th className="p-2 text-right">{T("الأوردر", "Order")}</th>
                        <th className="p-2 text-right">{T("الكشف", "Statement")}</th>
                        <th className="p-2 text-right">{T("النظام", "System")}</th>
                        <th className="p-2 text-right">{T("الحالة", "Status")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(linesQ.data ?? []).map((l: Record<string, unknown>) => (
                        <tr key={String(l["id"])} className="border-t">
                          <td dir="ltr" className="p-2 text-right font-mono text-xs">
                            {String(l["tracking"] ?? "")}
                          </td>
                          <td className="p-2">
                            {l["order_id"] ? (
                              <Link
                                to="/order-view/$id"
                                params={{ id: String(l["order_id"]) }}
                                className="text-primary hover:underline"
                              >
                                {String(l["order_number"] ?? T("عرض", "View"))}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="p-2">
                            {money(Number(l["declared_amount"] ?? 0), currency)}
                          </td>
                          <td className="p-2">
                            {money(Number(l["system_amount"] ?? 0), currency)}
                          </td>
                          <td className="p-2">
                            <Badge
                              variant={l["match_status"] === "matched" ? "default" : "destructive"}
                            >
                              {l["match_status"] === "matched"
                                ? T("مطابق", "Matched")
                                : String(l["diff_reason"] ?? l["match_status"])}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        ))}
        {!listQ.isLoading && (listQ.data ?? []).length === 0 && (
          <Card className="p-6 text-center text-muted-foreground">
            {T("لا توجد كشوف بعد", "No statements yet")}
          </Card>
        )}
      </div>

      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          {T("أوردرات مُسلَّمة بدون تحصيل كامل", "Delivered orders with an outstanding balance")}
          <Badge variant="secondary">{(gapsQ.data ?? []).length}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {T(
            "مطابقة للقراءة فقط: أوردرات تم تسليمها والمبلغ المسجَّل في order_collections أقل من قيمة الأوردر — مفيش تعديل أو ترحيل تلقائي هنا.",
            "Read-only reconciliation: delivered orders where recorded collections fall short of the order total — nothing here writes or auto-posts anything.",
          )}
        </p>
        {gapsQ.isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">{T("جارٍ التحميل…", "Loading…")}</div>
        ) : (gapsQ.data ?? []).length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            {T("لا توجد فجوات تحصيل حاليًا", "No collection gaps right now")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="p-2 text-start">{T("الأوردر", "Order")}</th>
                  <th className="p-2 text-start">{T("العميل", "Customer")}</th>
                  <th className="p-2 text-start">{T("البراند", "Brand")}</th>
                  <th className="p-2 text-start">{T("شركة الشحن", "Courier")}</th>
                  <th className="p-2 text-start">{T("الإجمالي", "Total")}</th>
                  <th className="p-2 text-start">{T("المحصَّل", "Collected")}</th>
                  <th className="p-2 text-start">{T("المتبقي", "Outstanding")}</th>
                </tr>
              </thead>
              <tbody>
                {(gapsQ.data ?? []).map((r) => (
                  <tr key={r.orderId} className="border-t">
                    <td className="p-2">
                      <Link
                        to="/order-view/$id"
                        params={{ id: r.orderId }}
                        className="text-primary hover:underline"
                      >
                        #{r.orderNumber ?? r.orderId.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="p-2">{r.customerName ?? "—"}</td>
                    <td className="p-2">{r.brandName}</td>
                    <td className="p-2">{r.courierName ?? "—"}</td>
                    <td className="p-2">{money(r.totalAmount, currency)}</td>
                    <td className="p-2">{money(r.collected, currency)}</td>
                    <td className="p-2 font-semibold text-destructive">
                      {money(r.outstanding, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
