import { tr } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Printer, MessageCircle, Search as SearchIcon, ReceiptText } from "lucide-react";
import { listBranchInvoicesForPrint, getPosInvoice } from "@/lib/pos.functions";

type PosInvoice = Awaited<ReturnType<typeof getPosInvoice>>;

export const Route = createFileRoute("/_authenticated/_app/invoice-print")({
  head: () => ({ meta: [
    { title: "طباعة الفواتير — فروع الأوفلاين" },
    { name: "description", content: "اطبع أو أرسل عبر واتساب أي فاتورة فرع خلال آخر 14 يوم" },
  ] }),
  component: InvoicePrintPage,
});

function InvoicePrintPage() {
  const listFn = useServerFn(listBranchInvoicesForPrint);
  const invFn = useServerFn(getPosInvoice);
  const [brandId, setBrandId] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [receipt, setReceipt] = useState<PosInvoice | null>(null);

  const q = useQuery({
    queryKey: ["branch-invoices-print", brandId, startDate, endDate],
    queryFn: () => listFn({ data: {
      days: 14,
      brandId: brandId === "all" ? undefined : brandId,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    } }),
  });

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    const list = q.data?.invoices ?? [];
    if (!s) return list;
    return list.filter((r) =>
      (r.customer_name ?? "").toLowerCase().includes(s) ||
      (r.customer_phone ?? "").toLowerCase().includes(s) ||
      String(r.id).toLowerCase().includes(s) ||
      (r.brand_name ?? "").toLowerCase().includes(s));
  }, [q.data, search]);

  const openInvoice = async (id: string) => {
    try { setReceipt(await invFn({ data: { id } })); }
    catch (e) { toast.error(e instanceof Error ? e.message : "تعذر فتح الفاتورة"); }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <ReceiptText className="w-6 h-6" /> {tr("طباعة الفواتير")}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {tr("فواتير الفروع خلال آخر 14 يوم — طباعة أو إرسال عبر واتساب فقط.")}
        </p>
      </div>

      <Card className="p-3 grid gap-2 md:grid-cols-4">
        <Select value={brandId} onValueChange={setBrandId}>
          <SelectTrigger><SelectValue placeholder={tr("الفرع")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tr("كل الفروع")}</SelectItem>
            {(q.data?.branches ?? []).map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} placeholder={tr("من")} />
        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder={tr("إلى")} />
        <div className="relative">
          <SearchIcon className="w-4 h-4 absolute top-1/2 -translate-y-1/2 rtl:right-3 ltr:left-3 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr("اسم العميل / الهاتف / الفرع")} className="rtl:pr-9 ltr:pl-9" />
        </div>
      </Card>

      <Card className="divide-y divide-border/60">
        {q.isLoading && <div className="p-4 text-sm text-muted-foreground">{tr("جاري التحميل...")}</div>}
        {!q.isLoading && rows.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">{tr("لا فواتير في هذه الفترة.")}</div>
        )}
        {rows.map((r) => {
          const no = `POS-${String(r.id).slice(0, 8).toUpperCase()}`;
          const when = new Date(r.created_at).toLocaleString("en-GB");
          const pay = r.payment_method === "cash" ? "كاش" : r.payment_method === "visa" ? "فيزا" : r.payment_method === "mixed" ? "مختلط" : "—";
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">
                  {r.customer_name ?? "—"}
                  <span className="text-xs text-muted-foreground" dir="ltr"> · {no}</span>
                </div>
                <div className="text-xs text-muted-foreground num" dir="ltr">
                  {when} · {r.brand_name} · {pay} · {r.customer_phone ?? ""}
                </div>
              </div>
              <div className="text-primary font-bold num">{Number(r.total_amount).toLocaleString("en-US")}</div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => openInvoice(r.id)} className="gap-1">
                  <Printer className="w-4 h-4" /> {tr("عرض / طباعة")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => openInvoice(r.id)} className="gap-1">
                  <MessageCircle className="w-4 h-4" /> {tr("واتساب")}
                </Button>
              </div>
            </div>
          );
        })}
      </Card>

      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{tr("تفاصيل الفاتورة")}</DialogTitle></DialogHeader>
          {receipt && <ReceiptView inv={receipt} />}
          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="ghost" onClick={() => setReceipt(null)}>{tr("إغلاق")}</Button>
            {receipt && (
              <>
                <Button variant="outline" onClick={() => printReceipt(receipt)} className="gap-1">
                  <Printer className="w-4 h-4" /> {tr("طباعة")}
                </Button>
                <Button onClick={() => whatsappReceipt(receipt)} className="gap-1">
                  <MessageCircle className="w-4 h-4" /> {tr("واتساب")}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReceiptView({ inv }: { inv: PosInvoice }) {
  const no = `POS-${String(inv.id).slice(0, 8).toUpperCase()}`;
  return (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between"><span className="text-muted-foreground">{tr("رقم")}</span><span dir="ltr">{no}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">{tr("الفرع")}</span><span>{inv.brand_name}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">{tr("التاريخ")}</span><span dir="ltr">{new Date(inv.created_at).toLocaleString("en-GB")}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">{tr("العميل")}</span><span>{inv.customer_name ?? "—"}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">{tr("الهاتف")}</span><span dir="ltr">{inv.customer_phone ?? "—"}</span></div>
      <table className="w-full text-xs mt-2">
        <thead><tr className="border-b"><th className="text-right p-1">{tr("الصنف")}</th><th className="p-1">{tr("كمية")}</th><th className="p-1">{tr("سعر")}</th><th className="p-1">{tr("إجمالي")}</th></tr></thead>
        <tbody>
          {inv.items.map((it) => (
            <tr key={it.id} className="border-b border-border/40">
              <td className="p-1">{it.product_name}</td>
              <td className="p-1 num text-center">{it.qty}</td>
              <td className="p-1 num text-center">{Number(it.unit_price).toLocaleString("en-US")}</td>
              <td className="p-1 num text-center">{Number(it.subtotal).toLocaleString("en-US")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="font-bold flex justify-between pt-2 border-t"><span>{tr("الإجمالي")}</span><span className="num">{Number(inv.total_amount).toLocaleString("en-US")}</span></div>
      <div className="flex justify-between text-xs">
        <Badge variant="secondary">{inv.payment_method ?? "—"}</Badge>
        <span className="num">{tr("كاش")} {Number(inv.cash_amount ?? 0).toLocaleString("en-US")} {tr("/ فيزا")} {Number(inv.card_amount ?? 0).toLocaleString("en-US")}</span>
      </div>
    </div>
  );
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function printReceipt(inv: PosInvoice) {
  const no = `POS-${String(inv.id).slice(0, 8).toUpperCase()}`;
  const w = window.open("", "_blank", "width=380,height=640");
  if (!w) return;
  const rows = inv.items.map((i) => `<tr><td>${escapeHtml(i.product_name)}</td><td class="c">${i.qty}</td><td class="r">${Number(i.unit_price).toLocaleString("en-US")}</td><td class="r">${Number(i.subtotal).toLocaleString("en-US")}</td></tr>`).join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${no}</title>
    <style>body{font-family:sans-serif;padding:10px;font-size:12px;direction:rtl}h1{font-size:16px;text-align:center;margin:4px 0}table{width:100%;border-collapse:collapse;margin-top:8px}td,th{padding:4px;border-bottom:1px dashed #999}.r{text-align:left}.c{text-align:center}.tot{font-weight:bold;font-size:14px}</style>
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

function whatsappReceipt(inv: PosInvoice) {
  const no = `POS-${String(inv.id).slice(0, 8).toUpperCase()}`;
  const lines = [
    `فاتورة ${inv.brand_name}`,
    `رقم: ${no}`,
    `التاريخ: ${new Date(inv.created_at).toLocaleString("en-GB")}`,
    `العميل: ${inv.customer_name ?? ""}`,
    "",
    ...inv.items.map((it) => `- ${it.product_name} × ${it.qty} = ${Number(it.subtotal).toLocaleString("en-US")}`),
    "",
    `الإجمالي: ${Number(inv.total_amount).toLocaleString("en-US")}`,
    `الدفع: ${inv.payment_method ?? ""}`,
  ].join("\n");
  const phone = String(inv.customer_phone ?? "").replace(/\D/g, "");
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(lines)}`
    : `https://wa.me/?text=${encodeURIComponent(lines)}`;
  window.open(url, "_blank", "noopener");
}