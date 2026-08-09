// Server-only Shopify Admin API integration.
// NEVER import from browser/component code. Load lazily inside server handlers.
import { decryptConnectionKey } from "@/server/connectionKeyCrypto";
import {
  mapShopifyLifecycleFields,
  mapShopifyFulfillmentStatus,
  shopifyLineItemTitle,
} from "@/lib/order-lifecycle.shared";
import type { Json } from "@/integrations/supabase/types";

type ShopifyLineItem = {
  id: number;
  product_id: number | null;
  sku: string | null;
  title: string;
  /** e.g. "50ml" — Shopify's own "single variant, nothing to show" sentinel
   *  is the literal string "Default Title", not null/empty. */
  variant_title: string | null;
  quantity: number;
  price: string;
};
type ShopifyAddress = {
  province?: string | null;
  address1?: string | null;
  phone?: string | null;
} | null;
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
  customer: {
    first_name?: string;
    last_name?: string;
    email?: string | null;
    phone?: string | null;
  } | null;
  billing_address: ShopifyAddress;
  shipping_address: ShopifyAddress;
  line_items: ShopifyLineItem[];
};

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
  if (!integ || !integ.credentials_ciphertext)
    throw new Error("Shopify not connected for this brand");

  const creds = JSON.parse(decryptConnectionKey(integ.credentials_ciphertext)) as {
    access_token?: string;
    admin_access_token?: string;
  };
  const token = creds.access_token || creds.admin_access_token;
  const cfg = (integ.config ?? {}) as { shop_domain?: string; shop?: string };
  const shop = cfg.shop_domain || cfg.shop;
  if (!token || !shop)
    throw new Error("Shopify credentials incomplete (need shop_domain + access_token)");
  const host = shop.replace(/^https?:\/\//, "").replace(/\/+$/, "");

  // Optional pre-deletion of orders outside the requested window (backfill scenario)
  if (opts.deleteBeforeISO) {
    await supabaseAdmin
      .from("orders")
      .delete()
      .eq("brand_id", brandId)
      .eq("source", "shopify")
      .lt("occurred_at", opts.deleteBeforeISO);
  }
  if (opts.deleteAfterISO) {
    await supabaseAdmin
      .from("orders")
      .delete()
      .eq("brand_id", brandId)
      .eq("source", "shopify")
      .gt("occurred_at", opts.deleteAfterISO);
  }

  // Build first-page URL. When paginating, subsequent pages come from Link headers.
  const since =
    opts.sinceISO ?? integ.last_sync_at ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const params = new URLSearchParams({ status: "any", limit: "250" });
  params.set("updated_at_min", since);
  if (opts.untilISO) params.set("updated_at_max", opts.untilISO);
  let url: string | null = `https://${host}/admin/api/2024-10/orders.json?${params.toString()}`;

  const orders: ShopifyOrder[] = [];
  while (url) {
    const res: Response = await fetch(url, {
      headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      await supabaseAdmin
        .from("brand_integrations")
        .update({
          last_error: `Shopify ${res.status}: ${txt.slice(0, 400)}`,
          status: "error",
        })
        .eq("id", integ.id);
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
  for (const o of orders)
    for (const li of o.line_items) {
      if (li.sku) skuSet.add(li.sku);
    }
  const productBySku = new Map<string, { id: string; brand_id: string }>();
  if (skuSet.size > 0) {
    const { data: prods } = await supabaseAdmin
      .from("products")
      .select("id, sku, brand_id")
      .in("sku", Array.from(skuSet))
      .eq("brand_id", brandId);
    for (const p of (prods ?? []) as Array<{ id: string; sku: string; brand_id: string }>) {
      productBySku.set(p.sku, { id: p.id, brand_id: p.brand_id });
      productIds.add(p.id);
    }
  }
  const cogsByProduct = new Map<string, number>();
  if (productIds.size > 0) {
    const ids = Array.from(productIds);
    const { data: products } = await supabaseAdmin
      .from("products")
      .select("id, cogs_override")
      .in("id", ids);
    const { data: bom } = await supabaseAdmin
      .from("product_materials")
      .select("product_id, qty_per_unit, materials(unit_cost)")
      .in("product_id", ids);
    type B = { product_id: string; qty_per_unit: number; materials: { unit_cost: number } | null };
    const bomSum = new Map<string, number>();
    for (const b of (bom ?? []) as unknown as B[]) {
      bomSum.set(
        b.product_id,
        (bomSum.get(b.product_id) ?? 0) +
          Number(b.qty_per_unit) * Number(b.materials?.unit_cost ?? 0),
      );
    }
    for (const p of (products ?? []) as Array<{ id: string; cogs_override: number | null }>) {
      cogsByProduct.set(
        p.id,
        p.cogs_override != null ? Number(p.cogs_override) : (bomSum.get(p.id) ?? 0),
      );
    }
  }

  let upserted = 0;
  const failures: string[] = [];
  for (const o of orders) {
    const items = o.line_items.map((li) => {
      const p = li.sku ? productBySku.get(li.sku) : undefined;
      const unit_cost = p ? (cogsByProduct.get(p.id) ?? 0) : 0;
      const unit_price = Number(li.price) || 0;
      return {
        product_id: p?.id ?? null,
        sku: li.sku,
        title: shopifyLineItemTitle(li.title, li.variant_title),
        qty: li.quantity,
        unit_price,
        unit_cost,
        subtotal: unit_price * li.quantity,
      };
    });
    const cost_total = items.reduce((s, i) => s + i.unit_cost * i.qty, 0);

    const customerName =
      [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(" ").trim() || null;
    const addr = o.shipping_address ?? o.billing_address;
    // Phone can live in several places on Shopify — try them all.
    const phone =
      o.customer?.phone || o.phone || o.shipping_address?.phone || o.billing_address?.phone || null;
    const fulfillmentStatus = mapShopifyFulfillmentStatus(o.fulfillment_status, o.cancelled_at);
    const payloadBase = {
      brand_id: brandId,
      source: "shopify",
      external_id: String(o.id),
      external_order_number: o.name || String(o.order_number),
      customer_name: customerName,
      customer_phone: phone,
      customer_email: o.customer?.email || o.email,
      shipping_governorate: addr?.province ?? null,
      shipping_address: addr?.address1 ?? null,
      financial_status: mapFinancial(o.financial_status),
      fulfillment_status: fulfillmentStatus,
      subtotal_amount: Number(o.subtotal_price) || 0,
      shipping_amount: Number(o.total_shipping_price_set?.shop_money?.amount ?? 0),
      discount_amount: Number(o.total_discounts) || 0,
      total_amount: Number(o.total_price) || 0,
      cost_total,
      currency: o.currency || "EGP",
      occurred_at: o.created_at,
    } as const;
    const { data: existing } = await supabaseAdmin
      .from("orders")
      .select("id, fulfillment_status, shipment_outcome")
      .eq("brand_id", brandId)
      .eq("source", "shopify")
      .eq("external_id", String(o.id))
      .maybeSingle();
    const shopifyRaw = JSON.parse(JSON.stringify(o)) as Json;
    const lifecycleFields = mapShopifyLifecycleFields(
      o.fulfillment_status,
      o.cancelled_at,
      o.financial_status,
      existing?.fulfillment_status,
      existing?.shipment_outcome,
    );
    const orderPatch = {
      ...payloadBase,
      fulfillment_status: lifecycleFields.fulfillmentStatus,
      order_status: lifecycleFields.orderStatus,
      collection_status: lifecycleFields.collectionStatus,
      shipment_outcome: lifecycleFields.shipmentOutcome,
      lifecycle_source: "shopify",
      lifecycle_updated_by: null,
      lifecycle_updated_at: new Date().toISOString(),
    };
    // This RPC archives _payload and writes raw={} atomically; archive failure
    // rolls the order/items upsert back in the same transaction.
    const { data: orderId, error: upsertError } = await supabaseAdmin.rpc(
      "upsert_shopify_order_with_archive",
      {
        _order_id: (existing?.id ?? null) as unknown as string,
        _order_patch: orderPatch,
        _items: items,
        _payload: shopifyRaw,
      },
    );
    if (upsertError || !orderId) {
      failures.push(`${o.name || o.id}: ${upsertError?.message ?? "missing order id"}`);
      continue;
    }
    upserted += 1;
  }

  if (failures.length > 0) {
    const summary = `${failures.length} Shopify order(s) failed: ${failures.slice(0, 3).join("; ")}`;
    await supabaseAdmin
      .from("brand_integrations")
      .update({ last_error: summary.slice(0, 1000), status: "error" })
      .eq("id", integ.id);
    throw new Error(summary);
  }

  await supabaseAdmin
    .from("brand_integrations")
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_summary: { orders_upserted: upserted, fetched: orders.length },
      last_error: null,
      status: "connected",
    })
    .eq("id", integ.id);

  return { ok: true, upserted, fetched: orders.length };
}

export async function syncAllConnectedShopify() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows } = await supabaseAdmin
    .from("brand_integrations")
    .select("brand_id")
    .eq("provider", "shopify")
    .eq("status", "connected");
  const results: Array<{ brand_id: string; ok: boolean; upserted?: number; error?: string }> = [];
  for (const r of (rows ?? []) as Array<{ brand_id: string }>) {
    try {
      const res = await syncShopifyOrdersForBrand(r.brand_id, {
        sinceISO: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
        paginate: true,
      });
      results.push({ brand_id: r.brand_id, ok: true, upserted: res.upserted });
    } catch (e) {
      results.push({ brand_id: r.brand_id, ok: false, error: (e as Error).message });
    }
  }
  return results;
}

