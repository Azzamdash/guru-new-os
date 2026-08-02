import { createFileRoute } from "@tanstack/react-router";

async function isAuthorized(request: Request): Promise<boolean> {
  const expected = process.env["SHOPIFY_SYNC_HOOK_SECRET"];
  if (!expected) return false;
  const provided = request.headers.get("apikey");
  if (!provided) return false;

  const { timingSafeEqual } = await import("node:crypto");
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/hooks/shopify-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthorized(request))) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const { syncAllConnectedShopify } = await import("@/server/shopifySync.server");
        const results = await syncAllConnectedShopify();
        return Response.json({ ok: true, results });
      },
    },
  },
});
