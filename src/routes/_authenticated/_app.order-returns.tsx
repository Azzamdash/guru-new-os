import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PackageX, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { listBrands } from "@/lib/internal.functions";
import { advanceReturn, createReturn, listReturns } from "@/lib/orders-ops.functions";
import { RETURN_STATUS_LABELS } from "@/lib/orders-ops.shared";

export const Route = createFileRoute("/_authenticated/_app/order-returns")({
  head: () => ({
    meta: [
      { title: "المرتجعات والاستبدال — e-GURUS" },
      {
        name: "description",
        content: "دورة كاملة للمرتجعات: طلب، استلام، إرجاع للمخزون، ورد المبلغ للعميل.",
      },
      { property: "og:title", content: "المرتجعات والاستبدال — e-GURUS" },
      { property: "og:description", content: "إدارة مرتجعات واستبدالات الأوردرات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrderReturnsPage,
});

function OrderReturnsPage() {
  const { lang } = useLang();
  const money = (n: number) =>
    `${Math.round(n).toLocaleString("en-US")} ${lang === "ar" ? "ج" : "EGP"}`;
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
      toast.success(lang === "ar" ? "تم فتح طلب المرتجع" : "Return request opened");
      setNewOrderId("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const advanceM = useMutation({
    mutationFn: (v: {
      returnId: string;
      action: "receive" | "restock" | "refund" | "close" | "cancel";
      refundAmount?: number;
    }) => advanceFn({ data: v }),
    onSuccess: () => {
      toast.success(lang === "ar" ? "تم تحديث حالة المرتجع" : "Return status updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = listQ.data ?? [];

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <PackageX className="h-5 w-5 text-primary" />{" "}
          {lang === "ar" ? "المرتجعات والاستبدال" : "Returns & Exchanges"}
        </h1>
        <Button variant="outline" size="sm" onClick={() => listQ.refetch()}>
          <RefreshCw className="ml-1 h-4 w-4" /> {lang === "ar" ? "تحديث" : "Refresh"}
        </Button>
      </div>

      <Card className="flex flex-wrap items-end gap-2 p-3">
        <Select value={brandId} onValueChange={setBrandId}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder={lang === "ar" ? "البراند" : "Brand"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === "ar" ? "كل البراندات" : "All Brands"}</SelectItem>
            {(brandsQ.data ?? []).map((b: { id: string; name: string }) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === "ar" ? "كل الحالات" : "All Statuses"}</SelectItem>
            {Object.entries(RETURN_STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ms-auto flex items-center gap-2">
          <Input
            value={newOrderId}
            onChange={(e) => setNewOrderId(e.target.value)}
            placeholder={lang === "ar" ? "معرّف الأوردر (UUID)" : "Order ID (UUID)"}
            className="w-64"
          />
          <Button
            size="sm"
            disabled={!newOrderId.trim() || createM.isPending}
            onClick={() => createM.mutate("return")}
          >
            {lang === "ar" ? "مرتجع" : "Return"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!newOrderId.trim() || createM.isPending}
            onClick={() => createM.mutate("exchange")}
          >
            {lang === "ar" ? "استبدال" : "Exchange"}
          </Button>
        </div>
      </Card>

      <div className="space-y-2">
        {listQ.isLoading && (
          <Card className="p-6 text-center text-muted-foreground">
            {lang === "ar" ? "جارِ التحميل…" : "Loading…"}
          </Card>
        )}
        {!listQ.isLoading && rows.length === 0 && (
          <Card className="p-6 text-center text-muted-foreground">
            {lang === "ar" ? "لا توجد مرتجعات" : "No returns found"}
          </Card>
        )}
        {rows.map((r) => (
          <Card key={r.id} className="space-y-2 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/order-view/$id"
                params={{ id: r.order_id }}
                className="font-semibold text-primary hover:underline"
              >
                #{r.order_number ?? r.order_id.slice(0, 8)}
              </Link>
              <Badge variant="outline">
                {r.kind === "exchange"
                  ? lang === "ar"
                    ? "استبدال"
                    : "Exchange"
                  : lang === "ar"
                    ? "مرتجع"
                    : "Return"}
              </Badge>
              <Badge>{RETURN_STATUS_LABELS[r.status] ?? r.status}</Badge>
              <span className="text-sm">{r.customer_name ?? "—"}</span>
              <span className="text-sm text-muted-foreground">
                {lang === "ar" ? "قيمة الأوردر:" : "Order value:"} {money(r.order_total)}
              </span>
              {r.restocked && (
                <Badge variant="secondary">{lang === "ar" ? "رجع للمخزون" : "Restocked"}</Badge>
              )}
              {r.refund_amount > 0 && (
                <Badge variant="secondary">
                  {lang === "ar" ? "استرداد" : "Refund"} {money(r.refund_amount)}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={r.status !== "requested"}
                onClick={() => advanceM.mutate({ returnId: r.id, action: "receive" })}
              >
                {lang === "ar" ? "استلام" : "Receive"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={r.restocked || r.status === "requested"}
                onClick={() => advanceM.mutate({ returnId: r.id, action: "restock" })}
              >
                {lang === "ar" ? "إرجاع للمخزون" : "Restock"}
              </Button>
              <Input
                className="w-32"
                type="number"
                placeholder={lang === "ar" ? "مبلغ الاسترداد" : "Refund amount"}
                value={refundInputs[r.id] ?? ""}
                onChange={(e) => setRefundInputs((p) => ({ ...p, [r.id]: e.target.value }))}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!Number(refundInputs[r.id] ?? 0)}
                onClick={() =>
                  advanceM.mutate({
                    returnId: r.id,
                    action: "refund",
                    refundAmount: Number(refundInputs[r.id]),
                  })
                }
              >
                {lang === "ar" ? "تسجيل استرداد" : "Record Refund"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={r.status === "closed"}
                onClick={() => advanceM.mutate({ returnId: r.id, action: "close" })}
              >
                {lang === "ar" ? "إقفال" : "Close"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => advanceM.mutate({ returnId: r.id, action: "cancel" })}
              >
                {lang === "ar" ? "إلغاء" : "Cancel"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
