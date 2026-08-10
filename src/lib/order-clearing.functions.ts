import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPageWrite } from "./page-permissions.server";
import { ORDERS_PAGE } from "./page-permission-paths";
import { fetchAllRows } from "./paginate";
import { businessDateEndUTC, businessDateStartUTC, getTodayInBusinessTimezone } from "./timezone";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

export type ClearingStatus = "paid" | "partial" | "unpaid";

export type ClearingRow = {
  orderId: string;
  orderNumber: string | null;
  customerName: string | null;
  occurredAt: string;
  totalAmount: number;
  collected: number;
  outstanding: number;
  status: ClearingStatus;
  /** True when at least one of this order's collections is tied to a treasury movement. */
  postedToTreasury: boolean;
};

export type OrderClearingList = {
  rows: ClearingRow[];
  totals: { orders: number; totalAmount: number; collected: number; outstanding: number };
};

/**
 * Every delivered order for one courier with what it has actually collected,
 * for an accountant to review line by line against the courier's own numbers.
 */
export const getOrderClearing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      courierId: string;
      brandId?: string | null;
      from?: string | null;
      to?: string | null;
      status?: ClearingStatus | "all";
    }) => d,
  )
  .handler(async ({ data, context }): Promise<OrderClearingList> => {
    const ctx = context as unknown as Ctx;
    if (!data.courierId)
      return { rows: [], totals: { orders: 0, totalAmount: 0, collected: 0, outstanding: 0 } };
    const to = data.to ?? getTodayInBusinessTimezone();
    const from = data.from ?? `${to.slice(0, 4)}-01-01`;

    const orders = await fetchAllRows<{
      id: string;
      external_order_number: string | null;
      customer_name: string | null;
      occurred_at: string;
      total_amount: number;
    }>(() => {
      let q = ctx.supabase
        .from("orders")
        .select("id, external_order_number, customer_name, occurred_at, total_amount")
        .eq("courier_id", data.courierId)
        .eq("shipment_outcome", "delivered")
        .gte("occurred_at", businessDateStartUTC(from.slice(0, 10)))
        .lte("occurred_at", businessDateEndUTC(to.slice(0, 10)))
        .order("occurred_at", { ascending: false });
      if (data.brandId) q = q.eq("brand_id", data.brandId);
      return q;
    });

    const collectedByOrder = new Map<string, number>();
    const postedOrders = new Set<string>();
    const ids = orders.map((o) => o.id);
    const CHUNK = 500;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const cols = await fetchAllRows<{
        order_id: string;
        amount: number;
        cash_transaction_id: string | null;
      }>(() =>
        ctx.supabase
          .from("order_collections")
          .select("order_id, amount, cash_transaction_id")
          .in("order_id", chunk),
      );
      for (const c of cols) {
        collectedByOrder.set(
          c.order_id,
          (collectedByOrder.get(c.order_id) ?? 0) + (Number(c.amount) || 0),
        );
        if (c.cash_transaction_id) postedOrders.add(c.order_id);
      }
    }

    const all: ClearingRow[] = orders.map((o) => {
      const totalAmount = Number(o.total_amount) || 0;
      const collected = collectedByOrder.get(o.id) ?? 0;
      const outstanding = totalAmount - collected;
      const status: ClearingStatus =
        collected <= 0.01 ? "unpaid" : outstanding > 0.01 ? "partial" : "paid";
      return {
        orderId: o.id,
        orderNumber: o.external_order_number,
        customerName: o.customer_name,
        occurredAt: o.occurred_at,
        totalAmount,
        collected,
        outstanding,
        status,
        postedToTreasury: postedOrders.has(o.id),
      };
    });

    const rows =
      !data.status || data.status === "all" ? all : all.filter((r) => r.status === data.status);
    const totals = rows.reduce(
      (acc, r) => {
        acc.orders += 1;
        acc.totalAmount += r.totalAmount;
        acc.collected += r.collected;
        acc.outstanding += r.outstanding;
        return acc;
      },
      { orders: 0, totalAmount: 0, collected: 0, outstanding: 0 },
    );
    return { rows, totals };
  });

export type PostClearingResult = {
  ok: true;
  postedOrders: number;
  amount: number;
  cashTransactionId: string;
};

/**
 * Records a batch of collections and the single treasury movement that paid
 * for them — one courier transfer covering many orders, which is how the money
 * actually arrives. The cash row is written first because the collections
 * carry its id; if any collection then fails to insert, the cash row is
 * removed again so the treasury never shows money that no order accounts for.
 */
