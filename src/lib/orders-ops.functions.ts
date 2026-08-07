import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPageWrite } from "./page-permissions.server";
import { ORDERS_PAGE } from "./page-permission-paths";
import { parseSettlementCsv, renderTemplate } from "./orders-ops.shared";
import { businessDateEndUTC, businessDateStartUTC } from "./timezone";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/* ============================ 1) Confirmation desk ============================ */

export type ConfirmationOrder = {
  id: string;
  brand_id: string;
  number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  governorate: string | null;
  total_amount: number;
  occurred_at: string;
  confirmation_status: string;
  attempts: number;
  last_attempt_at: string | null;
  last_outcome: string | null;
};

export const getConfirmationQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { brandId?: string | null; status?: string; search?: string | null }) => input,
  )
  .handler(async ({ data, context }): Promise<ConfirmationOrder[]> => {
    const ctx = context as unknown as Ctx;
    let q = ctx.supabase
      .from("orders")
      .select(
        "id, brand_id, external_order_number, customer_name, customer_phone, shipping_governorate, total_amount, occurred_at, confirmation_status",
      )
      .order("occurred_at", { ascending: false })
      .limit(400);
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    if (data.status && data.status !== "all") q = q.eq("confirmation_status", data.status);
    else q = q.in("confirmation_status", ["pending", "unreachable", "postponed"]);
    if (data.search) {
      const s = data.search.replace(/[%,]/g, "");
      q = q.or(
        `external_order_number.ilike.%${s}%,customer_name.ilike.%${s}%,customer_phone.ilike.%${s}%`,
      );
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const orders = (rows ?? []) as Row[];
    const ids = orders.map((o) => o["id"] as string);

    const attemptsMap = new Map<string, { count: number; at: string; outcome: string }>();
    if (ids.length) {
      const { data: att } = await ctx.supabase
        .from("order_confirmation_attempts")
        .select("order_id, outcome, attempted_at")
        .in("order_id", ids.slice(0, 400))
        .order("attempted_at", { ascending: false });
      for (const a of (att ?? []) as Row[]) {
        const key = a["order_id"] as string;
        const prev = attemptsMap.get(key);
        if (!prev) attemptsMap.set(key, { count: 1, at: a["attempted_at"], outcome: a["outcome"] });
        else prev.count += 1;
      }
    }

    return orders.map((o) => {
      const a = attemptsMap.get(o["id"] as string);
      return {
        id: o["id"],
        brand_id: o["brand_id"],
        number: o["external_order_number"] ?? null,
        customer_name: o["customer_name"] ?? null,
        customer_phone: o["customer_phone"] ?? null,
        governorate: o["shipping_governorate"] ?? null,
        total_amount: Number(o["total_amount"] ?? 0),
        occurred_at: o["occurred_at"],
        confirmation_status: o["confirmation_status"] ?? "pending",
        attempts: a?.count ?? 0,
        last_attempt_at: a?.at ?? null,
        last_outcome: a?.outcome ?? null,
      };
    });
  });

export const recordConfirmation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      orderId: string;
      channel?: string;
      outcome: "confirmed" | "cancelled" | "unreachable" | "postponed";
      reason?: string | null;
      note?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPageWrite(ctx, ORDERS_PAGE);
    const { data: order } = await ctx.supabase
      .from("orders")
      .select("id, brand_id")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) throw new Error("Order not found");

    const { error } = await ctx.supabase.from("order_confirmation_attempts").insert({
      order_id: data.orderId,
      brand_id: order.brand_id,
      channel: data.channel ?? "call",
      outcome: data.outcome,
      reason: data.reason ?? null,
      note: data.note ?? null,
      created_by: ctx.userId,
    });
    if (error) throw new Error(error.message);

    const patch: Row = { confirmation_status: data.outcome };
    if (data.outcome === "cancelled") patch["order_status"] = "cancelled";
    const { error: uErr } = await ctx.supabase.from("orders").update(patch).eq("id", data.orderId);
    if (uErr) throw new Error(uErr.message);
    return { ok: true };
  });

/* ================================ 2) Returns ================================= */

