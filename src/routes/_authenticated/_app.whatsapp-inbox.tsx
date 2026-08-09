import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageCircle, Send, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { queryPresets } from "@/lib/query-presets";
import { listBrands } from "@/lib/internal.functions";
import {
  listWhatsappThreads,
  getWhatsappThread,
  sendWhatsappMessage,
  startWhatsappThread,
  linkThreadToOrder,
} from "@/lib/orders-management.functions";
import { getOrder } from "@/lib/orders.functions";
import { OrderSearchCombobox } from "@/components/orders/OrderSearchCombobox";
import { useLang } from "@/lib/i18n";
import { useOrderTimeline } from "@/lib/order-timeline.shared";

export const Route = createFileRoute("/_authenticated/_app/whatsapp-inbox")({
  head: () => ({
    meta: [
      { title: "واتساب — e-GURUS" },
      {
        name: "description",
        content: "صندوق محادثات واتساب: إرسال، استقبال، وربط المحادثات بالأوردرات.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Page,
});

const nf = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium break-words">{value}</div>
    </div>
  );
}

function Page() {
  const { lang } = useLang();
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [threadId, setThreadId] = useState("");
  const [text, setText] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newBrand, setNewBrand] = useState<string>("");

  const brandsQ = useQuery({
    queryKey: ["brands"],
    queryFn: () => listBrands(),
    ...queryPresets.reference,
  });
  const brands = (brandsQ.data ?? []) as Array<{ id: string; name: string }>;
  const effectiveNewBrand = newBrand || brands[0]?.id || "";

  const listFn = useServerFn(listWhatsappThreads);
  const threadFn = useServerFn(getWhatsappThread);
  const sendFn = useServerFn(sendWhatsappMessage);
  const startFn = useServerFn(startWhatsappThread);

  const threads = useQuery({
    queryKey: ["whatsapp-inbox", "threads", search],
    queryFn: () => listFn({ data: { search: search || null } }),
    ...queryPresets.live,
  });
  const thread = useQuery({
    queryKey: ["whatsapp-inbox", "thread", threadId],
    queryFn: () => threadFn({ data: { threadId } }),
    enabled: !!threadId,
    ...queryPresets.live,
  });

  const send = useMutation({
    mutationFn: () => sendFn({ data: { threadId, body: text } }),
    onSuccess: (r) => {
      setText("");
      if (r.status === "sent") toast.success(t("تم الإرسال", "Sent"));
      else toast.warning(r.error ?? t("الرسالة في الانتظار", "Message pending"));
      qc.invalidateQueries({ queryKey: ["whatsapp-inbox", "thread", threadId] });
      qc.invalidateQueries({ queryKey: ["whatsapp-inbox", "threads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const start = useMutation({
    mutationFn: () => startFn({ data: { brandId: effectiveNewBrand, phone: newPhone } }),
    onSuccess: (r) => {
      setNewPhone("");
      setThreadId(r.id);
      qc.invalidateQueries({ queryKey: ["whatsapp-inbox", "threads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const currentThread = (threads.data ?? []).find((th) => th.id === threadId) ?? null;
  const linkedOrderId = currentThread?.order_id ?? null;

  const getOrderFn = useServerFn(getOrder);
  const linkedOrder = useQuery({
    queryKey: ["whatsapp-inbox", "linked-order", linkedOrderId],
    queryFn: () => getOrderFn({ data: { id: linkedOrderId as string } }),
    enabled: !!linkedOrderId,
  });

  const linkFn = useServerFn(linkThreadToOrder);
  const linkMut = useMutation({
    mutationFn: (orderId: string | null) => linkFn({ data: { threadId, orderId } }),
    onSuccess: (_r, orderId) => {
      toast.success(
        orderId
          ? t("تم ربط المحادثة بالأوردر", "Chat linked to order")
          : t("تم فك الربط", "Link removed"),
      );
      qc.invalidateQueries({ queryKey: ["whatsapp-inbox", "threads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const linkedTimeline = useOrderTimeline(linkedOrderId ?? "");

  const lo = linkedOrder.data;
  const linkedTotal = lo
    ? lo.items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.unit_price || 0), 0) +
      Number(lo.shipping_amount || 0) -
      Number(lo.discount_amount || 0)
    : 0;
  const linkedCollected = (linkedTimeline.data?.collections ?? []).reduce(
    (s, c) => s + Number(c.amount || 0),
    0,
  );
  const linkedOutstanding = Math.max(0, linkedTotal - linkedCollected);
  const lastShipment = (linkedTimeline.data?.shipments ?? []).slice(-1)[0] ?? null;

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">{t("واتساب", "WhatsApp")}</h1>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="p-3 space-y-3">
          <Input
            placeholder={t("بحث برقم أو اسم", "Search by number or name")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="space-y-1 max-h-[420px] overflow-auto">
            {(threads.data ?? []).map((th) => (
              <button
                key={th.id}
                onClick={() => setThreadId(th.id)}
                className={`w-full text-start p-2 rounded-md border ${threadId === th.id ? "bg-accent" : ""}`}
              >
                <div className="font-medium text-sm flex items-center gap-1">
                  {th.order_id ? (
                    <Link2
                      className="h-3.5 w-3.5 text-primary shrink-0"
                      aria-label={t("مرتبطة بأوردر", "Linked to order")}
                    />
                  ) : null}
                  <span className="truncate">{th.display_name ?? th.phone}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {th.last_message_preview ?? "—"}
                </div>
              </button>
            ))}
            {(threads.data ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground p-2">
                {t("لا توجد محادثات.", "No chats.")}
              </div>
            ) : null}
          </div>
          <div className="space-y-2 border-t pt-3">
            <Label>{t("محادثة جديدة", "New chat")}</Label>
            <Select value={effectiveNewBrand} onValueChange={setNewBrand}>
              <SelectTrigger>
                <SelectValue placeholder={t("البراند", "Brand")} />
              </SelectTrigger>
              <SelectContent>
                {brands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input
                placeholder={t("رقم الهاتف", "Phone number")}
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
              <Button
                onClick={() => start.mutate()}
                disabled={!effectiveNewBrand || !newPhone || start.isPending}
              >
                {t("بدء", "Start")}
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-4 flex flex-col min-h-[420px]">
          {!threadId ? (
            <div className="m-auto text-muted-foreground flex items-center gap-2">
              <MessageCircle className="h-4 w-4" /> {t("اختر محادثة", "Select a chat")}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 pb-3 mb-3 border-b">
                {linkedOrderId ? (
                  <>
                    <Badge variant="secondary" className="gap-1">
                      <Link2 className="h-3 w-3" />#
                      {linkedOrder.data?.external_order_number ?? linkedOrderId.slice(0, 8)}
                      {linkedOrder.data ? ` • ${linkedOrder.data.fulfillment_status}` : ""}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => linkMut.mutate(null)}
                      disabled={linkMut.isPending}
                    >
                      <Unlink className="h-4 w-4 me-1" /> {t("فك الربط", "Unlink")}
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-sm text-muted-foreground">
                      {t("ربط بأوردر:", "Link to order:")}
                    </span>
                    <OrderSearchCombobox
                      className="w-[280px]"
                      onSelect={(o) => linkMut.mutate(o.id)}
                    />
                  </>
                )}
              </div>
              {linkedOrderId ? (
                <div className="mb-3 rounded-lg border bg-muted/40 p-3">
                  {linkedOrder.isLoading || linkedTimeline.isLoading ? (
                    <div className="text-xs text-muted-foreground">
                      {t("جارٍ تحميل بيانات الأوردر…", "Loading order data…")}
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-4 text-sm">
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">{t("الحالة", "Status")}</div>
                        <Badge variant="secondary">{lo?.fulfillment_status ?? "—"}</Badge>
                      </div>
                      <Field
                        label={t("المبلغ الإجمالي", "Total amount")}
                        value={`${nf(linkedTotal)} ${t("ج.م", "EGP")}`}
                      />
                      <Field
                        label={t("المتوقع تحصيله", "Expected to collect")}
                        value={`${nf(linkedOutstanding)} ${t("ج.م", "EGP")}`}
                      />
                      <Field
                        label={t("آخر محاولة شحن", "Last shipment attempt")}
                        value={
                          lastShipment
                            ? `#${lastShipment.attempt_no} • ${lastShipment.status}${lastShipment.tracking ? ` • ${lastShipment.tracking}` : ""}`
                            : t("لا توجد", "None")
                        }
                      />
                    </div>
                  )}
                </div>
              ) : null}
              <div className="flex-1 space-y-2 overflow-auto">
                {(thread.data?.messages ?? []).map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[75%] rounded-lg p-2 text-sm ${m.direction === "out" ? "ms-auto bg-primary/10" : "bg-muted"}`}
                  >
                    <div>{m.body}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(m.sent_at).toLocaleString("en-GB")} • {m.status}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-3 border-t mt-3">
                <Input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t("اكتب رسالة…", "Type a message…")}
                />
                <Button onClick={() => send.mutate()} disabled={!text.trim() || send.isPending}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
