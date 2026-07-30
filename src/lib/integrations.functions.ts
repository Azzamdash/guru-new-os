import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

const PROVIDERS = ["shopify", "bosta", "aramex", "mylerz", "shipblu", "meta_ads", "tiktok_ads"] as const;
type Provider = (typeof PROVIDERS)[number];

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
    _user_id: context.userId,
    _brand_id: brandId,
  });
  if (error || data !== true) throw new Error("Forbidden: brand access denied");
}

// ============ LIST INTEGRATIONS ============
export const listIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertManager(context);
    const { data, error } = await context.supabase
      .from("brand_integrations")
      .select("id, brand_id, provider, status, config, last_sync_at, last_sync_summary, last_error, updated_at");
    if (error) throw error;
    return data as Array<{
      id: string;
      brand_id: string;
      provider: Provider;
      status: string;
      config: Record<string, any>;
      last_sync_at: string | null;
      last_sync_summary: Record<string, any> | null;
      last_error: string | null;
      updated_at: string;
    }>;
  });

// ============ SAVE CREDENTIALS ============
export const saveIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    brand_id: string;
    provider: Provider;
    credentials: Record<string, string>; // opaque; encrypted before storage
    config?: Record<string, any>;    // non-secret metadata (e.g. shop domain)
  }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    await assertBrandAccess(context, data.brand_id);
    if (!PROVIDERS.includes(data.provider)) throw new Error("Unknown provider");

    const { encryptConnectionKey } = await import("@/server/connectionKeyCrypto");
    const cipher = encryptConnectionKey(JSON.stringify(data.credentials));

    const { error } = await context.supabase.from("brand_integrations").upsert(
      {
        brand_id: data.brand_id,
        provider: data.provider,
        credentials_ciphertext: cipher,
        config: data.config ?? {},
        status: "connected",
        last_error: null,
      },
      { onConflict: "brand_id,provider" },
    );
    if (error) throw error;
    return { ok: true };
  });

// ============ DELETE ============
export const deleteIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string; provider: Provider }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    await assertBrandAccess(context, data.brand_id);
    const { error } = await context.supabase
      .from("brand_integrations")
      .delete()
      .eq("brand_id", data.brand_id)
      .eq("provider", data.provider);
    if (error) throw error;
    return { ok: true };
  });

// ============ HELPERS ============
async function loadCreds(
  context: Ctx,
  brand_id: string,
  provider: Provider,
): Promise<{ creds: Record<string, string>; config: Record<string, any> }> {
  await assertBrandAccess(context, brand_id);
  const { data, error } = await context.supabase
    .from("brand_integrations")
    .select("credentials_ciphertext, config")
    .eq("brand_id", brand_id)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw error;
  if (!data?.credentials_ciphertext) throw new Error("لا يوجد اتصال محفوظ لهذا المزود");
  const { decryptConnectionKey } = await import("@/server/connectionKeyCrypto");
  const creds = JSON.parse(decryptConnectionKey(data.credentials_ciphertext));
  return { creds, config: data.config ?? {} };
}

async function updateStatus(
  context: Ctx,
  brand_id: string,
  provider: Provider,
  patch: { status?: string; last_error?: string | null; last_sync_at?: string; last_sync_summary?: Record<string, any> },
) {
  await context.supabase
    .from("brand_integrations")
    .update(patch)
    .eq("brand_id", brand_id)
    .eq("provider", provider);
}

// ============ SHOPIFY TEST + SYNC ============
function shopifyBase(config: Record<string, any>) {
  const shop = String(config.shop_domain ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!shop) throw new Error("shop_domain مفقود");
  const domain = shop.includes(".myshopify.com") ? shop : `${shop}.myshopify.com`;
  const version = String(config.api_version ?? "2024-10");
  return `https://${domain}/admin/api/${version}`;
}

export const testShopify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    try {
      const { creds, config } = await loadCreds(context, data.brand_id, "shopify");
      const res = await fetch(`${shopifyBase(config)}/shop.json`, {
        headers: { "X-Shopify-Access-Token": creds.access_token, Accept: "application/json" },
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`Shopify ${res.status}: ${body.slice(0, 200)}`);
      const parsed = JSON.parse(body);
      await updateStatus(context, data.brand_id, "shopify", {
        status: "connected",
        last_error: null,
        last_sync_at: new Date().toISOString(),
        last_sync_summary: { shop_name: parsed.shop?.name, currency: parsed.shop?.currency },
      });
      return { ok: true, shop: parsed.shop?.name, currency: parsed.shop?.currency };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await updateStatus(context, data.brand_id, "shopify", { status: "error", last_error: msg });
      throw new Error(msg);
    }
  });

