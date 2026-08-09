import { formatBusinessDate } from "@/lib/timezone";
import { getTodayInBusinessTimezone } from "@/lib/timezone";
import { businessDateEndUTC, businessDateStartUTC } from "@/lib/timezone";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "./paginate";
import { assertPageWrite } from "./page-permissions.server";
import { COURIERS_PAGE } from "./page-permission-paths";
import { isTerminalShipmentOutcome } from "./order-lifecycle.shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

// Bosta delivery type codes (from Bosta's API spec): deliver/Send = 10,
// Customer Return Pickup = 25, Exchange = 30.
const BOSTA_DELIVERY_TYPE_BY_KIND: Record<string, number> = {
  sale: 10,
  return: 25,
  exchange: 30,
};

async function assertManager(ctx: Ctx) {
  for (const role of ["admin", "manager"] as const) {
    const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: role });
    if (data) return;
  }
  throw new Error("Forbidden");
}

async function courierServesBrand(context: Ctx, courierId: string, brandId: string) {
  const { data, error } = await context.supabase.rpc("courier_serves_brand", {
    _courier_id: courierId,
    _brand_id: brandId,
  });
  if (error) throw error;
  return data === true;
}

async function couriersForBrand<T extends { id: string }>(
  context: Ctx,
  couriers: T[],
  brandId: string,
) {
  const allowed = await Promise.all(
    couriers.map(async (courier) =>
      (await courierServesBrand(context, courier.id, brandId)) ? courier : null,
    ),
  );
  return allowed.filter(Boolean) as T[];
}

type OrderRow = {
  id: string;
  brand_id: string;
  courier_id: string | null;
  fulfillment_status: string;
  confirmation_status: string;
  total_amount: number;
  shipping_amount: number;
  courier_expense: number;
  shipping_governorate: string | null;
  occurred_at: string;
};

