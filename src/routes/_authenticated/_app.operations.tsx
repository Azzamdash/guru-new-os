import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, AlertTriangle, PackageX, ChevronRight, ChevronLeft, ShoppingBag, ShoppingCart, Wrench, X, HandCoins } from "lucide-react";
import { getOperationsSnapshot, updateInvoiceStage, STAGES, type Stage, assignInvoicePrep } from "@/lib/operations.functions";
import { listBrands } from "@/lib/internal.functions";
import { listOrderPrepUsers } from "@/lib/admin.functions";
import { useLang } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_app/operations")({
  head: () => ({ meta: [
    { title: "تقارير المخزون — e-GURUS" },
    { name: "description", content: "حالة المخزون اللحظية، قيمة المخزون لكل براند، ونقاط إعادة الطلب." },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
  component: OperationsPage,
});

const STAGE_ORDER: Stage[] = ["new", "processing", "packing", "ready_to_ship", "with_courier"];

function OperationsPage() {
  const { lang } = useLang();
  const qc = useQueryClient();
  const getSnap = useServerFn(getOperationsSnapshot);
  const updStage = useServerFn(updateInvoiceStage);
  const listBrandsFn = useServerFn(listBrands);
  const assignFn = useServerFn(assignInvoicePrep);
  const listPrepFn = useServerFn(listOrderPrepUsers);
  const [brandId, setBrandId] = useState<string>("all");
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listBrandsFn() });
  const prepUsersQ = useQuery({ queryKey: ["order-prep-users"], queryFn: () => listPrepFn() });
  const snapQ = useQuery({
    queryKey: ["ops-snapshot", brandId],
    queryFn: () => getSnap({ data: { brandId: brandId === "all" ? null : brandId } }),
    refetchInterval: 15000,
  });

  const advance = useMutation({
    mutationFn: (v: { id: string; stage: Stage }) => updStage({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ops-snapshot"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const assign = useMutation({
    mutationFn: (v: { id: string; assigneeId: string | null }) => assignFn({ data: v }),
    onSuccess: () => { toast.success(lang === "ar" ? "تم إسناد الأوردر" : "Assigned"); qc.invalidateQueries({ queryKey: ["ops-snapshot"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const prepUsers = prepUsersQ.data ?? [];
  const prepLabel = (id: string | null) => id ? (prepUsers.find((u) => u.id === id)?.email ?? id.slice(0, 6)) : (lang === "ar" ? "غير مُسند" : "Unassigned");

  // Live "seconds since last refresh"
  const [tick, setTick] = useState(0);
  useEffect(() => { const i = setInterval(() => setTick((t) => t + 1), 1000); return () => clearInterval(i); }, []);
  const secondsAgo = snapQ.data ? Math.floor((Date.now() - new Date(snapQ.data.generatedAt).getTime()) / 1000) : 0;
  void tick;

  const brands = brandsQ.data ?? [];
  const data = snapQ.data;

  const stageLabel: Record<Stage, { ar: string; en: string }> = {
    new: { ar: "أوردر جديد", en: "New order" },
    processing: { ar: "قيد التجهيز", en: "Processing" },
    packing: { ar: "التعبئة", en: "Packing" },
    ready_to_ship: { ar: "جاهز للشحن", en: "Ready to ship" },
    with_courier: { ar: "مع المندوب", en: "With courier" },
    delivered: { ar: "تم التسليم", en: "Delivered" },
    cancelled: { ar: "ملغي", en: "Cancelled" },
  };
  const L = (s: Stage) => (lang === "ar" ? stageLabel[s].ar : stageLabel[s].en);

  const stockLabel: Record<string, { ar: string; en: string; variant: "default"|"secondary"|"outline"|"destructive" }> = {
    ok: { ar: "متوفر", en: "OK", variant: "default" },
    low: { ar: "منخفض", en: "Low", variant: "secondary" },
    critical: { ar: "حرج", en: "Critical", variant: "destructive" },
    out: { ar: "نفد", en: "Out", variant: "destructive" },
  };

  const nf = (n: number) => Number(n || 0).toLocaleString("en-US");

  const nextStage = (s: Stage): Stage | null => {
    const i = STAGES.indexOf(s);
    if (i < 0 || i >= STAGE_ORDER.length) return null;
    return STAGE_ORDER[i + 1] ?? "delivered";
  };
  const prevStage = (s: Stage): Stage | null => {
    const i = STAGE_ORDER.indexOf(s);
    if (i <= 0) return null;
    return STAGE_ORDER[i - 1];
  };
  const isRtl = lang === "ar";
  const NextIcon = isRtl ? ChevronLeft : ChevronRight;
  const PrevIcon = isRtl ? ChevronRight : ChevronLeft;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Activity className="w-7 h-7 text-primary" /> {lang === "ar" ? "تقارير المخزون" : "Inventory Reports"}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {lang === "ar" ? "المخزون بيتحدث لحظي مع كل عملية شراء وبيع — بتشوف الأصناف، الكميات المتاحة، تكلفتها لكل براند، ونقطة إعادة الطلب." : "Inventory updates instantly on every purchase and sale — per-brand units, total cost value, and reorder points."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-xs text-emerald-500 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            {lang === "ar" ? `متصل — آخر تحديث منذ ${secondsAgo} ثواني` : `Live — updated ${secondsAgo}s ago`}
          </span>
          <Select value={brandId} onValueChange={setBrandId}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{lang === "ar" ? "كل البراندات" : "All brands"}</SelectItem>
              {brands.filter((b) => b.active).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={ShoppingBag} label={lang === "ar" ? "إجمالي القطع بالمخزون" : "Total units in stock"} value={nf(Math.round(data?.kpis.totalUnits ?? 0))} sub={`${nf(data?.inventory.length ?? 0)} ${lang === "ar" ? "صنف" : "SKUs"}`} />
        <Kpi icon={HandCoins} label={lang === "ar" ? "قيمة المخزون (تكلفة)" : "Inventory value (cost)"} value={`${nf(Math.round(data?.kpis.totalStockValue ?? 0))} ${lang === "ar" ? "ج" : "EGP"}`} sub={lang === "ar" ? "عبر كل البراندات" : "across all brands"} />
        <Kpi icon={PackageX} label={lang === "ar" ? "أصناف تحت حد إعادة الطلب" : "Below reorder point"} value={nf(data?.kpis.lowCount ?? 0)} sub={lang === "ar" ? "محتاجة إعادة توريد" : "needs reorder"} tone="danger" />
      </div>

      {/* Per-brand inventory value */}
      <Card className="card-gradient overflow-hidden">
        <div className="p-4 border-b border-border font-semibold flex items-center justify-between">
          <span>{lang === "ar" ? "قيمة المخزون لكل براند" : "Inventory value per brand"}</span>
          <span className="text-xs text-muted-foreground font-normal">{lang === "ar" ? "الكمية × تكلفة الوحدة" : "units × unit cost"}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-muted-foreground">
              <th className="p-3 text-start">{lang === "ar" ? "البراند" : "Brand"}</th>
              <th className="p-3 text-start">{lang === "ar" ? "عدد الأصناف" : "SKUs"}</th>
              <th className="p-3 text-start">{lang === "ar" ? "إجمالي القطع" : "Total units"}</th>
              <th className="p-3 text-start">{lang === "ar" ? "إجمالي التكلفة" : "Total cost"}</th>
              <th className="p-3 text-start">{lang === "ar" ? "تحت الحد الأدنى" : "Below reorder"}</th>
            </tr></thead>
            <tbody>
              {(data?.brandInventory ?? []).map((b) => (
                <tr key={b.brandId} className="border-b border-border/50">
                  <td className="p-3 font-medium">{b.brandName}</td>
                  <td className="p-3 num">{nf(b.skuCount)}</td>
                  <td className="p-3 num">{nf(Math.round(b.totalUnits))}</td>
                  <td className="p-3 num font-semibold">{nf(Math.round(b.totalValue))} {lang === "ar" ? "ج" : "EGP"}</td>
                  <td className={`p-3 num ${b.belowReorder > 0 ? "text-amber-500 font-semibold" : ""}`}>{nf(b.belowReorder)}</td>
                </tr>
              ))}
              {(data?.brandInventory ?? []).length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">—</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Inventory */}
        <Card className="card-gradient lg:col-span-2 overflow-hidden">
          <div className="p-4 border-b border-border font-semibold flex items-center justify-between">
            <span>{lang === "ar" ? "حالة المخزون" : "Inventory status"}</span>
            <span className="text-xs text-muted-foreground font-normal">{lang === "ar" ? "محدث لحظيًا مع كل عملية بيع" : "Updated live on every sale"}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-muted-foreground text-start">
                <th className="p-3 text-start">{lang === "ar" ? "الصنف" : "SKU"}</th>
                <th className="p-3 text-start">{lang === "ar" ? "المخزون الحالي" : "In stock"}</th>
                <th className="p-3 text-start">{lang === "ar" ? "معدل البيع اليومي" : "Daily rate"}</th>
                <th className="p-3 text-start">{lang === "ar" ? "هينفذ خلال" : "Runs out in"}</th>
                <th className="p-3 text-start">{lang === "ar" ? "حد إعادة الطلب" : "Reorder point"}</th>
                <th className="p-3 text-start">{lang === "ar" ? "قيمة المخزون" : "Stock value"}</th>
                <th className="p-3 text-start">{lang === "ar" ? "الحالة" : "Status"}</th>
                <th className="p-3"></th>
              </tr></thead>
              <tbody>
                {(data?.inventory ?? []).map((p) => (
                  <tr key={p.id} className="border-b border-border/50">
                    <td className="p-3">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground">{p.brandName}</div>
                    </td>
                    <td className="p-3 num">{nf(Math.round(p.stock))} <span className="text-[11px] text-muted-foreground">{p.unit}</span></td>
                    <td className="p-3 num text-xs">{p.dailyRate.toFixed(1)}/{lang === "ar" ? "يوم" : "day"}</td>
                    <td className="p-3 num">{p.daysToEmpty === null ? "—" : `${p.daysToEmpty.toFixed(1)} ${lang === "ar" ? "يوم" : "d"}`}</td>
                    <td className="p-3 num">{nf(Math.round(p.reorderPoint))}</td>
                    <td className="p-3 num">{nf(Math.round(p.stockValue))} {lang === "ar" ? "ج" : ""}</td>
                    <td className="p-3"><Badge variant={stockLabel[p.status].variant}>{lang === "ar" ? stockLabel[p.status].ar : stockLabel[p.status].en}</Badge></td>
                    <td className="p-3 text-end">
                      {(p.status === "low" || p.status === "critical" || p.status === "out") && (
                        <Button size="sm" variant="outline">
                          <Wrench className="w-3 h-3 me-1" />{lang === "ar" ? "اطلب من المورد" : "Reorder"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {(data?.inventory ?? []).length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">—</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Alerts */}
        <Card className="card-gradient overflow-hidden">
          <div className="p-4 border-b border-border font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> {lang === "ar" ? "تنبيهات لحظية" : "Live alerts"}
          </div>
          <div className="max-h-[520px] overflow-y-auto divide-y divide-border/50">
            {(data?.alerts ?? []).map((a, i) => (
              <div key={i} className={`p-3 text-sm flex items-start gap-2 ${a.severity === "danger" ? "bg-destructive/5" : ""}`}>
                <span className={`mt-1 w-1.5 h-1.5 rounded-full ${a.severity === "danger" ? "bg-destructive" : "bg-amber-500"}`} />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{a.message}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5" dir="ltr">{new Date(a.when).toLocaleString()}</div>
                </div>
              </div>
            ))}
            {(data?.alerts ?? []).length === 0 && <div className="p-8 text-sm text-muted-foreground text-center">{lang === "ar" ? "لا تنبيهات — كل شيء تحت السيطرة." : "All clear."}</div>}
          </div>
        </Card>
      </div>

      {/* Sources */}
      <Card className="card-gradient p-5">
        <div className="flex items-center gap-2 font-semibold mb-3"><ShoppingCart className="w-4 h-4 text-primary" /> {lang === "ar" ? "مصادر البيع المتصلة" : "Connected sales sources"}</div>
        <ul className="text-sm space-y-2">
          <SourceRow label="Shopify" status={lang === "ar" ? "متصل، تحديث فوري" : "Connected, live sync"} ok />
          <SourceRow label={lang === "ar" ? "نظام نقاط البيع (المحلات)" : "POS (retail stores)"} status={lang === "ar" ? "متصل" : "Connected"} ok />
          <SourceRow label={lang === "ar" ? "فريق المبيعات اليدوي" : "Manual sales team"} status={lang === "ar" ? "متصل" : "Connected"} ok />
        </ul>
        <p className="text-xs text-muted-foreground mt-3">
          {lang === "ar" ? "ميزة: أي طلب من أي قناة بينقص من نفس رصيد المخزون فورًا — مفيش ازدواجية بيع لنفس القطعة." : "Any order from any channel decrements the same stock instantly — no double-selling the same unit."}
        </p>
      </Card>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub?: string; tone?: "danger" }) {
  return (
    <Card className="card-gradient p-5">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <Icon className={`w-4 h-4 ${tone === "danger" ? "text-destructive" : "text-primary"}`} />
        {label}
      </div>
      <div className={`text-3xl font-bold mt-2 num ${tone === "danger" ? "text-destructive" : ""}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}

function SourceRow({ label, status, ok }: { label: string; status: string; ok: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} />
      <span className="font-medium">{label}</span>
      <span className="text-muted-foreground">— {status}</span>
    </li>
  );
}