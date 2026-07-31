// Public Shopify webhook endpoint. Shopify signs body with the shared secret
// stored per brand_integration. We look up the brand from the shop domain header,
// verify HMAC, then delegate to the existing idempotent sync.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/shopify/orders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const shopDomain = request.headers.get("x-shopify-shop-domain");
        const hmac = request.headers.get("x-shopify-hmac-sha256");
        const topic = request.headers.get("x-shopify-topic") ?? "orders/updated";

        if (!shopDomain || !hmac) {
          return new Response("Missing Shopify headers", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: integ } = await supabaseAdmin
          .from("brand_integrations")
          .select("id, brand_id, config")
          .eq("provider", "shopify")
          .contains("config", { shop_domain: shopDomain })
          .maybeSingle();

        if (!integ) {
          return new Response("No integration for shop", { status: 404 });
        }

        try {
          const { verifyShopifyHmac, ingestShopifyOrderWebhook } =
            await import("@/server/shopifySync.server");
          const ok = await verifyShopifyHmac(integ.brand_id, rawBody, hmac);
          if (!ok) {
            await supabaseAdmin.from("integration_logs").insert({
              provider: "shopify",
              direction: "webhook",
              operation: topic,
              status: "error",
              reason: "HMAC verification failed",
              brand_id: integ.brand_id,
            });
            return new Response("Invalid HMAC", { status: 401 });
          }

          const order = JSON.parse(rawBody);
          await ingestShopifyOrderWebhook(integ.brand_id, order);
          await supabaseAdmin.from("integration_logs").insert({
            provider: "shopify",
            direction: "webhook",
            operation: topic,
            status: "success",
            order_number: String(order.name ?? order.order_number ?? ""),
            brand_id: integ.brand_id,
          });
          return new Response("ok", { status: 200 });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await supabaseAdmin.from("integration_logs").insert({
            provider: "shopify",
            direction: "webhook",
            operation: topic,
            status: "error",
            reason: msg.slice(0, 500),
            brand_id: integ.brand_id,
          });
          return new Response(`Error: ${msg}`, { status: 500 });
        }
      },
    },
  },
});