/** Couriers analytics dashboard: aggregates orders in a date range. */
export const getCouriersDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (
      d: {
        from?: string;
        to?: string;
        brandId?: string | null;
        courierId?: string | null;
        confirmationStatus?: string | null;
      } = {},
    ) => d,
  )
  .handler(async ({ data, context }) => {
    await assertManager(context as unknown as Ctx);
    const to = data.to ?? getTodayInBusinessTimezone();
    const from = data.from ?? formatBusinessDate(new Date(Date.now() - 30 * 86400000));

    const ordersBuilder = () => {
      let q = context.supabase
        .from("orders")
        .select(
          "id, brand_id, courier_id, fulfillment_status, confirmation_status, total_amount, shipping_amount, courier_expense, shipping_governorate, occurred_at",
        )
        .gte("occurred_at", businessDateStartUTC(from))
        .lte("occurred_at", businessDateEndUTC(to));
      if (data.brandId) q = q.eq("brand_id", data.brandId);
      if (data.courierId) q = q.eq("courier_id", data.courierId);
      if (data.confirmationStatus && data.confirmationStatus !== "all") {
        q = q.eq("confirmation_status", data.confirmationStatus);
      }
      return q;
    };
    const [orders, cR, bR] = await Promise.all([
      fetchAllRows<OrderRow>(ordersBuilder),
      context.supabase.from("couriers").select("id, name, type, brand_id, active"),
      context.supabase.from("brands").select("id, name"),
    ]);
    if (cR.error) throw cR.error;
    if (bR.error) throw bR.error;
    // Fetch pieces (order_items.qty) for the filtered orders so we can report
    // "delivered (orders)" AND "delivered (pieces)" side by side.
    const orderIds = orders.map((o) => o.id);
    const qtyByOrder = new Map<string, number>();
    if (orderIds.length > 0) {
      const { data: items } = await context.supabase
        .from("order_items")
        .select("order_id, qty")
        .in("order_id", orderIds);
      for (const it of (items ?? []) as Array<{ order_id: string; qty: number }>) {
        qtyByOrder.set(it.order_id, (qtyByOrder.get(it.order_id) ?? 0) + Number(it.qty || 0));
      }
    }
    const couriers = (cR.data ?? []) as Array<{
      id: string;
      name: string;
      type: string;
      brand_id: string | null;
      active: boolean;
    }>;
    const brands = (bR.data ?? []) as Array<{ id: string; name: string }>;
    const brandName = new Map(brands.map((b) => [b.id, b.name]));
    const courierName = new Map(couriers.map((c) => [c.id, c.name]));
    const courierType = new Map(couriers.map((c) => [c.id, c.type]));

    type Agg = {
      orders: number;
      pieces: number;
      delivered: number;
      deliveredPieces: number;
      returned: number;
      returnedPieces: number;
      inTransit: number;
      cancelled: number;
      confirmed: number;
      confirmationCancelled: number;
      revenue: number;
      collected: number;
      expectedCod: number;
      shipping: number;
      shippingCost: number;
    };
    const zero = (): Agg => ({
      orders: 0,
      pieces: 0,
      delivered: 0,
      deliveredPieces: 0,
      returned: 0,
      returnedPieces: 0,
      inTransit: 0,
      cancelled: 0,
      confirmed: 0,
      confirmationCancelled: 0,
      revenue: 0,
      collected: 0,
      expectedCod: 0,
      shipping: 0,
      shippingCost: 0,
    });
    const add = (a: Agg, o: OrderRow) => {
      a.orders += 1;
      const pcs = qtyByOrder.get(o.id) ?? 0;
      a.pieces += pcs;
      const amt = Number(o.total_amount) || 0;
      const ship = Number(o.shipping_amount) || 0;
      a.revenue += amt;
      a.shipping += ship;
      a.shippingCost += Number(o.courier_expense) || 0;
      if (o.confirmation_status === "confirmed") a.confirmed += 1;
      else if (o.confirmation_status === "cancelled") a.confirmationCancelled += 1;
      if (o.fulfillment_status === "delivered") {
        a.delivered += 1;
        a.deliveredPieces += pcs;
        a.collected += amt;
      } else if (o.fulfillment_status === "returned") {
        a.returned += 1;
        a.returnedPieces += pcs;
      } else if (o.fulfillment_status === "cancelled") a.cancelled += 1;
      else {
        a.inTransit += 1;
        a.expectedCod += amt;
      }
    };

    const totals = zero();
    const perCourier = new Map<string, Agg>();
    const perBrand = new Map<string, Agg>();
    const perGov = new Map<string, Agg>();
    const govCourier = new Map<string, Map<string, Agg>>();
    const daily = new Map<string, Agg>();
    for (const o of orders) {
      add(totals, o);
      const cid = o.courier_id ?? "__none";
      if (!perCourier.has(cid)) perCourier.set(cid, zero());
      add(perCourier.get(cid)!, o);
      if (!perBrand.has(o.brand_id)) perBrand.set(o.brand_id, zero());
      add(perBrand.get(o.brand_id)!, o);
      const gov = (o.shipping_governorate || "—").trim() || "—";
      if (!perGov.has(gov)) perGov.set(gov, zero());
      add(perGov.get(gov)!, o);
      if (o.courier_id) {
        if (!govCourier.has(gov)) govCourier.set(gov, new Map());
        const inner = govCourier.get(gov)!;
        if (!inner.has(o.courier_id)) inner.set(o.courier_id, zero());
        add(inner.get(o.courier_id)!, o);
      }
      const day = o.occurred_at.slice(0, 10);
      if (!daily.has(day)) daily.set(day, zero());
      add(daily.get(day)!, o);
    }

    const rate = (a: Agg) => {
      const done = a.delivered + a.returned;
      return {
        deliveryRate:
          a.confirmed > 0 ? a.delivered / a.confirmed : done > 0 ? a.delivered / done : 0,
        returnRate: done > 0 ? a.returned / done : 0,
        confirmationRate: a.orders > 0 ? a.confirmed / a.orders : 0,
      };
    };

    const couriersRows = Array.from(perCourier.entries())
      .map(([id, a]) => ({
        courier_id: id === "__none" ? null : id,
        name: id === "__none" ? "— بدون —" : (courierName.get(id) ?? "—"),
        type: id === "__none" ? "unassigned" : (courierType.get(id) ?? "—"),
        ...a,
        ...rate(a),
      }))
      .sort((a, b) => b.orders - a.orders);

    const brandsRows = Array.from(perBrand.entries())
      .map(([id, a]) => ({
        brand_id: id,
        name: brandName.get(id) ?? "—",
        ...a,
        ...rate(a),
      }))
      .sort((a, b) => b.orders - a.orders);

    const govRows = Array.from(perGov.entries())
      .map(([gov, a]) => {
        const inner = govCourier.get(gov);
        let best: { id: string; name: string; deliveryRate: number; orders: number } | null = null;
        if (inner) {
          for (const [cid, ca] of inner.entries()) {
            const done = ca.delivered + ca.returned;
            if (done < 3) continue;
            const dr = ca.delivered / done;
            if (!best || dr > best.deliveryRate)
              best = {
                id: cid,
                name: courierName.get(cid) ?? "—",
                deliveryRate: dr,
                orders: ca.orders,
              };
          }
        }
        return { governorate: gov, ...a, ...rate(a), bestCourier: best };
      })
      .sort((a, b) => b.orders - a.orders);

    const trend = Array.from(daily.entries())
      .map(([day, a]) => ({ day, ...a, ...rate(a) }))
      .sort((a, b) => a.day.localeCompare(b.day));

    return {
      from,
      to,
      totals: { ...totals, ...rate(totals) },
      couriers: couriersRows,
      brands: brandsRows,
      governorates: govRows,
      trend,
      couriersList: couriers
        .filter((c) => c.active)
        .map((c) => ({ id: c.id, name: c.name, brand_id: c.brand_id, type: c.type })),
    };
  });

