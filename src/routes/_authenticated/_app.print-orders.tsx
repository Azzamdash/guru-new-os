import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Printer, Loader2 } from "lucide-react";
import { fetchOrderShippingLabel, listPrintableOrders } from "@/lib/shipping-labels.functions";
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
        content: "طباعة بوليصة الشحن من داخل السيستم بدل الدخول على موقع شركة الشحن.",
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
  bosta_delivery_id: string | null;
  bosta_sent_at: string | null;
  courier_id: string | null;
  couriers: { name: string } | null;
};

// Bosta's AWB response body is opened as a Blob object URL (not a data: URL)
// so a multi-MB PDF doesn't get inflated ~33% into the address bar and hit a
// browser length cap.
function openLabel(result: { kind: "pdf"; base64: string } | { kind: "url"; url: string }) {
  if (result.kind === "url") {
    window.open(result.url, "_blank", "noopener,noreferrer");
    return;
  }
  const bytes = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));
  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  window.open(blobUrl, "_blank", "noopener,noreferrer");
  // The opened tab has already started loading the blob; free it shortly after
  // rather than immediately, so the navigation isn't racing the revoke.
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

function PrintOrdersPage() {
  const listFn = useServerFn(listPrintableOrders);
  const labelFn = useServerFn(fetchOrderShippingLabel);
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

  const printOne = useMutation({
    mutationFn: (orderId: string) => labelFn({ data: { orderId } }),
    onSuccess: (result) => openLabel(result),
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const printSelected = async () => {
    if (!selected.size) return;
    setBulkPrinting(true);
    let failed = 0;
    for (const id of selected) {
      try {
        const result = await labelFn({ data: { orderId: id } });
        openLabel(result);
      } catch (e) {
        failed += 1;
        toast.error(`تعذر طباعة أوردر: ${(e as Error).message}`);
      }
    }
    setBulkPrinting(false);
    if (!failed) toast.success(`اتفتحت ${selected.size} بوليصة في تابات جديدة`);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">طباعة الأوردرات</h1>
        <p className="text-sm text-muted-foreground">
          بوليصة الشحن الأصلية من بوسطة — تتفتح في تاب جديد جاهزة للطباعة.
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

      {/* Browsers can block several tabs opening back-to-back — this is a
          known limitation of the new-tab approach, surfaced up front rather
          than debugged blind after a silent popup block. */}
      {selected.size > 1 ? (
        <p className="text-xs text-muted-foreground">
          لو المتصفح منع فتح التابات، فعّل السماح بالنوافذ المنبثقة (popups) لهذا الموقع.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>أوردرات متسندة لبوسطة ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">جاري التحميل…</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground">مفيش أوردرات متسندة لبوسطة حاليًا.</p>
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
                      <td className="py-2 pl-3 font-mono">{r.bosta_tracking ?? "—"}</td>
                      <td className="py-2 pl-3">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={printingId === r.id}
                          onClick={async () => {
                            setPrintingId(r.id);
                            try {
                              await printOne.mutateAsync(r.id);
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
