import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPageWrite } from "./page-permissions.server";
import { fetchAllRows, sanitizeOrFilterValue } from "./paginate";


// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

const ORDERS_PAGE = "/orders";

function dayRange(from: string | null, to: string | null) {
  const start = from ? new Date(`${from}T00:00:00.000Z`) : new Date(Date.now() - 30 * 86400000);
  const end = to ? new Date(`${to}T23:59:59.999Z`) : new Date();
  return { start: start.toISOString(), end: end.toISOString() };
}

export type OrdersOverview = {
  totals: {
    orders: number;
    revenue: number;
    cost: number;
    shipping: number;
    avgOrderValue: number;
  };
  delivery: { delivered: number; returned: number; open: number; cancelled: number; deliveryRate: number; returnRate: number };
  collection: { expected: number; collected: number; outstanding: number; collectionRate: number };
  byStatus: Array<{ status: string; count: number; amount: number }>;
  byGovernorate: Array<{ name: string; count: number; amount: number; delivered: number }>;
  byCourier: Array<{ name: string; count: number; delivered: number; returned: number; deliveryRate: number }>;
  daily: Array<{ day: string; count: number; amount: number }>;
};

export const getOrdersOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { dateFrom: string | null; dateTo: string | null; brandId?: string | null }) => input)
  .handler(async ({ data, context }): Promise<OrdersOverview> => {
    const ctx = context as unknown as Ctx;
    const { start, end } = dayRange(data.dateFrom, data.dateTo);

    let q = ctx.supabase
      .from("orders")
      .select(
        "id, brand_id, courier_id, order_status, collection_status, shipment_outcome, total_amount, cost_total, shipping_amount, shipping_governorate, occurred_at",
      )
      .gte("occurred_at", start)
      .lte("occurred_at", end)
      .limit(20000);
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    const { data: orders, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (orders ?? []) as Array<Record<string, unknown>>;

    const ids = rows.map((r) => r["id"] as string);
    let collected = 0;
    // Chunk the id list (URL length safety) and paginate each chunk fully.
    const ID_CHUNK = 500;
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
      const chunk = ids.slice(i, i + ID_CHUNK);
      const cols = await fetchAllRows<{ amount: number }>(() =>
        ctx.supabase.from("order_collections").select("order_id, amount").in("order_id", chunk),
      );
      for (const c of cols) collected += Number(c.amount ?? 0);
    }


    const { data: couriers } = await ctx.supabase.from("couriers").select("id, name");
    const courierName = new Map<string, string>(
      ((couriers ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]),
    );

    const totals = { orders: rows.length, revenue: 0, cost: 0, shipping: 0, avgOrderValue: 0 };
    const delivery = { delivered: 0, returned: 0, open: 0, cancelled: 0, deliveryRate: 0, returnRate: 0 };
    let expected = 0;
    const byStatus = new Map<string, { count: number; amount: number }>();
    const byGov = new Map<string, { count: number; amount: number; delivered: number }>();
    const byCourier = new Map<string, { count: number; delivered: number; returned: number }>();
    const daily = new Map<string, { count: number; amount: number }>();

    for (const r of rows) {
      const amount = Number(r["total_amount"] ?? 0);
      totals.revenue += amount;
      totals.cost += Number(r["cost_total"] ?? 0);
      totals.shipping += Number(r["shipping_amount"] ?? 0);

      const outcome = String(r["shipment_outcome"] ?? "open");
      if (outcome === "delivered" || outcome === "exchanged") delivery.delivered += 1;
      else if (outcome === "returned" || outcome === "customer_returned") delivery.returned += 1;
      else if (outcome === "cancelled_before_dispatch") delivery.cancelled += 1;
      else delivery.open += 1;

      const collectionStatus = String(r["collection_status"] ?? "processing");
      if (collectionStatus !== "unavailable") expected += amount;

      const st = String(r["order_status"] ?? "new");
      const s = byStatus.get(st) ?? { count: 0, amount: 0 };
      s.count += 1; s.amount += amount; byStatus.set(st, s);

      const gov = String(r["shipping_governorate"] ?? "—") || "—";
      const g = byGov.get(gov) ?? { count: 0, amount: 0, delivered: 0 };
      g.count += 1; g.amount += amount;
      if (outcome === "delivered" || outcome === "exchanged") g.delivered += 1;
      byGov.set(gov, g);

      const cid = (r["courier_id"] as string | null) ?? "";
      const cname = cid ? (courierName.get(cid) ?? "—") : "—";
      const c = byCourier.get(cname) ?? { count: 0, delivered: 0, returned: 0 };
      c.count += 1;
      if (outcome === "delivered" || outcome === "exchanged") c.delivered += 1;
      if (outcome === "returned" || outcome === "customer_returned") c.returned += 1;
      byCourier.set(cname, c);

      const day = String(r["occurred_at"] ?? "").slice(0, 10);
      const d = daily.get(day) ?? { count: 0, amount: 0 };
      d.count += 1; d.amount += amount; daily.set(day, d);
    }
    totals.avgOrderValue = rows.length ? totals.revenue / rows.length : 0;
    const shipped = delivery.delivered + delivery.returned;
    delivery.deliveryRate = shipped ? (delivery.delivered / shipped) * 100 : 0;
    delivery.returnRate = shipped ? (delivery.returned / shipped) * 100 : 0;

    return {
      totals,
      delivery,
      collection: {
        expected,
        collected,
        outstanding: expected - collected,
        collectionRate: expected ? (collected / expected) * 100 : 0,
      },
      byStatus: [...byStatus.entries()].map(([status, v]) => ({ status, ...v })).sort((a, b) => b.count - a.count),
      byGovernorate: [...byGov.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count).slice(0, 15),
      byCourier: [...byCourier.entries()].map(([name, v]) => ({
        name, ...v, deliveryRate: v.delivered + v.returned ? (v.delivered / (v.delivered + v.returned)) * 100 : 0,
      })).sort((a, b) => b.count - a.count),
      daily: [...daily.entries()].map(([day, v]) => ({ day, ...v })).sort((a, b) => a.day.localeCompare(b.day)),
    };
  });

