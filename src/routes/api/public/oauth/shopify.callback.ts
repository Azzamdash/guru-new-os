import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/oauth/shopify/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleShopifyOAuthCallback } = await import("@/server/shopifyOAuthCallback.server");
        return handleShopifyOAuthCallback(request);
      },
    },
  },
});
