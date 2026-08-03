import { tr } from "@/lib/i18n";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle2, AlertCircle, RefreshCw, Settings2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { listBrands } from "@/lib/internal.functions";
import { listIntegrations, saveIntegration, deleteIntegration } from "@/lib/integrations.functions";
import {
  testMetaAds,
  getMetaInsights,
  testTikTokAds,
  getTikTokInsights,
  type AdsInsights,
} from "@/lib/ads.functions";
import { useLang } from "@/lib/i18n";

type ProviderKey = "meta_ads" | "tiktok_ads";

const PROVIDER_META = {
  meta_ads: {
    name: "Meta Ads",
    idLabel: "Ad Account ID",
    idPlaceholder: (lang: "ar" | "en") =>
      lang === "ar" ? "act_1234567890 (أو 1234567890)" : "act_1234567890 (or 1234567890)",
    idHint: "Meta Ads Manager → Account Overview → Ad Account ID.",
    tokenLabel: "Access Token (Long-Lived)",
    tokenPlaceholder: "EAAG... (System User token)",
    tokenHint: (lang: "ar" | "en") =>
      lang === "ar"
        ? "Meta Business Suite → Business Settings → System Users → Generate New Token بصلاحية ads_read + read_insights."
        : "Meta Business Suite → Business Settings → System Users → Generate New Token with ads_read + read_insights permission.",
    docsUrl: "https://developers.facebook.com/docs/marketing-api/insights/",
    idField: "ad_account_id" as const,
  },
  tiktok_ads: {
    name: "TikTok Ads",
    idLabel: "Advertiser ID",
    idPlaceholder: (_lang: "ar" | "en") => "7123456789012345678",
    idHint: "TikTok Ads Manager → Account Info → Advertiser ID.",
    tokenLabel: "Long-Term Access Token",
    tokenPlaceholder: "Long-term token from TikTok for Business",
    tokenHint: (lang: "ar" | "en") =>
      lang === "ar"
        ? "TikTok Business → Developers → Apps → Generate a long-term access token بصلاحية Ad Account: Read + Reporting: Read."
        : "TikTok Business → Developers → Apps → Generate a long-term access token with Ad Account: Read + Reporting: Read permission.",
    docsUrl: "https://business-api.tiktok.com/portal/docs?id=1740302848100353",
    idField: "advertiser_id" as const,
  },
};