export const syncShopifyOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string; days?: number }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    try {
      const { creds, config } = await loadCreds(context, data.brand_id, "shopify");
      const days = Math.min(Math.max(data.days ?? 7, 1), 90);
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      const url = `${shopifyBase(config)}/orders.json?status=any&limit=50&created_at_min=${encodeURIComponent(since)}`;
      const res = await fetch(url, {
        headers: { "X-Shopify-Access-Token": creds.access_token, Accept: "application/json" },
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`Shopify ${res.status}: ${body.slice(0, 200)}`);
      const parsed = JSON.parse(body);
      const orders = (parsed.orders ?? []) as Array<{ total_price: string; financial_status: string; fulfillment_status: string | null }>;
      const total = orders.reduce((s, o) => s + Number(o.total_price || 0), 0);
      const summary = {
        orders: orders.length,
        total_amount: total,
        paid: orders.filter((o) => o.financial_status === "paid").length,
        fulfilled: orders.filter((o) => o.fulfillment_status === "fulfilled").length,
        since,
      };
      await updateStatus(context, data.brand_id, "shopify", {
        status: "connected",
        last_error: null,
        last_sync_at: new Date().toISOString(),
        last_sync_summary: summary,
      });
      return summary;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await updateStatus(context, data.brand_id, "shopify", { status: "error", last_error: msg });
      throw new Error(msg);
    }
  });

// Manually (re-)register Shopify webhooks for a brand. Same logic auto-runs on OAuth callback.
export const registerShopifyWebhooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string; origin: string }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    await assertBrandAccess(context, data.brand_id);
    const { registerShopifyWebhooksForBrand } = await import("@/server/shopifyWebhooks.server");
    try {
      const res = await registerShopifyWebhooksForBrand(data.brand_id, data.origin);
      await updateStatus(context, data.brand_id, "shopify", { last_error: null });
      return res;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await updateStatus(context, data.brand_id, "shopify", { last_error: `webhook_register: ${msg}` });
      throw new Error(msg);
    }
  });

// ============ SHOPIFY OAUTH (Client ID / Secret) ============
const SHOPIFY_OAUTH_SCOPES = "read_orders,write_orders,read_products,write_products,read_customers,write_customers,read_inventory,write_inventory,read_fulfillments,write_fulfillments,read_locations";

function normalizeShopDomain(input: string): string {
  const shop = input.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
  if (!shop) throw new Error("shop_domain مفقود");
  return shop.includes(".myshopify.com") ? shop : `${shop}.myshopify.com`;
}

