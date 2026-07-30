import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ctx = { supabase: any; userId: string };
type AdsProvider = "meta_ads" | "tiktok_ads";

async function assertManager(context: Ctx) {
  const results = await Promise.all(
    ["admin", "manager"].map((r) =>
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: r }),
    ),
  );
  if (!results.some((r) => !r.error && r.data === true)) throw new Error("Forbidden");
}

async function assertBrandAccess(context: Ctx, brandId: string) {
  const { data, error } = await context.supabase.rpc("has_brand_access", {
    _user_id: context.userId, _brand_id: brandId,
  });
  if (error || data !== true) throw new Error("Forbidden: brand access denied");
}

async function loadCreds(context: Ctx, brand_id: string, provider: AdsProvider) {
  await assertBrandAccess(context, brand_id);
  const { data, error } = await context.supabase
    .from("brand_integrations")
    .select("credentials_ciphertext, config")
    .eq("brand_id", brand_id).eq("provider", provider).maybeSingle();
  if (error) throw error;
  if (!data?.credentials_ciphertext) throw new Error("لا يوجد اتصال محفوظ لهذا المزود");
  const { decryptConnectionKey } = await import("@/server/connectionKeyCrypto");
  const creds = JSON.parse(decryptConnectionKey(data.credentials_ciphertext));
  return { creds, config: (data.config ?? {}) as Record<string, any> };
}

async function updateStatus(
  context: Ctx, brand_id: string, provider: AdsProvider,
  patch: { status?: string; last_error?: string | null; last_sync_at?: string; last_sync_summary?: Record<string, any> },
) {
  await context.supabase.from("brand_integrations").update(patch)
    .eq("brand_id", brand_id).eq("provider", provider);
}

/* ================= META ADS ================= */
const META_VERSION = "v20.0";
const META_BASE = `https://graph.facebook.com/${META_VERSION}`;

function normalizeAdAccount(id: string) {
  const t = id.trim();
  return t.startsWith("act_") ? t : `act_${t}`;
}

export const testMetaAds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    try {
      const { creds, config } = await loadCreds(context, data.brand_id, "meta_ads");
      const act = normalizeAdAccount(String(config.ad_account_id ?? ""));
      if (!act || act === "act_") throw new Error("ad_account_id مفقود");
      const url = `${META_BASE}/${act}?fields=name,currency,account_status&access_token=${encodeURIComponent(creds.access_token)}`;
      const res = await fetch(url);
      const body = await res.text();
      if (!res.ok) throw new Error(`Meta ${res.status}: ${body.slice(0, 250)}`);
      const parsed = JSON.parse(body);
      await updateStatus(context, data.brand_id, "meta_ads", {
        status: "connected", last_error: null, last_sync_at: new Date().toISOString(),
        last_sync_summary: { account: parsed.name, currency: parsed.currency },
      });
      return { ok: true, account: parsed.name, currency: parsed.currency };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await updateStatus(context, data.brand_id, "meta_ads", { status: "error", last_error: msg });
      throw new Error(msg);
    }
  });

function parseMetaActions(actions: Array<{ action_type: string; value: string }> = [],
                           values: Array<{ action_type: string; value: string }> = []) {
  const purchaseTypes = new Set([
    "purchase", "offsite_conversion.fb_pixel_purchase",
    "omni_purchase", "onsite_conversion.purchase", "web_in_store_purchase",
  ]);
  let conversions = 0, revenue = 0;
  for (const a of actions) if (purchaseTypes.has(a.action_type)) conversions += Number(a.value || 0);
  for (const a of values) if (purchaseTypes.has(a.action_type)) revenue += Number(a.value || 0);
  return { conversions, revenue };
}

export type AdsInsights = {
  currency: string | null;
  totals: {
    spend: number; impressions: number; clicks: number; ctr: number; cpc: number; cpm: number;
    conversions: number; revenue: number; cpa: number; roas: number;
  };
  daily: Array<{ date: string; spend: number; impressions: number; clicks: number; conversions: number; revenue: number }>;
  topCampaigns: Array<{ name: string; spend: number; impressions: number; clicks: number; ctr: number; conversions: number; revenue: number; roas: number }>;
};

