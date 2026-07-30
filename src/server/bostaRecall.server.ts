// Server-only Bosta status recall. Used by cron via /api/public/hooks/bosta-recall.
import { decryptConnectionKey } from "@/server/connectionKeyCrypto";

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
  fulfillment_status: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any;
};

export async function recallAllOpenBostaShipments(limit = 100) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { logIntegrationEvent } = await import("@/server/integrationLogger");

  const { data: rows, error } = await supabaseAdmin
    .from("orders")
    .select("id, brand_id, external_order_number, fulfillment_status, raw")
    .not("raw->>bosta_tracking", "is", null)
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
      const raw = order.raw ?? {};
      const tracking = raw.bosta_tracking as string | undefined;
      const deliveryId = raw.bosta_delivery_id as string | undefined;
      if (!tracking && !deliveryId) { failed += 1; continue; }

      const endpoints = [
        deliveryId ? `https://app.bosta.co/api/v2/deliveries/${deliveryId}` : null,
        tracking ? `https://app.bosta.co/api/v2/deliveries/business/${tracking}` : null,
        tracking ? `https://app.bosta.co/api/v0/deliveries/business/track/${tracking}` : null,
      ].filter(Boolean) as string[];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let parsed: any = null; let httpStatus = 0;
      for (const url of endpoints) {
        const res = await fetch(url, { headers: { Authorization: creds.api_key, Accept: "application/json" } });
        httpStatus = res.status;
        const text = await res.text();
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { _raw: text.slice(0, 500) }; }
        if (res.ok && parsed) break;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = (parsed?.data ?? parsed ?? {}) as any;
      const stateValue: string = d?.state?.value ?? d?.state ?? d?.status ?? d?.currentStatus?.state ?? "unknown";
      const stateCode = d?.state?.code ?? d?.masterState ?? null;
      let newStatus = mapBostaStateToFulfillment(stateValue);
      const notFoundOnBosta = httpStatus === 404 || /not\s*found|deleted|does\s*not\s*exist/i.test(String(parsed?.message ?? parsed?.error ?? ""));
      if (!newStatus && notFoundOnBosta && order.fulfillment_status !== "delivered" && order.fulfillment_status !== "returned") {
        newStatus = "cancelled";
      }

      const changed = !!(newStatus && newStatus !== order.fulfillment_status);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: { raw: any; fulfillment_status?: string } = {
        raw: { ...raw, bosta_last_state: stateValue, bosta_last_state_code: stateCode, bosta_last_pull_at: new Date().toISOString(), ...(notFoundOnBosta ? { bosta_deleted: true } : {}) },
      };
      if (changed) patch.fulfillment_status = newStatus!;
      await supabaseAdmin.from("orders").update(patch).eq("id", order.id);
      if (changed) updated += 1;

      await logIntegrationEvent(supabaseAdmin, {
        provider: "bosta", brand_id: order.brand_id, direction: "incoming",
        operation: "pull_status_cron", status: changed ? "success" : "info", http_status: httpStatus,
        order_id: order.id, order_number: order.external_order_number,
        tracking_number: tracking ?? null,
        reason: `state=${stateValue}${notFoundOnBosta ? " (deleted on Bosta)" : ""}${changed ? ` → ${newStatus}` : ""}`,
        metadata: { duration_ms: Date.now() - started },
      });

    } catch (e) {
      failed += 1;
      await logIntegrationEvent(supabaseAdmin, {
        provider: "bosta", brand_id: order.brand_id, direction: "incoming",
        operation: "pull_status_cron", status: "error",
        order_id: order.id, order_number: order.external_order_number,
        reason: `recall failed: ${(e as Error).message}`,
      });
    }
  }
  return { ok: true, checked, updated, failed };
}