export const startShopifyOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    brand_id: string;
    shop_domain: string;
    client_id: string;
    client_secret: string;
    redirect_uri: string;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    await assertBrandAccess(context, data.brand_id);
    if (!data.client_id.trim() || !data.client_secret.trim()) throw new Error("client_id و client_secret مطلوبان");
    if (!/^https?:\/\//.test(data.redirect_uri)) throw new Error("redirect_uri غير صالح");
    const shop = normalizeShopDomain(data.shop_domain);

    const { encryptConnectionKey } = await import("@/server/connectionKeyCrypto");
    const pendingCreds = { client_id: data.client_id.trim(), client_secret: data.client_secret.trim() };
    const cipher = encryptConnectionKey(JSON.stringify(pendingCreds));

    const { error } = await context.supabase.from("brand_integrations").upsert(
      {
        brand_id: data.brand_id,
        provider: "shopify",
        credentials_ciphertext: cipher,
        config: { shop_domain: shop, redirect_uri: data.redirect_uri, auth_mode: "oauth" },
        status: "pending",
        last_error: null,
      },
      { onConflict: "brand_id,provider" },
    );
    if (error) throw error;

    const { randomBytes } = await import("node:crypto");
    const nonce = randomBytes(16).toString("hex");
    const encryptedState = encryptConnectionKey(JSON.stringify({ brand_id: data.brand_id, shop, nonce, ts: Date.now() }));
    const state = Buffer.from(encryptedState, "utf8").toString("base64url");

    const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${encodeURIComponent(data.client_id.trim())}`
      + `&scope=${encodeURIComponent(SHOPIFY_OAUTH_SCOPES)}`
      + `&redirect_uri=${encodeURIComponent(data.redirect_uri)}`
      + `&state=${encodeURIComponent(state)}`;
    return { authorization_url: authUrl };
  });

// ============ LIST SHOPIFY ORDERS (LIVE) ============
export const listShopifyOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string; days?: number; limit?: number }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const { creds, config } = await loadCreds(context, data.brand_id, "shopify");
    const days = Math.min(Math.max(data.days ?? 30, 1), 90);
    const limit = Math.min(Math.max(data.limit ?? 100, 1), 250);
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    const fields = "id,name,created_at,total_price,currency,financial_status,fulfillment_status,customer,line_items";
    const url = `${shopifyBase(config)}/orders.json?status=any&limit=${limit}&created_at_min=${encodeURIComponent(since)}&fields=${encodeURIComponent(fields)}`;
    const res = await fetch(url, {
      headers: { "X-Shopify-Access-Token": creds.access_token, Accept: "application/json" },
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`Shopify ${res.status}: ${body.slice(0, 200)}`);
    const parsed = JSON.parse(body);
    type LI = { title: string; quantity: number; price: string };
    const orders = (parsed.orders ?? []).map((o: {
      id: number; name: string; created_at: string; total_price: string; currency: string;
      financial_status: string; fulfillment_status: string | null;
      customer?: { first_name?: string; last_name?: string; email?: string } | null;
      line_items?: LI[];
    }) => ({
      id: o.id,
      name: o.name,
      created_at: o.created_at,
      total: Number(o.total_price || 0),
      currency: o.currency,
      financial_status: o.financial_status,
      fulfillment_status: o.fulfillment_status ?? "unfulfilled",
      customer: [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(" ") || o.customer?.email || "-",
      items: (o.line_items ?? []).reduce((s, li) => s + Number(li.quantity || 0), 0),
      top_item: o.line_items?.[0]?.title ?? "-",
    }));
    return { since, orders };
  });

// ============ BOSTA ============
export const testBosta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const { logIntegrationEvent } = await import("@/server/integrationLogger");
    const started = Date.now();
    try {
      const { creds } = await loadCreds(context, data.brand_id, "bosta");
      const url = "https://app.bosta.co/api/v1/cities";
      await logIntegrationEvent(context.supabase, {
        provider: "bosta", brand_id: data.brand_id, direction: "outgoing",
        operation: "test_connection", status: "info", actor_id: context.userId,
        request: { url, method: "GET" }, reason: "starting test",
      });
      const res = await fetch(url, {
        headers: { Authorization: creds.api_key, Accept: "application/json", "X-Requested-By": "e-gurus" },
      });
      const body = await res.text();
      if (!res.ok) {
        await logIntegrationEvent(context.supabase, {
          provider: "bosta", brand_id: data.brand_id, direction: "outgoing",
          operation: "test_connection", status: "error", http_status: res.status,
          reason: `HTTP ${res.status}`, response: body.slice(0, 500),
          metadata: { duration_ms: Date.now() - started }, actor_id: context.userId,
        });
        throw new Error(`Bosta ${res.status}: ${body.slice(0, 200)}`);
      }
      const parsed = JSON.parse(body);
      if (parsed?.success === false) {
        await logIntegrationEvent(context.supabase, {
          provider: "bosta", brand_id: data.brand_id, direction: "outgoing",
          operation: "test_connection", status: "error", http_status: res.status,
          reason: parsed?.message ?? "success=false", response: parsed,
          metadata: { duration_ms: Date.now() - started }, actor_id: context.userId,
        });
        throw new Error(`Bosta: ${parsed?.message ?? "فشل اختبار الاتصال"}`);
      }
      const name = "Bosta API";
      await updateStatus(context, data.brand_id, "bosta", {
        status: "connected",
        last_error: null,
        last_sync_at: new Date().toISOString(),
        last_sync_summary: { account: name, cities: Array.isArray(parsed?.data) ? parsed.data.length : undefined },
      });
      await logIntegrationEvent(context.supabase, {
        provider: "bosta", brand_id: data.brand_id, direction: "outgoing",
        operation: "test_connection", status: "success", http_status: res.status,
        reason: "connected", metadata: { duration_ms: Date.now() - started, cities: Array.isArray(parsed?.data) ? parsed.data.length : undefined },
        actor_id: context.userId,
      });
      return { ok: true, account: name };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await updateStatus(context, data.brand_id, "bosta", { status: "error", last_error: msg });
      await logIntegrationEvent(context.supabase, {
        provider: "bosta", brand_id: data.brand_id, direction: "outgoing",
        operation: "test_connection", status: "error", reason: msg,
        metadata: { duration_ms: Date.now() - started }, actor_id: context.userId,
      });
      throw new Error(msg);
    }
  });

export const syncBostaDeliveries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string; days?: number }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const { logIntegrationEvent } = await import("@/server/integrationLogger");
    const started = Date.now();
    try {
      const { creds } = await loadCreds(context, data.brand_id, "bosta");
      const days = Math.min(Math.max(data.days ?? 7, 1), 90);
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      const url = "https://app.bosta.co/api/v2/deliveries/search";
      const reqBody = { pageNumber: 0, pageLimit: 100, createdAtStart: since };
      await logIntegrationEvent(context.supabase, {
        provider: "bosta", brand_id: data.brand_id, direction: "outgoing",
        operation: "sync_deliveries", status: "info", request: { url, days, since },
        reason: "starting sync", actor_id: context.userId,
      });
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: creds.api_key,
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Requested-By": "e-gurus",
        },
        body: JSON.stringify(reqBody),
      });
      const body = await res.text();
      if (!res.ok) {
        await logIntegrationEvent(context.supabase, {
          provider: "bosta", brand_id: data.brand_id, direction: "outgoing",
          operation: "sync_deliveries", status: "error", http_status: res.status,
          reason: `HTTP ${res.status}`, response: body.slice(0, 500),
          metadata: { duration_ms: Date.now() - started }, actor_id: context.userId,
        });
        throw new Error(`Bosta ${res.status}: ${body.slice(0, 200)}`);
      }
      const parsed = JSON.parse(body);
      if (parsed?.success === false) {
        await logIntegrationEvent(context.supabase, {
          provider: "bosta", brand_id: data.brand_id, direction: "outgoing",
          operation: "sync_deliveries", status: "error", http_status: res.status,
          reason: parsed?.message ?? "success=false",
          metadata: { duration_ms: Date.now() - started }, actor_id: context.userId,
        });
        throw new Error(`Bosta: ${parsed?.message ?? "فشل المزامنة"}`);
      }
      const list = (parsed?.data?.deliveries ?? parsed?.data?.list ?? parsed?.data ?? []) as Array<{
        state?: { value?: string } | string;
        status?: string;
        cod?: number;
        amount?: number;
        createdAt?: string;
        created_at?: string;
      }>;
      const recent = list.filter((d) => {
        const created = d.createdAt ?? d.created_at;
        return !created || new Date(created).getTime() >= new Date(since).getTime();
      });
      const statusOf = (d: { state?: { value?: string } | string; status?: string }) =>
        (typeof d.state === "string" ? d.state : d.state?.value ?? d.status ?? "").toLowerCase();
      const delivered = recent.filter((d) => statusOf(d).includes("delivered")).length;
      const returned = recent.filter((d) => statusOf(d).includes("return")).length;
      const cod = recent.reduce((s, d) => s + Number(d.cod ?? d.amount ?? 0), 0);
      const summary = { deliveries: recent.length, delivered, returned, cod_total: cod, since };
      await updateStatus(context, data.brand_id, "bosta", {
        status: "connected",
        last_error: null,
        last_sync_at: new Date().toISOString(),
        last_sync_summary: summary,
      });
      await logIntegrationEvent(context.supabase, {
        provider: "bosta", brand_id: data.brand_id, direction: "outgoing",
        operation: "sync_deliveries", status: "success", http_status: res.status,
        reason: `synced ${recent.length} deliveries`,
        metadata: { duration_ms: Date.now() - started, ...summary },
        actor_id: context.userId,
      });
      return summary;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await updateStatus(context, data.brand_id, "bosta", { status: "error", last_error: msg });
      await logIntegrationEvent(context.supabase, {
        provider: "bosta", brand_id: data.brand_id, direction: "outgoing",
        operation: "sync_deliveries", status: "error", reason: msg,
        metadata: { duration_ms: Date.now() - started }, actor_id: context.userId,
      });
      throw new Error(msg);
    }
  });

// ============ SEND SHIPMENT TO BOSTA ============
export const sendBostaShipment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { order_id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const { logIntegrationEvent } = await import("@/server/integrationLogger");
    const started = Date.now();

    // 1) Load order
    const { data: order, error: oErr } = await context.supabase
      .from("orders")
      .select("id, brand_id, external_order_number, customer_name, customer_phone, customer_email, shipping_governorate, shipping_address, building_number, floor_number, apartment_number, total_amount, financial_status, fulfillment_status, note, raw")
      .eq("id", data.order_id)
      .maybeSingle();
    if (oErr) throw new Error(oErr.message);
    if (!order) throw new Error("Order not found");
    if (!order.brand_id) throw new Error("Order missing brand");
    await assertBrandAccess(context, order.brand_id);

    if ((order.raw as any)?.bosta_tracking) {
      throw new Error(`تم إرسال هذا الأوردر لبوسطة مسبقاً — رقم التتبع: ${(order.raw as any).bosta_tracking}`);
    }
    if (!order.customer_phone) throw new Error("رقم تليفون العميل مفقود");
    if (!order.shipping_governorate) throw new Error("المحافظة مفقودة");
    if (!order.shipping_address) throw new Error("عنوان الشحن مفقود");

    // 2) Load items for description
    const { data: items } = await context.supabase
      .from("order_items")
      .select("title, qty")
      .eq("order_id", data.order_id);
    const itemsCount = (items ?? []).reduce((s: number, i: any) => s + Number(i.qty || 1), 0) || 1;
    const description = (items ?? []).map((i: any) => `${i.title} x${i.qty}`).join(", ").slice(0, 250) || "طلب";

    // 3) Credentials
    const { creds } = await loadCreds(context, order.brand_id, "bosta");

    // 4) Resolve city ID via Bosta cities lookup
    const citiesRes = await fetch("https://app.bosta.co/api/v1/cities", {
      headers: { Authorization: creds.api_key, Accept: "application/json" },
    });
    if (!citiesRes.ok) throw new Error(`Bosta cities ${citiesRes.status}`);
    const citiesJson = await citiesRes.json();
    const cities: Array<any> = Array.isArray(citiesJson?.data) ? citiesJson.data : [];
    const normalize = (value: unknown) => String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[إأآا]/g, "ا")
      .replace(/[ىي]/g, "ي")
      .replace(/[ة]/g, "ه")
      .replace(/\s+/g, " ");
    const governorateAliases: Record<string, string[]> = {
      Cairo: ["القاهرة", "القاهره", "cairo", "greater cairo"],
      Alexandria: ["الإسكندرية", "الاسكندرية", "اسكندريه", "alexandria"],
      Giza: ["الجيزة", "الجيزه", "giza"],
      Qalyubia: ["القليوبية", "القليوبيه", "qalyubia", "qaliubiya"],
      Dakahlia: ["الدقهلية", "الدقهليه", "dakahlia"],
      Sharqia: ["الشرقية", "الشرقيه", "sharqia", "sharkia"],
      Gharbia: ["الغربية", "الغربيه", "gharbia"],
      Monufia: ["المنوفية", "المنوفيه", "menofia", "monufia"],
      Beheira: ["البحيرة", "البحيره", "beheira", "behera"],
      KafrElSheikh: ["كفر الشيخ", "kafr el sheikh", "kafr elsheikh"],
      Damietta: ["دمياط", "damietta"],
      PortSaid: ["بورسعيد", "port said", "portsaid"],
      Ismailia: ["الإسماعيلية", "الاسماعيلية", "ismailia"],
      Suez: ["السويس", "suez"],
      Fayoum: ["الفيوم", "fayoum"],
      BeniSuef: ["بني سويف", "بنى سويف", "beni suef", "bani suef"],
      Minya: ["المنيا", "minya"],
      Assiut: ["أسيوط", "اسيوط", "assiut", "asyut"],
      Sohag: ["سوهاج", "sohag"],
      Qena: ["قنا", "qena"],
      Luxor: ["الأقصر", "الاقصر", "luxor"],
      Aswan: ["أسوان", "اسوان", "aswan"],
      RedSea: ["البحر الأحمر", "البحر الاحمر", "red sea"],
      Matrouh: ["مطروح", "matrouh", "marsa matrouh"],
      NorthSinai: ["شمال سيناء", "north sinai"],
      SouthSinai: ["جنوب سيناء", "south sinai"],
      NewValley: ["الوادي الجديد", "الوادى الجديد", "new valley"],
    };
    const governorateCodes: Record<string, string> = {
      Cairo: "EG-01",
      Alexandria: "EG-02",
      Beheira: "EG-04",
      Dakahlia: "EG-05",
      Qalyubia: "EG-06",
      Gharbia: "EG-07",
      KafrElSheikh: "EG-08",
      Monufia: "EG-09",
      Sharqia: "EG-10",
      Ismailia: "EG-11",
      Suez: "EG-12",
      PortSaid: "EG-13",
      Damietta: "EG-14",
      Fayoum: "EG-15",
      BeniSuef: "EG-16",
      Assiut: "EG-17",
      Sohag: "EG-18",
      Minya: "EG-19",
      Qena: "EG-20",
      Aswan: "EG-21",
      Luxor: "EG-22",
      RedSea: "EG-23",
      NewValley: "EG-24",
      Giza: "EG-25",
      SouthSinai: "EG-26",
      NorthSinai: "EG-27",
      Matrouh: "EG-28",
    };
    const target = normalize(order.shipping_governorate);
    const canonical = Object.entries(governorateAliases).find(([, aliases]) => aliases.some((alias) => normalize(alias) === target))?.[0];
    const searchableTargets = new Set([target, canonical ? normalize(canonical) : ""]);
    const city = cities.find((c: any) => {
      const values = [c.name, c.nameAr, c.cityName, c.cityNameAr, c.code, c._id, c.id].map(normalize).filter(Boolean);
      return values.some((value) => searchableTargets.has(value) || value.includes(target) || (canonical ? value.includes(normalize(canonical)) : false));
    }) ?? (canonical && governorateCodes[canonical] ? { code: governorateCodes[canonical], name: canonical } : null);
    if (!city) {
      const available = cities.slice(0, 40).map((c: any) => c.name ?? c.nameAr ?? c.cityName ?? c.code ?? c._id).filter(Boolean);
      await logIntegrationEvent(context.supabase, {
        provider: "bosta", brand_id: order.brand_id, direction: "outgoing",
        operation: "create_delivery", status: "error",
        order_id: order.id, order_number: order.external_order_number,
        reason: `city lookup failed for ${order.shipping_governorate}`,
        metadata: { governorate: order.shipping_governorate, normalized: target, canonical, available_cities: available },
        actor_id: context.userId,
      });
      throw new Error(`لم يتم إيجاد المحافظة "${order.shipping_governorate}" في قائمة بوسطة`);
    }

    const rawShipping = (order.raw as any)?.shipping_address ?? (order.raw as any)?.billing_address ?? {};
    const addressParts = [
      rawShipping.address1,
      rawShipping.address2,
      rawShipping.city,
      rawShipping.province,
      rawShipping.province_code,
      rawShipping.zip,
      order.shipping_address,
    ].filter(Boolean).map((part) => String(part).trim());
    const addressText = addressParts[0] || String(order.shipping_address).trim();
    const addressSearchText = addressParts.join(" - ");
    const addressNormalized = normalize(addressSearchText);

    // 4b) Fetch districts for the resolved city. Bosta's current API returns
    // zoneId/zoneName + districtId/districtName from the v2 city endpoint.
    const cityId = city._id ?? city.id ?? city.cityId;
    let districts: any[] = [];
    if (cityId) {
      try {
        const dRes = await fetch(`https://app.bosta.co/api/v2/cities/${cityId}/districts`, {
          headers: { Authorization: creds.api_key, Accept: "application/json" },
        });
        if (dRes.ok) {
          const dj = await dRes.json();
          districts = Array.isArray(dj?.data)
            ? dj.data
            : Array.isArray(dj?.data?.list)
              ? dj.data.list
              : Array.isArray(dj?.data?.districts)
                ? dj.data.districts
                : [];
        }
      } catch { /* fall through with empty list */ }
    }

    const normalizedWords = new Set(
      addressNormalized
        .split(/[^\p{L}\p{N}]+/u)
        .map((w) => w.trim())
        .filter((w) => w.length > 2),
    );
    const keyPhrases: Array<{ needles: string[]; zone?: string; district?: string }> = [
      { needles: ["مدينه نصر", "مدينة نصر", "nasr city"], zone: "Nasr City" },
      { needles: ["التجمع الخامس", "5th settlement", "fifth settlement"], zone: "New Cairo", district: "5th Settlement" },
      { needles: ["التجمع الاول", "1st settlement", "first settlement"], zone: "New Cairo", district: "1st Settlement" },
      { needles: ["التجمع الثالث", "3rd settlement", "third settlement"], zone: "New Cairo", district: "3rd Settlement" },
      { needles: ["التجمع", "new cairo", "القاهره الجديده", "القاهرة الجديدة"], zone: "New Cairo" },
      { needles: ["المعادي", "maadi"], zone: "Maadi" },
      { needles: ["مصر الجديده", "مصر الجديدة", "heliopolis"], zone: "Heliopolis" },
      { needles: ["الشيخ زايد", "zayed"], zone: "Sheikh Zayed" },
      { needles: ["اكتوبر", "أكتوبر", "october"], zone: "6th Of October" },
      { needles: ["المهندسين", "mohandeseen"], zone: "Mohandseen" },
      { needles: ["الدقي", "dokki"], zone: "Dokki" },
    ];
    const phraseMatch = keyPhrases.find((p) => p.needles.some((needle) => addressNormalized.includes(normalize(needle))));
    const districtValues = (d: any) => [
      d?.districtName,
      d?.districtOtherName,
      d?.name,
      d?.nameAr,
      d?.zoneName,
      d?.zoneOtherName,
    ].map((value) => String(value ?? "").trim()).filter(Boolean);
    const scoreDistrict = (d: any) => {
      const values = districtValues(d);
      let score = 0;
      for (const value of values) {
        const n = normalize(value);
        if (!n) continue;
        if (addressNormalized.includes(n)) score += 120 + Math.min(n.length, 40);
        const words = n.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
        score += words.filter((w) => normalizedWords.has(w)).length * 18;
      }
      if (phraseMatch?.zone && normalize(d?.zoneName).includes(normalize(phraseMatch.zone))) score += 90;
      if (phraseMatch?.district && normalize(d?.districtName).includes(normalize(phraseMatch.district))) score += 110;
      if (d?.dropOffAvailability === false) score -= 500;
      return score;
    };
    const scoredDistricts = districts
      .map((district) => ({ district, score: scoreDistrict(district) }))
      .sort((a, b) => b.score - a.score);
    const pickedDistrict = scoredDistricts.find((row) => row.score > 0)?.district ?? districts.find((d) => d?.dropOffAvailability !== false) ?? null;

    if (!pickedDistrict?.districtId && !pickedDistrict?.districtName) {
      await logIntegrationEvent(context.supabase, {
        provider: "bosta", brand_id: order.brand_id, direction: "outgoing",
        operation: "create_delivery", status: "error",
        order_id: order.id, order_number: order.external_order_number,
        reason: `district lookup failed for ${order.shipping_address}`,
        metadata: { city: city.name, cityId, governorate: order.shipping_governorate, address: addressSearchText, districts_count: districts.length },
        actor_id: context.userId,
      });
      throw new Error(`لم يتم إيجاد منطقة مناسبة في بوسطة لعنوان: ${order.shipping_address}`);
    }

    const dropOffAddress: Record<string, unknown> = {
      cityId,
      cityCode: city.code ?? city.cityCode ?? (canonical ? governorateCodes[canonical] : undefined),
      city: city.code ?? city.cityCode ?? (canonical ? governorateCodes[canonical] : undefined),
      firstLine: addressText.slice(0, 250),
    };
    const districtName = pickedDistrict.districtName ?? pickedDistrict.name ?? pickedDistrict.nameAr;
    const zoneName = pickedDistrict.zoneName ?? pickedDistrict.zone?.name ?? districtName;
    if (pickedDistrict.districtId) dropOffAddress.districtId = pickedDistrict.districtId;
    if (pickedDistrict.zoneId) dropOffAddress.zoneId = pickedDistrict.zoneId;
    if (districtName) {
      dropOffAddress.districtName = String(districtName).slice(0, 80);
      dropOffAddress.district = String(districtName).slice(0, 80);
    }
    if (zoneName) dropOffAddress.zone = String(zoneName).slice(0, 80);
    if (order.building_number) dropOffAddress.buildingNumber = String(order.building_number).slice(0, 20);
    if (order.floor_number) dropOffAddress.floor = String(order.floor_number).slice(0, 20);
    if (order.apartment_number) dropOffAddress.apartment = String(order.apartment_number).slice(0, 20);


    // 5) Parse receiver name
    const fullName = String(order.customer_name ?? "عميل").trim().split(/\s+/);
    const firstName = fullName[0] || "عميل";
    const lastName = fullName.slice(1).join(" ") || firstName;

    // 6) Build delivery payload (Bosta v2 delivery type 10 = SEND)
    const cod = order.financial_status === "paid" ? 0 : Number(order.total_amount ?? 0);
    const payload = {
      type: 10,
      specs: {
        packageType: "Parcel",
        packageDetails: { itemsCount, description },
      },
      dropOffAddress,
      receiver: {
        firstName,
        lastName,
        phone: String(order.customer_phone).replace(/\s+/g, ""),
        ...(order.customer_email ? { email: order.customer_email } : {}),
      },
      cod,
      businessReference: order.external_order_number || order.id,
      notes: order.note ? String(order.note).slice(0, 250) : undefined,
    };

    const url = "https://app.bosta.co/api/v2/deliveries?apiVersion=1";
    await logIntegrationEvent(context.supabase, {
      provider: "bosta", brand_id: order.brand_id, direction: "outgoing",
      operation: "create_delivery", status: "info",
      order_id: order.id, order_number: order.external_order_number,
      request: { url, payload }, reason: "creating delivery", actor_id: context.userId,
    });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: creds.api_key,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    const bodyText = await res.text();
    let parsed: any = null;
    try { parsed = bodyText ? JSON.parse(bodyText) : null; } catch { parsed = { _raw: bodyText.slice(0, 500) }; }

    if (!res.ok || parsed?.success === false) {
      const msg = parsed?.message || parsed?.error || `HTTP ${res.status}`;
      await logIntegrationEvent(context.supabase, {
        provider: "bosta", brand_id: order.brand_id, direction: "outgoing",
        operation: "create_delivery", status: "error", http_status: res.status,
        order_id: order.id, order_number: order.external_order_number,
        reason: msg, response: parsed,
        metadata: { duration_ms: Date.now() - started }, actor_id: context.userId,
      });
      throw new Error(`Bosta: ${msg}`);
    }

    const tracking = parsed?.data?.trackingNumber ?? parsed?.trackingNumber ?? parsed?.data?._id ?? null;
    const deliveryId = parsed?.data?._id ?? parsed?._id ?? null;

    // 7) Update order
    await context.supabase
      .from("orders")
      .update({
        fulfillment_status: "shipped",
        raw: { ...(order.raw as any ?? {}), bosta_tracking: tracking, bosta_delivery_id: deliveryId, bosta_sent_at: new Date().toISOString() },
      })
      .eq("id", order.id);

    await logIntegrationEvent(context.supabase, {
      provider: "bosta", brand_id: order.brand_id, direction: "outgoing",
      operation: "create_delivery", status: "success", http_status: res.status,
      order_id: order.id, order_number: order.external_order_number,
      tracking_number: tracking, reason: `delivery created (cod=${cod})`,
      response: parsed, metadata: { duration_ms: Date.now() - started }, actor_id: context.userId,
    });

    return { ok: true, tracking, deliveryId };
  });