export const getMetaInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string; days?: number }) => d)
  .handler(async ({ data, context }): Promise<AdsInsights> => {
    await assertManager(context);
    const { creds, config } = await loadCreds(context, data.brand_id, "meta_ads");
    const act = normalizeAdAccount(String(config.ad_account_id ?? ""));
    if (!act || act === "act_") throw new Error("ad_account_id مفقود");
    const days = Math.min(Math.max(data.days ?? 30, 1), 90);
    const until = new Date();
    const since = new Date(Date.now() - days * 86400_000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const timeRange = encodeURIComponent(JSON.stringify({ since: iso(since), until: iso(until) }));
    const token = encodeURIComponent(creds.access_token);
    const commonFields = "spend,impressions,clicks,ctr,cpc,cpm,actions,action_values";

    const [dailyRes, campRes, acctRes] = await Promise.all([
      fetch(`${META_BASE}/${act}/insights?level=account&fields=${commonFields}&time_range=${timeRange}&time_increment=1&limit=500&access_token=${token}`),
      fetch(`${META_BASE}/${act}/insights?level=campaign&fields=campaign_name,${commonFields}&time_range=${timeRange}&limit=25&access_token=${token}`),
      fetch(`${META_BASE}/${act}?fields=currency&access_token=${token}`),
    ]);
    for (const r of [dailyRes, campRes, acctRes]) {
      if (!r.ok) throw new Error(`Meta ${r.status}: ${(await r.text()).slice(0, 250)}`);
    }
    const dailyJ = await dailyRes.json();
    const campJ = await campRes.json();
    const acctJ = await acctRes.json();

    const daily = (dailyJ.data ?? []).map((r: any) => {
      const { conversions, revenue } = parseMetaActions(r.actions, r.action_values);
      return {
        date: r.date_start ?? r.date_stop,
        spend: Number(r.spend || 0),
        impressions: Number(r.impressions || 0),
        clicks: Number(r.clicks || 0),
        conversions, revenue,
      };
    }).sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date));

    const totals = daily.reduce((s: { spend: number; impressions: number; clicks: number; conversions: number; revenue: number }, r: { spend: number; impressions: number; clicks: number; conversions: number; revenue: number }) => ({
      spend: s.spend + r.spend, impressions: s.impressions + r.impressions,
      clicks: s.clicks + r.clicks, conversions: s.conversions + r.conversions, revenue: s.revenue + r.revenue,
    }), { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 });

    const topCampaigns = (campJ.data ?? []).map((r: any) => {
      const { conversions, revenue } = parseMetaActions(r.actions, r.action_values);
      const spend = Number(r.spend || 0);
      const clicks = Number(r.clicks || 0);
      const impressions = Number(r.impressions || 0);
      return {
        name: r.campaign_name ?? "-",
        spend, impressions, clicks,
        ctr: impressions ? (clicks / impressions) * 100 : 0,
        conversions, revenue,
        roas: spend ? revenue / spend : 0,
      };
    }).sort((a: { spend: number }, b: { spend: number }) => b.spend - a.spend).slice(0, 10);

    const result: AdsInsights = {
      currency: acctJ.currency ?? null,
      totals: {
        ...totals,
        ctr: totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0,
        cpc: totals.clicks ? totals.spend / totals.clicks : 0,
        cpm: totals.impressions ? (totals.spend / totals.impressions) * 1000 : 0,
        cpa: totals.conversions ? totals.spend / totals.conversions : 0,
        roas: totals.spend ? totals.revenue / totals.spend : 0,
      },
      daily, topCampaigns,
    };
    await updateStatus(context, data.brand_id, "meta_ads", {
      status: "connected", last_error: null, last_sync_at: new Date().toISOString(),
      last_sync_summary: { spend: result.totals.spend, conversions: result.totals.conversions, days },
    });
    return result;
  });

/* ================= TIKTOK ADS ================= */
const TIKTOK_BASE = "https://business-api.tiktok.com/open_api/v1.3";

export const testTikTokAds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    try {
      const { creds, config } = await loadCreds(context, data.brand_id, "tiktok_ads");
      const advertiser_id = String(config.advertiser_id ?? "").trim();
      if (!advertiser_id) throw new Error("advertiser_id مفقود");
      const url = `${TIKTOK_BASE}/advertiser/info/?advertiser_ids=${encodeURIComponent(JSON.stringify([advertiser_id]))}`;
      const res = await fetch(url, { headers: { "Access-Token": creds.access_token, Accept: "application/json" } });
      const body = await res.text();
      if (!res.ok) throw new Error(`TikTok ${res.status}: ${body.slice(0, 250)}`);
      const parsed = JSON.parse(body);
      if (parsed.code && parsed.code !== 0) throw new Error(`TikTok: ${parsed.message ?? "error"}`);
      const info = parsed?.data?.list?.[0] ?? parsed?.data?.[0];
      await updateStatus(context, data.brand_id, "tiktok_ads", {
        status: "connected", last_error: null, last_sync_at: new Date().toISOString(),
        last_sync_summary: { account: info?.name ?? info?.advertiser_name, currency: info?.currency },
      });
      return { ok: true, account: info?.name ?? info?.advertiser_name, currency: info?.currency };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await updateStatus(context, data.brand_id, "tiktok_ads", { status: "error", last_error: msg });
      throw new Error(msg);
    }
  });