export type ReturnRow = {
  id: string;
  order_id: string;
  brand_id: string;
  kind: string;
  reason: string | null;
  status: string;
  requested_at: string;
  received_at: string | null;
  restocked: boolean;
  refund_amount: number;
  refunded_at: string | null;
  note: string | null;
  order_number: string | null;
  customer_name: string | null;
  order_total: number;
};

export const listReturns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { brandId?: string | null; status?: string | null }) => input)
  .handler(async ({ data, context }): Promise<ReturnRow[]> => {
    const ctx = context as unknown as Ctx;
    let q = ctx.supabase
      .from("order_returns")
      .select("*")
      .order("requested_at", { ascending: false })
      .limit(300);
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Row[];
    const ids = [...new Set(list.map((r) => r["order_id"] as string))];
    const orders = new Map<string, Row>();
    if (ids.length) {
      const { data: os } = await ctx.supabase
        .from("orders")
        .select("id, external_order_number, customer_name, total_amount")
        .in("id", ids);
      for (const o of (os ?? []) as Row[]) orders.set(o["id"], o);
    }
    return list.map((r) => {
      const o = orders.get(r["order_id"]);
      return {
        id: r["id"],
        order_id: r["order_id"],
        brand_id: r["brand_id"],
        kind: r["kind"],
        reason: r["reason"],
        status: r["status"],
        requested_at: r["requested_at"],
        received_at: r["received_at"],
        restocked: Boolean(r["restocked"]),
        refund_amount: Number(r["refund_amount"] ?? 0),
        refunded_at: r["refunded_at"],
        note: r["note"],
        order_number: o?.["external_order_number"] ?? null,
        customer_name: o?.["customer_name"] ?? null,
        order_total: Number(o?.["total_amount"] ?? 0),
      };
    });
  });

export const createReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      orderId: string;
      kind?: "return" | "exchange";
      reason?: string | null;
      note?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPageWrite(ctx, ORDERS_PAGE);
    const { data: order } = await ctx.supabase
      .from("orders")
      .select("id, brand_id, total_amount")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) throw new Error("Order not found");
    const { data: created, error } = await ctx.supabase
      .from("order_returns")
      .insert({
        order_id: data.orderId,
        brand_id: order.brand_id,
        kind: data.kind ?? "return",
        reason: data.reason ?? null,
        note: data.note ?? null,
        refund_amount: 0,
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id as string };
  });

/**
 * Advances a return through: requested -> received -> restocked -> refunded -> closed.
 * Restocking writes inventory movements back for the order items.
 */
export const advanceReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      returnId: string;
      action: "receive" | "restock" | "refund" | "close" | "cancel";
      refundAmount?: number;
      note?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPageWrite(ctx, ORDERS_PAGE);
    const { data: ret, error: rErr } = await ctx.supabase
      .from("order_returns")
      .select("*")
      .eq("id", data.returnId)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!ret) throw new Error("Return not found");

    const now = new Date().toISOString();
    const patch: Row = {};

    if (data.action === "receive") {
      patch["status"] = "received";
      patch["received_at"] = now;
    } else if (data.action === "restock") {
      if (ret.restocked) throw new Error("تم إرجاع الأصناف للمخزون بالفعل");
      const { data: items } = await ctx.supabase
        .from("order_items")
        .select("product_id, qty, unit_cost")
        .eq("order_id", ret.order_id);
      const moves = ((items ?? []) as Row[])
        .filter((i) => i["product_id"] && Number(i["qty"] ?? 0) > 0)
        .map((i) => ({
          type: "return",
          product_id: i["product_id"],
          qty: Number(i["qty"] ?? 0),
          unit_cost: Number(i["unit_cost"] ?? 0),
          source: "order_return",
          source_id: ret.id,
          reason: "مرتجع أوردر",
          created_by: ctx.userId,
        }));

      if (moves.length) {
        const { error: mErr } = await ctx.supabase.from("inventory_movements").insert(moves);
        if (mErr) throw new Error(mErr.message);
      }
      patch["restocked"] = true;
      patch["restocked_at"] = now;
      patch["status"] = "restocked";
    } else if (data.action === "refund") {
      const amount = Number(data.refundAmount ?? 0);
      if (!(amount > 0)) throw new Error("مبلغ الاسترداد يجب أن يكون أكبر من صفر");
      patch["refund_amount"] = amount;
      patch["refunded_at"] = now;
      patch["status"] = "refunded";
    } else if (data.action === "close") {
      patch["status"] = "closed";
    } else {
      patch["status"] = "cancelled";
    }
    if (data.note) patch["note"] = data.note;

    const { error } = await ctx.supabase
      .from("order_returns")
      .update(patch)
      .eq("id", data.returnId);
    if (error) throw new Error(error.message);
    return { ok: true, status: patch["status"] };
  });