// ============ RECALL / PULL SHIPMENT STATUS FROM BOSTA ============
function mapBostaStateToFulfillment(stateValue: string | null | undefined): string | null {
  const s = String(stateValue ?? "").toLowerCase();
  if (!s) return null;
  if (s.includes("delivered")) return "delivered";
  if (s.includes("returned") || s.includes("returning to business") || s.includes("rtb")) return "returned";
  if (s.includes("cancel") || s.includes("terminated")) return "cancelled";
  if (s.includes("out for delivery") || s.includes("in transit") || s.includes("picked") || s.includes("received") || s.includes("in-transit")) return "shipped";
  return null;
}

async function pullOneBostaOrder(context: Ctx, order_id: string) {
  const { logIntegrationEvent } = await import("@/server/integrationLogger");
  const started = Date.now();

  const { data: order, error: oErr } = await context.supabase
    .from("orders")
    .select("id, brand_id, external_order_number, fulfillment_status, raw")
    .eq("id", order_id)
    .maybeSingle();
  if (oErr) throw new Error(oErr.message);
  if (!order) throw new Error("Order not found");
  await assertBrandAccess(context, order.brand_id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (order.raw as any) ?? {};
  const tracking = raw.bosta_tracking as string | undefined;
  const deliveryId = raw.bosta_delivery_id as string | undefined;
  if (!tracking && !deliveryId) throw new Error("هذا الأوردر لم يُرسل إلى بوسطة بعد");

  const { creds } = await loadCreds(context, order.brand_id, "bosta");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any = null;
  let httpStatus = 0;
  const endpoints = [
    deliveryId ? `https://app.bosta.co/api/v2/deliveries/${deliveryId}` : null,
    tracking ? `https://app.bosta.co/api/v2/deliveries/business/${tracking}` : null,
    tracking ? `https://app.bosta.co/api/v0/deliveries/business/track/${tracking}` : null,
  ].filter(Boolean) as string[];
  for (const url of endpoints) {
    const res = await fetch(url, { headers: { Authorization: creds.api_key, Accept: "application/json" } });
    httpStatus = res.status;
    const text = await res.text();
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { _raw: text.slice(0, 500) }; }
    if (res.ok && parsed) break;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = (parsed?.data ?? parsed ?? {}) as any;
  const stateValue: string = d?.state?.value ?? d?.state ?? d?.status ?? d?.currentStatus?.state ?? "unknown";
  const stateCode = d?.state?.code ?? d?.masterState ?? null;
  let newStatus = mapBostaStateToFulfillment(stateValue);

  // If Bosta returns 404 / not found on all endpoints → shipment was deleted on Bosta side → mark cancelled
  const notFoundOnBosta = httpStatus === 404 || /not\s*found|deleted|does\s*not\s*exist/i.test(String(parsed?.message ?? parsed?.error ?? ""));
  if (!newStatus && notFoundOnBosta && order.fulfillment_status !== "delivered" && order.fulfillment_status !== "returned") {
    newStatus = "cancelled";
  }

  const patch: Record<string, unknown> = {
    raw: { ...raw, bosta_last_state: stateValue, bosta_last_state_code: stateCode, bosta_last_pull_at: new Date().toISOString(), ...(notFoundOnBosta ? { bosta_deleted: true } : {}) },
  };
  if (newStatus && newStatus !== order.fulfillment_status) patch.fulfillment_status = newStatus;
  await context.supabase.from("orders").update(patch).eq("id", order.id);

  await logIntegrationEvent(context.supabase, {
    provider: "bosta", brand_id: order.brand_id, direction: "incoming",
    operation: "pull_status", status: newStatus ? "success" : "info", http_status: httpStatus,
    order_id: order.id, order_number: order.external_order_number,
    tracking_number: tracking ?? null,
    reason: `state=${stateValue}${notFoundOnBosta ? " (deleted on Bosta)" : ""}${newStatus ? ` → ${newStatus}` : ""}`,
    response: parsed, metadata: { duration_ms: Date.now() - started }, actor_id: context.userId,
  });

  return { ok: true, state: stateValue, fulfillment_status: newStatus ?? order.fulfillment_status, changed: !!(newStatus && newStatus !== order.fulfillment_status) };

}

export const pullBostaShipmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { order_id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    return pullOneBostaOrder(context, data.order_id);
  });

