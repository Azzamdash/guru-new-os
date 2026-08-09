import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPageWrite } from "./page-permissions.server";
import { COURIERS_PAGE } from "./page-permission-paths";

/**
 * Orders dispatched to Bosta (bosta_delivery_id is only ever set from a real
 * Bosta create-delivery response) that a merchant might want to reprint.
 */
export const listPrintableOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string | null; search?: string | null } = {}) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("orders")
      .select(
        "id, brand_id, external_order_number, customer_name, shipping_governorate, bosta_tracking, bosta_delivery_id, bosta_sent_at, courier_id, couriers(name)",
      )
      .not("bosta_delivery_id", "is", null)
      .order("bosta_sent_at", { ascending: false })
      .limit(200);
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    // PostgREST's .or() filter syntax treats "," "(" ")" as grammar, not literal
    // search text — strip them so a stray character in a search box can't
    // reshape the filter into something the merchant didn't type.
    const search = data.search?.trim().replace(/[,()]/g, "");
    if (search) {
      q = q.or(
        `external_order_number.ilike.%${search}%,bosta_tracking.ilike.%${search}%,customer_name.ilike.%${search}%`,
      );
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

type LabelResult =
  | { kind: "pdf"; base64: string; orderNumber: string; trackingNumber: string | null }
  | { kind: "url"; url: string; orderNumber: string; trackingNumber: string | null };

/**
 * Bosta's own AWB response shape isn't in any public docs we could reach —
 * the community Node SDK only confirms the endpoint, not the payload. Look
 * for a plausible PDF/link field under a few likely names rather than
 * assuming one; logIntegrationEvent captures the raw response either way so
 * a wrong guess here is a one-line fix, not a silent failure.
 */
function findAwbUrl(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  const root = parsed as Record<string, unknown>;
  const data =
    root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : root;
  const candidates = [data.deliveryAWB, data.awbUrl, data.url, data.awb, data.pdfUrl, data.link];
  for (const c of candidates) {
    if (typeof c === "string" && /^https?:\/\//.test(c)) return c;
  }
  return null;
}

export const fetchOrderShippingLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string }) => d)
  .handler(async ({ data, context }): Promise<LabelResult> => {
    await assertPageWrite(context, COURIERS_PAGE);
    const { data: order, error } = await context.supabase
      .from("orders")
      .select("id, brand_id, external_order_number, bosta_tracking, bosta_delivery_id")
      .eq("id", data.orderId)
      .single();
    if (error) throw error;
    if (!order.bosta_delivery_id) {
      throw new Error("لا يوجد رقم شحنة بوسطة لهذا الأوردر — لسه متسندش لبوسطة");
    }

    const { data: integ } = await context.supabase
      .from("brand_integrations")
      .select("credentials_ciphertext")
      .eq("brand_id", order.brand_id)
      .eq("provider", "bosta")
      .maybeSingle();
    if (!integ?.credentials_ciphertext) throw new Error("لا يوجد اتصال ببوسطة لهذا البراند");
    const { decryptConnectionKey } = await import("@/server/connectionKeyCrypto");
    const creds = JSON.parse(decryptConnectionKey(integ.credentials_ciphertext)) as Record<
      string,
      string
    >;
    if (!creds.api_key) throw new Error("مفتاح بوسطة غير موجود لهذا البراند");

    const { logIntegrationEvent } = await import("@/server/integrationLogger");
    const orderNo = String(order.external_order_number ?? order.id);

    const res = await fetch(`https://app.bosta.co/api/v2/deliveries/awb/${order.bosta_delivery_id}`, {
      headers: { Authorization: creds.api_key, Accept: "application/json,application/pdf" },
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      await logIntegrationEvent({
        provider: "bosta",
        brand_id: order.brand_id,
        direction: "outgoing",
        operation: "fetch_awb",
        status: "error",
        http_status: res.status,
        order_number: orderNo,
        order_id: order.id,
        tracking_number: order.bosta_tracking,
        reason: `HTTP ${res.status}`,
        response: bodyText.slice(0, 500),
        actor_id: context.userId,
      });
      throw new Error(`تعذر جلب بوليصة بوسطة (HTTP ${res.status})`);
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("pdf")) {
      const bytes = await res.arrayBuffer();
      await logIntegrationEvent({
        provider: "bosta",
        brand_id: order.brand_id,
        direction: "outgoing",
        operation: "fetch_awb",
        status: "success",
        http_status: res.status,
        order_number: orderNo,
        order_id: order.id,
        tracking_number: order.bosta_tracking,
        reason: "awb pdf fetched",
        actor_id: context.userId,
      });
      return {
        kind: "pdf",
        base64: Buffer.from(bytes).toString("base64"),
        orderNumber: orderNo,
        trackingNumber: order.bosta_tracking,
      };
    }

    const bodyText = await res.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      /* fall through — findAwbUrl handles non-object input */
    }
    const url = findAwbUrl(parsed);
    await logIntegrationEvent({
      provider: "bosta",
      brand_id: order.brand_id,
      direction: "outgoing",
      operation: "fetch_awb",
      status: url ? "success" : "warning",
      http_status: res.status,
      order_number: orderNo,
      order_id: order.id,
      tracking_number: order.bosta_tracking,
      reason: url ? "awb url fetched" : "unrecognized awb response shape",
      response: parsed ?? bodyText.slice(0, 500),
      actor_id: context.userId,
    });
    if (!url) {
      throw new Error(
        "شكل استجابة بوسطة غير متوقع — الرد اتسجل في سجل التكاملات (Integration Logs) لمراجعته",
      );
    }
    return { kind: "url", url, orderNumber: orderNo, trackingNumber: order.bosta_tracking };
  });