// Shopify sends events via HTTPS with header X-Shopify-Hmac-Sha256, base64(HMAC-SHA256(rawBody, apiSecret)).
// Verify per-brand using shopify_api_secret stored in credentials.
export async function verifyShopifyHmac(
  brandId: string,
  rawBody: string,
  headerHmac: string | null,
): Promise<boolean> {
  if (!headerHmac) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: integ } = await supabaseAdmin
    .from("brand_integrations")
    .select("credentials_ciphertext")
    .eq("brand_id", brandId)
    .eq("provider", "shopify")
    .maybeSingle();
  if (!integ?.credentials_ciphertext) return false;
  const creds = JSON.parse(decryptConnectionKey(integ.credentials_ciphertext)) as {
    api_secret?: string;
    webhook_secret?: string;
    client_secret?: string;
  };
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

async function loadShopifyConnection(brandId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: integration, error } = await supabaseAdmin
    .from("brand_integrations")
    .select("credentials_ciphertext, config")
    .eq("brand_id", brandId)
    .eq("provider", "shopify")
    .maybeSingle();
  if (error) throw error;
  if (!integration?.credentials_ciphertext) {
    throw new Error("Shopify not connected for this brand");
  }

  const credentials = JSON.parse(decryptConnectionKey(integration.credentials_ciphertext)) as {
    access_token?: string;
    admin_access_token?: string;
  };
  const token = credentials.access_token || credentials.admin_access_token;
  const config = (integration.config ?? {}) as {
    shop_domain?: string;
    shop?: string;
    api_version?: string;
  };
  const shop = config.shop_domain || config.shop;
  if (!token || !shop) throw new Error("Shopify credentials incomplete");

  const host = shop.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const apiVersion = config.api_version || "2024-10";
  return { baseUrl: `https://${host}/admin/api/${apiVersion}`, token };
}