export const syncAllBostaShipments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id?: string | null } = {}) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    let q = context.supabase
      .from("orders")
      .select("id, brand_id, raw, fulfillment_status")
      .not("raw->>bosta_tracking", "is", null)
      .not("fulfillment_status", "in", "(delivered,returned,cancelled)")
      .limit(200);
    if (data.brand_id) q = q.eq("brand_id", data.brand_id);
    const { data: rows, error } = await q;
    if (error) throw error;
    let checked = 0, updated = 0, failed = 0;
    for (const r of (rows ?? []) as Array<{ id: string }>) {
      try {
        checked += 1;
        const res = await pullOneBostaOrder(context, r.id);
        if (res.changed) updated += 1;
      } catch { failed += 1; }
    }
    return { ok: true, checked, updated, failed };
  });

export const attachBostaTracking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { order_id: string; tracking: string; delivery_id?: string | null }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const { data: order, error } = await context.supabase
      .from("orders").select("id, brand_id, raw, fulfillment_status").eq("id", data.order_id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Order not found");
    await assertBrandAccess(context, order.brand_id);
    const tracking = String(data.tracking ?? "").trim();
    if (!tracking) throw new Error("Tracking is required");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (order.raw as any) ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: any = {
      raw: { ...raw, bosta_tracking: tracking, ...(data.delivery_id ? { bosta_delivery_id: data.delivery_id } : {}), bosta_manual_attached_at: new Date().toISOString() },
    };
    if (order.fulfillment_status === "unfulfilled") patch.fulfillment_status = "shipped";
    const { error: uErr } = await context.supabase.from("orders").update(patch).eq("id", order.id);

    if (uErr) throw new Error(uErr.message);
    return { ok: true, tracking };
  });