export type ShipmentRow = {
  id: string;
  order_id: string;
  attempt_no: number;
  courier_id: string | null;
  tracking: string | null;
  status: string;
  expected_cod: number;
  shipping_fee: number;
  shipped_at: string | null;
  delivered_at: string | null;
  returned_at: string | null;
  note: string | null;
  created_at: string;
};

export type CollectionRow = {
  id: string;
  order_id: string;
  shipment_id: string | null;
  amount: number;
  method: string;
  collected_at: string;
  note: string | null;
};

export type WhatsappMessageRow = {
  id: string;
  thread_id: string;
  direction: string;
  body: string | null;
  media_url: string | null;
  status: string;
  error: string | null;
  sent_at: string;
};

export type TimelineEntry = {
  id: string;
  kind: "lifecycle" | "shipment" | "collection";
  at: string;
  title: string;
  detail: string | null;
  source: string | null;
};

export const getOrderTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const [events, shipments, collections] = await Promise.all([
      ctx.supabase.from("order_lifecycle_events")
        .select("id, created_at, source, from_order_status, to_order_status, to_collection_status, to_shipment_outcome, raw_status, note")
        .eq("order_id", data.orderId).order("created_at", { ascending: false }).limit(200),
      ctx.supabase.from("order_shipments")
        .select("*").eq("order_id", data.orderId).order("attempt_no", { ascending: true }),
      ctx.supabase.from("order_collections")
        .select("*").eq("order_id", data.orderId).order("collected_at", { ascending: false }),
    ]);

    const entries: TimelineEntry[] = [];
    for (const e of (events.data ?? []) as Array<Record<string, unknown>>) {
      entries.push({
        id: String(e["id"]),
        kind: "lifecycle",
        at: String(e["created_at"]),
        title: `${e["from_order_status"] ?? "—"} → ${e["to_order_status"]}`,
        detail: [e["to_collection_status"], e["to_shipment_outcome"], e["raw_status"], e["note"]]
          .filter(Boolean).join(" • ") || null,
        source: String(e["source"] ?? ""),
      });
    }
    for (const s of (shipments.data ?? []) as Array<Record<string, unknown>>) {
      entries.push({
        id: `sh-${String(s["id"])}`,
        kind: "shipment",
        at: String(s["shipped_at"] ?? s["created_at"]),
        title: `شحنة #${s["attempt_no"]} — ${s["status"]}`,
        detail: [s["tracking"], s["note"]].filter(Boolean).join(" • ") || null,
        source: "shipment",
      });
    }
    for (const c of (collections.data ?? []) as Array<Record<string, unknown>>) {
      entries.push({
        id: `co-${String(c["id"])}`,
        kind: "collection",
        at: String(c["collected_at"]),
        title: `تحصيل ${Number(c["amount"] ?? 0).toLocaleString()} (${c["method"]})`,
        detail: (c["note"] as string) ?? null,
        source: "collection",
      });
    }
    entries.sort((a, b) => (a.at < b.at ? 1 : -1));

    return {
      entries,
      shipments: (shipments.data ?? []) as ShipmentRow[],
      collections: (collections.data ?? []) as CollectionRow[],
    };
  });

