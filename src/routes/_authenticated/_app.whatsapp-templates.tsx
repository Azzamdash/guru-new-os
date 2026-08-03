import { tr } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageSquare, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { listBrands } from "@/lib/internal.functions";
import {
  deleteWhatsappTemplate,
  listWhatsappTemplates,
  upsertWhatsappTemplate,
} from "@/lib/orders-ops.functions";
import { WHATSAPP_EVENTS, renderTemplate } from "@/lib/orders-ops.shared";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/whatsapp-templates")({
  head: () => ({
    meta: [
      { title: "قوالب رسائل واتساب — e-GURUS" },
      {
        name: "description",
        content:
          "إدارة قوالب رسائل واتساب التلقائية لأحداث الأوردر: التأكيد، الشحن، التسليم والمرتجع.",
      },
      { property: "og:title", content: "قوالب رسائل واتساب — e-GURUS" },
      { property: "og:description", content: "قوالب الرسائل التلقائية لأحداث الأوردرات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WhatsappTemplatesPage,
});

const SAMPLE = {
  customer_name: "أحمد",
  order_number: "1042",
  tracking: "78451236",
  courier: "بوسطة",
  total: "850",
  brand: "e-GURUS",
};

const emptyDraft = {
  id: null as string | null,
  brandId: "" as string,
  name: "",
  eventKey: "order_shipped",
  body: "",
  active: true,
  autoSend: false,
};

function WhatsappTemplatesPage() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const qc = useQueryClient();
  const brandsFn = useServerFn(listBrands);
  const listFn = useServerFn(listWhatsappTemplates);
  const upsertFn = useServerFn(upsertWhatsappTemplate);
  const deleteFn = useServerFn(deleteWhatsappTemplate);

  const [draft, setDraft] = useState(emptyDraft);

  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => brandsFn() });
  const listQ = useQuery({ queryKey: ["whatsapp-templates"], queryFn: () => listFn() });

  const saveM = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          id: draft.id,
          brandId: draft.brandId || null,
          name: draft.name,
          eventKey: draft.eventKey,
          body: draft.body,
          active: draft.active,
          autoSend: draft.autoSend,
        },
      }),
    onSuccess: () => {
      toast.success(T("تم حفظ القالب", "Template saved"));
      setDraft(emptyDraft);
      qc.invalidateQueries({ queryKey: ["whatsapp-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success(T("تم حذف القالب", "Template deleted"));
      qc.invalidateQueries({ queryKey: ["whatsapp-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 p-4">
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <MessageSquare className="h-5 w-5 text-primary" />{" "}
        {T("قوالب رسائل واتساب", "WhatsApp message templates")}
      </h1>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder={T("اسم القالب", "Template name")}
            className="w-56"
          />
          <Select value={draft.eventKey} onValueChange={(v) => setDraft({ ...draft, eventKey: v })}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WHATSAPP_EVENTS.map((e) => (
                <SelectItem key={e.key} value={e.key}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={draft.brandId || "all"}
            onValueChange={(v) => setDraft({ ...draft, brandId: v === "all" ? "" : v })}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder={T("كل البراندات", "All brands")} />
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
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={draft.active}
              onCheckedChange={(v) => setDraft({ ...draft, active: v })}
            />{" "}
            {T("مُفعّل", "Active")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={draft.autoSend}
              onCheckedChange={(v) => setDraft({ ...draft, autoSend: v })}
            />{" "}
            {T("إرسال تلقائي", "Auto-send")}
          </label>
          <Button
            size="sm"
            className="ms-auto"
            disabled={saveM.isPending}
            onClick={() => saveM.mutate()}
          >
            <Plus className="ml-1 h-4 w-4" /> {draft.id ? T("تحديث", "Update") : T("إضافة", "Add")}
          </Button>
          {draft.id && (
            <Button size="sm" variant="ghost" onClick={() => setDraft(emptyDraft)}>
              {T("إلغاء", "Cancel")}
            </Button>
          )}
        </div>
        <Textarea
          rows={4}
          value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          placeholder={tr(
            "مرحباً {{customer_name}}، أوردرك رقم {{order_number}} خرج للشحن مع {{courier}} — رقم التتبع {{tracking}}.",
          )}
        />
        <div className="text-xs text-muted-foreground">
          {T("المتغيرات المتاحة", "Available variables")}:{" "}
          {Object.keys(SAMPLE)
            .map((k) => `{{${k}}}`)
            .join(T("، ", ", "))}
        </div>
        {draft.body.trim() && (
          <div className="rounded-md bg-muted/50 p-3 text-sm">
            <div className="mb-1 text-xs text-muted-foreground">{T("معاينة", "Preview")}:</div>
            {renderTemplate(draft.body, SAMPLE)}
          </div>
        )}
      </Card>

      <div className="space-y-2">
        {(listQ.data ?? []).map((t: Record<string, unknown>) => (
          <Card key={String(t["id"])} className="p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{String(t["name"])}</span>
              <Badge variant="outline">
                {WHATSAPP_EVENTS.find((e) => e.key === t["event_key"])?.label ??
                  String(t["event_key"])}
              </Badge>
              {t["auto_send"] ? <Badge>{T("تلقائي", "Auto")}</Badge> : null}
              {!t["active"] && <Badge variant="secondary">{T("موقوف", "Inactive")}</Badge>}
              <div className="ms-auto flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setDraft({
                      id: String(t["id"]),
                      brandId: (t["brand_id"] as string) ?? "",
                      name: String(t["name"]),
                      eventKey: String(t["event_key"]),
                      body: String(t["body"]),
                      active: Boolean(t["active"]),
                      autoSend: Boolean(t["auto_send"]),
                    })
                  }
                >
                  {T("تعديل", "Edit")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => delM.mutate(String(t["id"]))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {String(t["body"])}
            </p>
          </Card>
        ))}
        {!listQ.isLoading && (listQ.data ?? []).length === 0 && (
          <Card className="p-6 text-center text-muted-foreground">
            {T("لا توجد قوالب بعد", "No templates yet")}
          </Card>
        )}
      </div>
    </div>
  );
}