/* ========================= 3) Courier COD settlements ========================= */

export type SettlementSummary = {
  id: string;
  reference: string | null;
  courier_id: string | null;
  courier_name: string | null;
  brand_id: string;
  period_from: string | null;
  period_to: string | null;
  declared_total: number;
  matched_total: number;
  status: string;
  lines: number;
  matched_lines: number;
  created_at: string;
};

export const listSettlements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { brandId?: string | null }) => input)
  .handler(async ({ data, context }): Promise<SettlementSummary[]> => {
    const ctx = context as unknown as Ctx;
    let q = ctx.supabase
      .from("courier_settlements")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Row[];
    const ids = list.map((r) => r["id"] as string);
    const counts = new Map<string, { total: number; matched: number }>();
    if (ids.length) {
      const { data: lines } = await ctx.supabase
        .from("courier_settlement_lines")
        .select("settlement_id, match_status")
        .in("settlement_id", ids);
      for (const l of (lines ?? []) as Row[]) {
        const c = counts.get(l["settlement_id"]) ?? { total: 0, matched: 0 };
        c.total += 1;
        if (l["match_status"] === "matched") c.matched += 1;
        counts.set(l["settlement_id"], c);
      }
    }
    const { data: couriers } = await ctx.supabase.from("couriers").select("id, name");
    const cname = new Map<string, string>(
      ((couriers ?? []) as Row[]).map((c) => [c["id"], c["name"]]),
    );
    return list.map((r) => {
      const c = counts.get(r["id"]) ?? { total: 0, matched: 0 };
      return {
        id: r["id"],
        reference: r["reference"],
        courier_id: r["courier_id"],
        courier_name: r["courier_id"] ? (cname.get(r["courier_id"]) ?? null) : null,
        brand_id: r["brand_id"],
        period_from: r["period_from"],
        period_to: r["period_to"],
        declared_total: Number(r["declared_total"] ?? 0),
        matched_total: Number(r["matched_total"] ?? 0),
        status: r["status"],
        lines: c.total,
        matched_lines: c.matched,
        created_at: r["created_at"],
      };
    });
  });