function fmt(n: number, digits = 0) {
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function AdsInsightsView({ provider }: { provider: ProviderKey }) {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const meta = PROVIDER_META[provider];
  const qc = useQueryClient();
  const listB = useServerFn(listBrands);
  const listI = useServerFn(listIntegrations);
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listB() });
  const integQ = useQuery({ queryKey: ["integrations"], queryFn: () => listI() });

  const productBrands = useMemo(() => (brandsQ.data ?? []).filter((b) => b.active), [brandsQ.data]);

  const [brandId, setBrandId] = useState<string>("");
  const activeBrand = brandId || productBrands[0]?.id || "";
  const [days, setDays] = useState<number>(30);
  const [configOpen, setConfigOpen] = useState(false);

  const integration = useMemo(
    () => (integQ.data ?? []).find((i) => i.brand_id === activeBrand && i.provider === provider),
    [integQ.data, activeBrand, provider],
  );
  const connected = integration?.status === "connected";

  const testFn = useServerFn(provider === "meta_ads" ? testMetaAds : testTikTokAds);
  const insightsFn = useServerFn(provider === "meta_ads" ? getMetaInsights : getTikTokInsights);

  const insightsQ = useQuery({
    queryKey: ["ads-insights", provider, activeBrand, days],
    queryFn: () => insightsFn({ data: { brand_id: activeBrand, days } }),
    enabled: !!activeBrand && !!connected,
  });

  const testM = useMutation({
    mutationFn: () => testFn({ data: { brand_id: activeBrand } }),
    onSuccess: () => {
      toast.success(T("الاتصال يعمل", "Connection is working"));
      qc.invalidateQueries({ queryKey: ["integrations"] });
      qc.invalidateQueries({ queryKey: ["ads-insights", provider, activeBrand] });
    },
    onError: (e) => toast.error(String(e)),
  });

  const data = insightsQ.data;

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">{meta.name}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {T(`سحب لايف من ${meta.name}`, `Live pull from ${meta.name}`)} — Spend, Impressions,
            Clicks, CTR, CPC, CPM, Conversions, ROAS.
          </p>
        </div>
        <a
          href={meta.docsUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-primary inline-flex items-center gap-1"
        >
          Docs <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <Card className="card-gradient p-4 md:p-5">
        <div className="grid md:grid-cols-4 gap-3 items-end">
          <div className="md:col-span-2">
            <Label>{T("البراند", "Brand")}</Label>
            <Select value={activeBrand} onValueChange={setBrandId}>
              <SelectTrigger>
                <SelectValue placeholder={T("اختر براند", "Select a brand")} />
              </SelectTrigger>
              <SelectContent>
                {productBrands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{T("الفترة", "Period")}</Label>
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{T("آخر 7 أيام", "Last 7 days")}</SelectItem>
                <SelectItem value="30">{T("آخر 30 يوم", "Last 30 days")}</SelectItem>
                <SelectItem value="90">{T("آخر 90 يوم", "Last 90 days")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                if (!activeBrand) {
                  toast.error(
                    productBrands.length === 0
                      ? T(
                          "لا توجد براندات نشطة. أضف براند أولاً.",
                          "No active brands. Add a brand first.",
                        )
                      : T("اختر براند أولاً", "Select a brand first"),
                  );
                  return;
                }
                setConfigOpen(true);
              }}
            >
              <Settings2 className="w-4 h-4 me-1" />{" "}
              {connected ? T("تعديل", "Edit") : T("ربط", "Connect")}
            </Button>
            {connected && (
              <Button
                variant="outline"
                onClick={() => testM.mutate()}
                disabled={testM.isPending || !activeBrand}
              >
                <CheckCircle2 className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() =>
                qc.invalidateQueries({ queryKey: ["ads-insights", provider, activeBrand] })
              }
              disabled={!connected || insightsQ.isFetching}
            >
              <RefreshCw className={`w-4 h-4 ${insightsQ.isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {integration ? (
            <>
              {integration.status === "connected" ? (
                <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
                  <CheckCircle2 className="w-3 h-3 me-1" />
                  {T("متصل", "Connected")}
                </Badge>
              ) : integration.status === "error" ? (
                <Badge variant="destructive">
                  <AlertCircle className="w-3 h-3 me-1" />
                  {T("خطأ", "Error")}
                </Badge>
              ) : (
                <Badge variant="outline">{T("غير متصل", "Not connected")}</Badge>
              )}
              {integration.last_sync_at && (
                <span className="text-muted-foreground">
                  {T("آخر مزامنة", "Last sync")}:{" "}
                  {new Date(integration.last_sync_at).toLocaleString("en-US")}
                </span>
              )}
              {integration.last_error && (
                <span className="text-destructive truncate max-w-full">
                  {integration.last_error}
                </span>
              )}
            </>
          ) : (
            <Badge variant="outline">{T("لم يتم الربط بعد", "Not connected yet")}</Badge>
          )}
        </div>
      </Card>

      {!connected && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {T(
            `اربط حساب ${meta.name} لهذا البراند لعرض الأرقام مباشرة من الاد أكونت.`,
            `Connect a ${meta.name} account for this brand to display numbers directly from the ad account.`,
          )}
        </Card>
      )}

      {connected && insightsQ.isLoading && (
        <Card className="p-8 text-center text-muted-foreground">
          {T("جاري تحميل الأرقام...", "Loading numbers...")}
        </Card>
      )}
      {connected && insightsQ.isError && (
        <Card className="p-6 text-sm text-destructive">
          {T("فشل السحب", "Fetch failed")}:{" "}
          {String((insightsQ.error as Error)?.message ?? insightsQ.error)}
        </Card>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Spend" value={fmt(data.totals.spend, 2)} sub={data.currency ?? ""} />
            <Kpi label="Impressions" value={fmt(data.totals.impressions)} />
            <Kpi label="Clicks" value={fmt(data.totals.clicks)} />
            <Kpi label="CTR" value={`${fmt(data.totals.ctr, 2)}%`} />
            <Kpi label="CPC" value={fmt(data.totals.cpc, 2)} sub={data.currency ?? ""} />
            <Kpi label="CPM" value={fmt(data.totals.cpm, 2)} sub={data.currency ?? ""} />
            <Kpi label="Conversions" value={fmt(data.totals.conversions)} />
            <Kpi
              label="Purchase Value"
              value={fmt(data.totals.revenue, 2)}
              sub={data.currency ?? ""}
            />
            <Kpi label="CPA" value={fmt(data.totals.cpa, 2)} sub={data.currency ?? ""} />
            <Kpi
              label="ROAS"
              value={`${fmt(data.totals.roas, 2)}x`}
              highlight={data.totals.roas >= 2}
            />
          </div>

          <Card className="card-gradient p-4 md:p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">{T("الأداء اليومي", "Daily Performance")}</h3>
              <span className="text-xs text-muted-foreground">
                {T(`آخر ${days} يوم`, `Last ${days} days`)}
              </span>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.daily}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis yAxisId="left" fontSize={11} />
                  <YAxis yAxisId="right" orientation="right" fontSize={11} />
                  <Tooltip />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="spend"
                    stroke="hsl(var(--primary))"
                    name="Spend"
                    dot={false}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="conversions"
                    stroke="#10b981"
                    name="Conversions"
                    dot={false}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="revenue"
                    stroke="#f59e0b"
                    name="Revenue"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="card-gradient p-4 md:p-5">
            <h3 className="font-semibold mb-3">
              {T("أعلى الحملات أداءً", "Top Performing Campaigns")}
            </h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead className="text-end">Spend</TableHead>
                    <TableHead className="text-end">Impr.</TableHead>
                    <TableHead className="text-end">Clicks</TableHead>
                    <TableHead className="text-end">CTR</TableHead>
                    <TableHead className="text-end">Conv.</TableHead>
                    <TableHead className="text-end">Revenue</TableHead>
                    <TableHead className="text-end">ROAS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.topCampaigns.map((c, i) => (
                    <TableRow key={`${c.name}-${i}`}>
                      <TableCell className="max-w-[220px] truncate">{c.name}</TableCell>
                      <TableCell className="text-end">{fmt(c.spend, 2)}</TableCell>
                      <TableCell className="text-end">{fmt(c.impressions)}</TableCell>
                      <TableCell className="text-end">{fmt(c.clicks)}</TableCell>
                      <TableCell className="text-end">{fmt(c.ctr, 2)}%</TableCell>
                      <TableCell className="text-end">{fmt(c.conversions)}</TableCell>
                      <TableCell className="text-end">{fmt(c.revenue, 2)}</TableCell>
                      <TableCell className="text-end">{fmt(c.roas, 2)}x</TableCell>
                    </TableRow>
                  ))}
                  {data.topCampaigns.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                        {T("لا توجد حملات في هذه الفترة", "No campaigns in this period")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}

      {configOpen && activeBrand && (
        <ConfigDialog
          provider={provider}
          brand_id={activeBrand}
          brand_name={productBrands.find((b) => b.id === activeBrand)?.name ?? ""}
          current={
            integration
              ? { [meta.idField]: String(integration.config?.[meta.idField] ?? "") }
              : null
          }
          onClose={() => setConfigOpen(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["integrations"] });
            qc.invalidateQueries({ queryKey: ["ads-insights", provider, activeBrand] });
          }}
        />
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <Card className={`p-3 ${highlight ? "border-emerald-500/40" : ""}`}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-lg md:text-xl font-bold mt-1">
        {value}
        {sub && <span className="text-xs text-muted-foreground ms-1">{sub}</span>}
      </div>
    </Card>
  );
}

function ConfigDialog({
  provider,
  brand_id,
  brand_name,
  current,
  onClose,
  onSaved,
}: {
  provider: ProviderKey;
  brand_id: string;
  brand_name: string;
  current: Record<string, string> | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const meta = PROVIDER_META[provider];
  const save = useServerFn(saveIntegration);
  const del = useServerFn(deleteIntegration);
  const [accountId, setAccountId] = useState(current?.[meta.idField] ?? "");
  const [token, setToken] = useState("");

  const saveM = useMutation({
    mutationFn: async () => {
      if (!accountId.trim() || !token.trim())
        throw new Error(T("املأ كل الحقول", "Fill in all fields"));
      return save({
        data: {
          brand_id,
          provider,
          credentials: { access_token: token.trim() },
          config: { [meta.idField]: accountId.trim() },
        },
      });
    },
    onSuccess: () => {
      toast.success(T("تم الحفظ", "Saved"));
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(String(e)),
  });

  const delM = useMutation({
    mutationFn: () => del({ data: { brand_id, provider } }),
    onSuccess: () => {
      toast.success(T("تم فصل الاتصال", "Connection disconnected"));
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {meta.name} — {brand_name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{meta.idLabel}</Label>
            <Input
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder={meta.idPlaceholder(lang)}
            />
            <p className="text-[11px] text-muted-foreground mt-1">{meta.idHint}</p>
          </div>
          <div>
            <Label>{meta.tokenLabel}</Label>
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={meta.tokenPlaceholder}
            />
            <p className="text-[11px] text-muted-foreground mt-1">{meta.tokenHint(lang)}</p>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {T(
              "التوكن يُخزّن مشفّرًا (AES-256-GCM) ولا يظهر مرة أخرى.",
              "The token is stored encrypted (AES-256-GCM) and will not be shown again.",
            )}
          </p>
        </div>
        <DialogFooter className="gap-2">
          {current && (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                if (confirm(T("فصل هذا الاتصال؟", "Disconnect this connection?"))) delM.mutate();
              }}
            >
              {T("فصل", "Disconnect")}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            {T("إلغاء", "Cancel")}
          </Button>
          <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>
            {T("حفظ", "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
