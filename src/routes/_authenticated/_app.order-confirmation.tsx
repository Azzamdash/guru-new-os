import { tr } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhoneCall, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { listBrands } from "@/lib/internal.functions";
import { getConfirmationQueue, recordConfirmation } from "@/lib/orders-ops.functions";
import { CONFIRMATION_OUTCOMES } from "@/lib/orders-ops.shared";

export const Route = createFileRoute("/_authenticated/_app/order-confirmation")({
  head: () => ({
    meta: [
      { title: "تأكيد الأوردرات — e-GURUS" },
      { name: "description", content: "طابور تأكيد الأوردرات بالمكالمات والواتساب قبل الشحن مع تسجيل أسباب الإلغاء." },
      { property: "og:title", content: "تأكيد الأوردرات — e-GURUS" },
      { property: "og:description", content: "طابور تأكيد الأوردرات قبل الشحن." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrderConfirmationPage,
});

const money = (n: number) => `${Math.round(n).toLocaleString("en-US")} ج`;

function OrderConfirmationPage() {
  const qc = useQueryClient();
  const brandsFn = useServerFn(listBrands);
  const queueFn = useServerFn(getConfirmationQueue);
  const recordFn = useServerFn(recordConfirmation);

  const [brandId, setBrandId] = useState("all");
  const [status, setStatus] = useState("queue");
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => brandsFn() });
  const params = {
    brandId: brandId === "all" ? null : brandId,
    status: status === "queue" ? "queue" : status,
    search: search.trim() || null,
  };
  const queueQ = useQuery({
    queryKey: ["confirmation-queue", params],
    queryFn: () => queueFn({ data: params }),
    staleTime: 30_000,
  });

  const recordM = useMutation({
    mutationFn: (v: { orderId: string; outcome: "confirmed" | "cancelled" | "unreachable" | "postponed" }) =>
      recordFn({ data: { ...v, reason: reason.trim() || null, channel: "call" } }),
    onSuccess: () => {
      toast.success(tr("تم تسجيل نتيجة التأكيد"));
      setReason("");
      setActiveId(null);
      qc.invalidateQueries({ queryKey: ["confirmation-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = queueQ.data ?? [];

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <PhoneCall className="h-5 w-5 text-primary" /> {tr("تأكيد الأوردرات")}
        </h1>
        <Button variant="outline" size="sm" onClick={() => queueQ.refetch()}>
          <RefreshCw className="ml-1 h-4 w-4" /> {tr("تحديث")}
        </Button>
      </div>

      <Card className="flex flex-wrap items-center gap-2 p-3">
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
            <SelectItem value="queue">{tr("طابور التأكيد")}</SelectItem>
            <SelectItem value="pending">{tr("جديد")}</SelectItem>
            <SelectItem value="unreachable">{tr("لا يرد")}</SelectItem>
            <SelectItem value="postponed">{tr("مؤجل")}</SelectItem>
            <SelectItem value="confirmed">{tr("مؤكد")}</SelectItem>
            <SelectItem value="all">{tr("الكل")}</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr("رقم الأوردر / العميل / الهاتف")} className="pr-8" />
        </div>
        <Badge variant="secondary">{rows.length} {tr("أوردر")}</Badge>
      </Card>

      <div className="space-y-2">
        {queueQ.isLoading && <Card className="p-6 text-center text-muted-foreground">{tr("جارِ التحميل…")}</Card>}
        {!queueQ.isLoading && rows.length === 0 && (
          <Card className="p-6 text-center text-muted-foreground">{tr("لا توجد أوردرات في الطابور")}</Card>
        )}
        {rows.map((o) => (
          <Card key={o.id} className="p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Link to="/order-view/$id" params={{ id: o.id }} className="font-semibold text-primary hover:underline">
                #{o.number ?? o.id.slice(0, 8)}
              </Link>
              <span className="text-sm">{o.customer_name ?? "—"}</span>
              <span dir="ltr" className="text-sm text-muted-foreground">{o.customer_phone ?? "—"}</span>
              <Badge variant="outline">{o.governorate ?? "بدون محافظة"}</Badge>
              <Badge>{money(o.total_amount)}</Badge>
              {o.attempts > 0 && <Badge variant="secondary">{tr("محاولات:")} {o.attempts}</Badge>}
              <Badge variant={o.confirmation_status === "confirmed" ? "default" : "outline"}>
                {o.confirmation_status}
              </Badge>
              <div className="ms-auto flex gap-1">
                <Button size="sm" variant={activeId === o.id ? "secondary" : "outline"} onClick={() => setActiveId(activeId === o.id ? null : o.id)}>
                  {tr("تسجيل نتيجة")}
                </Button>
              </div>
            </div>
            {activeId === o.id && (
              <div className="mt-3 space-y-2 border-t pt-3">
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr("السبب / ملاحظة (اختياري)")} rows={2} />
                <div className="flex flex-wrap gap-2">
                  {CONFIRMATION_OUTCOMES.map((oc) => (
                    <Button
                      key={oc.key}
                      size="sm"
                      variant={oc.key === "confirmed" ? "default" : oc.key === "cancelled" ? "destructive" : "outline"}
                      disabled={recordM.isPending}
                      onClick={() => recordM.mutate({ orderId: o.id, outcome: oc.key })}
                    >
                      {oc.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