export const importSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      brandId: string;
      courierId?: string | null;
      reference?: string | null;
      periodFrom?: string | null;
      periodTo?: string | null;
      csv: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPageWrite(ctx, ORDERS_PAGE);
    const parsed = parseSettlementCsv(data.csv);
    if (!parsed.length) throw new Error("لا توجد بنود صالحة في الملف");

    const declaredTotal = parsed.reduce((s, l) => s + l.amount, 0);
    const { data: settlement, error: sErr } = await ctx.supabase
      .from("courier_settlements")
      .insert({
        brand_id: data.brandId,
        courier_id: data.courierId ?? null,
        reference: data.reference ?? null,
        period_from: data.periodFrom ?? null,
        period_to: data.periodTo ?? null,
        declared_total: declaredTotal,
        status: "draft",
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (sErr) throw new Error(sErr.message);

    // Match by bosta tracking, then dispatch tracking, then order number.
    const trackings = parsed.map((p) => p.tracking);
    const { data: byBosta } = await ctx.supabase
      .from("orders")
      .select("id, external_order_number, bosta_tracking, dispatch_tracking, total_amount")
      .eq("brand_id", data.brandId)
      .or(
        `bosta_tracking.in.(${trackings.join(",")}),dispatch_tracking.in.(${trackings.join(",")}),external_order_number.in.(${trackings.join(",")})`,
      )
      .limit(5000);
    const index = new Map<string, Row>();
    for (const o of (byBosta ?? []) as Row[]) {
      for (const key of [o["bosta_tracking"], o["dispatch_tracking"], o["external_order_number"]]) {
        if (key) index.set(String(key), o);
      }
    }

    let matchedTotal = 0;
    const lines = parsed.map((p) => {
      const order = index.get(p.tracking);
      const systemAmount = Number(order?.["total_amount"] ?? 0);
      let matchStatus: string = "unmatched";
      let diff: string | null = "لا يوجد أوردر مطابق لرقم التتبع";
      if (order) {
        if (Math.abs(systemAmount - p.amount) < 0.5) {
          matchStatus = "matched";
          diff = null;
          matchedTotal += p.amount;
        } else {
          matchStatus = "amount_mismatch";
          diff = `النظام ${systemAmount} — الكشف ${p.amount}`;
        }
      }
      return {
        settlement_id: settlement.id,
        brand_id: data.brandId,
        order_id: order?.["id"] ?? null,
        tracking: p.tracking,
        order_number: order?.["external_order_number"] ?? null,
        declared_amount: p.amount,
        shipping_fee: p.fee,
        net_amount: p.amount - p.fee,
        system_amount: systemAmount,
        match_status: matchStatus,
        diff_reason: diff,
      };
    });

    const { error: lErr } = await ctx.supabase.from("courier_settlement_lines").insert(lines);
    if (lErr) throw new Error(lErr.message);
    await ctx.supabase
      .from("courier_settlements")
      .update({ matched_total: matchedTotal })
      .eq("id", settlement.id);

    return {
      id: settlement.id as string,
      total: lines.length,
      matched: lines.filter((l) => l.match_status === "matched").length,
    };
  });

export const getSettlementLines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { settlementId: string; matchStatus?: string | null }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    let q = ctx.supabase
      .from("courier_settlement_lines")
      .select("*")
      .eq("settlement_id", data.settlementId)
      .order("match_status", { ascending: true })
      .limit(2000);
    if (data.matchStatus && data.matchStatus !== "all") q = q.eq("match_status", data.matchStatus);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as Row[];
  });

/** Posts matched lines into order_collections so the money hits the treasury reports. */
export const postSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { settlementId: string }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPageWrite(ctx, ORDERS_PAGE);
    const { data: settlement } = await ctx.supabase
      .from("courier_settlements")
      .select("id, brand_id, courier_id, status")
      .eq("id", data.settlementId)
      .maybeSingle();
    if (!settlement) throw new Error("Settlement not found");

    const { data: lines, error } = await ctx.supabase
      .from("courier_settlement_lines")
      .select("id, order_id, net_amount, declared_amount, posted")
      .eq("settlement_id", data.settlementId)
      .eq("match_status", "matched")
      .eq("posted", false);
    if (error) throw new Error(error.message);
    const rows = (lines ?? []) as Row[];
    if (!rows.length) return { ok: true, posted: 0, skipped: 0 };

    const candidateOrderIds = [
      ...new Set(rows.map((l) => l["order_id"]).filter(Boolean)),
    ] as string[];
    const [{ data: orderTotals }, { data: existingCollections }] = await Promise.all([
      ctx.supabase.from("orders").select("id, total_amount").in("id", candidateOrderIds),
      ctx.supabase
        .from("order_collections")
        .select("order_id, amount")
        .in("order_id", candidateOrderIds),
    ]);
    const totalByOrder = new Map<string, number>(
      ((orderTotals ?? []) as Array<{ id: string; total_amount: number }>).map((o) => [
        o.id,
        Number(o.total_amount ?? 0),
      ]),
    );
    const collectedByOrder = new Map<string, number>();
    for (const c of (existingCollections ?? []) as Array<{ order_id: string; amount: number }>) {
      collectedByOrder.set(
        c.order_id,
        (collectedByOrder.get(c.order_id) ?? 0) + Number(c.amount ?? 0),
      );
    }

    const postable: Row[] = [];
    const inserts: Array<{
      order_id: string;
      brand_id: string;
      courier_id: string | null;
      amount: number;
      method: string;
      note: string;
      created_by: string;
    }> = [];
    for (const l of rows) {
      const orderId = l["order_id"] as string | undefined;
      const amount = Number(l["declared_amount"]);
      if (!orderId || !(amount > 0)) continue;
      const already = collectedByOrder.get(orderId) ?? 0;
      const total = totalByOrder.get(orderId) ?? 0;
      // Skip lines that would over-collect against the order total (already
      // settled manually or by a previous settlement) — leave them unposted
      // so they surface for manual review instead of silently double-counting.
      if (already + amount > total + 0.01) continue;
      collectedByOrder.set(orderId, already + amount);
      postable.push(l);
      inserts.push({
        order_id: orderId,
        brand_id: settlement.brand_id,
        courier_id: settlement.courier_id ?? null,
        amount,
        method: "cod",
        note: `كشف تحصيل ${data.settlementId.slice(0, 8)}`,
        created_by: ctx.userId,
      });
    }
    if (inserts.length) {
      const { error: cErr } = await ctx.supabase.from("order_collections").insert(inserts);
      if (cErr) throw new Error(cErr.message);
      await ctx.supabase
        .from("courier_settlement_lines")
        .update({ posted: true })
        .in(
          "id",
          postable.map((r) => r["id"]),
        );
    }
    await ctx.supabase
      .from("courier_settlements")
      .update({ status: "posted" })
      .eq("id", data.settlementId);
    return { ok: true, posted: inserts.length, skipped: rows.length - inserts.length };
  });

