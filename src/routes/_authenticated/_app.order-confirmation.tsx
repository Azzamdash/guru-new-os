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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PhoneCall, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { listBrands } from "@/lib/internal.functions";
import { getConfirmationQueue, recordConfirmation } from "@/lib/orders-ops.functions";
import { CONFIRMATION_OUTCOMES } from "@/lib/orders-ops.shared";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/order-confirmation")({
  head: () => ({
    meta: [
      { title: "تأكيد الأوردرات — e-GURUS" },
      {
        name: "description",
        content: "طابور تأكيد الأوردرات بالمكالمات والواتساب قبل الشحن مع تسجيل أسباب الإلغاء.",
      },
      { property: "og:title", content: "تأكيد الأوردرات — e-GURUS" },
      { property: "og:description", content: "طابور تأكيد الأوردرات قبل الشحن." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrderConfirmationPage,
});

const money = (n: number, lang: "ar" | "en" = "ar") =>
  `${Math.round(n).toLocaleString("en-US")} ${lang === "ar" ? "ج" : "EGP"}`;

function OrderConfirmationPage() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
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
    mutationFn: (v: {
      orderId: string;
      outcome: "confirmed" | "cancelled" | "unreachable" | "postponed";
    }) => recordFn({ data: { ...v, reason: reason.trim() || null, channel: "call" } }),
    onSuccess: () => {
      toast.success(T("تم تسجيل نتيجة التأكيد", "Confirmation result recorded"));
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
          <PhoneCall className="h-5 w-5 text-primary" />{" "}
          {T("تأكيد الأوردرات", "Order Confirmation")}
        </h1>
        <Button variant="outline" size="sm" onClick={() => queueQ.refetch()}>
          <RefreshCw className="ml-1 h-4 w-4" /> {T("تحديث", "Refresh")}
        </Button>
      </div>

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <Select value={brandId} onValueChange={setBrandId}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder={T("البراند", "Brand")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{T("كل البراندات", "All brands")}</SelectItem>
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
            <SelectItem value="queue">{T("طابور التأكيد", "Confirmation queue")}</SelectItem>
            <SelectItem value="pending">{T("جديد", "New")}</SelectItem>
            <SelectItem value="unreachable">{T("لا يرد", "Unreachable")}</SelectItem>
            <SelectItem value="postponed">{T("مؤجل", "Postponed")}</SelectItem>
            <SelectItem value="confirmed">{T("مؤكد", "Confirmed")}</SelectItem>
            <SelectItem value="all">{T("الكل", "All")}</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={T("رقم الأوردر / العميل / الهاتف", "Order number / customer / phone")}
            className="pr-8"
          />
        </div>
        <Badge variant="secondary">
          {rows.length} {T("أوردر", "orders")}
        </Badge>
      </Card>

      <div className="space-y-2">
        {queueQ.isLoading && (
          <Card className="p-6 text-center text-muted-foreground">
            {T("جارِ التحميل…", "Loading…")}
          </Card>
        )}
        {!queueQ.isLoading && rows.length === 0 && (
          <Card className="p-6 text-center text-muted-foreground">
            {T("لا توجد أوردرات في الطابور", "No orders in the queue")}
          </Card>
        )}
        {rows.map((o) => (
          <Card key={o.id} className="p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/order-view/$id"
                params={{ id: o.id }}
                className="font-semibold text-primary hover:underline"
              >
                #{o.number ?? o.id.slice(0, 8)}
              </Link>
              <span className="text-sm">{o.customer_name ?? "—"}</span>
              <span dir="ltr" className="text-sm text-muted-foreground">
                {o.customer_phone ?? "—"}
              </span>
              <Badge variant="outline">{o.governorate ?? T("بدون محافظة", "No governorate")}</Badge>
              <Badge>{money(o.total_amount, lang)}</Badge>
              {o.attempts > 0 && (
                <Badge variant="secondary">
                  {T("محاولات", "Attempts")}: {o.attempts}
                </Badge>
              )}
              <Badge variant={o.confirmation_status === "confirmed" ? "default" : "outline"}>
                {o.confirmation_status}
              </Badge>
              <div className="ms-auto flex gap-1">
                <Button
                  size="sm"
                  variant={activeId === o.id ? "secondary" : "outline"}
                  onClick={() => setActiveId(activeId === o.id ? null : o.id)}
                >
                  {T("تسجيل نتيجة", "Record result")}
                </Button>
              </div>
            </div>
            {activeId === o.id && (
              <div className="mt-3 space-y-2 border-t pt-3">
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={T("السبب / ملاحظة (اختياري)", "Reason / note (optional)")}
                  rows={2}
                />
                <div className="flex flex-wrap gap-2">
                  {CONFIRMATION_OUTCOMES.map((oc) => (
                    <Button
                      key={oc.key}
                      size="sm"
                      variant={
                        oc.key === "confirmed"
                          ? "default"
                          : oc.key === "cancelled"
                            ? "destructive"
                            : "outline"
                      }
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