async function pickBestCourier(context: Ctx, brand_id: string, governorate: string | null) {
  const gov = (governorate ?? "").trim() || null;
  const since = new Date(Date.now() - 180 * 86400000).toISOString();
  const arr = await fetchAllRows<{
    courier_id: string;
    fulfillment_status: string;
    shipping_governorate: string | null;
    brand_id: string;
  }>(() =>
    context.supabase
      .from("orders")
      .select("courier_id, fulfillment_status, shipping_governorate, brand_id")
      .gte("occurred_at", since)
      .not("courier_id", "is", null),
  );

  const score = (filter: (r: (typeof arr)[number]) => boolean) => {
    const map = new Map<string, { d: number; r: number }>();
    for (const r of arr) {
      if (!filter(r)) continue;
      const s = map.get(r.courier_id) ?? { d: 0, r: 0 };
      if (r.fulfillment_status === "delivered") s.d += 1;
      else if (r.fulfillment_status === "returned") s.r += 1;
      map.set(r.courier_id, s);
    }
    let best: { id: string; rate: number; volume: number } | null = null;
    for (const [id, s] of map.entries()) {
      const done = s.d + s.r;
      if (done < 3) continue;
      const rate = s.d / done;
      if (!best || rate > best.rate || (rate === best.rate && done > best.volume)) {
        best = { id, rate, volume: done };
      }
    }
    return best;
  };

  const pick =
    (gov
      ? score((r) => r.brand_id === brand_id && (r.shipping_governorate ?? "").trim() === gov)
      : null) ?? score((r) => r.brand_id === brand_id);

  if (!pick) {
    const { data: cs } = await context.supabase
      .from("couriers")
      .select("id, name, brand_id, active, type")
      .eq("active", true);
    const list = (cs ?? []) as Array<{
      id: string;
      name: string;
      brand_id: string | null;
      active: boolean;
      type: string;
    }>;
    const [forBrand] = await couriersForBrand(context, list, brand_id);
    if (!forBrand) return { courier: null };
    return {
      courier: {
        id: forBrand.id,
        name: forBrand.name,
        type: forBrand.type,
        deliveryRate: null as number | null,
        volume: 0,
      },
    };
  }
  const { data: c } = await context.supabase
    .from("couriers")
    .select("id, name, type, brand_id, active")
    .eq("id", pick.id)
    .single();
  if (!c?.active || !(await courierServesBrand(context, pick.id, brand_id))) {
    const { data: fallbacks } = await context.supabase
      .from("couriers")
      .select("id, name, type, brand_id")
      .eq("active", true);
    const fallbackRows = (fallbacks ?? []) as Array<{
      id: string;
      name: string;
      type: string;
      brand_id: string | null;
    }>;
    const [fallback] = await couriersForBrand(context, fallbackRows, brand_id);
    return {
      courier: fallback
        ? {
            id: fallback.id,
            name: fallback.name,
            type: fallback.type,
            deliveryRate: null,
            volume: 0,
          }
        : null,
    };
  }
  return {
    courier: {
      id: pick.id,
      name: c?.name ?? "—",
      type: c?.type ?? "—",
      deliveryRate: pick.rate,
      volume: pick.volume,
    },
  };
}