export type CollectionGapRow = {
  orderId: string;
  orderNumber: string | null;
  customerName: string | null;
  brandName: string;
  courierName: string | null;
  totalAmount: number;
  collected: number;
  outstanding: number;
  occurredAt: string;
};

/**
 * Delivered orders whose recorded collections (order_collections) fall short
 * of the order total — a read-only reconciliation view, not a new ledger.
 * Surfaces COD that should have come in but hasn't been recorded, without
 * touching or unifying order_collections / cash_transactions / sales_invoices.
 */
export const getCollectionGaps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { brandId?: string | null; from?: string | null; to?: string | null } = {}) => input,
  )
  .handler(async ({ data, context }): Promise<CollectionGapRow[]> => {
    const ctx = context as unknown as Ctx;
    await assertPageWrite(ctx, ORDERS_PAGE);

    let q = ctx.supabase
      .from("orders")
      .select(
        "id, brand_id, external_order_number, customer_name, courier_id, total_amount, occurred_at",
      )
      .eq("fulfillment_status", "delivered")
      .gt("total_amount", 0)
      .order("occurred_at", { ascending: false })
      .limit(500);
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    if (data.from) q = q.gte("occurred_at", businessDateStartUTC(data.from.slice(0, 10)));
    if (data.to) q = q.lte("occurred_at", businessDateEndUTC(data.to.slice(0, 10)));

    const { data: orders, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (orders ?? []) as Row[];
    if (!rows.length) return [];

    const orderIds = rows.map((r) => r["id"] as string);
    const brandIds = [...new Set(rows.map((r) => r["brand_id"] as string))];
    const courierIds = [...new Set(rows.map((r) => r["courier_id"]).filter(Boolean))] as string[];

    const [{ data: collections }, { data: brands }, { data: couriers }] = await Promise.all([
      ctx.supabase.from("order_collections").select("order_id, amount").in("order_id", orderIds),
      ctx.supabase.from("brands").select("id, name").in("id", brandIds),
      courierIds.length
        ? ctx.supabase.from("couriers").select("id, name").in("id", courierIds)
        : Promise.resolve({ data: [] }),
    ]);

    const collectedByOrder = new Map<string, number>();
    for (const c of (collections ?? []) as Array<{ order_id: string; amount: number }>) {
      collectedByOrder.set(
        c.order_id,
        (collectedByOrder.get(c.order_id) ?? 0) + Number(c.amount ?? 0),
      );
    }
    const brandName = new Map<string, string>(
      (brands ?? []).map((b: { id: string; name: string }) => [b.id, b.name]),
    );
    const courierName = new Map<string, string>(
      (couriers ?? []).map((c: { id: string; name: string }) => [c.id, c.name]),
    );

    return rows
      .map((r) => {
        const total = Number(r["total_amount"] ?? 0);
        const collected = collectedByOrder.get(r["id"] as string) ?? 0;
        return {
          orderId: r["id"] as string,
          orderNumber: (r["external_order_number"] as string | null) ?? null,
          customerName: (r["customer_name"] as string | null) ?? null,
          brandName: brandName.get(r["brand_id"] as string) ?? "—",
          courierName: r["courier_id"] ? (courierName.get(r["courier_id"] as string) ?? "—") : null,
          totalAmount: total,
          collected,
          outstanding: total - collected,
          occurredAt: r["occurred_at"] as string,
        };
      })
      .filter((r) => r.outstanding > 0.01)
      .sort((a, b) => b.outstanding - a.outstanding);
  });

/* ============================ 4) WhatsApp templates =========================== */

export const listWhatsappTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    const { data, error } = await ctx.supabase
      .from("whatsapp_templates")
      .select("*")
      .order("event_key", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Row[];
  });

