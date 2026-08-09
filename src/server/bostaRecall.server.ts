// Server-only Bosta status recall. Used by cron via /api/public/hooks/bosta-recall.
import { decryptConnectionKey } from "@/server/connectionKeyCrypto";
import {
  bostaProviderEventAt,
  isConfirmedBostaNotFound,
  isRecognizedBostaDeliveryStatus,
  mapBostaLifecycle,
  preserveDeliveredStatusOnReturn,
  resolveBostaShipmentOutcome,
  shopifyActionForOrderStatus,
} from "@/lib/order-lifecycle.shared";

function mapBostaStateToFulfillment(stateValue: string | null | undefined): string | null {
  const s = String(stateValue ?? "").toLowerCase();
  if (!s) return null;
  if (s.includes("delivered")) return "delivered";
  if (s.includes("returned") || s.includes("returning to business") || s.includes("rtb")) return "returned";
  if (s.includes("cancel") || s.includes("terminated")) return "cancelled";
  if (s.includes("out for delivery") || s.includes("in transit") || s.includes("picked") || s.includes("received") || s.includes("in-transit")) return "shipped";
  return null;
}

type OrderRow = {
  id: string;
  brand_id: string;
  external_order_number: string | null;
  order_status: string | null;
  fulfillment_status: string | null;
  shipment_outcome: string | null;
  source: string;
  external_id: string | null;
  bosta_tracking: string | null;
  bosta_delivery_id: string | null;
};

