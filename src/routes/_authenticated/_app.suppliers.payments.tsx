import { tr } from "@/lib/i18n";
import { getTodayInBusinessTimezone } from "@/lib/timezone";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { toast } from "sonner";
import { Trash2, HandCoins, Wallet, ArrowDownCircle, ScrollText, Pencil, Printer, X } from "lucide-react";
import {
  listPayments, upsertPayment, deletePayment,
  listInvoices, listSuppliers, listBrands, deleteInvoice,
} from "@/lib/internal.functions";
import { getMyRole } from "@/lib/admin.functions";
import { PaginatedTable, type Column } from "@/components/PaginatedTable";

export const Route = createFileRoute("/_authenticated/_app/suppliers/payments")({
  head: () => ({ meta: [
    { title: "دفعات الموردين — e-GURUS" },
    { name: "description", content: "تسجيل دفعة لمورد: اختر المورد والبراند والفاتورة والمبلغ — يخصم من مديونيات المورد ومن الخزنة تلقائيًا." },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
  component: SupplierPaymentsPage,
});

const today = () => getTodayInBusinessTimezone();
const addDays = (d: string, n: number) => { const dt = new Date(d); dt.setDate(dt.getDate() + n); return dt.toISOString().slice(0, 10); };
const nf = (n: number) => Number(n || 0).toLocaleString("en-US");

function SupplierPaymentsPage() {
  const qc = useQueryClient();
  const roleQ = useQuery({ queryKey: ["my-role"], queryFn: useServerFn(getMyRole) });
  const canWrite = !!(roleQ.data?.isAdmin || roleQ.data?.isManager || roleQ.data?.canWrite);

  const suppliersQ = useQuery({ queryKey: ["suppliers"], queryFn: useServerFn(listSuppliers) });
  const invoicesQ = useQuery({ queryKey: ["supplier-invoices"], queryFn: useServerFn(listInvoices) });
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: useServerFn(listBrands) });
  const allPaymentsQ = useQuery({ queryKey: ["supplier-payments-all"], queryFn: useServerFn(listPayments) });

  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [statementSupplierId, setStatementSupplierId] = useState<string | null>(null);


  const listFn = useServerFn(listPayments);
  const paymentsQ = useQuery({
    queryKey: ["supplier-payments"],
    queryFn: () => listFn({ data: { supplier_id: null, from: null, to: null } }),
  });



  const upFn = useServerFn(upsertPayment);
  const delFn = useServerFn(deletePayment);
  const delInvoiceFn = useServerFn(deleteInvoice);

  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [confirmDelInvoice, setConfirmDelInvoice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [form, setForm] = useState({
    supplier_id: "",
    brand_id: "",
    invoice_id: "",
    amount: 0,
    paid_at: today(),
    note: "",
  });

  const suppliers = suppliersQ.data ?? [];
  const invoices = invoicesQ.data ?? [];
  const brands = brandsQ.data ?? [];
  const allPayments = allPaymentsQ.data ?? [];
  const supplierName = (id: string | null | undefined) => suppliers.find((s) => s.id === id)?.name ?? "—";
  const brandName = (id: string | null | undefined) => brands.find((b) => b.id === id)?.name ?? "—";
  const supplierBrandId = (id: string | null | undefined) => {
    const s = suppliers.find((x) => x.id === id);
    return s?.brand_id ?? s?.brand_ids?.[0] ?? null;
  };

  // Paid map across ALL payments — for accurate remaining/debts
  const paidByInvoiceGlobal = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of allPayments) { if (p.invoice_id) m.set(p.invoice_id, (m.get(p.invoice_id) ?? 0) + Number(p.amount || 0)); }
    return m;
  }, [allPayments]);

  const remainingOf = (invId: string, amt: number) => Math.max(0, Number(amt || 0) - (paidByInvoiceGlobal.get(invId) ?? 0));

  const brandsForSupplier = useMemo(() => {
    if (!form.supplier_id) return [];
    const ids = new Set<string>();
    for (const i of invoices) if (i.supplier_id === form.supplier_id && i.brand_id) ids.add(i.brand_id);
    const sup = suppliers.find((s) => s.id === form.supplier_id) as { brand_id?: string | null; brand_ids?: string[] } | undefined;
    if (sup?.brand_id) ids.add(sup.brand_id);
    for (const b of sup?.brand_ids ?? []) ids.add(b);
    return brands.filter((b) => ids.has(b.id));
  }, [form.supplier_id, invoices, brands, suppliers]);

  const openInvoicesForFilter = useMemo(
    () => invoices.filter((i) =>
      i.supplier_id === form.supplier_id
      && i.status !== "paid"
      && (!form.brand_id || i.brand_id === form.brand_id)
      && remainingOf(i.id, Number(i.amount)) > 0,
    ),
    [invoices, form.supplier_id, form.brand_id, paidByInvoiceGlobal],
  );

  const selectedInvoice = invoices.find((i) => i.id === form.invoice_id) ?? null;
  const selectedRemaining = selectedInvoice ? remainingOf(selectedInvoice.id, Number(selectedInvoice.amount)) : 0;

  const resetForm = () => { setEditingId(null); setForm({ supplier_id: "", brand_id: "", invoice_id: "", amount: 0, paid_at: today(), note: "" }); };

  const loadForEdit = (payment: { id: string; invoice_id: string | null; amount: number; paid_at: string; note: string | null }) => {
    const inv = invoices.find((i) => i.id === payment.invoice_id);
    setEditingId(payment.id);
    setForm({
      supplier_id: inv?.supplier_id ?? "",
      brand_id: inv?.brand_id ?? "",
      invoice_id: payment.invoice_id ?? "",
      amount: Number(payment.amount || 0),
      paid_at: payment.paid_at,
      note: payment.note ?? "",
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = useMutation({
    mutationFn: () => {
      const bName = standalone && form.brand_id ? brandName(form.brand_id) : "";
      const composedNote = standalone && bName
        ? `[${bName}] ${form.note ?? ""}`.trim()
        : (form.note || null);
      return upFn({ data: {
        ...(editingId ? { id: editingId } : {}),
        invoice_id: standalone ? null : (form.invoice_id || null),
        supplier_id: standalone ? (form.supplier_id || null) : null,
        amount: Number(form.amount) || 0,
        paid_at: form.paid_at,
        note: composedNote || null,
      } });
    },
    onSuccess: () => {
      toast.success(editingId ? "تم تعديل الدفعة وتحديث الخزنة" : "تم تسجيل الدفعة وخصمها من مديونيات المورد ومن الخزنة");
      qc.invalidateQueries({ queryKey: ["supplier-payments"] });
      qc.invalidateQueries({ queryKey: ["supplier-payments-all"] });
      qc.invalidateQueries({ queryKey: ["supplier-invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["cash-txns"] });
      qc.invalidateQueries({ queryKey: ["cash-summary"] });
      qc.invalidateQueries({ queryKey: ["internal-dashboard"] });
      resetForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const printReceipt = (p: { id: string; invoice_id: string | null; amount: number; paid_at: string; note: string | null }) => {
    const inv = invoices.find((i) => i.id === p.invoice_id);
    const sName = inv ? supplierName(inv.supplier_id) : "—";
    const bName = inv?.brand_id ? brandName(inv.brand_id) : "—";
    const invAmt = inv ? Number(inv.amount) : 0;
    const paidBefore = p.invoice_id ? (paidByInvoiceGlobal.get(p.invoice_id) ?? 0) : 0;
    const remainingAfter = Math.max(0, invAmt - paidBefore);
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
<title>إيصال دفعة مورد — ${sName}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:'Tahoma','Segoe UI',Arial,sans-serif;margin:0;padding:32px;color:#111;background:#fff}
  .wrap{max-width:720px;margin:0 auto;border:1px solid #ddd;border-radius:12px;padding:28px}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:14px;margin-bottom:20px}
  .brand{font-size:22px;font-weight:800}
  .doc{font-size:14px;color:#555}
  h1{font-size:20px;margin:0 0 6px}
  table{width:100%;border-collapse:collapse;margin-top:12px}
  th,td{padding:10px;border-bottom:1px solid #eee;text-align:right;font-size:14px}
  th{background:#f7f7f7;font-weight:700}
  .amount{font-size:26px;font-weight:800;color:#059669;text-align:center;padding:16px;background:#ecfdf5;border-radius:8px;margin:16px 0}
  .foot{margin-top:24px;display:flex;justify-content:space-between;font-size:12px;color:#666}
  .sig{margin-top:40px;display:flex;justify-content:space-between}
  .sig div{width:40%;text-align:center;border-top:1px solid #999;padding-top:6px;font-size:13px}
  @media print{ .noprint{display:none} body{padding:0} .wrap{border:none} }
  .btn{display:inline-block;padding:8px 14px;background:#111;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;border:none;cursor:pointer}
</style></head><body>
<div class="wrap">
  <div class="head">
    <div><div class="brand">e-GURUS</div><div class="doc">إيصال دفعة مورد</div></div>
    <div style="text-align:left"><div>رقم الإيصال: <b>${p.id.slice(0,8).toUpperCase()}</b></div><div>التاريخ: <b>${p.paid_at}</b></div></div>
  </div>
  <table>
    <tr><th>المورد</th><td>${sName}</td></tr>
    <tr><th>البراند</th><td>${bName}</td></tr>
    <tr><th>رقم الفاتورة</th><td dir="ltr" style="text-align:right">${p.invoice_id}</td></tr>
    <tr><th>تاريخ الفاتورة</th><td>${inv?.issued_at ?? "—"}</td></tr>
    <tr><th>قيمة الفاتورة</th><td>${nf(invAmt)} EGP</td></tr>
    <tr><th>المدفوع قبل هذه الدفعة</th><td>${nf(paidBefore - Number(p.amount || 0))} EGP</td></tr>
    <tr><th>المتبقّي بعد الدفعة</th><td><b>${nf(Math.max(0, remainingAfter))}</b> EGP</td></tr>
    <tr><th>ملاحظة</th><td>${(p.note ?? "—").replace(/</g,"&lt;")}</td></tr>
  </table>
  <div class="amount">المبلغ المدفوع: ${nf(Number(p.amount || 0))} EGP</div>
  <div class="sig"><div>توقيع المورد</div><div>توقيع المستلم</div></div>
  <div class="foot"><div>مطبوع تلقائياً من نظام e-GURUS</div><div>${new Date().toLocaleString("en-US")}</div></div>
  <div class="noprint" style="text-align:center;margin-top:20px"><button class="btn" onclick="window.print()">طباعة / حفظ PDF</button></div>
</div>
<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300));</script>
</body></html>`;
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) { toast.error(tr("افتح النوافذ المنبثقة للطباعة")); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };



  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success(tr("تم الحذف"));
      qc.invalidateQueries({ queryKey: ["supplier-payments"] });
      qc.invalidateQueries({ queryKey: ["supplier-payments-all"] });
      qc.invalidateQueries({ queryKey: ["supplier-invoices"] });
      qc.invalidateQueries({ queryKey: ["cash-txns"] });
      qc.invalidateQueries({ queryKey: ["cash-summary"] });
      setConfirmDel(null);
    },
    onError: (e: unknown) => toast.error(`فشل الحذف: ${(e as Error)?.message ?? e}`),
  });

  const removeInvoice = useMutation({
    mutationFn: (id: string) => delInvoiceFn({ data: { id } }),
    onSuccess: () => {
      toast.success(tr("تم حذف الفاتورة"));
      qc.invalidateQueries({ queryKey: ["supplier-invoices"] });
      qc.invalidateQueries({ queryKey: ["supplier-payments"] });
      qc.invalidateQueries({ queryKey: ["supplier-payments-all"] });
      qc.invalidateQueries({ queryKey: ["cash-txns"] });
      qc.invalidateQueries({ queryKey: ["cash-summary"] });
      setConfirmDelInvoice(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = paymentsQ.data ?? [];
  const totalPeriod = rows.reduce((a, r) => a + Number(r.amount || 0), 0);

  // Aggregate outstanding debt per supplier (global): opening + invoice remainings − standalone payments
  const totalOpenDebt = useMemo(() => {
    let s = 0;
    for (const sup of suppliers) s += Number((sup as { opening_balance?: number }).opening_balance ?? 0);
    for (const inv of invoices) s += remainingOf(inv.id, Number(inv.amount));
    for (const p of allPayments) if (!p.invoice_id && p.supplier_id) s -= Number(p.amount || 0);
    return s;
  }, [suppliers, invoices, allPayments, paidByInvoiceGlobal]);

  const originalPaymentAmount = editingId ? Number(allPayments.find((p) => p.id === editingId)?.amount ?? 0) : 0;
  const maxAllowed = selectedRemaining + originalPaymentAmount;
  const canSubmit = !!form.supplier_id && Number(form.amount) > 0 && (standalone ? !!form.brand_id : (!!form.invoice_id && Number(form.amount) <= maxAllowed + 0.001));

  return (
    <div className="p-6 md:p-8 space-y-6" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><HandCoins className="w-7 h-7 text-primary" /> د{tr("دفعات الموردين")}/h1>
          <p className="text-muted-foreground text-sm mt-1">{tr("سجّل دفعة لمورد — تُخصم من مديونيات المورد ومن الخزنة تلقائيًا.")}</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{tr("إجمالي المدفوع خلال الفترة")}</div>
          <div className="text-2xl font-bold mt-1 text-emerald-500">{nf(totalPeriod)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{tr("عدد الدفعات")}</div>
          <div className="text-2xl font-bold mt-1">{rows.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{tr("إجمالي مديونيات مفتوحة")}</div>
          <div className="text-2xl font-bold mt-1 text-destructive">{nf(totalOpenDebt)}</div>
        </Card>
      </div>

      {/* Inline "Add Payment" form */}
      {canWrite && (
        <Card className="p-5 border-primary/30">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {editingId ? <Pencil className="w-5 h-5 text-primary" /> : <ArrowDownCircle className="w-5 h-5 text-primary" />}
            <h2 className="text-lg font-semibold">{editingId ? `تعديل الدفعة (${editingId.slice(0,8).toUpperCase()})` : "دفعة جديدة"}</h2>
            {editingId && <Badge variant="outline" className="ms-2">{tr("وضع التعديل")}</Badge>}
            <label className="ms-auto flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={standalone} onChange={(e) => { setStandalone(e.target.checked); setForm((f) => ({ ...f, invoice_id: "", brand_id: "" })); }} />
              دفعة على المديو{tr("دفعة على المديونية (بدون تحديد فاتورة)")}label>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <Label>{tr("اسم المورد *")}</Label>
              <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v, brand_id: "", invoice_id: "", amount: 0 })}>
                <SelectTrigger><SelectValue placeholder={tr("اختر المورد")} /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {standalone && (
              <div>
                <Label>{tr("البراند *")}</Label>
                <Select value={form.brand_id} onValueChange={(v) => setForm({ ...form, brand_id: v })} disabled={!form.supplier_id}>
                  <SelectTrigger><SelectValue placeholder={form.supplier_id ? "اختر البراند" : "اختر المورد أولاً"} /></SelectTrigger>
                  <SelectContent>
                    {(brandsForSupplier.length > 0 ? brandsForSupplier : brands).map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {!standalone && (<>
            <div>
              <Label>{tr("البراند")}</Label>
              <Select value={form.brand_id || "all"} onValueChange={(v) => setForm({ ...form, brand_id: v === "all" ? "" : v, invoice_id: "", amount: 0 })} disabled={!form.supplier_id}>
                <SelectTrigger><SelectValue placeholder={form.supplier_id ? "كل البراندات" : "اختر المورد أولاً"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{tr("كل البراندات")}</SelectItem>
                  {brandsForSupplier.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{tr("الفاتورة *")}</Label>
              <Select value={form.invoice_id} onValueChange={(v) => {
                const inv = invoices.find((i) => i.id === v);
                const rem = inv ? remainingOf(inv.id, Number(inv.amount)) : 0;
                setForm({ ...form, invoice_id: v, amount: rem });
              }} disabled={!form.supplier_id}>
                <SelectTrigger><SelectValue placeholder={form.supplier_id ? "اختر فاتورة مفتوحة" : "اختر المورد أولاً"} /></SelectTrigger>
                <SelectContent>
                  {openInvoicesForFilter.map((i) => {
                    const rem = remainingOf(i.id, Number(i.amount));
                    return (
                      <SelectItem key={i.id} value={i.id}>
                        {i.issued_at} — {brandName(i.brand_id)} —{tr("— متبقي")}{nf(rem)} EGP
                      </SelectItem>
                    );
                  })}
                  {editingId && selectedInvoice && !openInvoicesForFilter.some((i) => i.id === selectedInvoice.id) && (
                    <SelectItem value={selectedInvoice.id}>
                      {selectedInvoice.issued_at} — {brandName(selectedInvoice.brand_id)} —{tr("— (فاتورة الدفعة الحالية)")}                    </SelectItem>
                  )}
                  {openInvoicesForFilter.length === 0 && !editingId && form.supplier_id && (
                    <div className="p-2 text-xs text-muted-foreground">{tr("لا فواتير مفتوحة.")}</div>
                  )}
                </SelectContent>
              </Select>
            </div>
            </>)}
            <div>
              <Label>{tr("المبلغ المدفوع *")}</Label>
              <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
              {selectedInvoice && (
                <div className="text-xs text-muted-foreground mt-1">
                  المتبقي على الفاتور{tr("المتبقي على الفاتورة:")}um font-semibold text-foreground">{nf(selectedRemaining)}</span> EGP
                  {editingId && <> —{tr("— الحد الأقصى للتعديل:")}<span className="num font-semibold text-foreground">{nf(maxAllowed)}</span> EGP</>}
                </div>
              )}
            </div>
            <div>
              <Label>{tr("تاريخ الدفع *")}</Label>
              <Input type="date" value={form.paid_at} onChange={(e) => setForm({ ...form, paid_at: e.target.value })} />
            </div>
            <div>
              <Label>{tr("ملاحظة")}</Label>
              <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={tr("اختياري")} />
            </div>
          </div>
          <div className="flex items-center justify-between mt-4 gap-3 flex-wrap">
            <p className="text-xs text-muted-foreground bg-muted/30 px-3 py-2 rounded">
              الدفعة تُسجَّل {tr("الدفعة تُسجَّل تلقائيًا في الخزنة تحت فئة «دفعات الموردين» وتُخصم من مديونيات المورد.")}p>
            <div className="flex gap-2">
              {editingId && (
                <Button variant="outline" onClick={resetForm} disabled={save.isPending} className="gap-1">
                  <X className="w-4 h-4" /> إ{tr("إلغاء التعديل")}                </Button>
              )}
              {!editingId && <Button variant="ghost" onClick={resetForm} disabled={save.isPending}>{tr("مسح")}</Button>}
              <Button onClick={() => save.mutate()} disabled={!canSubmit || save.isPending}>
                {save.isPending ? "جاري الحفظ…" : (editingId ? "حفظ التعديل" : "تسجيل الدفعة")}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Statement of Account picker */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <Label>{tr("كشف حساب مورد")}</Label>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger><SelectValue placeholder={tr("اختر المورد")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tr("— اختر المورد —")}</SelectItem>
                {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="secondary"
            disabled={supplierFilter === "all"}
            onClick={() => setStatementSupplierId(supplierFilter)}
            className="gap-1"
          >
            <ScrollText className="w-4 h-4" /> ع{tr("عرض كشف الحساب")}          </Button>
        </div>
      </Card>



      {/* Payments table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-right text-muted-foreground">
              <th className="p-3">{tr("التاريخ")}</th>
              <th className="p-3">{tr("المورد")}</th>
              <th className="p-3">{tr("البراند")}</th>
              <th className="p-3">{tr("الفاتورة")}</th>
              <th className="p-3 text-left">{tr("المبلغ")}</th>
              <th className="p-3">{tr("الخزنة")}</th>
              <th className="p-3">{tr("ملاحظة")}</th>
              <th className="p-3"></th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/40">
                  <td className="p-3 num" dir="ltr">{r.paid_at}</td>
                  <td className="p-3 font-medium">{supplierName(r.supplier_invoices?.supplier_id ?? r.supplier_id)}</td>
                  <td className="p-3">{brandName(r.supplier_invoices?.brand_id ?? supplierBrandId(r.supplier_id))}</td>
                  <td className="p-3 text-muted-foreground text-xs" dir="ltr">{(r.invoice_id ?? "").slice(0, 8)}</td>
                  <td className="p-3 num text-left font-semibold text-emerald-500">{nf(Number(r.amount))}</td>
                  <td className="p-3">
                    {r.cash_transaction_id ? <Badge variant="secondary" className="gap-1"><Wallet className="w-3 h-3" /> م{tr("مسجَّل")}/Badge> : <Badge variant="outline">—</Badge>}
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">{r.note ?? "—"}</td>
                  <td className="p-3 text-left">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon" variant="ghost" title={tr("طباعة إيصال PDF")} onClick={() => printReceipt({ id: r.id, invoice_id: r.invoice_id, amount: Number(r.amount), paid_at: r.paid_at, note: r.note })}>
                        <Printer className="w-4 h-4" />
                      </Button>
                      {canWrite && (
                        <>
                          <Button size="icon" variant="ghost" title={tr("تعديل")} onClick={() => loadForEdit({ id: r.id, invoice_id: r.invoice_id, amount: Number(r.amount), paid_at: r.paid_at, note: r.note })}>
                            <Pencil className="w-4 h-4 text-primary" />
                          </Button>
                          <Button size="icon" variant="ghost" title={tr("إلغاء / حذف")} onClick={() => setConfirmDel(r.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">{tr("لا دفعات في هذه الفترة.")}</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Full audit log — every payment ever recorded */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <ScrollText className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">{tr("السجل الكامل لكل الدفعات")}</h2>
          <Badge variant="outline" className="ms-2">{allPayments.length}</Badge>
          <div className="ms-auto text-xs text-muted-foreground">
            إجمالي المدفو{tr("إجمالي المدفوع:")}ame="num font-semibold text-emerald-500">{nf(allPayments.reduce((a, r) => a + Number(r.amount || 0), 0))}</span> EGP
          </div>
        </div>
        <PaginatedTable
          isLoading={allPaymentsQ.isLoading}
          rows={[...allPayments].sort((a, b) => (a.paid_at < b.paid_at ? 1 : -1)).map((r) => {
            const inv = invoices.find((i) => i.id === r.invoice_id);
            return {
              id: r.id,
              _raw: r,
              paid_at: r.paid_at,
              supplier: supplierName(inv?.supplier_id ?? r.supplier_id),
              brand: brandName(inv?.brand_id ?? supplierBrandId(r.supplier_id)),
              invoice_short: (r.invoice_id ?? "").slice(0, 8),
              invoice_amount: inv ? Number(inv.amount) : 0,
              invoice_issued_at: inv?.issued_at ?? "—",
              amount: Number(r.amount || 0),
              cash_linked: !!r.cash_transaction_id,
              note: r.note ?? "",
            };
          })}
          searchKeys={["supplier", "brand", "invoice_short", "note", "paid_at"]}
          columns={[
            { key: "paid_at", header: "تاريخ الدفع", render: (r) => <span className="num" dir="ltr">{r.paid_at}</span> },
            { key: "supplier", header: "المورد", render: (r) => <span className="font-medium">{r.supplier}</span> },
            { key: "brand", header: "البراند" },
            { key: "invoice_short", header: "الفاتورة", render: (r) => <span className="text-xs text-muted-foreground" dir="ltr">{r.invoice_short}</span> },
            { key: "invoice_issued_at", header: "تاريخ الفاتورة", render: (r) => <span className="num text-xs" dir="ltr">{r.invoice_issued_at}</span> },
            { key: "invoice_amount", header: "قيمة الفاتورة", render: (r) => <span className="num">{nf(r.invoice_amount)}</span> },
            { key: "amount", header: "المبلغ المدفوع", render: (r) => <span className="num font-semibold text-emerald-500">{nf(r.amount)}</span> },
            { key: "cash_linked", header: "الخزنة", render: (r) => r.cash_linked ? <Badge variant="secondary" className="gap-1"><Wallet className="w-3 h-3" /> م{tr("مسجَّل")}/Badge> : <Badge variant="outline">—</Badge> },
            { key: "note", header: "ملاحظة", render: (r) => <span className="text-xs text-muted-foreground">{r.note || "—"}</span> },
            { key: "actions", header: "", render: (r) => (
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" title={tr("طباعة إيصال PDF")} onClick={() => printReceipt({ id: r._raw.id, invoice_id: r._raw.invoice_id, amount: Number(r._raw.amount), paid_at: r._raw.paid_at, note: r._raw.note })}>
                  <Printer className="w-4 h-4" />
                </Button>
                {canWrite && (
                  <>
                    <Button size="icon" variant="ghost" title={tr("تعديل")} onClick={() => loadForEdit({ id: r._raw.id, invoice_id: r._raw.invoice_id, amount: Number(r._raw.amount), paid_at: r._raw.paid_at, note: r._raw.note })}>
                      <Pencil className="w-4 h-4 text-primary" />
                    </Button>
                    <Button size="icon" variant="ghost" title={tr("إلغاء / حذف")} onClick={() => setConfirmDel(r._raw.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </>
                )}
              </div>
            )},
          ] as Column<{ id: string; _raw: { id: string; invoice_id: string | null; amount: number; paid_at: string; note: string | null }; paid_at: string; supplier: string; brand: string; invoice_short: string; invoice_amount: number; invoice_issued_at: string; amount: number; cash_linked: boolean; note: string }>[]}
          pageSize={25}
          emptyText={tr("لا توجد دفعات مسجّلة بعد.")}
        />
      </Card>

      {/* Supplier invoices — delete */}
      {canWrite && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <ScrollText className="w-5 h-5 text-destructive" />
            <h2 className="text-lg font-semibold">{tr("فواتير الموردين — حذف")}</h2>
            <Badge variant="outline" className="ms-2">
              {invoices.filter((i) => supplierFilter === "all" || i.supplier_id === supplierFilter).length}
            </Badge>
          </div>
          <PaginatedTable
            isLoading={invoicesQ.isLoading}
            rows={invoices
              .filter((i) => supplierFilter === "all" || i.supplier_id === supplierFilter)
              .sort((a, b) => (a.issued_at < b.issued_at ? 1 : -1))
              .map((i) => ({
                id: i.id,
                issued_at: i.issued_at,
                supplier: supplierName(i.supplier_id),
                brand: brandName(i.brand_id),
                amount: Number(i.amount || 0),
                paid: paidByInvoiceGlobal.get(i.id) ?? 0,
                remaining: remainingOf(i.id, Number(i.amount)),
                status: i.status,
                note: i.note ?? "",
              }))}
            searchKeys={["supplier", "brand", "note", "issued_at"]}
            columns={[
              { key: "issued_at", header: "التاريخ", render: (r) => <span className="num" dir="ltr">{r.issued_at}</span> },
              { key: "supplier", header: "المورد", render: (r) => <span className="font-medium">{r.supplier}</span> },
              { key: "brand", header: "البراند" },
              { key: "amount", header: "قيمة الفاتورة", render: (r) => <span className="num">{nf(r.amount)}</span> },
              { key: "paid", header: "المدفوع", render: (r) => <span className="num text-emerald-500">{nf(r.paid)}</span> },
              { key: "remaining", header: "المتبقي", render: (r) => <span className="num text-destructive">{nf(r.remaining)}</span> },
              { key: "status", header: "الحالة", render: (r) => <Badge variant={r.status === "paid" ? "secondary" : "outline"}>{r.status === "paid" ? "مدفوعة" : "أجل"}</Badge> },
              { key: "actions", header: "", render: (r) => (
                <Button size="icon" variant="ghost" title={tr("حذف الفاتورة")} onClick={() => setConfirmDelInvoice(r.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              )},
            ] as Column<{ id: string; issued_at: string; supplier: string; brand: string; amount: number; paid: number; remaining: number; status: string; note: string }>[]}
            pageSize={25}
            emptyText={tr("لا فواتير.")}
          />
        </Card>
      )}

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("حذف الدفعة")}</AlertDialogTitle>
            <AlertDialogDescription>{tr("ستُلغى حركة الخزنة المرتبطة وتتحدّث حالة الفاتورة. متأكد؟")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("إلغاء")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDel && remove.mutate(confirmDel)}>{tr("حذف")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDelInvoice} onOpenChange={(o) => !o && setConfirmDelInvoice(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("حذف الفاتورة")}</AlertDialogTitle>
            <AlertDialogDescription>{tr("سيتم حذف الفاتورة وكل بنودها ودفعاتها المرتبطة وحركات الخزنة الخاصة بها. متأكد؟")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("إلغاء")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelInvoice && removeInvoice.mutate(confirmDelInvoice)}>{tr("حذف")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <StatementDialog
        supplierId={statementSupplierId}
        onClose={() => setStatementSupplierId(null)}
        supplierName={supplierName}
        brandName={brandName}
        invoices={invoices}
        payments={allPayments}
        paidByInv={paidByInvoiceGlobal}
        openingOf={(id) => Number((suppliers.find((s) => s.id === id) as { opening_balance?: number } | undefined)?.opening_balance ?? 0)}
      />
    </div>
  );
}

type StmtInvoice = { id: string; supplier_id: string; brand_id: string | null; amount: number; issued_at: string; due_at: string | null; status: "open" | "paid"; note: string | null };
type StmtPayment = { id: string; invoice_id: string | null; supplier_id: string | null; amount: number; paid_at: string; note: string | null };

function StatementDialog({
  supplierId, onClose, supplierName, brandName, invoices, payments, paidByInv, openingOf,
}: {
  supplierId: string | null;
  onClose: () => void;
  supplierName: (id: string | null | undefined) => string;
  brandName: (id: string | null | undefined) => string;
  invoices: StmtInvoice[];
  payments: StmtPayment[];
  paidByInv: Map<string, number>;
  openingOf: (id: string) => number;
}) {
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const data = useMemo(() => {
    if (!supplierId) return { rows: [] as Array<{ date: string; kind: "opening" | "invoice" | "payment"; label: string; debit: number; credit: number; balance: number }>, totals: { debit: 0, credit: 0, balance: 0 } };
    const opening = openingOf(supplierId);
    const inRange = (d: string) => (!from || d >= from) && (!to || d <= to);
    const invs = invoices.filter((i) => i.supplier_id === supplierId && inRange(i.issued_at));
    const pays = payments.filter((p) => {
      const sid = p.supplier_id ?? invoices.find((i) => i.id === p.invoice_id)?.supplier_id ?? null;
      return sid === supplierId && inRange(p.paid_at);
    });
    type Row = { date: string; kind: "opening" | "invoice" | "payment"; label: string; debit: number; credit: number; balance: number };
    const rows: Row[] = [];
    if (!from || opening !== 0) {
      rows.push({ date: from || "—", kind: "opening", label: "رصيد افتتاحي", debit: opening > 0 ? opening : 0, credit: opening < 0 ? -opening : 0, balance: opening });
    }
    const events: Array<{ date: string; kind: "invoice" | "payment"; row: StmtInvoice | StmtPayment }> = [
      ...invs.map((i) => ({ date: i.issued_at, kind: "invoice" as const, row: i })),
      ...pays.map((p) => ({ date: p.paid_at, kind: "payment" as const, row: p })),
    ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let bal = opening;
    for (const ev of events) {
      if (ev.kind === "invoice") {
        const inv = ev.row as StmtInvoice;
        bal += Number(inv.amount || 0);
        rows.push({ date: inv.issued_at, kind: "invoice", label: `فاتورة — ${brandName(inv.brand_id)} — ${inv.id.slice(0,8)}`, debit: Number(inv.amount || 0), credit: 0, balance: bal });
      } else {
        const p = ev.row as StmtPayment;
        bal -= Number(p.amount || 0);
        rows.push({ date: p.paid_at, kind: "payment", label: `دفعة${p.invoice_id ? ` — للفاتورة ${p.invoice_id.slice(0,8)}` : " — على المديونية"}${p.note ? ` — ${p.note}` : ""}`, debit: 0, credit: Number(p.amount || 0), balance: bal });
      }
    }
    const totals = rows.reduce((a, r) => ({ debit: a.debit + r.debit, credit: a.credit + r.credit, balance: bal }), { debit: 0, credit: 0, balance: bal });
    return { rows, totals };
  }, [supplierId, invoices, payments, paidByInv, openingOf, brandName, from, to]);

  const print = () => {
    if (!supplierId) return;
    const sName = supplierName(supplierId);
    const rowsHtml = data.rows.map((r) => `<tr><td>${r.date}</td><td>${r.label}</td><td class="num">${r.debit ? nf(r.debit) : "—"}</td><td class="num">${r.credit ? nf(r.credit) : "—"}</td><td class="num"><b>${nf(r.balance)}</b></td></tr>`).join("");
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><title>كشف حساب — ${sName}</title>
<style>body{font-family:Tahoma,Arial;padding:24px;color:#111}h1{margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{border:1px solid #ddd;padding:8px;text-align:right;font-size:13px}th{background:#f5f5f5}.num{text-align:left;font-variant-numeric:tabular-nums}.foot{margin-top:16px;display:flex;justify-content:space-between;font-size:12px;color:#555}@media print{.noprint{display:none}}</style></head><body>
<h1>كشف حساب مورد</h1><div>${sName}</div><div style="color:#666;font-size:13px">الفترة: ${from || "من البداية"} → ${to || "حتى الآن"}</div>
<table><thead><tr><th>التاريخ</th><th>البيان</th><th>مدين (له)</th><th>دائن (عليه)</th><th>الرصيد</th></tr></thead><tbody>${rowsHtml}
<tr><th colspan="2">الإجماليات</th><th class="num">${nf(data.totals.debit)}</th><th class="num">${nf(data.totals.credit)}</th><th class="num">${nf(data.totals.balance)}</th></tr></tbody></table>
<div class="foot"><div>e-GURUS</div><div>${new Date().toLocaleString("en-US")}</div></div>
<div class="noprint" style="text-align:center;margin-top:20px"><button onclick="window.print()">طباعة / حفظ PDF</button></div>
<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300));</script>
</body></html>`;
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) return;
    w.document.open(); w.document.write(html); w.document.close();
  };

  return (
    <Dialog open={!!supplierId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ScrollText className="w-5 h-5 text-primary" /> ك{tr("كشف حساب —")}{supplierId ? supplierName(supplierId) : ""}</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 items-end flex-wrap">
          <div><Label className="text-xs">{tr("من")}</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40 mt-1" /></div>
          <div><Label className="text-xs">{tr("إلى")}</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40 mt-1" /></div>
          {(from || to) && <Button variant="ghost" size="sm" onClick={() => { setFrom(""); setTo(""); }}>{tr("مسح")}</Button>}
          <div className="ms-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={print} className="gap-1"><Printer className="w-4 h-4" /> ط{tr("طباعة")}/Button>
          </div>
        </div>
        <div className="overflow-auto border rounded mt-2">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 sticky top-0"><tr>
              <th className="p-2 text-right">{tr("التاريخ")}</th>
              <th className="p-2 text-right">{tr("البيان")}</th>
              <th className="p-2 text-left">{tr("مدين (له)")}</th>
              <th className="p-2 text-left">{tr("دائن (عليه)")}</th>
              <th className="p-2 text-left">{tr("الرصيد")}</th>
            </tr></thead>
            <tbody>
              {data.rows.map((r, idx) => (
                <tr key={idx} className="border-t border-border/40">
                  <td className="p-2 num" dir="ltr">{r.date}</td>
                  <td className="p-2">{r.label}</td>
                  <td className="p-2 num text-left">{r.debit ? nf(r.debit) : "—"}</td>
                  <td className="p-2 num text-left text-emerald-500">{r.credit ? nf(r.credit) : "—"}</td>
                  <td className="p-2 num text-left font-semibold">{nf(r.balance)}</td>
                </tr>
              ))}
              {data.rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">{tr("لا حركات في الفترة المحددة.")}</td></tr>}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold bg-muted/30">
                <td className="p-2" colSpan={2}>{tr("الإجماليات")}</td>
                <td className="p-2 num text-left">{nf(data.totals.debit)}</td>
                <td className="p-2 num text-left text-emerald-500">{nf(data.totals.credit)}</td>
                <td className="p-2 num text-left">{nf(data.totals.balance)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
