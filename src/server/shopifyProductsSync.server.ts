// Server-only: import all products (and their variants) from Shopify Admin API into local products table.
import { decryptConnectionKey } from "@/server/connectionKeyCrypto";

type ShopifyVariant = {
  id: number;
  sku: string | null;
  title: string;
  price: string;
  inventory_quantity?: number | null;
  inventory_item_id?: number | null;
};
type ShopifyProduct = {
  id: number;
  title: string;
  status: string;
  variants: ShopifyVariant[];
};

async function fetchInventoryItemCosts(host: string, token: string, ids: number[]) {
  const costs = new Map<number, number>();
  // Shopify caps ids per call at ~100 — chunk to be safe.
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const url = `https://${host}/admin/api/${SHOPIFY_API_VERSION}/inventory_items.json?ids=${chunk.join(",")}&limit=250`;
    const res = await fetch(url, { headers: { "X-Shopify-Access-Token": token, Accept: "application/json" } });
    if (!res.ok) continue;
    const body = (await res.json()) as { inventory_items?: Array<{ id: number; cost: string | null }> };
    for (const it of body.inventory_items ?? []) {
      const c = Number(it.cost);
      if (Number.isFinite(c) && c > 0) costs.set(it.id, c);
    }
  }
  return costs;
}

const SHOPIFY_API_VERSION = "2024-10";
const REQUIRED_PRODUCT_SCOPES = ["read_products"] as const;

function normalizeShopHost(shop: string) {
  const host = shop.replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
  return host.includes(".myshopify.com") ? host : `${host}.myshopify.com`;
}

function parseScopeHandles(body: string) {
  try {
    const parsed = JSON.parse(body) as { access_scopes?: Array<{ handle?: string }> };
    return (parsed.access_scopes ?? []).map((scope) => String(scope.handle ?? "")).filter(Boolean);
  } catch {
    return [];
  }
}

async function loadShopifyScopes(host: string, token: string) {
  const res = await fetch(`https://${host}/admin/oauth/access_scopes.json`, {
    headers: { "X-Shopify-Access-Token": token, Accept: "application/json" },
  });
  const body = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, body, scopes: parseScopeHandles(body) };
}

function parseNextPageUrl(linkHeader: string | null) {
  const nextMatch = linkHeader?.match(/<([^>]+)>;\s*rel="next"/i);
  return nextMatch ? nextMatch[1] : null;
}