export const upsertWhatsappTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id?: string | null;
      brandId?: string | null;
      name: string;
      eventKey: string;
      body: string;
      active?: boolean;
      autoSend?: boolean;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPageWrite(ctx, ORDERS_PAGE);
    if (!data.name.trim() || !data.body.trim()) throw new Error("الاسم والنص مطلوبان");
    const payload = {
      brand_id: data.brandId ?? null,
      name: data.name.trim(),
      event_key: data.eventKey,
      body: data.body,
      active: data.active ?? true,
      auto_send: data.autoSend ?? false,
      created_by: ctx.userId,
    };
    if (data.id) {
      const { error } = await ctx.supabase
        .from("whatsapp_templates")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: created, error } = await ctx.supabase
      .from("whatsapp_templates")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id as string };
  });

export const deleteWhatsappTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPageWrite(ctx, ORDERS_PAGE);
    const { error } = await ctx.supabase.from("whatsapp_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Sends a template to the order's customer via WhatsApp (creates the thread if needed). */
export const sendOrderTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; templateId: string }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPageWrite(ctx, ORDERS_PAGE);
    const [{ data: order }, { data: tpl }] = await Promise.all([
      ctx.supabase
        .from("orders")
        .select(
          "id, brand_id, external_order_number, customer_name, customer_phone, total_amount, bosta_tracking, dispatch_tracking",
        )
        .eq("id", data.orderId)
        .maybeSingle(),
      ctx.supabase.from("whatsapp_templates").select("*").eq("id", data.templateId).maybeSingle(),
    ]);
    if (!order) throw new Error("Order not found");
    if (!tpl) throw new Error("Template not found");
    if (!order.customer_phone) throw new Error("لا يوجد رقم هاتف للعميل");

    const body = renderTemplate(tpl.body, {
      name: order.customer_name ?? "",
      order: order.external_order_number ?? "",
      total: String(Math.round(Number(order.total_amount ?? 0))),
      tracking: order.bosta_tracking ?? order.dispatch_tracking ?? "",
    });

    const phone = String(order.customer_phone).replace(/[^\d+]/g, "");
    let threadId: string;
    const { data: existing } = await ctx.supabase
      .from("whatsapp_threads")
      .select("id")
      .eq("brand_id", order.brand_id)
      .eq("phone", phone)
      .maybeSingle();
    if (existing) threadId = existing.id;
    else {
      const { data: created, error } = await ctx.supabase
        .from("whatsapp_threads")
        .insert({
          brand_id: order.brand_id,
          phone,
          display_name: order.customer_name ?? null,
          order_id: order.id,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      threadId = created.id;
    }

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
            to: phone,
            type: "text",
            text: { body },
          }),
        });
        const json = (await res.json()) as {
          messages?: Array<{ id: string }>;
          error?: { message?: string };
        };
        if (!res.ok) {
          status = "failed";
          err = json?.error?.message ?? `HTTP ${res.status}`;
        } else {
          status = "sent";
          waId = json?.messages?.[0]?.id ?? null;
        }
      } catch (e) {
        status = "failed";
        err = (e as Error).message;
      }
    }

    await ctx.supabase.from("whatsapp_messages").insert({
      thread_id: threadId,
      brand_id: order.brand_id,
      direction: "outgoing",
      body,
      status,
      wa_message_id: waId,
      error: err,
      sent_at: new Date().toISOString(),
      created_by: ctx.userId,
    });
    await ctx.supabase
      .from("whatsapp_threads")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: body.slice(0, 120),
      })
      .eq("id", threadId);

    if (status === "failed") throw new Error(err ?? "فشل الإرسال");
    return { ok: true, threadId, status };
  });

