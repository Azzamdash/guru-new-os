import { tr } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PackageX, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { listBrands } from "@/lib/internal.functions";
import { advanceReturn, createReturn, listReturns } from "@/lib/orders-ops.functions";
import { RETURN_STATUS_LABELS } from "@/lib/orders-ops.shared";

export const Route = createFileRoute("/_authenticated/_app/order-returns")({
  head: () => ({
    meta: [
      { title: "المرتجعات والاستبدال — e-GURUS" },
      { name: "description", content: "دورة كاملة للمرتجعات: طلب، استلام، إرجاع للمخزون، ورد المبلغ للعميل." },
      { property: "og:title", content: "المرتجعات والاستبدال — e-GURUS" },
      { property: "og:description", content: "إدارة مرتجعات واستبدالات الأوردرات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrderReturnsPage,
});

const money = (n: number) => `${Math.round(n).toLocaleString("en-US")} ج`;

function OrderReturnsPage() {
  const qc = useQueryClient();
  const brandsFn = useServerFn(listBrands);
  const listFn = useServerFn(listReturns);
  const createFn = useServerFn(createReturn);
  const advanceFn = useServerFn(advanceReturn);

  const [brandId, setBrandId] = useState("all");
  const [status, setStatus] = useState("all");
  const [newOrderId, setNewOrderId] = useState("");
  const [refundInputs, setRefundInputs] = useState<Record<string, string>>({});

  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => brandsFn() });
  const params = { brandId: brandId === "all" ? null : brandId, status };
  const listQ = useQuery({
    queryKey: ["order-returns", params],
    queryFn: () => listFn({ data: params }),
    staleTime: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["order-returns"] });

  const createM = useMutation({
    mutationFn: (kind: "return" | "exchange") =>
      createFn({ data: { orderId: newOrderId.trim(), kind } }),
    onSuccess: () => {
      toast.success(tr("تم فتح طلب المرتجع"));
      setNewOrderId("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const advanceM = useMutation({
    mutationFn: (v: { returnId: string; action: "receive" | "restock" | "refund" | "close" | "cancel"; refundAmount?: number }) =>
      advanceFn({ data: v }),
    onSuccess: () => {
      toast.success(tr("تم تحديث حالة المرتجع"));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = listQ.data ?? [];

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <PackageX className="h-5 w-5 text-primary" /> {tr("المرتجعات والاستبدال")}
        </h1>
        <Button variant="outline" size="sm" onClick={() => listQ.refetch()}>
          <RefreshCw className="ml-1 h-4 w-4" /> {tr("تحديث")}
        </Button>
      </div>

      <Card className="flex flex-wrap items-end gap-2 p-3">
        <Select value={brandId} onValueChange={setBrandId}>
          <SelectTrigger className="w-44"><SelectValue placeholder={tr("البراند")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tr("كل البراندات")}</SelectItem>
            {(brandsQ.data ?? []).map((b: { id: string; name: string }) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tr("كل الحالات")}</SelectItem>
            {Object.entries(RETURN_STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ms-auto flex items-center gap-2">
          <Input
            value={newOrderId}
            onChange={(e) => setNewOrderId(e.target.value)}
            placeholder={tr("معرّف الأوردر (UUID)")}
            className="w-64"
          />
          <Button size="sm" disabled={!newOrderId.trim() || createM.isPending} onClick={() => createM.mutate("return")}>
            {tr("مرتجع")}
          </Button>
          <Button size="sm" variant="outline" disabled={!newOrderId.trim() || createM.isPending} onClick={() => createM.mutate("exchange")}>
            {tr("استبدال")}
          </Button>
        </div>
      </Card>

      <div className="space-y-2">
        {listQ.isLoading && <Card className="p-6 text-center text-muted-foreground">{tr("جارِ التحميل…")}</Card>}
        {!listQ.isLoading && rows.length === 0 && (
          <Card className="p-6 text-center text-muted-foreground">{tr("لا توجد مرتجعات")}</Card>
        )}
        {rows.map((r) => (
          <Card key={r.id} className="space-y-2 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Link to="/order-view/$id" params={{ id: r.order_id }} className="font-semibold text-primary hover:underline">
                #{r.order_number ?? r.order_id.slice(0, 8)}
              </Link>
              <Badge variant="outline">{r.kind === "exchange" ? "استبدال" : "مرتجع"}</Badge>
              <Badge>{RETURN_STATUS_LABELS[r.status] ?? r.status}</Badge>
              <span className="text-sm">{r.customer_name ?? "—"}</span>
              <span className="text-sm text-muted-foreground">{tr("قيمة الأوردر:")} {money(r.order_total)}</span>
              {r.restocked && <Badge variant="secondary">{tr("رجع للمخزون")}</Badge>}
              {r.refund_amount > 0 && <Badge variant="secondary">{tr("استرداد")} {money(r.refund_amount)}</Badge>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" disabled={r.status !== "requested"} onClick={() => advanceM.mutate({ returnId: r.id, action: "receive" })}>
                {tr("استلام")}
              </Button>
              <Button size="sm" variant="outline" disabled={r.restocked || r.status === "requested"} onClick={() => advanceM.mutate({ returnId: r.id, action: "restock" })}>
                {tr("إرجاع للمخزون")}
              </Button>
              <Input
                className="w-32"
                type="number"
                placeholder={tr("مبلغ الاسترداد")}
                value={refundInputs[r.id] ?? ""}
                onChange={(e) => setRefundInputs((p) => ({ ...p, [r.id]: e.target.value }))}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!Number(refundInputs[r.id] ?? 0)}
                onClick={() => advanceM.mutate({ returnId: r.id, action: "refund", refundAmount: Number(refundInputs[r.id]) })}
              >
                {tr("تسجيل استرداد")}
              </Button>
              <Button size="sm" variant="secondary" disabled={r.status === "closed"} onClick={() => advanceM.mutate({ returnId: r.id, action: "close" })}>
                {tr("إقفال")}
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => advanceM.mutate({ returnId: r.id, action: "cancel" })}>
                {tr("إلغاء")}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