export const recommendCourierForOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase
      .from("orders")
      .select("id, brand_id, shipping_governorate")
      .eq("id", data.orderId)
      .single();
    if (error) throw error;
    return await pickBestCourier(context, order.brand_id, order.shipping_governorate);
  });

/** Assign an order to the best courier, mark processing, best-effort push to Bosta if integrated. */
export const dispatchOrderToBestCourier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string; courierId?: string | null }) => d)
  .handler(async ({ data, context }) => {
    await assertPageWrite(context, COURIERS_PAGE);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: order, error } = await (context.supabase as any)
      .from("orders")
      .select(
        "id, brand_id, source, external_id, shipping_governorate, external_order_number, customer_name, customer_phone, shipping_address, total_amount, shipping_amount, note, fulfillment_status, shipment_outcome, collection_status, order_kind",
      )
      .eq("id", data.orderId)
      .single();
    if (error) throw error;
    if (isTerminalShipmentOutcome(order.shipment_outcome)) {
      throw new Error("لا يمكن إسناد أوردر حالته نهائية لشركة شحن");
    }
    if (!order.shipping_address?.trim() || !order.customer_phone?.trim()) {
      throw new Error("لا يمكن إسناد الأوردر بدون عنوان ورقم تليفون للعميل");
    }

    let courierId = data.courierId ?? null;
    let courierName = "";
    let courierType = "";
    if (!courierId) {
      const rec = await pickBestCourier(context, order.brand_id, order.shipping_governorate);
      if (!rec.courier)
        throw new Error("لم يتم العثور على مندوب مناسب. أضف مندوبًا/شركة شحن أولاً.");
      courierId = rec.courier.id;
      courierName = rec.courier.name;
      courierType = rec.courier.type;
    } else {
      const { data: c, error: courierError } = await context.supabase
        .from("couriers")
        .select("name, type, brand_id")
        .eq("id", courierId)
        .single();
      if (courierError) throw courierError;
      if (!(await courierServesBrand(context, courierId, order.brand_id))) {
        throw new Error("شركة الشحن المختارة لا تخص براند الأوردر");
      }
      courierName = c?.name ?? "";
      courierType = c?.type ?? "";
    }

    const { claimOrderDispatch, releaseOrderDispatchClaim } = await import(
      "@/server/orderDispatchClaim.server"
    );
    const dispatchClaim = await claimOrderDispatch(context.supabase, order.id);
    let dispatchPersisted = false;
    let providerMayHaveAccepted = false;
    try {
      let externalNote = "";
      let trackingNumber: string | null = null;
      let providerAttempted = false;
      let providerTracking = false;
      const { logIntegrationEvent } = await import("@/server/integrationLogger");
      try {
      const lower = courierName.toLowerCase();
      const provider = lower.includes("bosta")
        ? "bosta"
        : lower.includes("aramex")
          ? "aramex"
          : lower.includes("mylerz")
            ? "mylerz"
            : lower.includes("shipblu")
              ? "shipblu"
              : null;
      if (provider) {
        const { data: integ } = await context.supabase
          .from("brand_integrations")
          .select("credentials_ciphertext, config")
          .eq("brand_id", order.brand_id)
          .eq("provider", provider)
          .maybeSingle();
        if (integ?.credentials_ciphertext) {
          const { decryptConnectionKey } = await import("@/server/connectionKeyCrypto");
          const creds = JSON.parse(decryptConnectionKey(integ.credentials_ciphertext)) as Record<
            string,
            string
          >;
          if (provider === "bosta" && creds.api_key) {
            providerAttempted = true;
            const started = Date.now();
            const orderNo = order.external_order_number ?? order.id;
            const orderKind = (order.order_kind as string | null) ?? "sale";
            const { data: dispatchItems } = await context.supabase
              .from("order_items")
              .select("title, qty")
              .eq("order_id", order.id);
            const packageItems = (dispatchItems ?? []) as Array<{ title: string; qty: number }>;
            const packageItemsCount =
              packageItems.reduce((sum, i) => sum + (Number(i.qty) || 0), 0) || 1;
            // Bosta's package description has no documented length cap, but a very long
            // list of items can still push a request over their payload limits — cap it
            // defensively rather than let a large order fail dispatch outright.
            const packageDescription = packageItems.length
              ? packageItems.map((i) => `${i.qty}x ${i.title}`).join(", ").slice(0, 500)
              : `Order ${orderNo}`;
            // Already collected manually (e.g. customer paid by transfer instead
            // of cash on delivery)? Don't ask the courier to collect it again.
            // Returns/exchanges never carry a COD to collect from the customer.
            // (Bosta's Customer Return Pickup type wants a negative cod when the
            // courier is issuing a refund to the customer on pickup — we don't
            // route refunds through the courier today, so 0 is correct here.)
            const codAmount =
              orderKind !== "sale" || order.collection_status === "paid"
                ? 0
                : Number(order.total_amount) || 0;
            const isReturnOrExchange = orderKind === "return" || orderKind === "exchange";
            const payload = {
              type: BOSTA_DELIVERY_TYPE_BY_KIND[orderKind as keyof typeof BOSTA_DELIVERY_TYPE_BY_KIND] ?? 10,
              businessReference: order.id,
              specs: {
                packageDetails: { itemsCount: packageItemsCount, description: packageDescription },
              },
              // Bosta's Customer Return Pickup / Exchange types also take
              // returnSpecs/returnNotes describing the item coming back from
              // the customer. returnAddress/pickupAddress (where the courier
              // should drop off what they picked up) are deliberately left
              // out — there's no warehouse/return address configured
              // anywhere in this app yet, and guessing one risks sending a
              // courier to the wrong place. Bosta falls back to the
              // business's registered pickup location when these are
              // omitted.
              ...(isReturnOrExchange
                ? {
                    returnSpecs: {
                      packageDetails: { itemsCount: packageItemsCount, description: packageDescription },
                    },
                    returnNotes:
                      order.note ||
                      (orderKind === "return" ? `Return for order ${orderNo}` : `Exchange for order ${orderNo}`),
                  }
                : {}),
              cod: codAmount,
              dropOffAddress: {
                city: order.shipping_governorate ?? "Cairo",
                district: order.shipping_governorate ?? "Cairo",
                firstLine: order.shipping_address ?? "—",
              },
              receiver: {
                firstName: (order.customer_name ?? "Customer").split(" ")[0] || "Customer",
                lastName: (order.customer_name ?? "").split(" ").slice(1).join(" ") || "-",
                phone: order.customer_phone ?? "",
              },
            };
            await logIntegrationEvent({
              provider: "bosta",
              brand_id: order.brand_id,
              direction: "outgoing",
              operation: "create_delivery",
              status: "info",
              order_number: String(orderNo),
              order_id: order.id,
              request: payload,
              reason: "dispatch → Bosta",
              actor_id: context.userId,
            });
            providerMayHaveAccepted = true;
            const res = await fetch("https://app.bosta.co/api/v2/deliveries", {
              method: "POST",
              headers: { Authorization: creds.api_key, "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const body = await res.text();
            let parsed: unknown = null;
            try {
              parsed = JSON.parse(body);
            } catch {
              /* noop */
            }
            trackingNumber =
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ((parsed as any)?.data?.trackingNumber ?? (parsed as any)?.trackingNumber ?? null) as
                string | null;
            const providerRejected =
              !res.ok ||
              (typeof parsed === "object" && parsed !== null && "success" in parsed && parsed.success === false);
            if (providerRejected) providerMayHaveAccepted = false;
            const deliveryCreated = !providerRejected && !!trackingNumber;
            externalNote = deliveryCreated ? " · Bosta: ✔" : ` · Bosta: ✗ (${res.status})`;
            await logIntegrationEvent({
              provider: "bosta",
              brand_id: order.brand_id,
              direction: "outgoing",
              operation: "create_delivery",
              status: deliveryCreated ? "success" : "error",
              http_status: res.status,
              order_number: String(orderNo),
              order_id: order.id,
              tracking_number: trackingNumber,
              reason: deliveryCreated
                ? "delivery created"
                : res.ok
                  ? "delivery response missing tracking number"
                  : `HTTP ${res.status}`,
              response: (parsed as unknown) ?? body.slice(0, 500),
              metadata: { duration_ms: Date.now() - started },
              actor_id: context.userId,
            });
            if (providerRejected) throw new Error(`Bosta delivery creation failed (HTTP ${res.status})`);
            if (!trackingNumber) {
              throw new Error("Bosta delivery response did not include a tracking number");
            }
            providerTracking = true;
          }
        }
      }
    } catch (e) {
      const msg = (e as Error).message;
      externalNote = ` · Dispatch API error: ${msg}`;
      await logIntegrationEvent({
        provider: "bosta",
        brand_id: order.brand_id,
        direction: "outgoing",
        operation: "create_delivery",
        status: "error",
        order_number: String(order.external_order_number ?? order.id),
        order_id: order.id,
        reason: msg,
        actor_id: context.userId,
      });
      if (providerAttempted) {
        throw new Error(`فشل إرسال الأوردر إلى شركة الشحن: ${msg}`);
      }
    }

    // Offline couriers get a local dispatch reference, never a fabricated provider tracking number.
    if (!trackingNumber) {
      const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
      const ts = Date.now().toString(36).toUpperCase().slice(-6);
      trackingNumber = `TRK-${ts}-${rand}`;
    }

    // Keep local dispatch references separate from provider tracking so Bosta recall never pulls them.
    const noteAppend = `[Dispatched → ${courierName} · TRK: ${trackingNumber}${externalNote}]`;
    const { data: finalized, error: finalizeError } = await context.supabase.rpc(
      "finalize_generic_order_dispatch",
      {
        _order_id: order.id,
        _claim_token: dispatchClaim,
        _courier_id: courierId,
        _tracking: trackingNumber,
        _provider_tracking: providerTracking,
        _note: order.note ? `${order.note} ${noteAppend}` : noteAppend,
      },
    );
    if (finalizeError) throw finalizeError;
    if (!finalized) throw new Error("تعذر تثبيت إسناد الشحنة");
    dispatchPersisted = true;

      // Best-effort: dispatch already succeeded and is committed, so a Shopify
      // hiccup here shouldn't fail the whole action — just flag it for retry.
      if (order.source === "shopify" && order.external_id) {
        try {
          const { applyShopifyOrderAction } = await import("@/server/shopifySync.server");
          await applyShopifyOrderAction({
            brandId: order.brand_id,
            externalOrderId: order.external_id,
            action: "fulfill",
          });
          await context.supabase
            .from("orders")
            .update({ shopify_sync_status: "synced", shopify_sync_error: null })
            .eq("id", order.id);
        } catch (shopifyError) {
          const message = shopifyError instanceof Error ? shopifyError.message : String(shopifyError);
          await context.supabase
            .from("orders")
            .update({ shopify_sync_status: "error", shopify_sync_error: message.slice(0, 500) })
            .eq("id", order.id);
        }
      }

      return {
        ok: true,
        courier: { id: courierId, name: courierName, type: courierType },
        trackingNumber,
        externalNote,
      };
    } finally {
      if (!dispatchPersisted && !providerMayHaveAccepted) {
        await releaseOrderDispatchClaim(context.supabase, order.id, dispatchClaim);
      }
    }
  });
