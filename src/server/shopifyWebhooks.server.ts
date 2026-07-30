// Auto-register/refresh Shopify webhooks for a brand using the stored access token.
// Idempotent: fetches existing webhooks, deletes stale ones, creates missing ones,
// and updates any whose address no longer matches.
import { decryptConnectionKey } from "@/server/connectionKeyCrypto";

const API_VERSION = "2024-10";

const TOPICS = [
  "orders/create",
  "orders/updated",
  "orders/paid",
  "orders/cancelled",
  "orders/fulfilled",
  "products/create",
  "products/update",
  "products/delete",
  "app/uninstalled",
] as const;

type ShopifyWebhook = { id: number; topic: string; address: string; format: string };

async function shopifyFetch(shop: string, token: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}${path}`, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(json)}`);
  return json as any;
}

export async function registerShopifyWebhooksForBrand(brandId: string, origin: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: integ, error } = await supabaseAdmin
    .from("brand_integrations")
    .select("credentials_ciphertext, config")
    .eq("brand_id", brandId)
    .eq("provider", "shopify")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!integ?.credentials_ciphertext) throw new Error("Shopify not connected for this brand");

  const creds = JSON.parse(decryptConnectionKey(integ.credentials_ciphertext)) as {
    access_token?: string;
  };
  const cfg = (integ.config ?? {}) as Record<string, any>;
  const shop = String(cfg.shop_domain || "").toLowerCase();
  if (!creds.access_token || !shop) throw new Error("Missing access_token or shop_domain");

  const addressFor = (topic: string) =>
    topic.startsWith("orders/")
      ? `${origin}/api/public/webhooks/shopify/orders`
      : `${origin}/api/public/webhooks/shopify/${brandId}`;

  const existing = (await shopifyFetch(shop, creds.access_token, "/webhooks.json")).webhooks as ShopifyWebhook[];
  const results: Array<{ topic: string; action: string; id?: number; error?: string }> = [];

  for (const topic of TOPICS) {
    const address = addressFor(topic);
    try {
      const match = existing.find((w) => w.topic === topic);
      if (!match) {
        const created = await shopifyFetch(shop, creds.access_token, "/webhooks.json", {
          method: "POST",
          body: JSON.stringify({ webhook: { topic, address, format: "json" } }),
        });
        results.push({ topic, action: "created", id: created.webhook?.id });
      } else if (match.address !== address) {
        const updated = await shopifyFetch(shop, creds.access_token, `/webhooks/${match.id}.json`, {
          method: "PUT",
          body: JSON.stringify({ webhook: { id: match.id, address } }),
        });
        results.push({ topic, action: "updated", id: updated.webhook?.id });
      } else {
        results.push({ topic, action: "kept", id: match.id });
      }
    } catch (e) {
      results.push({ topic, action: "error", error: (e as Error).message });
    }
  }

  // Prune webhooks pointing at our origin but no longer in TOPICS
  for (const w of existing) {
    const ours = w.address.startsWith(`${origin}/api/public/webhooks/shopify`);
    if (ours && !TOPICS.includes(w.topic as (typeof TOPICS)[number])) {
      try {
        await shopifyFetch(shop, creds.access_token, `/webhooks/${w.id}.json`, { method: "DELETE" });
        results.push({ topic: w.topic, action: "deleted", id: w.id });
      } catch (e) {
        results.push({ topic: w.topic, action: "delete_error", error: (e as Error).message });
      }
    }
  }

  await supabaseAdmin
    .from("brand_integrations")
    .update({
      config: { ...cfg, webhooks_registered_at: new Date().toISOString(), webhook_topics: [...TOPICS] },
    })
    .eq("brand_id", brandId)
    .eq("provider", "shopify");

  return { shop, results };
}
