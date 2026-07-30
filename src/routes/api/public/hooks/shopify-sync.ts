import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/shopify-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        if (!apiKey || apiKey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { syncAllConnectedShopify } = await import("@/server/shopifySync.server");
        const results = await syncAllConnectedShopify();
        return Response.json({ ok: true, results });
      },
    },
  },
});