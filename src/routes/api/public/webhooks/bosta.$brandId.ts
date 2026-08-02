import { createFileRoute } from "@tanstack/react-router";
import {
  bostaProviderEventAt,
  isRecognizedBostaDeliveryStatus,
  mapBostaLifecycle,
  resolveBostaShipmentOutcome,
  shopifyActionForOrderStatus,
} from "@/lib/order-lifecycle.shared";
import { applyShopifyOrderAction } from "@/server/shopifySync.server";

async function secretMatches(provided: string | null, expected: string | undefined): Promise<boolean> {
  if (!expected || !provided) return false;
  const { timingSafeEqual } = await import("node:crypto");
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Bosta webhook receiver.
 * URL: /api/public/webhooks/bosta/:brandId
 * Shared secret via the x-webhook-secret header, matched against BOSTA_WEBHOOK_SECRET
 * with a constant-time comparison.
 * Every event is logged with order_number, tracking_number, and a human-readable reason.
 */
export const Route = createFileRoute("/api/public/webhooks/bosta/$brandId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const started = Date.now();
        const providedSecret = request.headers.get("x-webhook-secret");
        const expected = process.env.BOSTA_WEBHOOK_SECRET;
        const secretOk = await secretMatches(providedSecret, expected);

        const raw = await request.text();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let payload: any = null;
        try {
          payload = raw ? JSON.parse(raw) : {};
        } catch {
          payload = { _raw: raw.slice(0, 2000) };
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { logIntegrationEvent } = await import("@/server/integrationLogger");

        if (!secretOk) {
          const httpStatus = expected ? 401 : 503;
          await logIntegrationEvent(supabaseAdmin, {
            provider: "bosta",
            brand_id: params.brandId,
            direction: "webhook",
            operation: "webhook_receive",
            status: "error",
            http_status: httpStatus,
            reason: expected
              ? "invalid or missing webhook secret"
              : "BOSTA_WEBHOOK_SECRET is not configured",
            metadata: {
              ip: request.headers.get("x-forwarded-for"),
              duration_ms: Date.now() - started,
            },
          });
          return new Response(expected ? "Unauthorized" : "Webhook is not configured", {
            status: httpStatus,
          });
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
        const collectionState =
          payload?.collectionStatus ??
          payload?.moneyCollection?.status ??
          payload?.data?.collectionStatus ??
          null;
        const reasonText =
          payload?.state?.reason ??
          payload?.reason ??
          payload?.exception?.reason ??
          payload?.deliveryHistory?.[0]?.reason ??
          `state=${state}`;

        try {
          if ((orderNumber || trackingNumber) && isRecognizedBostaDeliveryStatus(String(state))) {
            const mappedLifecycle = mapBostaLifecycle(String(state), collectionState);
            const selectOrder =
              "id, source, external_id, fulfillment_status, shipment_outcome, bosta_tracking" as const;
            type MatchedOrder = {
              id: string;
              source: string;
              external_id: string | null;
              fulfillment_status: string | null;
              shipment_outcome: string | null;
              bosta_tracking: string | null;
            };
            let order: MatchedOrder | null = null;
            let ambiguousMatch = false;

            if (
              orderNumber &&
              /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                String(orderNumber),
              )
            ) {
              const { data, error } = await supabaseAdmin
                .from("orders")
                .select(selectOrder)
                .eq("brand_id", params.brandId)
                .eq("id", String(orderNumber))
                .maybeSingle();
              if (error) throw error;
              order = data;
            }

            if (!order && trackingNumber) {
              const { data, error } = await supabaseAdmin
                .from("orders")
                .select(selectOrder)
                .eq("brand_id", params.brandId)
                .eq("bosta_tracking", String(trackingNumber))
                .limit(2);
              if (error) throw error;
              if ((data?.length ?? 0) === 1) order = data![0];
              else if ((data?.length ?? 0) > 1) ambiguousMatch = true;
            }

            if (!order && !ambiguousMatch && orderNumber) {
              const { data, error } = await supabaseAdmin
                .from("orders")
                .select(selectOrder)
                .eq("brand_id", params.brandId)
                .eq("external_order_number", String(orderNumber))
                .limit(2);
              if (error) throw error;
              if ((data?.length ?? 0) === 1) order = data![0];
              else if ((data?.length ?? 0) > 1) ambiguousMatch = true;
            }

            if (ambiguousMatch) {
              await logIntegrationEvent(supabaseAdmin, {
                provider: "bosta",
                brand_id: params.brandId,
                direction: "webhook",
                operation: "webhook_ambiguous_order",
                status: "warning",
                http_status: 202,
                order_number: orderNumber,
                tracking_number: trackingNumber,
                reason: "ambiguous Bosta order match; no order was updated",
                metadata: { state, duration_ms: Date.now() - started },
              });
              return Response.json({ ok: false, reason: "ambiguous_order" }, { status: 202 });
            }

            if (order) {
              const lifecycle = {
                ...mappedLifecycle,
                shipmentOutcome: resolveBostaShipmentOutcome(
                  order.shipment_outcome,
                  mappedLifecycle.shipmentOutcome,
                ),
              };
              const shopifyAction = shopifyActionForOrderStatus(
                lifecycle.orderStatus,
                lifecycle.shipmentOutcome,
              );
              const shouldSyncShopify =
                order.source === "shopify" &&
                (shopifyAction === "fulfill" || shopifyAction === "cancel");

              const legacyFulfillment =
                lifecycle.shipmentOutcome === "delivered" ||
                lifecycle.shipmentOutcome === "exchanged"
                  ? "delivered"
                  : lifecycle.shipmentOutcome === "returned" ||
                      lifecycle.shipmentOutcome === "customer_returned"
                    ? "returned"
                    : lifecycle.shipmentOutcome === "cancelled_before_dispatch"
                      ? "cancelled"
                      : "shipped";
              const { data: applied, error: updateError } = await supabaseAdmin.rpc(
                "apply_bosta_lifecycle",
                {
                  _order_id: order.id,
                  _provider_event_at: bostaProviderEventAt(payload) as unknown as string,
                  _tracking: trackingNumber ? String(trackingNumber) : "",
                  _state: String(state),
                  _collection_state: String(collectionState ?? "pending"),
                  _order_status: lifecycle.orderStatus,
                  _collection_status: lifecycle.collectionStatus,
                  _shipment_outcome: lifecycle.shipmentOutcome,
                  _fulfillment_status: legacyFulfillment as unknown as string,
                  _shopify_sync_status: shouldSyncShopify
                    ? "pending"
                    : shopifyAction === "review_return"
                      ? "pending"
                      : "not_applicable",
                  _shopify_sync_error: null as unknown as string,
                  _payload: payload,
                },
              );
              if (updateError) throw updateError;
              if (!applied) {
                return Response.json(
                  { ok: true, ignored: true, reason: "stale_provider_event" },
                  { status: 202 },
                );
              }

              if (shouldSyncShopify) {
                try {
                  if (!order.external_id) throw new Error("Shopify order is missing external_id");
                  await applyShopifyOrderAction({
                    brandId: params.brandId,
                    externalOrderId: order.external_id,
                    action: shopifyAction,
                  });
                } catch (shopifyError) {
                  const message =
                    shopifyError instanceof Error ? shopifyError.message : String(shopifyError);
                  await supabaseAdmin
                    .from("orders")
                    .update({
                      shopify_sync_status: "error",
                      shopify_sync_error: message.slice(0, 500),
                    })
                    .eq("id", order.id);
                  throw shopifyError;
                }

                const { error: syncStatusError } = await supabaseAdmin
                  .from("orders")
                  .update({
                    shopify_sync_status: "synced",
                    shopify_sync_error: null,
                  })
                  .eq("id", order.id);
                if (syncStatusError) throw syncStatusError;
              }
            }
          } else if (orderNumber) {
            await logIntegrationEvent(supabaseAdmin, {
              provider: "bosta",
              brand_id: params.brandId,
              direction: "webhook",
              operation: "webhook_unmapped_status",
              status: "warning",
              order_number: String(orderNumber),
              tracking_number: trackingNumber,
              reason: `unmapped Bosta state: ${String(state).slice(0, 200)}`,
            });
          }
        } catch (e) {
          await logIntegrationEvent(supabaseAdmin, {
            provider: "bosta",
            brand_id: params.brandId,
            direction: "webhook",
            operation: "webhook_apply",
            status: "warning",
            order_number: orderNumber,
            tracking_number: trackingNumber,
            reason: `order update failed: ${(e as Error).message}`,
            metadata: { state, duration_ms: Date.now() - started },
          });
          return new Response("Failed to apply Bosta webhook", { status: 500 });
        }

        await logIntegrationEvent(supabaseAdmin, {
          provider: "bosta",
          brand_id: params.brandId,
          direction: "webhook",
          operation: "webhook_receive",
          status: "success",
          http_status: 200,
          order_number: orderNumber,
          tracking_number: trackingNumber,
          reason: `${state} — ${String(reasonText).slice(0, 300)}`,
          request: payload,
          metadata: { duration_ms: Date.now() - started },
        });

        return Response.json({ ok: true });
      },
    },
  },
});
