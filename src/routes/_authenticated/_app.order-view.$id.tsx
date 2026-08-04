import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight, Package } from "lucide-react";
import { toast } from "sonner";
import { getOrderFull, listWhatsappTemplates, sendOrderTemplate } from "@/lib/orders-ops.functions";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/order-view/$id")({
  head: () => ({
    meta: [
      { title: "تفاصيل الأوردر — e-GURUS" },
      {
        name: "description",
        content:
          "عرض موحّد لتفاصيل الأوردر: الأصناف، الشحنة، التحصيل، سجل الحالات، المرتجعات ومحادثة واتساب.",
      },
      { property: "og:title", content: "تفاصيل الأوردر — e-GURUS" },
      { property: "og:description", content: "كل بيانات الأوردر في شاشة واحدة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrderViewPage,
});

const dt = (v: unknown) => (v ? new Date(String(v)).toLocaleString("en-GB") : "—");

function useT() {
  const { lang } = useLang();
  return {
    lang,
    T: (ar: string, en: string) => (lang === "ar" ? ar : en),
    money: (n: number) => `${Math.round(n).toLocaleString("en-US")} ${lang === "ar" ? "ج" : "EGP"}`,
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-bold text-muted-foreground">{title}</h2>
      {children}
    </Card>
  );
}

function OrderViewPage() {
  const { T, money } = useT();
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const fullFn = useServerFn(getOrderFull);
  const templatesFn = useServerFn(listWhatsappTemplates);
  const sendFn = useServerFn(sendOrderTemplate);
  const [templateId, setTemplateId] = useState("");

  const q = useQuery({
    queryKey: ["order-full", id],
    queryFn: () => fullFn({ data: { orderId: id } }),
  });
  const templatesQ = useQuery({ queryKey: ["whatsapp-templates"], queryFn: () => templatesFn() });

  const sendM = useMutation({
    mutationFn: () => sendFn({ data: { orderId: id, templateId } }),
    onSuccess: () => {
      toast.success(T("تم إرسال الرسالة", "Message sent"));
      qc.invalidateQueries({ queryKey: ["order-full", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading)
    return <div className="p-6 text-muted-foreground">{T("جارِ التحميل…", "Loading…")}</div>;
  if (q.error) return <div className="p-6 text-destructive">{(q.error as Error).message}</div>;
  const d = q.data!;
  const o = d.order as Record<string, unknown>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/orders-center" className="text-sm text-muted-foreground hover:underline">
          <ArrowRight className="inline h-4 w-4" /> {T("الأوردرات", "Orders")}
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Package className="h-5 w-5 text-primary" /> {T("أوردر", "Order")} #
          {String(o["external_order_number"] ?? id.slice(0, 8))}
        </h1>
        <Badge>{String(o["order_status"] ?? "")}</Badge>
        {o["confirmation_status"] ? (
          <Badge variant="outline">{String(o["confirmation_status"])}</Badge>
        ) : null}
        <Badge variant="secondary">{money(Number(o["total_amount"] ?? 0))}</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={T("بيانات العميل", "Customer Info")}>
          <div className="space-y-1 text-sm">
            <div>
              {T("الاسم", "Name")}: {String(o["customer_name"] ?? "—")}
            </div>
            <div dir="ltr" className="text-right">
              {T("الهاتف", "Phone")}: {String(o["customer_phone"] ?? "—")}
            </div>
            <div>
              {T("المحافظة", "Governorate")}: {String(o["shipping_governorate"] ?? "—")}
            </div>
            <div>
              {T("العنوان", "Address")}: {String(o["shipping_address"] ?? "—")}
            </div>
            <div>
              {T("شركة الشحن", "Courier")}: {d.courierName ?? "—"}
            </div>
            <div>
              {T("التاريخ", "Date")}: {dt(o["occurred_at"])}
            </div>
          </div>
        </Section>

        <Section title={T("الأصناف", "Items")}>
          <table className="w-full text-sm">
            <tbody>
              {d.items.map((it: Record<string, unknown>) => (
                <tr key={String(it["id"])} className="border-t">
                  <td className="p-1">{String(it["product_name"] ?? it["product_id"] ?? "")}</td>
                  <td className="p-1">×{Number(it["qty"] ?? 0)}</td>
                  <td className="p-1">{money(Number(it["unit_price"] ?? 0))}</td>
                </tr>
              ))}
              {d.items.length === 0 && (
                <tr>
                  <td className="p-2 text-muted-foreground">{T("لا توجد أصناف", "No items")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </Section>

        <Section title={T("الشحنات", "Shipments")}>
          {d.shipments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{T("لا توجد شحنات", "No shipments")}</p>
          ) : (
            <div className="space-y-2 text-sm">
              {d.shipments.map((s: Record<string, unknown>) => (
                <div
                  key={String(s["id"])}
                  className="flex flex-wrap items-center gap-2 border-t pt-2"
                >
                  <Badge variant="outline">
                    {T("محاولة", "Attempt")} {Number(s["attempt_no"] ?? 1)}
                  </Badge>
                  <span dir="ltr" className="font-mono text-xs">
                    {String(s["tracking"] ?? "—")}
                  </span>
                  <Badge>{String(s["status"] ?? "")}</Badge>
                  <span className="text-muted-foreground">
                    {dt(s["updated_at"] ?? s["created_at"])}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title={T("التحصيل", "Collection")}>
          {d.collections.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {T("لا يوجد تحصيل مسجّل", "No collections recorded")}
            </p>
          ) : (
            <div className="space-y-2 text-sm">
              {d.collections.map((c: Record<string, unknown>) => (
                <div
                  key={String(c["id"])}
                  className="flex flex-wrap items-center gap-2 border-t pt-2"
                >
                  <Badge>{money(Number(c["amount"] ?? 0))}</Badge>
                  <span className="text-muted-foreground">{String(c["method"] ?? "")}</span>
                  <span className="text-muted-foreground">{dt(c["collected_at"])}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title={T("محاولات التأكيد", "Confirmation Attempts")}>
          {d.confirmations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{T("لا توجد محاولات", "No attempts")}</p>
          ) : (
            <div className="space-y-1 text-sm">
              {d.confirmations.map((c: Record<string, unknown>) => (
                <div
                  key={String(c["id"])}
                  className="flex flex-wrap items-center gap-2 border-t pt-1"
                >
                  <Badge variant="outline">{String(c["outcome"] ?? "")}</Badge>
                  <span>{String(c["reason"] ?? "")}</span>
                  <span className="text-muted-foreground">{dt(c["attempted_at"])}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title={T("المرتجعات", "Returns")}>
          {d.returns.length === 0 ? (
            <p className="text-sm text-muted-foreground">{T("لا توجد مرتجعات", "No returns")}</p>
          ) : (
            <div className="space-y-1 text-sm">
              {d.returns.map((r: Record<string, unknown>) => (
                <div
                  key={String(r["id"])}
                  className="flex flex-wrap items-center gap-2 border-t pt-1"
                >
                  <Badge>{String(r["status"] ?? "")}</Badge>
                  <span>{String(r["kind"] ?? "")}</span>
                  <span className="text-muted-foreground">{dt(r["requested_at"])}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title={T("سجل الحالات", "Status History")}>
          <div className="max-h-64 space-y-1 overflow-auto text-sm">
            {d.events.map((e: Record<string, unknown>) => (
              <div
                key={String(e["id"])}
                className="flex flex-wrap items-center gap-2 border-t pt-1"
              >
                <span className="text-muted-foreground">{dt(e["created_at"])}</span>
                <Badge variant="outline">{String(e["source"] ?? "")}</Badge>
                <span>
                  {String(e["from_order_status"] ?? "—")} ← {String(e["to_order_status"] ?? "—")}
                </span>
              </div>
            ))}
            {d.events.length === 0 && (
              <p className="text-muted-foreground">{T("لا يوجد سجل", "No history")}</p>
            )}
          </div>
        </Section>

        <Section title={T("واتساب", "WhatsApp")}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder={T("اختر قالب", "Select template")} />
              </SelectTrigger>
              <SelectContent>
                {(templatesQ.data ?? []).map((t: Record<string, unknown>) => (
                  <SelectItem key={String(t["id"])} value={String(t["id"])}>
                    {String(t["name"])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!templateId || sendM.isPending}
              onClick={() => sendM.mutate()}
            >
              {T("إرسال", "Send")}
            </Button>
          </div>
          <div className="max-h-64 space-y-2 overflow-auto">
            {d.messages.map((m: Record<string, unknown>) => (
              <div
                key={String(m["id"])}
                className={`rounded-md p-2 text-sm ${m["direction"] === "out" ? "bg-primary/10" : "bg-muted"}`}
              >
                <div className="whitespace-pre-wrap">{String(m["body"] ?? "")}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {dt(m["sent_at"])} — {String(m["status"] ?? "")}
                </div>
              </div>
            ))}
            {d.messages.length === 0 && (
              <p className="text-sm text-muted-foreground">{T("لا توجد رسائل", "No messages")}</p>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}
