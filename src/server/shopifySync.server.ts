// Server-only Shopify Admin API integration.
// NEVER import from browser/component code. Load lazily inside server handlers.
import { decryptConnectionKey } from "@/server/connectionKeyCrypto";

type ShopifyLineItem = {
  id: number;
  product_id: number | null;
  sku: string | null;
  title: string;
  quantity: number;
  price: string;
};
type ShopifyAddress = { province?: string | null; address1?: string | null; phone?: string | null } | null;
type ShopifyOrder = {
  id: number;
  order_number: number;
  name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
  financial_status: string | null;
  fulfillment_status: string | null;
  cancelled_at: string | null;
  currency: string;
  subtotal_price: string;
  total_shipping_price_set?: { shop_money: { amount: string } };
  total_discounts: string;
  total_price: string;
  customer: { first_name?: string; last_name?: string; email?: string | null; phone?: string | null } | null;
  billing_address: ShopifyAddress;
  shipping_address: ShopifyAddress;
  line_items: ShopifyLineItem[];
};

function mapFulfillment(s: string | null, cancelled: string | null): string {
  if (cancelled) return "cancelled";
  if (s === "fulfilled") return "delivered";
  if (s === "partial" || s === "in_transit") return "shipped";
  if (s === "restocked") return "returned";
  return "unfulfilled";
}
function mapFinancial(s: string | null): string {
  if (!s) return "pending";
  if (["paid", "partially_paid"].includes(s)) return "paid";
  if (["refunded", "partially_refunded"].includes(s)) return "refunded";
  if (s === "voided") return "voided";
  return "pending";
}

export type ShopifySyncOptions = {
  /** Override the updated_at_min lower bound (ISO). */
  sinceISO?: string;
  /** Optional updated_at_max upper bound (ISO). */
  untilISO?: string;
  /** If true, paginate through all pages via Link header. */
  paginate?: boolean;
  /** Delete existing shopify orders whose occurred_at < this ISO (per brand). */
  deleteBeforeISO?: string;
  /** Delete existing shopify orders whose occurred_at > this ISO (per brand). */
  deleteAfterISO?: string;
};