export const addShipmentAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    orderId: string; courierId?: string | null; tracking?: string | null;
    expectedCod?: number; shippingFee?: number; status?: string; note?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPageWrite(ctx, ORDERS_PAGE);
    const { data: order, error: oErr } = await ctx.supabase
      .from("orders").select("id, brand_id, courier_id, total_amount").eq("id", data.orderId).maybeSingle();
    if (oErr) throw new Error(oErr.message);
    if (!order) throw new Error("Order not found");

    const { data: last } = await ctx.supabase
      .from("order_shipments").select("attempt_no").eq("order_id", data.orderId)
      .order("attempt_no", { ascending: false }).limit(1).maybeSingle();
    const attemptNo = Number(last?.attempt_no ?? 0) + 1;

    const { error } = await ctx.supabase.from("order_shipments").insert({
      order_id: data.orderId,
      brand_id: order.brand_id,
      courier_id: data.courierId ?? order.courier_id ?? null,
      attempt_no: attemptNo,
      tracking: data.tracking ?? null,
      status: data.status ?? "shipped",
      expected_cod: data.expectedCod ?? Number(order.total_amount ?? 0),
      shipping_fee: data.shippingFee ?? 0,
      shipped_at: new Date().toISOString(),
      note: data.note ?? null,
      created_by: ctx.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true, attemptNo };
  });

