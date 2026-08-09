import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import JsBarcode from "jsbarcode";
import { Printer, Loader2 } from "lucide-react";
import {
  getOrderLabelsData,
  listPrintableOrders,
  type OrderLabelData,
} from "@/lib/shipping-labels.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/_app/print-orders")({
  component: PrintOrdersPage,
  head: () => ({
    meta: [
      { title: "طباعة الأوردرات · e-Gurus" },
      {
        name: "description",
        content: "طباعة بوليصة شحن من داخل السيستم لكل أوردر متسند لشركة شحن.",
      },
    ],
  }),
});

type PrintableOrder = {
  id: string;
  brand_id: string;
  external_order_number: string | null;
  customer_name: string | null;
  shipping_governorate: string | null;
  bosta_tracking: string | null;
  dispatch_tracking: string | null;
  updated_at: string;
  courier_id: string | null;
  couriers: { name: string } | null;
};

const POPUP_BLOCKED_MESSAGE =
  "المتصفح منع فتح نافذة الطباعة — فعّل السماح بالنوافذ المنبثقة (popups) لهذا الموقع";

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

/** Renders a Code128 barcode to a PNG data URL via a detached canvas. */
function barcodeDataUrl(value: string): string | null {
  if (!value) return null;
  const canvas = document.createElement("canvas");
  try {
    JsBarcode(canvas, value, {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      height: 60,
    });
    return canvas.toDataURL("image/png");
  } catch {
    // A tracking string outside Code128B's printable-ASCII range would throw —
    // print the label without a barcode rather than fail the whole action.
    return null;
  }
}

function labelHtml(label: OrderLabelData): string {
  const barcode = barcodeDataUrl(label.trackingNumber);
  const itemsRows = label.items.length
    ? label.items.map((i) => `${i.qty}x ${escapeHtml(i.title)}`).join("<br/>")
    : "—";
  const addressParts = [
    label.address,
    label.buildingNumber ? `مبنى ${label.buildingNumber}` : null,
    label.floorNumber ? `دور ${label.floorNumber}` : null,
    label.apartmentNumber ? `شقة ${label.apartmentNumber}` : null,
  ]
    .filter(Boolean)
    .map((p) => escapeHtml(String(p)))
    .join(" - ");

  return `
  <section class="label">
    <div class="row header">
      <div class="brand">${escapeHtml(label.brandName || "—")}</div>
      <div class="courier">${escapeHtml(label.courierName || "—")}</div>
    </div>
    ${
      barcode
        ? `<div class="barcode"><img src="${barcode}" alt="${escapeHtml(label.trackingNumber)}" /><div class="tracking-no">${escapeHtml(label.trackingNumber)}</div></div>`
        : `<div class="tracking-no big">${escapeHtml(label.trackingNumber || "—")}</div>`
    }
    <div class="cod">مبلغ التحصيل: <b>${label.cod.toLocaleString("ar-EG")} ${escapeHtml(label.currency)}</b></div>
    <div class="box">
      <div class="section-title">توصيل إلى</div>
      <div class="customer-name">${escapeHtml(label.customerName || "—")}</div>
      <div class="customer-phone">${escapeHtml(label.customerPhone || "—")}</div>
      <div class="governorate">${escapeHtml(label.governorate || "—")}</div>
      <div class="address">${addressParts || "—"}</div>
    </div>
    <div class="box">
      <div class="section-title">وصف الشحنة</div>
      <div class="items">${itemsRows}</div>
    </div>
    ${label.note ? `<div class="box"><div class="section-title">ملاحظات</div><div>${escapeHtml(label.note)}</div></div>` : ""}
    <div class="order-no">Order #${escapeHtml(label.orderNumber)}</div>
  </section>`;
}

/**
 * Opens the popup synchronously, before any async work — window.open() only
 * counts as a direct response to the user's click (and skips the popup
 * blocker) if it runs on the same tick as the click handler. Calling it
 * after an `await` (e.g. once the label data has been fetched) is exactly
 * what silently trips the blocker, no matter what the site's popup
 * permission is set to.
 */
function openPrintWindow(): Window | null {
  const w = window.open("", "_blank", "width=420,height=680");
  if (w) {
    w.document.write(
      `<!doctype html><html dir="rtl" lang="ar"><body style="font-family:Tahoma,Arial,sans-serif;padding:16px;color:#666">جاري تجهيز البوليصة…</body></html>`,
    );
  }
  return w;
}

