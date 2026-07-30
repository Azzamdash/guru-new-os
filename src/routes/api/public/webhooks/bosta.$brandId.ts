import { createFileRoute } from "@tanstack/react-router";

/**
 * Bosta webhook receiver.
 * URL: /api/public/webhooks/bosta/:brandId
 * Optional shared secret via ?secret=... matched against BOSTA_WEBHOOK_SECRET.
 * Every event is logged with order_number, tracking_number, and a human-readable reason.
 */
export const Route = createFileRoute("/api/public/webhooks/bosta/$brandId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const started = Date.now();
        const url = new URL(request.url);
        const providedSecret = url.searchParams.get("secret") ?? request.headers.get("x-webhook-secret");
        const expected = process.env.BOSTA_WEBHOOK_SECRET;

        const raw = await request.text();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let payload: any = null;
        try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { _raw: raw.slice(0, 2000) }; }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { logIntegrationEvent } = await import("@/server/integrationLogger");

        if (expected && providedSecret !== expected) {
          await logIntegrationEvent(supabaseAdmin, {
            provider: "bosta", brand_id: params.brandId, direction: "webhook",
            operation: "webhook_receive", status: "error", http_status: 401,
            reason: "invalid or missing webhook secret",
            metadata: { ip: request.headers.get("x-forwarded-for"), duration_ms: Date.now() - started },
          });
          return new Response("Unauthorized", { status: 401 });
        }

        const orderNumber =
          payload?.businessReference ??
          payload?.order?.reference ??
          payload?.delivery?.businessReference ??
          payload?.data?.businessReference ??
          null;
        const trackingNumber =
          payload?.trackingNumber ??
          payload?.delivery?.trackingNumber ??
          payload?.data?.trackingNumber ??
          null;
        const state =
          payload?.state?.value ??
          payload?.state ??
          payload?.status ??
          payload?.delivery?.state?.value ??
          payload?.event ??
          "unknown";
        const reasonText =
          payload?.state?.reason ??
          payload?.reason ??
          payload?.exception?.reason ??
          payload?.deliveryHistory?.[0]?.reason ??
          `state=${state}`;

        try {
          if (orderNumber) {
            await supabaseAdmin
              .from("orders")
              .update({
                fulfillment_status:
                  String(state).toLowerCase().includes("delivered") ? "delivered"
                  : String(state).toLowerCase().includes("return") ? "returned"
                  : String(state).toLowerCase().includes("cancel") ? "cancelled"
                  : "shipped",
              })
              .eq("brand_id", params.brandId)
              .eq("external_order_number", String(orderNumber));
          }
        } catch (e) {
          await logIntegrationEvent(supabaseAdmin, {
            provider: "bosta", brand_id: params.brandId, direction: "webhook",
            operation: "webhook_apply", status: "warning",
            order_number: orderNumber, tracking_number: trackingNumber,
            reason: `order update failed: ${(e as Error).message}`,
            metadata: { state, duration_ms: Date.now() - started },
          });
        }


        await logIntegrationEvent(supabaseAdmin, {
          provider: "bosta", brand_id: params.brandId, direction: "webhook",
          operation: "webhook_receive", status: "success", http_status: 200,
          order_number: orderNumber, tracking_number: trackingNumber,
          reason: `${state} — ${String(reasonText).slice(0, 300)}`,
          request: payload,
          metadata: { duration_ms: Date.now() - started },
        });

        return Response.json({ ok: true });
      },
    },
  },
});
