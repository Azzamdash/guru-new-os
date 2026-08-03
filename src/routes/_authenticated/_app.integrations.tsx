import { tr } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ShoppingBag, Truck, CheckCircle2, AlertCircle, RefreshCw, Trash2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { listBrands } from "@/lib/internal.functions";
import {
  listIntegrations,
  saveIntegration,
  deleteIntegration,
  testShopify,
  syncShopifyOrders,
  testBosta,
  syncBostaDeliveries,
  getBostaWebhookInfo,
  startShopifyOAuth,
  registerShopifyWebhooks,
} from "@/lib/integrations.functions";
import { useEffect } from "react";


type Provider = "shopify" | "bosta" | "aramex" | "mylerz" | "shipblu";

const COURIERS: { id: Provider; name: string; live: boolean }[] = [
  { id: "bosta", name: "Bosta", live: true },
  { id: "aramex", name: "Aramex", live: false },
  { id: "mylerz", name: "Mylerz", live: false },
  { id: "shipblu", name: "ShipBlu", live: false },
];

export const Route = createFileRoute("/_authenticated/_app/integrations")({
  head: () => ({
    meta: [
      { title: tr("التكاملات — e-GURUS") },
      { name: "description", content: "ربط Shopify وشركات الشحن لكل براند لسحب الطلبات والشحنات تلقائياً." },
    ],
  }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const qc = useQueryClient();
  const listB = useServerFn(listBrands);
  const listI = useServerFn(listIntegrations);
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listB() });
  const integQ = useQuery({ queryKey: ["integrations"], queryFn: () => listI() });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const s = p.get("shopify");
    if (!s) return;
    const msg = p.get("msg") ?? "";
    if (s === "connected") toast.success(tr("تم ربط Shopify بنجاح"));
    else toast.error(`فشل ربط Shopify: ${msg}`);
    qc.invalidateQueries({ queryKey: ["integrations"] });
    const clean = new URL(window.location.href);
    clean.searchParams.delete("shopify"); clean.searchParams.delete("msg");
    window.history.replaceState({}, "", clean.toString());
  }, [qc]);

  const productBrands = (brandsQ.data ?? []).filter((b) => b.type === "product" && b.active);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["integrations"] });

  const [openDialog, setOpenDialog] = useState<null | { brand_id: string; brand_name: string; provider: Provider }>(null);

  const find = (brand_id: string, provider: Provider) =>
    (integQ.data ?? []).find((i) => i.brand_id === brand_id && i.provider === provider);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">{tr("التكاملات")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{tr("اربط Shopify وشركات الشحن لكل براند على حدة. المفاتيح تُخزن مشفّرة (AES-256-GCM).")}</p>
      </div>

      {/* Shopify */}
      <Card className="card-gradient p-4 md:p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><ShoppingBag className="w-5 h-5 text-primary" /></div>
          <div>
            <h3 className="font-semibold">Shopify</h3>
            <p className="text-xs text-muted-foreground">{tr("Admin API Access Token لكل براند — لسحب الطلبات والمبيعات والمنتجات.")}</p>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {productBrands.map((b) => {
            const it = find(b.id, "shopify");
            return (
              <BrandRow
                key={b.id}
                brand={b}
                integration={it}
                onConfigure={() => setOpenDialog({ brand_id: b.id, brand_name: b.name, provider: "shopify" })}
                onDeleted={invalidate}
                testFn={testShopify}
                syncFn={syncShopifyOrders}
                syncLabel={tr("استيراد طلبات اليوم")}
              />
            );
          })}
          {productBrands.length === 0 && <p className="text-sm text-muted-foreground col-span-full">{tr("أضف براندات منتجات أولاً.")}</p>}
        </div>
      </Card>

      {/* Couriers */}
      <Card className="card-gradient p-4 md:p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><Truck className="w-5 h-5 text-primary" /></div>
          <div>
            <h3 className="font-semibold">{tr("شركات الشحن")}</h3>
            <p className="text-xs text-muted-foreground">{tr("اربط شركة الشحن الخاصة بكل براند لسحب حالة التسليم والمرتجعات والـ COD.")}</p>
          </div>
        </div>

        <div className="space-y-4">
          {productBrands.map((b) => (
            <div key={b.id} className="border border-border rounded-lg p-3">
              <div className="font-medium mb-3">{b.name}</div>
              <div className="grid md:grid-cols-2 gap-2">
                {COURIERS.map((c) => {
                  const it = find(b.id, c.id);
                  return (
                    <div key={c.id} className="border border-border/60 rounded-md p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{c.name}</span>
                          {!c.live && <Badge variant="outline" className="text-[10px]">{tr("قريباً")}</Badge>}
                          {it && <StatusBadge status={it.status} />}
                        </div>
                        {it?.last_sync_at && (
                          <div className="text-[11px] text-muted-foreground truncate">{tr("آخر مزامنة:")} {new Date(it.last_sync_at).toLocaleString("en-US")}</div>
                        )}
                        {it?.last_error && <div className="text-[11px] text-destructive truncate">{it.last_error}</div>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {c.live ? (
                          <>
                            {it && <SyncButton brand_id={b.id} provider={c.id} testFn={testBosta} syncFn={syncBostaDeliveries} onDone={invalidate} />}
                            <Button size="sm" variant="outline" onClick={() => setOpenDialog({ brand_id: b.id, brand_name: b.name, provider: c.id })}>
                              <Settings2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="outline" disabled>{tr("قريباً")}</Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {productBrands.length === 0 && <p className="text-sm text-muted-foreground">{tr("أضف براندات منتجات أولاً.")}</p>}
        </div>
      </Card>

      <p className="text-[11px] text-muted-foreground text-center">
        {tr("المفاتيح تُخزّن مشفّرة على الخادم فقط ولا تظهر مرة أخرى بعد الحفظ. لتغيير المفتاح، احذف الاتصال وأعد الإدخال.")}
      </p>

      {openDialog && (
        <CredentialsDialog
          open
          onClose={() => setOpenDialog(null)}
          onSaved={invalidate}
          {...openDialog}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "connected") return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px]"><CheckCircle2 className="w-3 h-3 me-1" />{tr("متصل")}</Badge>;
  if (status === "error") return <Badge variant="destructive" className="text-[10px]"><AlertCircle className="w-3 h-3 me-1" />{tr("خطأ")}</Badge>;
  return <Badge variant="outline" className="text-[10px]">{tr("غير متصل")}</Badge>;
}

function BrandRow({
  brand,
  integration,
  onConfigure,
  onDeleted,
  testFn,
  syncFn,
  syncLabel,
}: {
  brand: { id: string; name: string };
  integration?: { status: string; last_sync_at: string | null; last_error: string | null; last_sync_summary: Record<string, unknown> | null };
  onConfigure: () => void;
  onDeleted: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  testFn: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  syncFn: any;
  syncLabel: string;
}) {
  const summary = integration?.last_sync_summary as Record<string, number | string> | null;
  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{brand.name}</span>
            {integration && <StatusBadge status={integration.status} />}
          </div>
          {integration?.last_sync_at && (
            <div className="text-[11px] text-muted-foreground">{tr("آخر مزامنة:")} {new Date(integration.last_sync_at).toLocaleString("en-US")}</div>
          )}
          {integration?.last_error && <div className="text-[11px] text-destructive truncate">{integration.last_error}</div>}
        </div>
        <div className="flex gap-1 shrink-0">
          {integration && <SyncButton brand_id={brand.id} provider="shopify" testFn={testFn} syncFn={syncFn} onDone={onDeleted} label={syncLabel} syncDays={1} />}
          {integration && integration.status === "connected" && <RegisterWebhooksButton brand_id={brand.id} onDone={onDeleted} />}
          <Button size="sm" variant="outline" onClick={onConfigure}>
            <Settings2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      {summary && (
        <div className="flex flex-wrap gap-2 text-[11px]">
          {Object.entries(summary).slice(0, 5).map(([k, v]) => (
            <span key={k} className="px-2 py-0.5 rounded bg-muted/50 text-muted-foreground">
              {k}: <span className="text-foreground font-medium">{String(v)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SyncButton({
  brand_id,
  provider,
  testFn,
  syncFn,
  onDone,
  label,
  syncDays,
}: {
  brand_id: string;
  provider: Provider;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  testFn: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  syncFn: any;
  onDone: () => void;
  label?: string;
  syncDays?: number;
}) {
  const test = useServerFn(testFn);
  const sync = useServerFn(syncFn);
  const del = useServerFn(deleteIntegration);
  const testM = useMutation({ mutationFn: () => test({ data: { brand_id } }), onSuccess: () => { toast.success(tr("الاتصال يعمل")); onDone(); }, onError: (e) => toast.error(String(e)) });
  const syncM = useMutation({ mutationFn: () => sync({ data: { brand_id, days: syncDays ?? 7 } }), onSuccess: (r) => { toast.success(`تمت المزامنة: ${JSON.stringify(r)}`); onDone(); }, onError: (e) => toast.error(String(e)) });
  const delM = useMutation({ mutationFn: () => del({ data: { brand_id, provider } }), onSuccess: () => { toast.success(tr("تم الحذف")); onDone(); }, onError: (e) => toast.error(String(e)) });

  return (
    <>
      <Button size="sm" variant="outline" title={tr("اختبار")} onClick={() => testM.mutate()} disabled={testM.isPending}>
        <CheckCircle2 className="w-3.5 h-3.5" />
      </Button>
      <Button size="sm" variant="outline" title={label ?? tr("مزامنة")} onClick={() => syncM.mutate()} disabled={syncM.isPending}>
        <RefreshCw className={`w-3.5 h-3.5 ${syncM.isPending ? "animate-spin" : ""}`} />
      </Button>
      <Button size="sm" variant="ghost" title={tr("حذف")} onClick={() => { if (confirm(tr("حذف هذا الاتصال؟"))) delM.mutate(); }} disabled={delM.isPending}>
        <Trash2 className="w-3.5 h-3.5 text-destructive" />
      </Button>
    </>
  );
}

function RegisterWebhooksButton({ brand_id, onDone }: { brand_id: string; onDone: () => void }) {
  const register = useServerFn(registerShopifyWebhooks);
  const m = useMutation({
    mutationFn: () => register({ data: { brand_id, origin: window.location.origin } }),
    onSuccess: (r) => {
      const summary = (r?.results ?? []).reduce((acc: Record<string, number>, x: { action: string }) => {
        acc[x.action] = (acc[x.action] ?? 0) + 1;
        return acc;
      }, {});
      toast.success(`Webhooks: ${Object.entries(summary).map(([k, v]) => `${k}=${v}`).join(", ")}`);
      onDone();
    },
    onError: (e) => toast.error(String(e)),
  });
  return (
    <Button size="sm" variant="outline" title={tr("تسجيل/تحديث Webhooks")} onClick={() => m.mutate()} disabled={m.isPending}>
      <RefreshCw className={`w-3.5 h-3.5 ${m.isPending ? "animate-spin" : ""}`} />
      <span className="ms-1 text-[10px]">WH</span>
    </Button>
  );
}

function CredentialsDialog({
  open,
  onClose,
  onSaved,
  brand_id,
  brand_name,
  provider,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  brand_id: string;
  brand_name: string;
  provider: Provider;
}) {
  const save = useServerFn(saveIntegration);
  const startOAuth = useServerFn(startShopifyOAuth);
  const [shop, setShop] = useState("");
  const [token, setToken] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [mode, setMode] = useState<"oauth" | "token">("oauth");

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const redirectUri = `${origin}/api/public/oauth/shopify.callback`;

  const saveM = useMutation({
    mutationFn: async () => {
      if (provider === "shopify") {
        if (mode === "oauth") {
          if (!shop.trim() || !clientId.trim() || !clientSecret.trim()) throw new Error("املأ Shop domain و Client ID و Client Secret");
          const r = await startOAuth({ data: {
            brand_id, shop_domain: shop.trim(),
            client_id: clientId.trim(), client_secret: clientSecret.trim(),
            redirect_uri: redirectUri,
          }});
          window.location.href = r.authorization_url;
          return { ok: true };
        }
        if (!shop.trim() || !token.trim()) throw new Error("املأ الحقول");
        return save({ data: { brand_id, provider, credentials: { access_token: token.trim() }, config: { shop_domain: shop.trim(), auth_mode: "custom_app" } } });
      }
      if (!apiKey.trim()) throw new Error("املأ مفتاح API");
      return save({ data: { brand_id, provider, credentials: { api_key: apiKey.trim() } } });
    },
    onSuccess: () => {
      if (provider === "shopify" && mode === "oauth") return; // redirecting
      toast.success(tr("تم الحفظ")); onSaved(); onClose();
    },
    onError: (e) => toast.error(String(e)),
  });

  const title = provider === "shopify" ? `Shopify — ${brand_name}` : `${provider.toUpperCase()} — ${brand_name}`;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {provider === "shopify" ? (
          <div className="space-y-3">
            <div className="flex gap-2 text-xs">
              <Button size="sm" variant={mode === "oauth" ? "default" : "outline"} onClick={() => setMode("oauth")}>OAuth (Client ID/Secret)</Button>
              <Button size="sm" variant={mode === "token" ? "default" : "outline"} onClick={() => setMode("token")}>Admin Token (Custom App)</Button>
            </div>
            <div>
              <Label>Shop domain</Label>
              <Input placeholder="mystore.myshopify.com" value={shop} onChange={(e) => setShop(e.target.value)} />
              <p className="text-[11px] text-muted-foreground mt-1">{tr("اسم متجرك على Shopify (بدون https).")}</p>
            </div>
            {mode === "oauth" ? (
              <>
                <div>
                  <Label>Client ID</Label>
                  <Input placeholder={tr("Client ID من Shopify App")} value={clientId} onChange={(e) => setClientId(e.target.value)} />
                </div>
                <div>
                  <Label>Client Secret</Label>
                  <Input type="password" placeholder="Client Secret" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
                </div>
                <div className="rounded-md border p-3 bg-muted/30 space-y-2">
                  <div className="text-xs font-semibold">Redirect / Callback URL</div>
                  <Input readOnly value={redirectUri} className="text-[11px] font-mono" onFocus={(e) => e.currentTarget.select()} />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(redirectUri); toast.success(tr("تم النسخ")); }}>{tr("نسخ")}</Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {tr("أضف هذا الرابط كما هو بالضبط في Shopify Partners → App → Configuration → Allowed redirection URL(s) قبل الضغط على اتصال.\n                    بعدها اضغط \"اتصال\" لتحويلك لصفحة تصريح Shopify.")}
                  </p>
                </div>
              </>
            ) : (
              <div>
                <Label>Admin API Access Token</Label>
                <Input type="password" placeholder="shpat_..." value={token} onChange={(e) => setToken(e.target.value)} />
                <p className="text-[11px] text-muted-foreground mt-1">
                  {tr("Shopify Admin → Settings → Apps and sales channels → Develop apps → Custom App → Admin API Scopes: read_orders, write_orders, read_products, write_products, read_customers, write_customers, read_inventory, write_inventory, read_fulfillments, write_fulfillments. بعد تغيير الـ scopes لازم تعمل Install/Reinstall للتطبيق وتنسخ Token جديد.")}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>API Key</Label>
              <Input type="password" placeholder={tr("مفتاح API الخاص بشركة الشحن")} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
              {provider === "bosta" && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {tr("Bosta Dashboard → Settings → API → أنشئ API Key. سيتم استخدامه في Header: Authorization.")}
                </p>
              )}
            </div>
            {provider === "bosta" && (
              <BostaWebhookInfo brand_id={brand_id} />
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tr("إلغاء")}</Button>
          <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>
            {provider === "shopify" && mode === "oauth" ? tr("اتصال بـ Shopify") : tr("حفظ")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BostaWebhookInfo({ brand_id }: { brand_id: string }) {
  const fn = useServerFn(getBostaWebhookInfo);
  const { data, isLoading } = useQuery({
    queryKey: ["bosta-webhook-info", brand_id],
    queryFn: () => fn({ data: { brand_id } }),
  });
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = data ? `${origin}${data.path}${data.secret ? `?secret=${encodeURIComponent(data.secret)}` : ""}` : "";
  return (
    <div className="rounded-md border p-3 space-y-2 bg-muted/30">
      <div className="text-xs font-semibold">Bosta Webhook</div>
      <p className="text-[11px] text-muted-foreground">
        {tr("سجّل الرابط ده في Bosta Dashboard → Settings → Webhooks عشان يوصل تحديث الحالة فورًا (بدل انتظار الـ Cron).")}
      </p>
      {isLoading ? (
        <p className="text-[11px] text-muted-foreground">{tr("جارٍ التحميل…")}</p>
      ) : (
        <>
          <Input readOnly value={url} className="text-[11px] font-mono" onFocus={(e) => e.currentTarget.select()} />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(url);
                toast.success(tr("تم نسخ الرابط"));
              }}
            >
              {tr("نسخ الرابط")}
            </Button>
            {!data?.hasSecret && (
              <span className="text-[11px] text-destructive self-center">{tr("تنبيه: BOSTA_WEBHOOK_SECRET غير مُعرَّف")}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