export async function syncShopifyOrdersForBrand(brandId: string, opts: ShopifySyncOptions = {}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: integ, error } = await supabaseAdmin
    .from("brand_integrations")
    .select("id, brand_id, credentials_ciphertext, config, last_sync_at")
    .eq("brand_id", brandId)
    .eq("provider", "shopify")
    .maybeSingle();
  if (error) throw error;
  if (!integ || !integ.credentials_ciphertext) throw new Error("Shopify not connected for this brand");

  const creds = JSON.parse(decryptConnectionKey(integ.credentials_ciphertext)) as {
    access_token?: string; admin_access_token?: string;
  };
  const token = creds.access_token || creds.admin_access_token;
  const cfg = (integ.config ?? {}) as { shop_domain?: string; shop?: string };
  const shop = cfg.shop_domain || cfg.shop;
  if (!token || !shop) throw new Error("Shopify credentials incomplete (need shop_domain + access_token)");
  const host = shop.replace(/^https?:\/\//, "").replace(/\/+$/, "");

  // Optional pre-deletion of orders outside the requested window (backfill scenario)
  if (opts.deleteBeforeISO) {
    await supabaseAdmin.from("orders")
      .delete()
      .eq("brand_id", brandId).eq("source", "shopify")
      .lt("occurred_at", opts.deleteBeforeISO);
  }
  if (opts.deleteAfterISO) {
    await supabaseAdmin.from("orders")
      .delete()
      .eq("brand_id", brandId).eq("source", "shopify")
      .gt("occurred_at", opts.deleteAfterISO);
  }

  // Build first-page URL. When paginating, subsequent pages come from Link headers.
  const since = opts.sinceISO ?? integ.last_sync_at ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const params = new URLSearchParams({ status: "any", limit: "250" });
  params.set("updated_at_min", since);
  if (opts.untilISO) params.set("updated_at_max", opts.untilISO);
  let url: string | null = `https://${host}/admin/api/2024-10/orders.json?${params.toString()}`;

  const orders: ShopifyOrder[] = [];
  while (url) {
    const res: Response = await fetch(url, { headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" } });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      await supabaseAdmin.from("brand_integrations").update({
        last_error: `Shopify ${res.status}: ${txt.slice(0, 400)}`, status: "error",
      }).eq("id", integ.id);
      throw new Error(`Shopify API error ${res.status}`);
    }
    const body = (await res.json()) as { orders: ShopifyOrder[] };
    orders.push(...(body.orders ?? []));
    if (!opts.paginate) break;
    // Parse Link header for the `rel="next"` URL
    const link = res.headers.get("link") || res.headers.get("Link");
    const nextMatch = link?.match(/<([^>]+)>;\s*rel="next"/i);
    url = nextMatch ? nextMatch[1] : null;
  }

  // Precompute COGS map for referenced products
  const productIds = new Set<string>();
  const skuSet = new Set<string>();
  for (const o of orders) for (const li of o.line_items) {
    if (li.sku) skuSet.add(li.sku);
  }
  const productBySku = new Map<string, { id: string; brand_id: string }>();
  if (skuSet.size > 0) {
    const { data: prods } = await supabaseAdmin
      .from("products").select("id, sku, brand_id")
      .in("sku", Array.from(skuSet)).eq("brand_id", brandId);
    for (const p of (prods ?? []) as Array<{ id: string; sku: string; brand_id: string }>) {
      productBySku.set(p.sku, { id: p.id, brand_id: p.brand_id });
      productIds.add(p.id);
    }
  }
  const cogsByProduct = new Map<string, number>();
  if (productIds.size > 0) {
    const ids = Array.from(productIds);
    const { data: products } = await supabaseAdmin.from("products").select("id, cogs_override").in("id", ids);
    const { data: bom } = await supabaseAdmin
      .from("product_materials").select("product_id, qty_per_unit, materials(unit_cost)").in("product_id", ids);
    type B = { product_id: string; qty_per_unit: number; materials: { unit_cost: number } | null };
    const bomSum = new Map<string, number>();
    for (const b of (bom ?? []) as unknown as B[]) {
      bomSum.set(b.product_id, (bomSum.get(b.product_id) ?? 0) + Number(b.qty_per_unit) * Number(b.materials?.unit_cost ?? 0));
    }
    for (const p of (products ?? []) as Array<{ id: string; cogs_override: number | null }>) {
      cogsByProduct.set(p.id, p.cogs_override != null ? Number(p.cogs_override) : bomSum.get(p.id) ?? 0);
    }
  }

  let upserted = 0;
  for (const o of orders) {
    const items = o.line_items.map((li) => {
      const p = li.sku ? productBySku.get(li.sku) : undefined;
      const unit_cost = p ? (cogsByProduct.get(p.id) ?? 0) : 0;
      const unit_price = Number(li.price) || 0;
      return {
        product_id: p?.id ?? null,
        sku: li.sku, title: li.title, qty: li.quantity,
        unit_price, unit_cost, subtotal: unit_price * li.quantity,
      };
    });
    const cost_total = items.reduce((s, i) => s + i.unit_cost * i.qty, 0);

    const customerName = [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(" ").trim() || null;
    const addr = o.shipping_address ?? o.billing_address;
    // Phone can live in several places on Shopify — try them all.
    const phone = o.customer?.phone
      || o.phone
      || o.shipping_address?.phone
      || o.billing_address?.phone
      || null;
    const payload = {
      brand_id: brandId, source: "shopify",
      external_id: String(o.id),
      external_order_number: o.name || String(o.order_number),
      customer_name: customerName,
      customer_phone: phone,
      customer_email: o.customer?.email || o.email,
      shipping_governorate: addr?.province ?? null,
      shipping_address: addr?.address1 ?? null,
      financial_status: mapFinancial(o.financial_status),
      fulfillment_status: mapFulfillment(o.fulfillment_status, o.cancelled_at),
      subtotal_amount: Number(o.subtotal_price) || 0,
      shipping_amount: Number(o.total_shipping_price_set?.shop_money?.amount ?? 0),
      discount_amount: Number(o.total_discounts) || 0,
      total_amount: Number(o.total_price) || 0,
      cost_total,
      currency: o.currency || "EGP",
      occurred_at: o.created_at,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      raw: o as any,
    } as const;
    const { data: existing } = await supabaseAdmin.from("orders").select("id")
      .eq("brand_id", brandId).eq("source", "shopify").eq("external_id", String(o.id)).maybeSingle();
    let orderId: string;
    if (existing?.id) {
      const { error: uerr } = await supabaseAdmin.from("orders").update(payload).eq("id", existing.id);
      if (uerr) continue;
      orderId = existing.id;
      await supabaseAdmin.from("order_items").delete().eq("order_id", orderId);
    } else {
      const { data: ins, error: ierr } = await supabaseAdmin.from("orders").insert(payload).select("id").single();
      if (ierr || !ins) continue;
      orderId = ins.id;
    }
    if (items.length) {
      await supabaseAdmin.from("order_items").insert(items.map((i) => ({ order_id: orderId, ...i })));
    }
    upserted += 1;
  }

  await supabaseAdmin.from("brand_integrations").update({
    last_sync_at: new Date().toISOString(),
    last_sync_summary: { orders_upserted: upserted, fetched: orders.length },
    last_error: null, status: "connected",
  }).eq("id", integ.id);

  return { ok: true, upserted, fetched: orders.length };
}


export async function syncAllConnectedShopify() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows } = await supabaseAdmin
    .from("brand_integrations").select("brand_id").eq("provider", "shopify").eq("status", "connected");
  const results: Array<{ brand_id: string; ok: boolean; upserted?: number; error?: string }> = [];
  for (const r of (rows ?? []) as Array<{ brand_id: string }>) {
    try {
      const res = await syncShopifyOrdersForBrand(r.brand_id);
      results.push({ brand_id: r.brand_id, ok: true, upserted: res.upserted });
    } catch (e) {
      results.push({ brand_id: r.brand_id, ok: false, error: (e as Error).message });
    }
  }
  return results;
}

// Shopify sends events via HTTPS with header X-Shopify-Hmac-Sha256, base64(HMAC-SHA256(rawBody, apiSecret)).
// Verify per-brand using shopify_api_secret stored in credentials.
export async function verifyShopifyHmac(brandId: string, rawBody: string, headerHmac: string | null): Promise<boolean> {
  if (!headerHmac) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: integ } = await supabaseAdmin
    .from("brand_integrations").select("credentials_ciphertext")
    .eq("brand_id", brandId).eq("provider", "shopify").maybeSingle();
  if (!integ?.credentials_ciphertext) return false;
  const creds = JSON.parse(decryptConnectionKey(integ.credentials_ciphertext)) as { api_secret?: string; webhook_secret?: string; client_secret?: string };
  const secret = creds.webhook_secret || creds.api_secret || creds.client_secret;
  if (!secret) return false;
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(digest);
  const b = Buffer.from(headerHmac);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function ingestShopifyOrderWebhook(brandId: string, order: ShopifyOrder) {
  // For webhooks we already receive a full order — re-use the same pipeline by narrowing to it.
  // Simplest correct path: call syncShopifyOrdersForBrand which re-pulls recent orders (idempotent).
  await syncShopifyOrdersForBrand(brandId);
  return { ok: true, id: order.id };
}