/* =========================== 5) Risk radar + SLA ============================== */

export type RadarOrder = {
  id: string;
  brand_id: string;
  number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  governorate: string | null;
  total_amount: number;
  occurred_at: string;
  order_status: string;
  stage: string;
  hours_in_stage: number;
  sla_hours: number | null;
  sla_breached: boolean;
  risk_score: number;
  risk_flags: string[];
};

export const getOrdersRadar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { brandId?: string | null; mode?: "sla" | "risk" | "all" }) => input)
  .handler(async ({ data, context }): Promise<{ orders: RadarOrder[]; slaRules: Row[] }> => {
    const ctx = context as unknown as Ctx;
    const [{ data: rules }, ordersRes] = await Promise.all([
      ctx.supabase.from("order_sla_rules").select("*").eq("active", true),
      (() => {
        let q = ctx.supabase
          .from("orders")
          .select(
            "id, brand_id, external_order_number, customer_name, customer_phone, shipping_governorate, total_amount, occurred_at, order_status, confirmation_status, fulfillment_status, lifecycle_updated_at, shipping_address",
          )
          .not("order_status", "in", "(delivered,cancelled,returned)")
          .order("occurred_at", { ascending: false })
          .limit(1000);
        if (data.brandId) q = q.eq("brand_id", data.brandId);
        return q;
      })(),
    ]);
    if (ordersRes.error) throw new Error(ordersRes.error.message);
    const orders = (ordersRes.data ?? []) as Row[];

    const slaMap = new Map<string, number>(
      ((rules ?? []) as Row[]).map((r) => [String(r["stage"]), Number(r["max_hours"])]),
    );

    // Customer-level history for risk scoring.
    const phones = [...new Set(orders.map((o) => o["customer_phone"]).filter(Boolean))] as string[];
    const returnCount = new Map<string, number>();
    const orderCount = new Map<string, number>();
    if (phones.length) {
      const { data: hist } = await ctx.supabase
        .from("orders")
        .select("customer_phone, order_status, shipment_outcome")
        .in("customer_phone", phones.slice(0, 500))
        .limit(10000);
      for (const h of (hist ?? []) as Row[]) {
        const p = String(h["customer_phone"]);
        orderCount.set(p, (orderCount.get(p) ?? 0) + 1);
        if (h["order_status"] === "returned" || h["shipment_outcome"] === "returned") {
          returnCount.set(p, (returnCount.get(p) ?? 0) + 1);
        }
      }
    }

    const now = Date.now();
    const out: RadarOrder[] = orders.map((o) => {
      const stage =
        o["fulfillment_status"] === "shipped"
          ? "shipped"
          : o["confirmation_status"] === "confirmed"
            ? "confirmed"
            : "new";
      const since = new Date(o["lifecycle_updated_at"] ?? o["occurred_at"]).getTime();
      const hours = Math.max(0, Math.round((now - since) / 3600000));
      const slaHours = slaMap.get(stage) ?? null;

      const phone = o["customer_phone"] ? String(o["customer_phone"]) : null;
      const flags: string[] = [];
      let score = 0;
      if (phone) {
        const rc = returnCount.get(phone) ?? 0;
        if (rc >= 2) {
          flags.push(`رفض الاستلام ${rc} مرات سابقاً`);
          score += Math.min(50, rc * 15);
        }
        const oc = orderCount.get(phone) ?? 0;
        if (oc >= 3) {
          flags.push(`${oc} أوردرات لنفس الرقم`);
          score += 10;
        }
      } else {
        flags.push("لا يوجد رقم هاتف");
        score += 25;
      }
      const addr = String(o["shipping_address"] ?? "").trim();
      if (addr.length < 12) {
        flags.push("العنوان ناقص");
        score += 20;
      }
      if (!o["shipping_governorate"]) {
        flags.push("المحافظة غير محددة");
        score += 15;
      }
      if (Number(o["total_amount"] ?? 0) > 5000) {
        flags.push("قيمة أوردر مرتفعة");
        score += 10;
      }

      return {
        id: o["id"],
        brand_id: o["brand_id"],
        number: o["external_order_number"] ?? null,
        customer_name: o["customer_name"] ?? null,
        customer_phone: phone,
        governorate: o["shipping_governorate"] ?? null,
        total_amount: Number(o["total_amount"] ?? 0),
        occurred_at: o["occurred_at"],
        order_status: o["order_status"],
        stage,
        hours_in_stage: hours,
        sla_hours: slaHours,
        sla_breached: slaHours != null && hours > slaHours,
        risk_score: Math.min(100, score),
        risk_flags: flags,
      };
    });

    const mode = data.mode ?? "all";
    const filtered =
      mode === "sla"
        ? out.filter((o) => o.sla_breached)
        : mode === "risk"
          ? out.filter((o) => o.risk_score >= 25)
          : out.filter((o) => o.sla_breached || o.risk_score >= 25);

    filtered.sort(
      (a, b) =>
        b.risk_score + (b.sla_breached ? 60 : 0) - (a.risk_score + (a.sla_breached ? 60 : 0)),
    );
    return { orders: filtered.slice(0, 300), slaRules: (rules ?? []) as Row[] };
  });