async function tiktokReport(token: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${TIKTOK_BASE}/report/integrated/get/?${qs}`, {
    headers: { "Access-Token": token, Accept: "application/json" },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`TikTok ${res.status}: ${body.slice(0, 250)}`);
  const parsed = JSON.parse(body);
  if (parsed.code && parsed.code !== 0) throw new Error(`TikTok: ${parsed.message ?? "error"}`);
  return (parsed?.data?.list ?? []) as Array<{ dimensions: Record<string, string>; metrics: Record<string, string> }>;
}

export const getTikTokInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string; days?: number }) => d)
  .handler(async ({ data, context }): Promise<AdsInsights> => {
    await assertManager(context);
    const { creds, config } = await loadCreds(context, data.brand_id, "tiktok_ads");
    const advertiser_id = String(config.advertiser_id ?? "").trim();
    if (!advertiser_id) throw new Error("advertiser_id مفقود");
    const days = Math.min(Math.max(data.days ?? 30, 1), 90);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const start_date = iso(new Date(Date.now() - days * 86400_000));
    const end_date = iso(new Date());
    const metrics = ["spend", "impressions", "clicks", "ctr", "cpc", "cpm", "conversion", "total_purchase_value"];

    const [dailyRows, campaignRows] = await Promise.all([
      tiktokReport(creds.access_token, {
        advertiser_id, report_type: "BASIC", data_level: "AUCTION_ADVERTISER",
        dimensions: JSON.stringify(["stat_time_day"]), metrics: JSON.stringify(metrics),
        start_date, end_date, service_type: "AUCTION", page_size: "365",
      }),
      tiktokReport(creds.access_token, {
        advertiser_id, report_type: "BASIC", data_level: "AUCTION_CAMPAIGN",
        dimensions: JSON.stringify(["campaign_id"]),
        metrics: JSON.stringify(["campaign_name", ...metrics]),
        start_date, end_date, service_type: "AUCTION", page_size: "50",
      }),
    ]);

    const daily = dailyRows.map((r) => ({
      date: (r.dimensions.stat_time_day ?? "").slice(0, 10),
      spend: Number(r.metrics.spend || 0),
      impressions: Number(r.metrics.impressions || 0),
      clicks: Number(r.metrics.clicks || 0),
      conversions: Number(r.metrics.conversion || 0),
      revenue: Number(r.metrics.total_purchase_value || 0),
    })).sort((a, b) => a.date.localeCompare(b.date));

    const totals = daily.reduce((s, r) => ({
      spend: s.spend + r.spend, impressions: s.impressions + r.impressions,
      clicks: s.clicks + r.clicks, conversions: s.conversions + r.conversions, revenue: s.revenue + r.revenue,
    }), { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 });

    const topCampaigns = campaignRows.map((r) => {
      const spend = Number(r.metrics.spend || 0);
      const impressions = Number(r.metrics.impressions || 0);
      const clicks = Number(r.metrics.clicks || 0);
      const conversions = Number(r.metrics.conversion || 0);
      const revenue = Number(r.metrics.total_purchase_value || 0);
      return {
        name: String(r.metrics.campaign_name ?? "-"),
        spend, impressions, clicks,
        ctr: impressions ? (clicks / impressions) * 100 : 0,
        conversions, revenue,
        roas: spend ? revenue / spend : 0,
      };
    }).sort((a, b) => b.spend - a.spend).slice(0, 10);

    const result: AdsInsights = {
      currency: null,
      totals: {
        ...totals,
        ctr: totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0,
        cpc: totals.clicks ? totals.spend / totals.clicks : 0,
        cpm: totals.impressions ? (totals.spend / totals.impressions) * 1000 : 0,
        cpa: totals.conversions ? totals.spend / totals.conversions : 0,
        roas: totals.spend ? totals.revenue / totals.spend : 0,
      },
      daily, topCampaigns,
    };
    await updateStatus(context, data.brand_id, "tiktok_ads", {
      status: "connected", last_error: null, last_sync_at: new Date().toISOString(),
      last_sync_summary: { spend: result.totals.spend, conversions: result.totals.conversions, days },
    });
    return result;
  });
