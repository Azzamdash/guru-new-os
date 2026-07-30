import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/bosta-recall")({
  server: {
    handlers: {
      POST: async () => {
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
