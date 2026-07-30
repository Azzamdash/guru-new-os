import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/shopify/$brandId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const brandId = params.brandId;
        const rawBody = await request.text();
        const hmac = request.headers.get("x-shopify-hmac-sha256");
        const { verifyShopifyHmac, ingestShopifyOrderWebhook } = await import("@/server/shopifySync.server");
        const ok = await verifyShopifyHmac(brandId, rawBody, hmac);
        if (!ok) return new Response("Invalid signature", { status: 401 });
        try {
          const parsed = JSON.parse(rawBody);
          await ingestShopifyOrderWebhook(brandId, parsed);
          return new Response("ok");
        } catch (e) {
          return new Response(`error: ${(e as Error).message}`, { status: 500 });
        }
      },
    },
  },
});