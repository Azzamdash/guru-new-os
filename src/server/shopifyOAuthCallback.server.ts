const SHOPIFY_SCOPES = "read_orders,write_orders,read_products,write_products,read_customers,write_customers,read_inventory,write_inventory,read_fulfillments,write_fulfillments,read_locations";

function decodeOAuthState(state: string) {
  try {
    return Buffer.from(state, "base64url").toString("utf8");
  } catch {
    return state;
  }
}

function buildShopifyHmacMessages(url: URL) {
  const params = new URLSearchParams(url.searchParams);
  params.delete("hmac");
  params.delete("signature");
  params.sort();

  const decodedPairs = Array.from(url.searchParams.entries())
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([aKey], [bKey]) => aKey.localeCompare(bKey))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const rawPairs = url.search
    .slice(1)
    .split("&")
    .filter(Boolean)
    .filter((pair) => {
      const key = pair.split("=", 1)[0];
      return decodeURIComponent(key.replace(/\+/g, "%20")) !== "hmac" && decodeURIComponent(key.replace(/\+/g, "%20")) !== "signature";
    })
    .sort((a, b) => {
      const aKey = decodeURIComponent(a.split("=", 1)[0].replace(/\+/g, "%20"));
      const bKey = decodeURIComponent(b.split("=", 1)[0].replace(/\+/g, "%20"));
      return aKey.localeCompare(bKey);
    })
    .join("&");

  return Array.from(new Set([
    params.toString(),
    params.toString().replace(/\+/g, "%20"),
    decodedPairs,
    rawPairs,
  ].filter(Boolean)));
}

// Shopify OAuth callback shared by both accepted callback URLs:
// /api/public/oauth/shopify.callback and /api/public/oauth/shopify/callback
export async function handleShopifyOAuthCallback(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const shop = params.get("shop");
  const hmac = params.get("hmac");

  const back = (msg: string, ok = false) =>
    Response.redirect(`${url.origin}/integrations?shopify=${ok ? "connected" : "error"}&msg=${encodeURIComponent(msg)}`, 302);

  try {
    if (!code || !state || !shop || !hmac) return back("Missing OAuth parameters");
    if (!/^[a-z0-9-]+\.myshopify\.com$/i.test(shop)) return back("Invalid shop");

    const { decryptConnectionKey, encryptConnectionKey } = await import("@/server/connectionKeyCrypto");
    let parsed: { brand_id: string; shop: string; ts: number; nonce: string };
    try {
      parsed = JSON.parse(decryptConnectionKey(decodeOAuthState(state)));
    } catch {
      return back("Invalid state");
    }
    if (Date.now() - parsed.ts > 15 * 60 * 1000) return back("State expired, please retry");
    if (parsed.shop.toLowerCase() !== shop.toLowerCase()) return back("Shop mismatch");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error: rowErr } = await supabaseAdmin
      .from("brand_integrations")
      .select("id, credentials_ciphertext, config")
      .eq("brand_id", parsed.brand_id)
      .eq("provider", "shopify")
      .maybeSingle();
    if (rowErr) return back(rowErr.message);
    if (!row?.credentials_ciphertext) return back("No pending Shopify connection for this brand");

    const creds = JSON.parse(decryptConnectionKey(row.credentials_ciphertext)) as {
      client_id?: string;
      client_secret?: string;
    };
    if (!creds.client_id || !creds.client_secret) return back("Missing client credentials — retry the connect flow");
    const clientId = creds.client_id;
    const clientSecret = creds.client_secret;

    const { createHmac, timingSafeEqual } = await import("node:crypto");
    const a = Buffer.from(hmac.toLowerCase(), "utf8");
    const hmacOk = buildShopifyHmacMessages(url).some((message) => {
      const expected = createHmac("sha256", clientSecret).update(message).digest("hex");
      const b = Buffer.from(expected, "utf8");
      return a.length === b.length && timingSafeEqual(a, b);
    });
    if (!hmacOk) return back("HMAC verification failed");

    const tokRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });
    const tokText = await tokRes.text();
    if (!tokRes.ok) return back(`Token exchange failed: ${tokRes.status} ${tokText.slice(0, 200)}`);
    const tokJson = JSON.parse(tokText) as { access_token?: string; scope?: string };
    if (!tokJson.access_token) return back("Missing access_token in response");

    const newCipher = encryptConnectionKey(JSON.stringify({
      access_token: tokJson.access_token,
      client_id: clientId,
      client_secret: clientSecret,
      api_secret: clientSecret,
    }));
    const cfg = (row.config ?? {}) as Record<string, unknown>;
    const { error: updErr } = await supabaseAdmin.from("brand_integrations").update({
      credentials_ciphertext: newCipher,
      config: { ...cfg, shop_domain: shop, scope: tokJson.scope ?? SHOPIFY_SCOPES, auth_mode: "oauth" },
      status: "connected",
      last_error: null,
    }).eq("id", row.id);
    if (updErr) return back(updErr.message);

    // Auto-register webhooks (best-effort; connection stays valid even if this fails)
    try {
      const { registerShopifyWebhooksForBrand } = await import("@/server/shopifyWebhooks.server");
      await registerShopifyWebhooksForBrand(parsed.brand_id, url.origin);
    } catch (e) {
      await supabaseAdmin
        .from("brand_integrations")
        .update({ last_error: `webhook_register: ${(e as Error).message}` })
        .eq("id", row.id);
    }

    return back("Shopify connected", true);
  } catch (e) {
    return back((e as Error).message || "Unknown error");
  }
}