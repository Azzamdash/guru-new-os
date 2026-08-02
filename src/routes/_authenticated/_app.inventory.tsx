import { formatBusinessDate } from "@/lib/timezone";
import { getTodayInBusinessTimezone } from "@/lib/timezone";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Boxes, Plus, Minus, AlertTriangle, Search, TrendingUp, Activity, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import {
  listStock, addMovement, listMovements, getInventoryReports, setReorderPoint,
  type StockItem, type MovementRow,
} from "@/lib/inventory.functions";

export const Route = createFileRoute("/_authenticated/_app/inventory")({
  head: () => ({
    meta: [
      { title: "إدارة المخزون — e-GURUS" },
      { name: "description", content: "دورة حياة المخزون كاملة: الخامات والمنتجات، الحركات، التنبيهات والتقارير." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: InventoryPage,
});

const money = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const num = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 3 });
const today = () => getTodayInBusinessTimezone();
const monthAgo = () => formatBusinessDate(new Date(Date.now() - 29 * 86400000));

function InventoryPage() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const qc = useQueryClient();

  const stockFn = useServerFn(listStock);
  const movesFn = useServerFn(listMovements);
  const reportsFn = useServerFn(getInventoryReports);

  const [kind, setKind] = useState<"all" | "product" | "material">("all");
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [from, setFrom] = useState(monthAgo());
  const [to, setTo] = useState(today());
  const [dialog, setDialog] = useState<null | { item: StockItem; direction: "in" | "out" | "adjust" }>(null);
  const [rpItem, setRpItem] = useState<StockItem | null>(null);

  const stockQ = useQuery({ queryKey: ["inv-stock", kind], queryFn: () => stockFn({ data: { kind } }) });
  const movesQ = useQuery({
    queryKey: ["inv-moves", from, to, kind],
    queryFn: () => movesFn({ data: { from, to, kind, limit: 1000 } }),
  });
  const reportsQ = useQuery({
    queryKey: ["inv-reports", from, to],
    queryFn: () => reportsFn({ data: { from, to } }),
  });

  const items = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (stockQ.data?.items ?? []).filter((i) => {
      if (lowOnly && !i.low_stock) return false;
      if (!s) return true;
      return i.name.toLowerCase().includes(s) || i.sku.toLowerCase().includes(s);
    });
  }, [stockQ.data, search, lowOnly]);

  const lowItems = useMemo(() => (stockQ.data?.items ?? []).filter((i) => i.low_stock), [stockQ.data]);
  const totals = stockQ.data?.totals ?? { value: 0, units: 0, low: 0, count: 0 };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["inv-stock"] });
    qc.invalidateQueries({ queryKey: ["inv-moves"] });
    qc.invalidateQueries({ queryKey: ["inv-reports"] });
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Boxes className="w-7 h-7 text-primary" />
          {T("إدارة المخزون", "Inventory Management")}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {T(
            "الخامات والمنتجات النهائية — حركات، تنبيهات وتقارير مربوطة تلقائيًا بالمشتريات والإنتاج والأوردرات.",
            "Raw materials & finished goods — movements, alerts & reports auto-linked to purchases, production and orders.",
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label={T("عدد الأصناف", "Items")} value={String(totals.count)} />
        <Kpi label={T("إجمالي القطع", "Total units")} value={num(totals.units)} />
        <Kpi label={T("قيمة المخزون", "Stock value")} value={`${money(totals.value)} EGP`} />
        <Kpi label={T("تحت الحد الأدنى", "Below minimum")} value={String(totals.low)} danger={totals.low > 0} />
      </div>

      {lowItems.length > 0 && (
        <Card className="p-4 border-destructive/40 bg-destructive/5">
          <div className="flex items-center gap-2 font-semibold text-destructive mb-2">
            <AlertTriangle className="w-4 h-4" />
            {T("تنبيهات نقص المخزون", "Low stock alerts")} ({lowItems.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {lowItems.slice(0, 30).map((i) => (
              <Badge key={i.key} variant="destructive" className="font-normal">
                {i.name} — {num(i.on_hand_qty)} / {num(i.reorder_point)} {i.unit}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      <Tabs defaultValue="stock" className="space-y-4">
        <TabsList>
          <TabsTrigger value="stock">{T("المخزون", "Stock")}</TabsTrigger>
          <TabsTrigger value="movements">{T("الحركات", "Movements")}</TabsTrigger>
          <TabsTrigger value="reports">{T("التقارير", "Reports")}</TabsTrigger>
        </TabsList>

        {/* STOCK */}
        <TabsContent value="stock" className="space-y-4">
          <Card className="card-gradient p-4 flex flex-wrap items-end gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute top-3 start-2 text-muted-foreground" />
              <Input
                className="ps-8 w-64"
                placeholder={T("بحث بالاسم أو SKU", "Search name or SKU")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">{T("النوع", "Type")}</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{T("الكل", "All")}</SelectItem>
                  <SelectItem value="product">{T("منتجات نهائية", "Finished products")}</SelectItem>
                  <SelectItem value="material">{T("مواد خام", "Raw materials")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant={lowOnly ? "default" : "outline"} size="sm" onClick={() => setLowOnly((v) => !v)}>
              <AlertTriangle className="w-4 h-4 me-1" /> {T("تحت الحد الأدنى فقط", "Low stock only")}
            </Button>
          </Card>

          <Card className="card-gradient p-4 md:p-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="p-2 text-start">{T("الصنف", "Item")}</th>
                  <th className="p-2 text-start">SKU</th>
                  <th className="p-2">{T("النوع", "Type")}</th>
                  <th className="p-2">{T("الكمية الحالية", "On hand")}</th>
                  <th className="p-2">{T("الحد الأدنى", "Minimum")}</th>
                  <th className="p-2">{T("تكلفة الوحدة", "Unit cost")}</th>
                  <th className="p-2">{T("القيمة الإجمالية", "Total value")}</th>
                  <th className="p-2">{T("آخر تحديث", "Last update")}</th>
                  <th className="p-2 text-end">{T("إجراء", "Action")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.key} className="border-b border-border/50">
                    <td className="p-2">
                      {i.name}
                      {i.brand_name && <span className="text-xs text-muted-foreground ms-1">({i.brand_name})</span>}
                    </td>
                    <td className="p-2 font-mono text-xs">{i.sku || "—"}</td>
                    <td className="p-2 text-center">
                      <Badge variant="outline">{i.kind === "product" ? T("منتج", "Product") : T("خامة", "Material")}</Badge>
                    </td>
                    <td className="p-2 text-center">
                      <Badge variant={i.low_stock ? "destructive" : "secondary"}>{num(i.on_hand_qty)} {i.unit}</Badge>
                    </td>
                    <td className="p-2 text-center">{num(i.reorder_point)}</td>
                    <td className="p-2 text-center">{money(i.unit_cost)}</td>
                    <td className="p-2 text-center font-medium">{money(i.total_value)}</td>
                    <td className="p-2 text-center text-xs text-muted-foreground">
                      {new Date(i.updated_at).toLocaleDateString("en-GB")}
                    </td>
                    <td className="p-2">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" onClick={() => setDialog({ item: i, direction: "in" })}>
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setDialog({ item: i, direction: "out" })}>
                          <Minus className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRpItem(i)} title={T("الحد الأدنى", "Minimum")}>
                          <Settings2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">{T("لا توجد أصناف.", "No items.")}</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        {/* MOVEMENTS */}
        <TabsContent value="movements" className="space-y-4">
          <PeriodBar from={from} to={to} setFrom={setFrom} setTo={setTo} T={T} />
          <Card className="card-gradient p-4 md:p-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="p-2 text-start">{T("التاريخ", "Date")}</th>
                  <th className="p-2 text-start">{T("الصنف", "Item")}</th>
                  <th className="p-2">{T("الحركة", "Direction")}</th>
                  <th className="p-2">{T("الكمية", "Qty")}</th>
                  <th className="p-2">{T("تكلفة الوحدة", "Unit cost")}</th>
                  <th className="p-2">{T("السبب", "Reason")}</th>
                  <th className="p-2">{T("المصدر", "Source")}</th>
                  <th className="p-2 text-start">{T("المستخدم", "User")}</th>
                  <th className="p-2 text-start">{T("ملاحظة", "Note")}</th>
                </tr>
              </thead>
              <tbody>
                {((movesQ.data ?? []) as MovementRow[]).map((m) => (
                  <tr key={m.id} className="border-b border-border/50">
                    <td className="p-2 whitespace-nowrap">
                      {m.occurred_at}
                      <div className="text-xs text-muted-foreground">
                        {new Date(m.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </td>
                    <td className="p-2">
                      {m.item_name}
                      <span className="text-xs text-muted-foreground ms-1">
                        ({m.kind === "product" ? T("منتج", "Product") : T("خامة", "Material")})
                      </span>
                    </td>
                    <td className="p-2 text-center">
                      <Badge variant={m.direction === "in" ? "secondary" : "outline"}>
                        {m.direction === "in" ? T("دخول", "In") : T("خروج", "Out")}
                      </Badge>
                    </td>
                    <td className="p-2 text-center">{num(m.qty)}</td>
                    <td className="p-2 text-center">{m.unit_cost === null ? "—" : money(m.unit_cost)}</td>
                    <td className="p-2 text-center text-xs">{reasonLabel(m.reason, T)}</td>
                    <td className="p-2 text-center text-xs">{sourceLabel(m.source, T)}</td>
                    <td className="p-2 text-xs">{m.user_name}</td>
                    <td className="p-2 max-w-[240px] truncate text-xs text-muted-foreground">{m.note ?? "—"}</td>
                  </tr>
                ))}
                {(movesQ.data ?? []).length === 0 && (
                  <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">{T("لا توجد حركات في الفترة.", "No movements in period.")}</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        {/* REPORTS */}
        <TabsContent value="reports" className="space-y-4">
          <PeriodBar from={from} to={to} setFrom={setFrom} setTo={setTo} T={T} />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label={T("إجمالي الداخل", "Total in")} value={num(reportsQ.data?.totals.in_qty ?? 0)} />
            <Kpi label={T("قيمة الداخل", "In value")} value={`${money(reportsQ.data?.totals.in_value ?? 0)} EGP`} />
            <Kpi label={T("إجمالي الخارج", "Total out")} value={num(reportsQ.data?.totals.out_qty ?? 0)} />
            <Kpi label={T("عدد الأيام", "Days")} value={String(reportsQ.data?.days ?? 0)} />
          </div>

          <Card className="card-gradient p-4 md:p-5 space-y-3 overflow-x-auto">
            <h3 className="font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4" /> {T("تقرير الاستهلاك ومعدلاته", "Consumption report")}
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="p-2 text-start">{T("الصنف", "Item")}</th>
                  <th className="p-2">{T("داخل", "In")}</th>
                  <th className="p-2">{T("خارج", "Out")}</th>
                  <th className="p-2">{T("الصافي", "Net")}</th>
                  <th className="p-2">{T("متوسط الاستهلاك اليومي", "Avg daily use")}</th>
                  <th className="p-2">{T("عدد الحركات", "Movements")}</th>
                </tr>
              </thead>
              <tbody>
                {(reportsQ.data?.items ?? []).map((r) => (
                  <tr key={`${r.kind}-${r.item_name}`} className="border-b border-border/50">
                    <td className="p-2">{r.item_name}</td>
                    <td className="p-2 text-center text-emerald-500">{num(r.in_qty)}</td>
                    <td className="p-2 text-center text-destructive">{num(r.out_qty)}</td>
                    <td className="p-2 text-center">{num(r.net_qty)}</td>
                    <td className="p-2 text-center">{num(r.avg_daily_consumption)}</td>
                    <td className="p-2 text-center">{r.movements}</td>
                  </tr>
                ))}
                {(reportsQ.data?.items ?? []).length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">{T("لا توجد بيانات.", "No data.")}</td></tr>
                )}
              </tbody>
            </table>
          </Card>

          <Card className="card-gradient p-4 md:p-5 space-y-3 overflow-x-auto">
            <h3 className="font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> {T("تحليل التكاليف والأسعار", "Cost & price analysis")}
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="p-2 text-start">{T("الصنف", "Item")}</th>
                  <th className="p-2">{T("أول تكلفة", "First cost")}</th>
                  <th className="p-2">{T("آخر تكلفة", "Last cost")}</th>
                  <th className="p-2">{T("التغير %", "Change %")}</th>
                  <th className="p-2">{T("قيمة المشتريات", "Purchased value")}</th>
                </tr>
              </thead>
              <tbody>
                {(reportsQ.data?.items ?? []).filter((r) => r.in_qty > 0).map((r) => (
                  <tr key={`c-${r.kind}-${r.item_name}`} className="border-b border-border/50">
                    <td className="p-2">{r.item_name}</td>
                    <td className="p-2 text-center">{r.first_cost === null ? "—" : money(r.first_cost)}</td>
                    <td className="p-2 text-center">{r.last_cost === null ? "—" : money(r.last_cost)}</td>
                    <td className={`p-2 text-center ${r.cost_change_pct > 0 ? "text-destructive" : r.cost_change_pct < 0 ? "text-emerald-500" : ""}`}>
                      {r.cost_change_pct.toFixed(1)}%
                    </td>
                    <td className="p-2 text-center">{money(r.in_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="card-gradient p-4 md:p-5 space-y-3">
            <h3 className="font-semibold">{T("الحركات حسب المصدر", "Movements by source")}</h3>
            <div className="flex flex-wrap gap-3">
              {(reportsQ.data?.bySource ?? []).map((s) => (
                <div key={s.source} className="rounded-lg border border-border p-3 min-w-[180px]">
                  <div className="text-sm font-medium">{sourceLabel(s.source, T)}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {T("داخل", "In")}: {num(s.in_qty)} · {T("خارج", "Out")}: {num(s.out_qty)} · {s.count} {T("حركة", "moves")}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {dialog && (
        <MoveDialog
          item={dialog.item}
          direction={dialog.direction}
          onClose={() => setDialog(null)}
          onDone={() => { setDialog(null); refresh(); }}
        />
      )}
      {rpItem && (
        <ReorderDialog item={rpItem} onClose={() => setRpItem(null)} onDone={() => { setRpItem(null); refresh(); }} />
      )}
    </div>
  );
}

function Kpi({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <Card className="card-gradient p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${danger ? "text-destructive" : ""}`}>{value}</div>
    </Card>
  );
}

function PeriodBar({
  from, to, setFrom, setTo, T,
}: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void; T: (a: string, e: string) => string }) {
  return (
    <Card className="card-gradient p-4 flex flex-wrap gap-3 items-end">
      <div>
        <Label className="text-xs">{T("من", "From")}</Label>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
      </div>
      <div>
        <Label className="text-xs">{T("إلى", "To")}</Label>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
      </div>
    </Card>
  );
}

function reasonLabel(reason: string, T: (a: string, e: string) => string) {
  switch (reason) {
    case "purchase": return T("مشتريات", "Purchase");
    case "production_consumption": return T("استهلاك إنتاج", "Production use");
    case "order_confirmed": return T("تأكيد أوردر", "Order confirmed");
    case "manual_in": return T("إضافة يدوية", "Manual in");
    case "manual_out": return T("خصم يدوي", "Manual out");
    case "adjustment": return T("تسوية", "Adjustment");
    default: return reason;
  }
}

function sourceLabel(source: string, T: (a: string, e: string) => string) {
  switch (source) {
    case "supplier_invoice": return T("فاتورة مشتريات", "Purchase invoice");
    case "bom": return T("أمر إنتاج", "Production order");
    case "order": return T("أوردر عميل", "Customer order");
    case "manual": return T("يدوي", "Manual");
    default: return source;
  }
}

function MoveDialog({
  item, direction, onClose, onDone,
}: { item: StockItem; direction: "in" | "out" | "adjust"; onClose: () => void; onDone: () => void }) {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const addFn = useServerFn(addMovement);

  const mut = useMutation({
    mutationFn: () => addFn({ data: {
      kind: item.kind, id: item.id, direction,
      qty: Number(qty || 0),
      unit_cost: direction === "in" && cost ? Number(cost) : null,
      occurred_at: date,
      note: note || null,
    } }),
    onSuccess: () => { toast.success(T("تم تسجيل الحركة", "Movement saved")); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {direction === "in" ? T("دخول مخزون", "Stock in") : T("خروج مخزون", "Stock out")} — {item.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{T("الكمية", "Quantity")} ({item.unit})</Label>
            <Input type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
          </div>
          {direction === "in" && (
            <div>
              <Label>{T("تكلفة الوحدة (اختياري)", "Unit cost (optional)")}</Label>
              <Input type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">
                {T("لو دخلت التكلفة هيتحدث متوسط التكلفة تلقائيًا.", "Updates the weighted-average cost automatically.")}
              </p>
            </div>
          )}
          <div>
            <Label>{T("التاريخ", "Date")}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>{T("السبب / ملاحظة", "Reason / note")}</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{T("إلغاء", "Cancel")}</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !qty || Number(qty) <= 0}>
            {T("حفظ", "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReorderDialog({ item, onClose, onDone }: { item: StockItem; onClose: () => void; onDone: () => void }) {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [val, setVal] = useState(String(item.reorder_point ?? 0));
  const fn = useServerFn(setReorderPoint);
  const mut = useMutation({
    mutationFn: () => fn({ data: { kind: item.kind, id: item.id, reorder_point: Number(val || 0) } }),
    onSuccess: () => { toast.success(T("تم الحفظ", "Saved")); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{T("الحد الأدنى للمخزون", "Minimum stock")} — {item.name}</DialogTitle></DialogHeader>
        <Input type="number" min={0} step="any" value={val} onChange={(e) => setVal(e.target.value)} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{T("إلغاء", "Cancel")}</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>{T("حفظ", "Save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
