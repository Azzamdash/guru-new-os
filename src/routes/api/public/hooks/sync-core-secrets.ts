import { createFileRoute } from "@tanstack/react-router";

async function isAuthorized(request: Request): Promise<boolean> {
  const expected = process.env["CRON_TOKEN_SECRETS_SYNC"] ?? process.env["CRON_TOKEN_SHOPIFY_SYNC"];
  if (!expected) return false;
  const provided = request.headers.get("apikey") ?? request.headers.get("x-webhook-secret");
  if (!provided) return false;

  const { timingSafeEqual } = await import("node:crypto");
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/hooks/sync-core-secrets")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isAuthorized(request))) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const { seedCoreConfiguration } = await import("@/server/coreSecretsSeed.server");
        try {
          const report = await seedCoreConfiguration();
          return Response.json({ ok: true, results: report.secrets, cron: report.cron });

        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
