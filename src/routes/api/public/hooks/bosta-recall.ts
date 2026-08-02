import { createFileRoute } from "@tanstack/react-router";

async function isAuthorized(request: Request): Promise<boolean> {
  const expected = process.env["BOSTA_RECALL_SECRET"];
  if (!expected) return false;
  const provided = request.headers.get("x-webhook-secret");
  if (!provided) return false;

  const { timingSafeEqual } = await import("node:crypto");
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/hooks/bosta-recall")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthorized(request))) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { recallAllOpenBostaShipments } = await import("@/server/bostaRecall.server");
        try {
          const r = await recallAllOpenBostaShipments(150);
          return Response.json(r);
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