async function fetchShopifyProducts(host: string, token: string, pathAndQuery: string) {
  const collected: ShopifyProduct[] = [];
  let url: string | null = `https://${host}/admin/api/${SHOPIFY_API_VERSION}/${pathAndQuery}`;
  while (url) {
    const res: Response = await fetch(url, {
      headers: { "X-Shopify-Access-Token": token, Accept: "application/json" },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Shopify API error ${res.status}: ${txt.slice(0, 200)}`);
    }
    const body = (await res.json()) as { products?: ShopifyProduct[] };
    collected.push(...(body.products ?? []));
    url = parseNextPageUrl(res.headers.get("link") || res.headers.get("Link"));
  }
  return collected;
}

function missingProductScopes(scopes: string[]) {
  return REQUIRED_PRODUCT_SCOPES.filter((scope) => !scopes.includes(scope));
}

function scopeErrorMessage(missing: readonly string[], scopes: string[]) {
  return [
    `Shopify token missing required scope(s): ${missing.join(", ")}.`,
    `Current scopes: ${scopes.length ? scopes.join(", ") : "none"}.`,
    "Add read_products/write_products to the Shopify app Admin API scopes, save, then reconnect Shopify for this brand so a new token is issued.",
  ].join(" ");
}

export async function syncShopifyProductsForBrand(brandId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: integ, error } = await supabaseAdmin
    .from("brand_integrations")
    .select("id, credentials_ciphertext, config")
    .eq("brand_id", brandId).eq("provider", "shopify").maybeSingle();
  if (error) throw error;
  if (!integ?.credentials_ciphertext) throw new Error("Shopify not connected for this brand");

  const creds = JSON.parse(decryptConnectionKey(integ.credentials_ciphertext)) as {
    access_token?: string; admin_access_token?: string;
  };
  const token = creds.access_token || creds.admin_access_token;
  const cfg = (integ.config ?? {}) as { shop_domain?: string; shop?: string };
  const shop = cfg.shop_domain || cfg.shop;
  if (!token || !shop) throw new Error("Shopify credentials incomplete");
  const host = normalizeShopHost(shop);

  const scopeInfo = await loadShopifyScopes(host, token);
  if (!scopeInfo.ok) {
    await supabaseAdmin.from("brand_integrations").update({
      last_error: `Shopify scopes ${scopeInfo.status}: ${scopeInfo.body.slice(0, 400)}`,
      status: "error",
    }).eq("id", integ.id);
    throw new Error(`Shopify scopes ${scopeInfo.status}: ${scopeInfo.body.slice(0, 200)}`);
  }
  const missing = missingProductScopes(scopeInfo.scopes);
  if (missing.length > 0) {
    const msg = scopeErrorMessage(missing, scopeInfo.scopes);
    await supabaseAdmin.from("brand_integrations").update({ last_error: msg, status: "error" }).eq("id", integ.id);
    throw new Error(msg);
  }

  let collected: ShopifyProduct[];
  try {
    collected = await fetchShopifyProducts(host, token, "products.json?limit=250&status=any");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabaseAdmin.from("brand_integrations").update({
      last_error: msg.slice(0, 400), status: "error",
    }).eq("id", integ.id);
    throw new Error(msg);
  }

  // If nothing came back, probe the store to explain why (scope? empty store?)
  if (collected.length === 0) {
    const countRes = await fetch(`https://${host}/admin/api/${SHOPIFY_API_VERSION}/products/count.json`, {
      headers: { "X-Shopify-Access-Token": token, Accept: "application/json" },
    });
    const countBody = await countRes.text().catch(() => "");
    const count = Number((JSON.parse(countBody || "{}") as { count?: number }).count ?? 0);
    if (count > 0) {
      collected = await fetchShopifyProducts(host, token, "products.json?limit=250");
    }
    if (collected.length === 0) {
      const diag = `count(${countRes.status})=${countBody.slice(0, 120)} | scopes=${scopeInfo.scopes.join(",")}`;
      await supabaseAdmin.from("brand_integrations").update({ last_error: `Products list empty. ${diag}` }).eq("id", integ.id);
      throw new Error(`Shopify returned 0 products. ${diag}`);
    }
  }

  // Batch-fetch variant costs from inventory_items (Shopify COGS)
  const inventoryItemIds: number[] = [];
  for (const p of collected) {
    for (const v of p.variants ?? []) {
      if (v.inventory_item_id) inventoryItemIds.push(Number(v.inventory_item_id));
    }
  }
  const costMap = inventoryItemIds.length
    ? await fetchInventoryItemCosts(host, token, Array.from(new Set(inventoryItemIds)))
    : new Map<number, number>();

  let inserted = 0, updated = 0, variantCount = 0, withCost = 0;
  for (const p of collected) {
    const isActive = p.status === "active";
    const variants = p.variants && p.variants.length ? p.variants : [{ id: p.id, sku: null, title: "Default", price: "0", inventory_quantity: 0 } as ShopifyVariant];
    for (const v of variants) {
      variantCount += 1;
      const displayName = variants.length > 1 && v.title && v.title !== "Default Title"
        ? `${p.title} — ${v.title}` : p.title;
      const sku = v.sku && v.sku.trim() ? v.sku.trim() : `SHOPIFY-${p.id}-${v.id}`;
      const sellPrice = Number(v.price) || 0;
      const onHand = Number(v.inventory_quantity ?? 0);
      const variantCost = v.inventory_item_id ? costMap.get(Number(v.inventory_item_id)) : undefined;
      if (variantCost && variantCost > 0) withCost += 1;

      // Lookup existing by brand+sku
      const { data: existing } = await supabaseAdmin
        .from("products").select("id, cogs_override")
        .eq("brand_id", brandId).eq("sku", sku).maybeSingle();

      if (existing?.id) {
        const patch = {
          name: displayName, sell_price: sellPrice, active: isActive, on_hand_qty: onHand,
          ...(variantCost && variantCost > 0 ? { cogs_override: variantCost } : {}),
        };
        await supabaseAdmin.from("products").update(patch).eq("id", existing.id);
        updated += 1;
      } else {
        await supabaseAdmin.from("products").insert({
          brand_id: brandId, name: displayName, sku, sell_price: sellPrice,
          unit: "piece", active: isActive, on_hand_qty: onHand, reorder_point: 0,
          cogs_override: variantCost && variantCost > 0 ? variantCost : null,
        });
        inserted += 1;
      }
    }
  }

  return { ok: true, fetched: collected.length, variants: variantCount, inserted, updated, withCost };
}
