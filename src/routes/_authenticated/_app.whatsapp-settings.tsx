import { tr } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, AlertCircle, RefreshCw, Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import {
  getWhatsappSettings,
  testWhatsappConnection,
  sendWhatsappTestMessage,
} from "@/lib/whatsapp-settings.functions";

export const Route = createFileRoute("/_authenticated/_app/whatsapp-settings")({
  head: () => ({
    meta: [
      { title: "إعدادات واتساب — e-GURUS" },
      {
        name: "description",
        content: "إدارة مفاتيح WhatsApp Cloud API وحالة الاتصال و Webhook الخاص بمركز الأوردرات.",
      },
      { property: "og:title", content: "إعدادات واتساب — e-GURUS" },
      { property: "og:description", content: "إدارة مفاتيح WhatsApp Cloud API واختبار الاتصال." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WhatsappSettingsPage,
});

const KEYS = [
  {
    env: "WHATSAPP_TOKEN",
    ar: "توكن الوصول الدائم",
    where: "Meta for Developers → تطبيقك → WhatsApp → API Setup → Permanent access token",
    field: "token" as const,
  },
  {
    env: "WHATSAPP_PHONE_NUMBER_ID",
    ar: "معرّف رقم الهاتف",
    where: "Meta for Developers → WhatsApp → API Setup → Phone number ID",
    field: "phoneNumberId" as const,
  },
  {
    env: "WHATSAPP_VERIFY_TOKEN",
    ar: "توكن التحقق من الـ Webhook",
    where: "أي نص عشوائي تختاره وتضعه نفسه في إعدادات Webhook داخل Meta",
    field: "verifyToken" as const,
  },
];

function StatusBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <Badge className="gap-1">
      <CheckCircle2 className="h-3.5 w-3.5" /> {tr("مُفعّل")}
    </Badge>
  ) : (
    <Badge variant="destructive" className="gap-1">
      <AlertCircle className="h-3.5 w-3.5" /> {tr("غير مضبوط")}
    </Badge>
  );
}

function WhatsappSettingsPage() {
  const load = useServerFn(getWhatsappSettings);
  const test = useServerFn(testWhatsappConnection);
  const sendTest = useServerFn(sendWhatsappTestMessage);
  const [phone, setPhone] = useState("");

  const q = useQuery({ queryKey: ["whatsapp-settings"], queryFn: () => load() });

  const testM = useMutation({
    mutationFn: () => test(),
    onSuccess: (r) => (r.ok ? toast.success(r.message) : toast.error(r.message)),
    onError: (e: Error) => toast.error(e.message),
  });

  const sendM = useMutation({
    mutationFn: () => sendTest({ data: { phone } }),
    onSuccess: (r) => (r.ok ? toast.success(r.message) : toast.error(r.message)),
    onError: (e: Error) => toast.error(e.message),
  });

  const s = q.data;
  const allSet = s ? s.token.configured && s.phoneNumberId.configured && s.verifyToken.configured : false;

  return (
    <div className="space-y-6 p-4 md:p-6" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <MessageCircle className="h-6 w-6 text-primary" /> {tr("إعدادات واتساب")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {tr("إدارة مفاتيح WhatsApp Cloud API المستخدمة في مركز إدارة الأوردرات.")}
          </p>
        </div>
        <Button variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} /> {tr("تحديث")}
        </Button>
      </header>

      {q.isError && (
        <Card className="border-destructive p-4 text-sm text-destructive">
          {tr("لا تملك صلاحية عرض هذه الإعدادات (متاحة للمدراء فقط).")}
        </Card>
      )}

      {s && (
        <>
          <Card className="space-y-4 p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{tr("حالة المفاتيح")}</h2>
              <StatusBadge ok={allSet} />
            </div>
            <div className="space-y-3">
              {KEYS.map((k) => {
                const item = s[k.field];
                return (
                  <div
                    key={k.env}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{k.ar}</span>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{k.env}</code>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{k.where}</p>
                      {item.preview && (
                        <p className="mt-1 font-mono text-xs text-muted-foreground">{item.preview}</p>
                      )}
                    </div>
                    <StatusBadge ok={item.configured} />
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {tr("القيم مخزّنة مشفّرة على الخادم ولا تظهر كاملة في الواجهة. لتغيير أي مفتاح اطلب من المطوّر\n              تحديثه عبر إعدادات الأسرار الآمنة.")}
            </p>
          </Card>

          <Card className="space-y-3 p-4">
            <h2 className="font-semibold">{tr("رابط الـ Webhook")}</h2>
            <div className="flex items-center gap-2">
              <Input readOnly value={s.webhookUrl} className="font-mono text-xs" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  navigator.clipboard.writeText(s.webhookUrl);
                  toast.success(tr("تم نسخ الرابط"));
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {tr("ضع هذا الرابط في Meta → WhatsApp → Configuration → Callback URL، ونفس قيمة\n              WHATSAPP_VERIFY_TOKEN في خانة Verify token، ثم اشترك في حقل messages.")}
            </p>
          </Card>

          <Card className="space-y-4 p-4">
            <h2 className="font-semibold">{tr("اختبار الاتصال")}</h2>
            <Button onClick={() => testM.mutate()} disabled={testM.isPending}>
              {testM.isPending ? "جاري الفحص..." : "فحص الاتصال بحساب واتساب"}
            </Button>
            <div className="space-y-2">
              <Label htmlFor="test-phone">{tr("إرسال رسالة اختبار إلى رقم (صيغة دولية بدون +)")}</Label>
              <div className="flex gap-2">
                <Input
                  id="test-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="201001234567"
                  inputMode="numeric"
                  maxLength={20}
                />
                <Button
                  variant="secondary"
                  onClick={() => sendM.mutate()}
                  disabled={sendM.isPending || phone.trim().length < 8}
                >
                  {tr("إرسال")}
                </Button>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