function writeLabelsToWindow(w: Window, labels: OrderLabelData[]) {
  const body = labels.map(labelHtml).join("\n");
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>بوليصة شحن</title>
<style>
  @page { size: 100mm 150mm; margin: 5mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Tahoma', 'Arial', sans-serif; color:#111; font-size: 12px; line-height: 1.5; }
  .label { padding: 6px; page-break-after: always; }
  .label:last-child { page-break-after: auto; }
  .row.header { display:flex; justify-content: space-between; align-items:center; border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 8px; }
  .brand { font-size: 18px; font-weight: 800; }
  .courier { font-size: 12px; color:#444; font-weight: 700; }
  .barcode { text-align: center; margin: 6px 0 10px; }
  .barcode img { max-width: 100%; height: 55px; }
  .tracking-no { text-align:center; font-family: 'Consolas','Menlo',monospace; letter-spacing: 1px; margin-top: 2px; }
  .tracking-no.big { font-size: 20px; font-weight: 800; margin: 12px 0; }
  .cod { text-align:center; font-size: 15px; border: 2px solid #111; border-radius: 4px; padding: 6px; margin-bottom: 8px; }
  .box { border: 1px dashed #999; border-radius: 4px; padding: 6px 8px; margin-bottom: 8px; }
  .section-title { font-size: 10px; color:#666; font-weight: 700; margin-bottom: 3px; }
  .customer-name { font-size: 14px; font-weight: 800; }
  .customer-phone { font-family: 'Consolas','Menlo',monospace; direction: ltr; text-align: right; }
  .order-no { text-align:center; font-size: 10px; color:#666; margin-top: 4px; }
  @media print { body { padding: 0; } }
</style></head><body>${body}
<script>window.onload = () => { window.print(); }</script>
</body></html>`;
  // Explicitly reopen the document stream rather than relying on write()'s
  // implicit re-open — the placeholder page's parse has already finished by
  // the time this runs, so an implicit open works in practice, but it's not
  // worth trusting across browsers when open() is one explicit call away.
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function PrintOrdersPage() {
  const listFn = useServerFn(listPrintableOrders);
  const labelsFn = useServerFn(getOrderLabelsData);
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [bulkPrinting, setBulkPrinting] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["printable-orders", applied],
    queryFn: () => listFn({ data: { search: applied || undefined } }),
  });
  const rows = (data ?? []) as PrintableOrder[];

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const printOrders = async (orderIds: string[], w: Window) => {
    try {
      const labels = await labelsFn({ data: { orderIds } });
      writeLabelsToWindow(w, labels);
    } catch (e) {
      w.close();
      toast.error((e as Error).message);
    }
  };

  const printSelected = async () => {
    if (!selected.size) return;
    const w = openPrintWindow();
    if (!w) {
      toast.error(POPUP_BLOCKED_MESSAGE);
      return;
    }
    setBulkPrinting(true);
    await printOrders([...selected], w);
    setBulkPrinting(false);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">طباعة الأوردرات</h1>
        <p className="text-sm text-muted-foreground">
          بوليصة شحن مُولَّدة من بيانات السيستم — بها باركود رقم التتبع، جاهزة للطباعة مباشرة.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-4">
          <Input
            placeholder="دور برقم الأوردر / رقم التتبع / اسم العميل"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Button onClick={() => setApplied(search)}>بحث</Button>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            تحديث
          </Button>
          <div className="flex-1" />
          <Button onClick={printSelected} disabled={!selected.size || bulkPrinting}>
            {bulkPrinting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Printer className="size-4" />
            )}
            طباعة المحدد ({selected.size})
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>أوردرات متسندة لشركة شحن ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">جاري التحميل…</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground">مفيش أوردرات متسندة لشركة شحن حاليًا.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-right text-muted-foreground">
                  <tr>
                    <th className="py-2 pl-3 w-8"></th>
                    <th className="py-2 pl-3">الأوردر</th>
                    <th className="py-2 pl-3">العميل</th>
                    <th className="py-2 pl-3">المحافظة</th>
                    <th className="py-2 pl-3">شركة الشحن</th>
                    <th className="py-2 pl-3">رقم التتبع</th>
                    <th className="py-2 pl-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t align-middle">
                      <td className="py-2 pl-3">
                        <Checkbox
                          checked={selected.has(r.id)}
                          onCheckedChange={() => toggle(r.id)}
                        />
                      </td>
                      <td className="py-2 pl-3 font-mono">{r.external_order_number ?? r.id}</td>
                      <td className="py-2 pl-3">{r.customer_name ?? "—"}</td>
                      <td className="py-2 pl-3">{r.shipping_governorate ?? "—"}</td>
                      <td className="py-2 pl-3">{r.couriers?.name ?? "—"}</td>
                      <td className="py-2 pl-3 font-mono">
                        {r.bosta_tracking ?? r.dispatch_tracking ?? "—"}
                      </td>
                      <td className="py-2 pl-3">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={printingId === r.id}
                          onClick={async () => {
                            const w = openPrintWindow();
                            if (!w) {
                              toast.error(POPUP_BLOCKED_MESSAGE);
                              return;
                            }
                            setPrintingId(r.id);
                            try {
                              await printOrders([r.id], w);
                            } finally {
                              setPrintingId(null);
                            }
                          }}
                        >
                          {printingId === r.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Printer className="size-4" />
                          )}
                          طباعة
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