export async function recallAllOpenBostaShipments(limit = 100) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { logIntegrationEvent } = await import("@/server/integrationLogger");

  const { data: rows, error } = await supabaseAdmin
    .from("orders")
    .select("id, brand_id, external_order_number, order_status, fulfillment_status, shipment_outcome, source, external_id, bosta_tracking, bosta_delivery_id")
    .not("bosta_tracking", "is", null)
    .not("fulfillment_status", "in", "(delivered,returned,cancelled)")
    .limit(limit);
  if (error) throw new Error(error.message);

  const orders = (rows ?? []) as OrderRow[];
  // Cache creds per brand to reduce round-trips.
  const credsCache = new Map<string, { api_key: string } | null>();
  async function getCreds(brand_id: string) {
    if (credsCache.has(brand_id)) return credsCache.get(brand_id)!;
    const { data } = await supabaseAdmin
      .from("brand_integrations")
      .select("credentials_ciphertext")
      .eq("brand_id", brand_id).eq("provider", "bosta").maybeSingle();
    if (!data?.credentials_ciphertext) { credsCache.set(brand_id, null); return null; }
    try {
      const parsed = JSON.parse(decryptConnectionKey(data.credentials_ciphertext)) as { api_key?: string };
      const c = parsed.api_key ? { api_key: parsed.api_key } : null;
      credsCache.set(brand_id, c); return c;
    } catch { credsCache.set(brand_id, null); return null; }
  }

  let checked = 0, updated = 0, failed = 0;
  for (const order of orders) {
    checked += 1;
    const started = Date.now();
    try {
      const creds = await getCreds(order.brand_id);
      if (!creds) { failed += 1; continue; }
      const tracking = order.bosta_tracking ?? undefined;
      const deliveryId = order.bosta_delivery_id ?? undefined;
      if (!tracking && !deliveryId) { failed += 1; continue; }

      const endpoints = [
        deliveryId ? `https://app.bosta.co/api/v2/deliveries/${deliveryId}` : null,
        tracking ? `https://app.bosta.co/api/v2/deliveries/business/${tracking}` : null,
        tracking ? `https://app.bosta.co/api/v0/deliveries/business/track/${tracking}` : null,
      ].filter(Boolean) as string[];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let parsed: any = null; let httpStatus = 0; let successfulResponse = false;
      const attemptedStatuses: number[] = [];
      for (const url of endpoints) {
        const res = await fetch(url, { headers: { Authorization: creds.api_key, Accept: "application/json" } });
        httpStatus = res.status;
        attemptedStatuses.push(res.status);
        const text = await res.text();
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { _raw: text.slice(0, 500) }; }
        if (res.ok && parsed) { successfulResponse = true; break; }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = (parsed?.data ?? parsed ?? {}) as any;
      const stateValue: string = d?.state?.value ?? d?.state ?? d?.status ?? d?.currentStatus?.state ?? "unknown";
      const stateCode = d?.state?.code ?? d?.masterState ?? null;
      const collectionValue: string =
        d?.collectionStatus?.value ?? d?.collectionStatus ?? d?.codStatus?.value ?? d?.codStatus ?? "pending";
      let newStatus = mapBostaStateToFulfillment(stateValue);
      const responseReason = String(parsed?.message ?? parsed?.error ?? "");
      const notFoundOnBosta = isConfirmedBostaNotFound(
        successfulResponse,
        attemptedStatuses,
        httpStatus,
        responseReason,
      );
      if (!successfulResponse && !notFoundOnBosta) {
        throw new Error(`Bosta status pull failed (HTTP ${httpStatus || "network"})`);
      }
      if (!newStatus && notFoundOnBosta && order.fulfillment_status !== "delivered" && order.fulfillment_status !== "returned") {
        newStatus = "cancelled";
      }

      if (!notFoundOnBosta && !isRecognizedBostaDeliveryStatus(stateValue)) {
        throw new Error(`unmapped Bosta state: ${stateValue}`);
      }

      const effectiveState = notFoundOnBosta ? "cancelled" : stateValue;
      const mapped = mapBostaLifecycle(effectiveState, collectionValue);
      const resolved = {
        ...mapped,
        shipmentOutcome: resolveBostaShipmentOutcome(order.shipment_outcome, mapped.shipmentOutcome),
      };
      const lifecycle = preserveDeliveredStatusOnReturn(order.order_status, order.shipment_outcome, resolved);
      const shopifyAction = shopifyActionForOrderStatus(lifecycle.orderStatus, lifecycle.shipmentOutcome);
      const shouldSyncShopify = order.source === "shopify" && shopifyAction !== "none";
      const bostaPayload = {
          response: parsed,
          last_state: stateValue,
          last_state_code: stateCode,
          collection_status: collectionValue,
          pulled_at: new Date().toISOString(),
          provider_event_at: bostaProviderEventAt(parsed),
          deleted: notFoundOnBosta,
        };
      const { data: applied, error: updateError } = await supabaseAdmin.rpc("apply_bosta_lifecycle", {
        _order_id: order.id,
        _provider_event_at: bostaProviderEventAt(parsed) as unknown as string,
        _tracking: tracking ?? "",
        _state: effectiveState as unknown as string,
        _collection_state: collectionValue,
        _order_status: lifecycle.orderStatus,
        _collection_status: resolved.collectionStatus,
        _shipment_outcome: lifecycle.shipmentOutcome,
        _fulfillment_status: newStatus ?? "",
        _shopify_sync_status: shouldSyncShopify ? "pending" : "not_applicable",
        _shopify_sync_error: null as unknown as string,
        _payload: bostaPayload,
      });
      if (updateError) throw updateError;
      const changed = Boolean(applied && newStatus && newStatus !== order.fulfillment_status);
      if (changed) updated += 1;

      if (applied && shouldSyncShopify && order.external_id) {
        const { applyShopifyOrderAction } = await import("@/server/shopifySync.server");
        await applyShopifyOrderAction({
          brandId: order.brand_id,
          externalOrderId: order.external_id,
          action: shopifyAction,
        });
        const syncStatusUpdate = await supabaseAdmin
          .from("orders")
          .update({ shopify_sync_status: "synced", shopify_sync_error: null })
          .eq("id", order.id);
        if (syncStatusUpdate.error) throw syncStatusUpdate.error;
      }

      await logIntegrationEvent({
        provider: "bosta", brand_id: order.brand_id, direction: "incoming",
        operation: "pull_status_cron", status: changed ? "success" : "info", http_status: httpStatus,
        order_id: order.id, order_number: order.external_order_number,
        tracking_number: tracking ?? null,
        reason: `state=${stateValue}${notFoundOnBosta ? " (deleted on Bosta)" : ""}${changed ? ` → ${newStatus}` : ""}`,
        metadata: { duration_ms: Date.now() - started },
      });

    } catch (e) {
      failed += 1;
      await logIntegrationEvent({
        provider: "bosta", brand_id: order.brand_id, direction: "incoming",
        operation: "pull_status_cron", status: "error",
        order_id: order.id, order_number: order.external_order_number,
        reason: `recall failed: ${(e as Error).message}`,
      });
    }
  }
  return { ok: true, checked, updated, failed };
}