export const recordCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    orderId: string; shipmentId?: string | null; amount: number;
    method?: string; note?: string | null; collectedAt?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPageWrite(ctx, ORDERS_PAGE);
    if (!(Number(data.amount) > 0)) throw new Error("Amount must be positive");
    const { data: order } = await ctx.supabase
      .from("orders").select("id, brand_id, courier_id").eq("id", data.orderId).maybeSingle();
    if (!order) throw new Error("Order not found");
    const { error } = await ctx.supabase.from("order_collections").insert({
      order_id: data.orderId,
      shipment_id: data.shipmentId ?? null,
      brand_id: order.brand_id,
      courier_id: order.courier_id ?? null,
      amount: Number(data.amount),
      method: data.method ?? "cod",
      collected_at: data.collectedAt ?? new Date().toISOString(),
      note: data.note ?? null,
      created_by: ctx.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------- WhatsApp -------------------------------- */

export type WhatsappThread = {
  id: string;
  brand_id: string;
  phone: string;
  display_name: string | null;
  order_id: string | null;
  status: string;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
};

export const listWhatsappThreads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { search?: string | null; brandId?: string | null }) => input)
  .handler(async ({ data, context }): Promise<WhatsappThread[]> => {
    const ctx = context as unknown as Ctx;
    let q = ctx.supabase.from("whatsapp_threads").select("*")
      .order("last_message_at", { ascending: false, nullsFirst: false }).limit(200);
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    if (data.search) {
      const s = sanitizeOrFilterValue(data.search);
      q = q.or(`phone.ilike.%${s}%,display_name.ilike.%${s}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as WhatsappThread[];
  });

export const getWhatsappThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { threadId: string }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { data: messages, error } = await ctx.supabase
      .from("whatsapp_messages").select("*").eq("thread_id", data.threadId)
      .order("sent_at", { ascending: true }).limit(300);
    if (error) throw new Error(error.message);
    await ctx.supabase.from("whatsapp_threads").update({ unread_count: 0 }).eq("id", data.threadId);
    return { messages: (messages ?? []) as WhatsappMessageRow[] };
  });

export const startWhatsappThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { brandId: string; phone: string; displayName?: string | null; orderId?: string | null }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPageWrite(ctx, ORDERS_PAGE);
    const phone = data.phone.replace(/[^\d+]/g, "");
    if (phone.length < 8) throw new Error("Invalid phone");
    const { data: existing } = await ctx.supabase.from("whatsapp_threads")
      .select("id").eq("brand_id", data.brandId).eq("phone", phone).maybeSingle();
    if (existing) return { id: existing.id as string };
    const { data: created, error } = await ctx.supabase.from("whatsapp_threads").insert({
      brand_id: data.brandId, phone, display_name: data.displayName ?? null, order_id: data.orderId ?? null,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: created.id as string };
  });

export const sendWhatsappMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { threadId: string; body: string }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPageWrite(ctx, ORDERS_PAGE);
    const body = data.body.trim();
    if (!body) throw new Error("Empty message");
    const { data: thread, error: tErr } = await ctx.supabase
      .from("whatsapp_threads").select("id, brand_id, phone").eq("id", data.threadId).maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!thread) throw new Error("Thread not found");

    const token = process.env["WHATSAPP_TOKEN"];
    const phoneId = process.env["WHATSAPP_PHONE_NUMBER_ID"];
    let status = "queued";
    let waId: string | null = null;
    let err: string | null = null;

    if (token && phoneId) {
      try {
        const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: thread.phone,
            type: "text",
            text: { body },
          }),
        });
        const json = (await res.json()) as { messages?: Array<{ id: string }>; error?: { message?: string } };
        if (!res.ok) {
          status = "failed";
          err = `[${res.status}] ${json?.error?.message ?? "provider error"}`;
        } else {
          status = "sent";
          waId = json.messages?.[0]?.id ?? null;
        }
      } catch (e) {
        status = "failed";
        err = e instanceof Error ? e.message : "network error";
      }
    } else {
      err = "WhatsApp API غير مفعّل — الرسالة محفوظة في الانتظار";
    }

    const { error } = await ctx.supabase.from("whatsapp_messages").insert({
      thread_id: thread.id, brand_id: thread.brand_id, direction: "out",
      body, wa_message_id: waId, status, error: err, created_by: ctx.userId,
    });
    if (error) throw new Error(error.message);
    await ctx.supabase.from("whatsapp_threads").update({
      last_message_at: new Date().toISOString(), last_message_preview: body.slice(0, 120),
    }).eq("id", thread.id);
    return { status, error: err };
  });

export const linkThreadToOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { threadId: string; orderId: string | null }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPageWrite(ctx, ORDERS_PAGE);
    const { error } = await ctx.supabase.from("whatsapp_threads")
      .update({ order_id: data.orderId }).eq("id", data.threadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type StuckOrderAlert = {
  id: string;
  kind: "no_shipment" | "uncollected";
  externalNumber: string | null;
  customerName: string | null;
  customerPhone: string | null;
  orderStatus: string;
  totalAmount: number;
  collected: number;
  outstanding: number;
  daysStuck: number;
  since: string;
};

export type StuckOrdersAlerts = {
  noShipment: StuckOrderAlert[];
  uncollected: StuckOrderAlert[];
  total: number;
};

const DAY_MS = 86400000;

export const getStuckOrdersAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { brandId?: string | null } = {}) => input)
  .handler(async ({ data, context }): Promise<StuckOrdersAlerts> => {
    const ctx = context as unknown as Ctx;
    const now = Date.now();
    const cutoff3 = new Date(now - 3 * DAY_MS).toISOString();
    const cutoff5 = new Date(now - 5 * DAY_MS).toISOString();
    const select = "id, external_order_number, customer_name, customer_phone, order_status, shipment_outcome, total_amount, occurred_at, lifecycle_updated_at";

    // (1) In-transit orders with no shipment row for more than 3 days.
    let q1 = ctx.supabase
      .from("orders")
      .select(select)
      .in("shipment_outcome", ["open"])
      .not("order_status", "in", "(cancelled)")
      .lt("occurred_at", cutoff3)
      .order("occurred_at", { ascending: true })
      .limit(300);
    if (data.brandId) q1 = q1.eq("brand_id", data.brandId);

    // (2) Delivered orders not fully collected after 5 days.
    let q2 = ctx.supabase
      .from("orders")
      .select(select)
      .eq("shipment_outcome", "delivered")
      .lt("lifecycle_updated_at", cutoff5)
      .order("lifecycle_updated_at", { ascending: true })
      .limit(300);
    if (data.brandId) q2 = q2.eq("brand_id", data.brandId);

    const [openRes, deliveredRes] = await Promise.all([q1, q2]);
    if (openRes.error) throw new Error(openRes.error.message);
    if (deliveredRes.error) throw new Error(deliveredRes.error.message);

    type Row = {
      id: string; external_order_number: string | null; customer_name: string | null;
      customer_phone: string | null; order_status: string; total_amount: number | null;
      occurred_at: string; lifecycle_updated_at: string | null;
    };
    const openRows = (openRes.data ?? []) as Row[];
    const deliveredRows = (deliveredRes.data ?? []) as Row[];

    const openIds = openRows.map((r) => r.id);
    const shipped = new Set<string>();
    if (openIds.length) {
      const { data: ships, error } = await ctx.supabase
        .from("order_shipments").select("order_id").in("order_id", openIds);
      if (error) throw new Error(error.message);
      for (const s of (ships ?? []) as Array<{ order_id: string }>) shipped.add(s.order_id);
    }

    const deliveredIds = deliveredRows.map((r) => r.id);
    const collectedMap = new Map<string, number>();
    if (deliveredIds.length) {
      const { data: cols, error } = await ctx.supabase
        .from("order_collections").select("order_id, amount").in("order_id", deliveredIds);
      if (error) throw new Error(error.message);
      for (const c of (cols ?? []) as Array<{ order_id: string; amount: number | null }>) {
        collectedMap.set(c.order_id, (collectedMap.get(c.order_id) ?? 0) + Number(c.amount ?? 0));
      }
    }

    const daysSince = (iso: string) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY_MS));

    const noShipment: StuckOrderAlert[] = openRows
      .filter((r) => !shipped.has(r.id))
      .map((r) => ({
        id: r.id,
        kind: "no_shipment" as const,
        externalNumber: r.external_order_number,
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        orderStatus: r.order_status,
        totalAmount: Number(r.total_amount ?? 0),
        collected: 0,
        outstanding: Number(r.total_amount ?? 0),
        daysStuck: daysSince(r.occurred_at),
        since: r.occurred_at,
      }));

    const uncollected: StuckOrderAlert[] = deliveredRows
      .map((r) => {
        const total = Number(r.total_amount ?? 0);
        const collected = collectedMap.get(r.id) ?? 0;
        const since = r.lifecycle_updated_at ?? r.occurred_at;
        return {
          id: r.id,
          kind: "uncollected" as const,
          externalNumber: r.external_order_number,
          customerName: r.customer_name,
          customerPhone: r.customer_phone,
          orderStatus: r.order_status,
          totalAmount: total,
          collected,
          outstanding: Math.round((total - collected) * 100) / 100,
          daysStuck: daysSince(since),
          since,
        };
      })
      .filter((r) => r.outstanding > 0.5);

    return { noShipment, uncollected, total: noShipment.length + uncollected.length };
  });
