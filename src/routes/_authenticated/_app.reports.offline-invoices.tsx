import { tr } from "@/lib/i18n";
import { formatBusinessDate } from "@/lib/timezone";
import { getTodayInBusinessTimezone } from "@/lib/timezone";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Receipt, Search as SearchIcon, Pencil, Trash2, Printer, Plus, X, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { listOfflineInvoices, updateOfflineInvoice, updateOfflineInvoiceItems, deleteOfflineInvoice, getPosInvoice, listBranchProducts } from "@/lib/pos.functions";

export const Route = createFileRoute("/_authenticated/_app/reports/offline-invoices")({
  head: () => ({ meta: [{ title: "فواتير الأوفلاين — e-GURUS" }, { name: "description", content: "سجل فواتير الفروع الأوفلاين مع بيانات العميل والتاريخ" }] }),
  component: OfflineInvoicesPage,
});

type Range = "day" | "week" | "month" | "year" | "custom";

function todayISO() { return getTodayInBusinessTimezone(); }
function daysAgo(n: number) { return formatBusinessDate(new Date(Date.now() - n * 86400000)); }

function OfflineInvoicesPage() {
  const [range, setRange] = useState<Range>("day");
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState(todayISO());
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<null | { id: string; brand_id: string; customer_name: string; customer_phone: string; customer_email: string; note: string; occurred_at: string }>(null);
  const [editItems, setEditItems] = useState<Array<{ productId: string; qty: number; unitPrice: number }>>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  function applyRange(r: Range) {
    setRange(r);
    const t = todayISO();
    if (r === "day") { setStart(t); setEnd(t); }
    else if (r === "week") { setStart(daysAgo(6)); setEnd(t); }
    else if (r === "month") { setStart(daysAgo(29)); setEnd(t); }
    else if (r === "year") { setStart(daysAgo(364)); setEnd(t); }
  }

  const listFn = useServerFn(listOfflineInvoices);
  const updateFn = useServerFn(updateOfflineInvoice);
  const updateItemsFn = useServerFn(updateOfflineInvoiceItems);
  const deleteFn = useServerFn(deleteOfflineInvoice);
  const getInv = useServerFn(getPosInvoice);
  const listProductsFn = useServerFn(listBranchProducts);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["offline-invoices", start, end, search],
    queryFn: () => listFn({ data: { startDate: start, endDate: end, search } }),
  });
  const invoices = q.data?.invoices ?? [];
  const canEdit = !!q.data?.canEdit;
  const canDelete = !!q.data?.canDelete;

  const totals = useMemo(() => {
    return invoices.reduce(
      (acc, i) => {
        acc.count += 1;
        acc.qty += i.qty;
        acc.total += i.total_amount;
        acc.cash += i.cash_amount;
        acc.card += i.card_amount;
        return acc;
      },
      { count: 0, qty: 0, total: 0, cash: 0, card: 0 },
    );
  }, [invoices]);

  const updateMut = useMutation({
    mutationFn: (v: Parameters<typeof updateOfflineInvoice>[0]["data"]) => updateFn({ data: v }),
    onSuccess: async () => {
      if (editing && editItems.length > 0) {
        try {
          await updateItemsFn({ data: { id: editing.id, items: editItems } });
        } catch (e) { toast.error(e instanceof Error ? e.message : "فشل حفظ الأصناف"); }
      }
      toast.success(tr("تم الحفظ"));
      setEditing(null);
      setEditItems([]);
      qc.invalidateQueries({ queryKey: ["offline-invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success(tr("تم الحذف")); setDeletingId(null); qc.invalidateQueries({ queryKey: ["offline-invoices"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const viewQ = useQuery({
    queryKey: ["offline-invoice", viewingId],
    queryFn: () => getInv({ data: { id: viewingId! } }),
    enabled: !!viewingId,
  });

  // When opening the edit dialog, load invoice items to prefill editable rows.
  const editInvQ = useQuery({
    queryKey: ["offline-invoice-edit", editing?.id],
    queryFn: () => getInv({ data: { id: editing!.id } }),
    enabled: !!editing?.id,
  });
  useEffect(() => {
    if (editInvQ.data && editing?.id === editInvQ.data.id) {
      setEditItems(editInvQ.data.items.filter((it) => it.product_id).map((it) => ({
        productId: it.product_id as string, qty: Number(it.qty), unitPrice: Number(it.unit_price),
      })));
    }
  }, [editInvQ.data, editing?.id]);
  const editProdsQ = useQuery({
    queryKey: ["branch-products", editing?.brand_id],
    queryFn: () => listProductsFn({ data: { brandId: editing!.brand_id } }),
    enabled: !!editing?.brand_id,
  });

  async function printInvoice() {
    if (!viewQ.data) return;
    const inv = viewQ.data;
    const no = `POS-${String(inv.id).slice(0, 8).toUpperCase()}`;
    const w = window.open("", "_blank", "width=380,height=640");
    if (!w) return;
    const rows = inv.items.map((i) => `<tr><td>${escapeHtml(i.product_name)}</td><td class="c">${i.qty}</td><td class="r">${Number(i.unit_price).toLocaleString("en-US")}</td><td class="r">${Number(i.subtotal).toLocaleString("en-US")}</td></tr>`).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${no}</title>
      <style>body{font-family:sans-serif;padding:10px;font-size:12px}h1{font-size:16px;text-align:center;margin:4px 0}table{width:100%;border-collapse:collapse;margin-top:8px}td,th{padding:4px;border-bottom:1px dashed #999}.r{text-align:right}.c{text-align:center}.tot{font-weight:bold;font-size:14px}</style>
      </head><body>
      <h1>${escapeHtml(inv.brand_name)}</h1>
      <div>فاتورة: ${no}</div>
      <div>التاريخ: ${new Date(inv.created_at).toLocaleString("en-GB")}</div>
      <div>العميل: ${escapeHtml(inv.customer_name ?? "")}</div>
      <div>الهاتف: ${escapeHtml(inv.customer_phone ?? "")}</div>
      <table><thead><tr><th>الصنف</th><th class="c">كمية</th><th class="r">سعر</th><th class="r">إجمالي</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="tot" style="margin-top:8px;display:flex;justify-content:space-between"><span>الإجمالي</span><span>${Number(inv.total_amount).toLocaleString("en-US")}</span></div>
      <div>الدفع: ${escapeHtml(inv.payment_method ?? "")} — كاش ${Number(inv.cash_amount ?? 0).toLocaleString("en-US")} / فيزا ${Number(inv.card_amount ?? 0).toLocaleString("en-US")}</div>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 250);
  }

  function waPhone(raw: string | null | undefined): string | null {
    const digits = (raw ?? "").replace(/\D/g, "");
    if (!digits) return null;
    if (digits.startsWith("00")) return digits.slice(2);
    if (digits.startsWith("2")) return digits;
    if (digits.startsWith("0")) return `2${digits}`;
    return digits;
  }
  function sendWhatsapp(inv: { id: string; brand_name: string; customer_name: string | null; customer_phone: string | null; total_amount: number; created_at: string; payment_method: string | null }) {
    const phone = waPhone(inv.customer_phone);
    if (!phone) { toast.error(tr("رقم عميل غير صالح")); return; }
    const no = `POS-${String(inv.id).slice(0, 8).toUpperCase()}`;
    const lines = [
      `فاتورة ${inv.brand_name}`,
      `رقم: ${no}`,
      `التاريخ: ${new Date(inv.created_at).toLocaleString("en-GB")}`,
      `العميل: ${inv.customer_name ?? ""}`,
      `الإجمالي: ${Number(inv.total_amount).toLocaleString("en-US")} EGP`,
      inv.payment_method ? `الدفع: ${inv.payment_method}` : "",
      "شكرًا لتعاملكم معنا — e-Gurus",
    ].filter(Boolean).join("\n");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(lines)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Receipt className="w-7 h-7" /> {tr("فواتير الأوفلاين")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{tr("كل فواتير الفروع الأوفلاين ببيانات العميل وسجل التاريخ.")}</p>
        </div>
      </div>

      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[140px]">
          <Label className="text-xs">{tr("الفترة")}</Label>
          <Select value={range} onValueChange={(v) => applyRange(v as Range)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="day">{tr("اليوم")}</SelectItem>
              <SelectItem value="week">{tr("أسبوع")}</SelectItem>
              <SelectItem value="month">{tr("شهر")}</SelectItem>
              <SelectItem value="year">{tr("سنة")}</SelectItem>
              <SelectItem value="custom">{tr("مخصص")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">{tr("من")}</Label><Input type="date" dir="ltr" value={start} onChange={(e) => { setStart(e.target.value); setRange("custom"); }} /></div>
        <div><Label className="text-xs">{tr("إلى")}</Label><Input type="date" dir="ltr" value={end} onChange={(e) => { setEnd(e.target.value); setRange("custom"); }} /></div>
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs">{tr("بحث (اسم/تليفون)")}</Label>
          <div className="relative">
            <SearchIcon className="w-4 h-4 absolute top-2.5 right-2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pr-8" placeholder={tr("بحث...")} />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label={tr("عدد الفواتير")} value={totals.count} />
        <Kpi label={tr("عدد القطع")} value={totals.qty} />
        <Kpi label={tr("الإجمالي")} value={totals.total} />
        <Kpi label={tr("كاش")} value={totals.cash} />
        <Kpi label={tr("فيزا")} value={totals.card} />
      </div>

      <Card className="card-gradient overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="text-muted-foreground text-right border-b border-border">
              <th className="p-3">{tr("التاريخ")}</th>
              <th className="p-3">{tr("رقم الفاتورة")}</th>
              <th className="p-3">{tr("الفرع")}</th>
              <th className="p-3">{tr("العميل")}</th>
              <th className="p-3">{tr("الهاتف")}</th>
              <th className="p-3">{tr("الدفع")}</th>
              <th className="p-3">{tr("قطع")}</th>
              <th className="p-3">{tr("الإجمالي")}</th>
              <th className="p-3">{tr("البائع")}</th>
              <th className="p-3">{tr("إجراءات")}</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id} className="border-b border-border/50">
                <td className="p-3 num" dir="ltr">{new Date(i.created_at).toLocaleString("en-GB")}</td>
                <td className="p-3" dir="ltr">POS-{String(i.id).slice(0, 8).toUpperCase()}</td>
                <td className="p-3">{i.brand_name}</td>
                <td className="p-3">
                  {i.customer_id ? (
                    <Link to="/customers/$id" params={{ id: i.customer_id }} className="text-primary hover:underline">
                      {i.customer_name ?? "—"}
                    </Link>
                  ) : (i.customer_name ?? "—")}
                </td>
                <td className="p-3 num" dir="ltr">{i.customer_phone ?? "—"}</td>
                <td className="p-3"><Badge variant="secondary">{i.payment_method ?? "—"}</Badge></td>
                <td className="p-3 num">{i.qty}</td>
                <td className="p-3 num text-primary font-bold">{i.total_amount.toLocaleString("en-US")}</td>
                <td className="p-3 text-xs" dir="ltr">{i.sold_by_email}</td>
                <td className="p-3">
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="outline" onClick={() => setViewingId(i.id)}><Printer className="w-4 h-4" /></Button>
                    <Button size="sm" variant="outline" title={tr("إرسال واتساب")} onClick={() => sendWhatsapp(i)}><MessageCircle className="w-4 h-4" /></Button>
                    {canEdit && (
                      <Button size="sm" variant="outline" onClick={() => setEditing({
                        id: i.id,
                        brand_id: i.brand_id,
                        customer_name: i.customer_name ?? "",
                        customer_phone: i.customer_phone ?? "",
                        customer_email: i.customer_email ?? "",
                        note: i.note ?? "",
                        occurred_at: i.occurred_at,
                      })}><Pencil className="w-4 h-4" /></Button>
                    )}
                    {canDelete && (
                      <Button size="sm" variant="destructive" onClick={() => setDeletingId(i.id)}><Trash2 className="w-4 h-4" /></Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && !q.isLoading && (
              <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">{tr("لا فواتير في هذه الفترة.")}</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) { setEditing(null); setEditItems([]); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{tr("تعديل الفاتورة")}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><Label>{tr("اسم العميل")}</Label><Input value={editing.customer_name} onChange={(e) => setEditing({ ...editing, customer_name: e.target.value })} /></div>
                <div><Label>{tr("الهاتف")}</Label><Input dir="ltr" value={editing.customer_phone} onChange={(e) => setEditing({ ...editing, customer_phone: e.target.value })} /></div>
                <div><Label>{tr("الإيميل")}</Label><Input dir="ltr" value={editing.customer_email} onChange={(e) => setEditing({ ...editing, customer_email: e.target.value })} /></div>
                <div><Label>{tr("التاريخ")}</Label><Input type="date" dir="ltr" value={editing.occurred_at} onChange={(e) => setEditing({ ...editing, occurred_at: e.target.value })} /></div>
              </div>
              <div><Label>{tr("ملاحظات")}</Label><Input value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} /></div>

              <div className="border-t pt-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-semibold">{tr("الأصناف")}</Label>
                  <Button size="sm" variant="outline" type="button" onClick={() => {
                    const firstProd = editProdsQ.data?.[0];
                    setEditItems((prev) => [...prev, {
                      productId: firstProd?.id ?? "",
                      qty: 1,
                      unitPrice: Number(firstProd?.sell_price ?? 0),
                    }]);
                  }} className="gap-1"><Plus className="w-3 h-3" /> {tr("إضافة صنف")}</Button>
                </div>
                {editInvQ.isLoading && <div className="text-xs text-muted-foreground">{tr("جاري تحميل الأصناف…")}</div>}
                <div className="space-y-2">
                  {editItems.map((it, idx) => (
                    <div key={idx} className="flex flex-wrap gap-2 items-end">
                      <div className="flex-1 min-w-[180px]">
                        <Label className="text-xs">{tr("الصنف")}</Label>
                        <Select value={it.productId} onValueChange={(v) => {
                          const p = editProdsQ.data?.find((x) => x.id === v);
                          setEditItems((prev) => prev.map((r, i) => i === idx ? {
                            ...r, productId: v,
                            unitPrice: p ? Number(p.sell_price) : r.unitPrice,
                          } : r));
                        }}>
                          <SelectTrigger><SelectValue placeholder={tr("اختر صنف")} /></SelectTrigger>
                          <SelectContent>
                            {(editProdsQ.data ?? []).map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-20"><Label className="text-xs">{tr("كمية")}</Label>
                        <Input type="number" min={1} value={it.qty} onChange={(e) => {
                          const q = Math.max(1, Number(e.target.value) || 1);
                          setEditItems((prev) => prev.map((r, i) => i === idx ? { ...r, qty: q } : r));
                        }} /></div>
                      <div className="w-28"><Label className="text-xs">{tr("سعر")}</Label>
                        <Input type="number" min={0} step="0.01" value={it.unitPrice} onChange={(e) => {
                          const p = Math.max(0, Number(e.target.value) || 0);
                          setEditItems((prev) => prev.map((r, i) => i === idx ? { ...r, unitPrice: p } : r));
                        }} /></div>
                      <div className="w-24 text-sm num" dir="ltr">
                        <div className="text-xs text-muted-foreground">{tr("إجمالي")}</div>
                        <div className="pt-2 font-semibold">{(it.qty * it.unitPrice).toLocaleString("en-US")}</div>
                      </div>
                      <Button size="sm" variant="ghost" type="button" onClick={() => setEditItems((prev) => prev.filter((_, i) => i !== idx))}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="text-right text-sm font-bold pt-2 border-t mt-2">
                  {tr("الإجمالي الجديد:")} <span className="num" dir="ltr">{editItems.reduce((s, it) => s + it.qty * it.unitPrice, 0).toLocaleString("en-US")}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setEditing(null); setEditItems([]); }}>{tr("إلغاء")}</Button>
            <Button disabled={updateMut.isPending} onClick={() => editing && updateMut.mutate({
              id: editing.id,
              customerName: editing.customer_name,
              customerPhone: editing.customer_phone,
              customerEmail: editing.customer_email,
              note: editing.note,
              occurredAt: editing.occurred_at,
            })}>{tr("حفظ")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("حذف الفاتورة؟")}</AlertDialogTitle>
            <AlertDialogDescription>{tr("لا يمكن التراجع عن هذه العملية.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("إلغاء")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingId && deleteMut.mutate(deletingId)}>{tr("حذف")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View / Print */}
      <Dialog open={!!viewingId} onOpenChange={(o) => !o && setViewingId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{tr("تفاصيل الفاتورة")}</DialogTitle></DialogHeader>
          {viewQ.data && (
            <div className="space-y-2 text-sm">
              <div><b>{tr("الفرع:")}</b> {viewQ.data.brand_name}</div>
              <div><b>{tr("التاريخ:")}</b> <span dir="ltr">{new Date(viewQ.data.created_at).toLocaleString("en-GB")}</span></div>
              <div><b>{tr("العميل:")}</b> {viewQ.data.customer_name} — <span dir="ltr">{viewQ.data.customer_phone}</span></div>
              <table className="w-full mt-2 text-xs">
                <thead><tr className="border-b"><th className="text-right p-1">{tr("الصنف")}</th><th className="p-1">{tr("كمية")}</th><th className="p-1">{tr("سعر")}</th><th className="p-1">{tr("إجمالي")}</th></tr></thead>
                <tbody>
                  {viewQ.data.items.map((it) => (
                    <tr key={it.id} className="border-b border-border/40"><td className="p-1">{it.product_name}</td><td className="p-1 num text-center">{it.qty}</td><td className="p-1 num text-center">{Number(it.unit_price).toLocaleString("en-US")}</td><td className="p-1 num text-center">{Number(it.subtotal).toLocaleString("en-US")}</td></tr>
                  ))}
                </tbody>
              </table>
              <div className="font-bold flex justify-between pt-2 border-t"><span>{tr("الإجمالي")}</span><span className="num">{Number(viewQ.data.total_amount).toLocaleString("en-US")}</span></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setViewingId(null)}>{tr("إغلاق")}</Button>
            <Button variant="outline" onClick={() => viewQ.data && sendWhatsapp({
              id: viewQ.data.id, brand_name: viewQ.data.brand_name,
              customer_name: viewQ.data.customer_name, customer_phone: viewQ.data.customer_phone,
              total_amount: Number(viewQ.data.total_amount), created_at: viewQ.data.created_at,
              payment_method: viewQ.data.payment_method,
            })} className="gap-1"><MessageCircle className="w-4 h-4" /> {tr("واتساب")}</Button>
            <Button onClick={printInvoice} className="gap-1"><Printer className="w-4 h-4" /> {tr("طباعة")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold num mt-1">{Number(value).toLocaleString("en-US")}</div>
    </Card>
  );
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}