export const saveSlaRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { stage: string; maxHours: number }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPageWrite(ctx, ORDERS_PAGE);
    const { error } = await ctx.supabase
      .from("order_sla_rules")
      .upsert(
        { stage: data.stage, max_hours: Math.max(1, Math.round(data.maxHours)) },
        { onConflict: "stage" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ======================== 6) Unified order detail view ======================== */

export const getOrderFull = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { data: order, error } = await ctx.supabase
      .from("orders")
      .select("*")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Order not found");

    const [items, shipments, collections, events, returns, attempts, thread, couriers] =
      await Promise.all([
        ctx.supabase.from("order_items").select("*").eq("order_id", data.orderId),
        ctx.supabase
          .from("order_shipments")
          .select("*")
          .eq("order_id", data.orderId)
          .order("attempt_no", { ascending: true }),
        ctx.supabase
          .from("order_collections")
          .select("*")
          .eq("order_id", data.orderId)
          .order("collected_at", { ascending: false }),
        ctx.supabase
          .from("order_lifecycle_events")
          .select("id, created_at, source, from_order_status, to_order_status, raw_status, note")
          .eq("order_id", data.orderId)
          .order("created_at", { ascending: false })
          .limit(100),
        ctx.supabase
          .from("order_returns")
          .select("*")
          .eq("order_id", data.orderId)
          .order("requested_at", { ascending: false }),
        ctx.supabase
          .from("order_confirmation_attempts")
          .select("*")
          .eq("order_id", data.orderId)
          .order("attempted_at", { ascending: false }),
        order.customer_phone
          ? ctx.supabase
              .from("whatsapp_threads")
              .select("id")
              .eq("brand_id", order.brand_id)
              .eq("phone", String(order.customer_phone).replace(/[^\d+]/g, ""))
              .maybeSingle()
          : Promise.resolve({ data: null }),
        ctx.supabase.from("couriers").select("id, name"),
      ]);

    let messages: Row[] = [];
    if (thread?.data?.id) {
      const { data: msgs } = await ctx.supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("thread_id", thread.data.id)
        .order("sent_at", { ascending: true })
        .limit(100);
      messages = (msgs ?? []) as Row[];
    }

    const courierName = order.courier_id
      ? (((couriers.data ?? []) as Row[]).find((c) => c["id"] === order.courier_id)?.["name"] ??
        null)
      : null;

    return {
      order: order as Row,
      courierName,
      items: (items.data ?? []) as Row[],
      shipments: (shipments.data ?? []) as Row[],
      collections: (collections.data ?? []) as Row[],
      events: (events.data ?? []) as Row[],
      returns: (returns.data ?? []) as Row[],
      confirmations: (attempts.data ?? []) as Row[],
      threadId: (thread?.data?.id as string | undefined) ?? null,
      messages,
    };
  });