export const listIntegrationLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    provider?: string;
    brand_id?: string;
    status?: string;
    operation?: string;
    order_number?: string;
    search?: string;
    limit?: number;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    let q = context.supabase
      .from("integration_logs")
      .select("id, created_at, provider, brand_id, direction, operation, order_number, order_id, tracking_number, status, http_status, reason, request, response, metadata")
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(data.limit ?? 200, 1), 1000));
    if (data.provider) q = q.eq("provider", data.provider);
    if (data.brand_id) q = q.eq("brand_id", data.brand_id);
    if (data.status) q = q.eq("status", data.status);
    if (data.operation) q = q.eq("operation", data.operation);
    if (data.order_number) q = q.eq("order_number", data.order_number);
    if (data.search) {
      const s = data.search.replace(/[%,]/g, " ");
      q = q.or(`reason.ilike.%${s}%,operation.ilike.%${s}%,order_number.ilike.%${s}%,tracking_number.ilike.%${s}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const getBostaWebhookInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brand_id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    await assertBrandAccess(context, data.brand_id);
    const secret = process.env.BOSTA_WEBHOOK_SECRET ?? "";
    return {
      path: `/api/public/webhooks/bosta/${data.brand_id}`,
      secret,
      hasSecret: Boolean(secret),
    };
  });