export const postOrderClearing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      courierId: string;
      lines: Array<{ orderId: string; amount: number }>;
      occurredAt?: string | null;
      walletId?: string | null;
      note?: string | null;
    }) => d,
  )
  .handler(async ({ data, context }): Promise<PostClearingResult> => {
    const ctx = context as unknown as Ctx;
    await assertPageWrite(ctx, ORDERS_PAGE);
    if (!data.courierId) throw new Error("لازم تختار شركة الشحن");
    const lines = (data.lines ?? []).filter((l) => l.orderId && Number(l.amount) > 0);
    if (lines.length === 0) throw new Error("مفيش أوردرات محددة للتحصيل");

    const orderIds = lines.map((l) => l.orderId);
    const orders = await fetchAllRows<{
      id: string;
      brand_id: string;
      courier_id: string | null;
      total_amount: number;
    }>(() =>
      ctx.supabase
        .from("orders")
        .select("id, brand_id, courier_id, total_amount")
        .in("id", orderIds),
    );
    const orderById = new Map(orders.map((o) => [o.id, o]));

    const priorByOrder = new Map<string, number>();
    const prior = await fetchAllRows<{ order_id: string; amount: number }>(() =>
      ctx.supabase.from("order_collections").select("order_id, amount").in("order_id", orderIds),
    );
    for (const p of prior) {
      priorByOrder.set(p.order_id, (priorByOrder.get(p.order_id) ?? 0) + (Number(p.amount) || 0));
    }

    // Validate everything before writing anything: a partially-applied batch
    // would leave the treasury total disagreeing with its own collections.
    let amount = 0;
    const brandIds = new Set<string>();
    for (const l of lines) {
      const order = orderById.get(l.orderId);
      if (!order) throw new Error(`أوردر غير موجود: ${l.orderId.slice(0, 8)}`);
      if (order.courier_id !== data.courierId) {
        throw new Error("فيه أوردر مش تابع لشركة الشحن المختارة");
      }
      const already = priorByOrder.get(l.orderId) ?? 0;
      if (already + Number(l.amount) > Number(order.total_amount) + 0.01) {
        throw new Error(
          `المبلغ يتخطى المتبقي من قيمة الأوردر ${order.id.slice(0, 8)} — راجع المبلغ`,
        );
      }
      amount += Number(l.amount);
      brandIds.add(order.brand_id);
    }

    let walletId = data.walletId ?? null;
    if (!walletId) {
      const { data: w } = await ctx.supabase
        .from("wallets")
        .select("id")
        .eq("active", true)
        .order("sort_order")
        .limit(1)
        .maybeSingle();
      walletId = (w as { id: string } | null)?.id ?? null;
    }
    const occurredAt = (data.occurredAt ?? getTodayInBusinessTimezone()).slice(0, 10);

    const { data: cash, error: cashErr } = await ctx.supabase
      .from("cash_transactions")
      .insert({
        type: "collection",
        amount,
        occurred_at: occurredAt,
        // Only tag a brand when the whole batch belongs to one; a mixed batch
        // is a company-level receipt.
        brand_id: brandIds.size === 1 ? [...brandIds][0] : null,
        courier_id: data.courierId,
        wallet_id: walletId,
        note: data.note?.trim() || `تصفية أوردرات — ${lines.length} أوردر`,
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (cashErr) throw new Error(cashErr.message);
    const cashTransactionId = (cash as { id: string }).id;

    const { error: colErr } = await ctx.supabase.from("order_collections").insert(
      lines.map((l) => {
        const order = orderById.get(l.orderId)!;
        return {
          order_id: l.orderId,
          brand_id: order.brand_id,
          courier_id: data.courierId,
          amount: Number(l.amount),
          method: "cod",
          collected_at: new Date(`${occurredAt}T12:00:00Z`).toISOString(),
          note: data.note?.trim() || null,
          created_by: ctx.userId,
          cash_transaction_id: cashTransactionId,
        };
      }),
    );
    if (colErr) {
      await ctx.supabase.from("cash_transactions").delete().eq("id", cashTransactionId);
      throw new Error(`تعذر تسجيل التحصيل، وتم التراجع عن حركة الخزنة: ${colErr.message}`);
    }

    return { ok: true, postedOrders: lines.length, amount, cashTransactionId };
  });

export type ClearOrderCollectionsResult = {
  ok: true;
  removed: number;
  amount: number;
  /** Treasury movements reduced by the removal, and whether any were emptied out. */
  adjustedCashTransactions: number;
  deletedCashTransactions: number;
};

/**
 * Un-marks an order as collected: removes its collections and takes the same
 * amount back out of whichever treasury movement paid for it, so the two
 * ledgers stay equal. A movement left at zero is deleted rather than kept as
 * an empty receipt. Collections with no treasury link (older CSV imports or
 * manual entries) are simply removed.
 */
export const clearOrderCollections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string }) => d)
  .handler(async ({ data, context }): Promise<ClearOrderCollectionsResult> => {
    const ctx = context as unknown as Ctx;
    await assertPageWrite(ctx, ORDERS_PAGE);

    const existing = await fetchAllRows<{
      id: string;
      amount: number;
      cash_transaction_id: string | null;
    }>(() =>
      ctx.supabase
        .from("order_collections")
        .select("id, amount, cash_transaction_id")
        .eq("order_id", data.orderId),
    );
    if (existing.length === 0) {
      return {
        ok: true,
        removed: 0,
        amount: 0,
        adjustedCashTransactions: 0,
        deletedCashTransactions: 0,
      };
    }

    const byCash = new Map<string, number>();
    let amount = 0;
    for (const c of existing) {
      const value = Number(c.amount) || 0;
      amount += value;
      if (c.cash_transaction_id) {
        byCash.set(c.cash_transaction_id, (byCash.get(c.cash_transaction_id) ?? 0) + value);
      }
    }

    const { error: delErr } = await ctx.supabase
      .from("order_collections")
      .delete()
      .eq("order_id", data.orderId);
    if (delErr) throw new Error(delErr.message);

    let adjusted = 0;
    let deleted = 0;
    for (const [cashId, removedAmount] of byCash) {
      const { data: txn } = await ctx.supabase
        .from("cash_transactions")
        .select("id, amount")
        .eq("id", cashId)
        .maybeSingle();
      if (!txn) continue;
      const remaining = (Number((txn as { amount: number }).amount) || 0) - removedAmount;
      if (remaining > 0.01) {
        await ctx.supabase.from("cash_transactions").update({ amount: remaining }).eq("id", cashId);
        adjusted += 1;
      } else {
        await ctx.supabase.from("cash_transactions").delete().eq("id", cashId);
        deleted += 1;
      }
    }

    return {
      ok: true,
      removed: existing.length,
      amount,
      adjustedCashTransactions: adjusted,
      deletedCashTransactions: deleted,
    };
  });