async function shopifyAdminRequest<T>(
  connection: { baseUrl: string; token: string },
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${connection.baseUrl}${path}`, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": connection.token,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const text = await response.text();
  let body = {} as T;
  if (text) {
    try {
      body = JSON.parse(text) as T;
    } catch {
      // Preserve the HTTP status/body error below for non-JSON responses.
    }
  }
  if (!response.ok) {
    throw new Error(`Shopify ${response.status}: ${text.slice(0, 300)}`);
  }
  return body;
}

/** Applies only safe terminal transitions. Returns/ refunds require manual review. */
export async function applyShopifyOrderAction(input: {
  brandId: string;
  externalOrderId: string;
  action: "fulfill" | "cancel" | "collect_payment";
}) {
  const orderId = String(input.externalOrderId).trim();
  if (!/^\d+$/.test(orderId)) throw new Error("Invalid Shopify order id");
  const connection = await loadShopifyConnection(input.brandId);

  if (input.action === "collect_payment") {
    const orderData = await shopifyAdminRequest<{
      order?: { financial_status?: string; total_price?: string; currency?: string };
    }>(connection, `/orders/${orderId}.json`);
    const shopifyOrder = orderData.order;
    if (!shopifyOrder) throw new Error("Shopify order not found");
    if (["paid", "partially_refunded", "refunded"].includes(shopifyOrder.financial_status ?? "")) {
      return { ok: true as const, action: "collect_payment" as const, alreadyComplete: true };
    }
    // Records the COD cash the courier collected as a completed sale
    // transaction — this is a manual/COD order, there's no payment gateway
    // to actually capture through.
    await shopifyAdminRequest(connection, `/orders/${orderId}/transactions.json`, {
      method: "POST",
      body: JSON.stringify({
        transaction: {
          kind: "sale",
          status: "success",
          amount: shopifyOrder.total_price,
          currency: shopifyOrder.currency,
        },
      }),
    });
    return { ok: true as const, action: "collect_payment" as const, alreadyComplete: false };
  }

  if (input.action === "cancel") {
    try {
      await shopifyAdminRequest(connection, `/orders/${orderId}/cancel.json`, {
        method: "POST",
        body: JSON.stringify({ notify_customer: false, restock: true }),
      });
      return { ok: true as const, action: "cancel" as const, alreadyComplete: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already\s+(?:been\s+)?cancelled|already\s+canceled/i.test(message)) {
        return { ok: true as const, action: "cancel" as const, alreadyComplete: true };
      }
      throw error;
    }
  }

  const fulfillmentOrders = await shopifyAdminRequest<{
    fulfillment_orders?: Array<{ id: number; status: string; supported_actions?: string[] }>;
  }>(connection, `/orders/${orderId}/fulfillment_orders.json`);
  const open = (fulfillmentOrders.fulfillment_orders ?? []).filter(
    (order) =>
      !["closed", "cancelled"].includes(order.status) &&
      (order.supported_actions ?? ["create_fulfillment"]).includes("create_fulfillment"),
  );
  if (open.length === 0) {
    return { ok: true as const, action: "fulfill" as const, alreadyComplete: true };
  }

  await shopifyAdminRequest(connection, "/fulfillments.json", {
    method: "POST",
    body: JSON.stringify({
      fulfillment: {
        notify_customer: false,
        line_items_by_fulfillment_order: open.map((order) => ({
          fulfillment_order_id: order.id,
        })),
      },
    }),
  });
  return { ok: true as const, action: "fulfill" as const, alreadyComplete: false };
}
