import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPageWrite } from "./page-permissions.server";
import { ORDERS_PAGE } from "./page-permission-paths";
import { fetchAllRows } from "./paginate";
import { businessDateEndUTC, businessDateStartUTC, getTodayInBusinessTimezone } from "./timezone";
import { normalizeGovernorate } from "./governorate.shared";

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
  /**
   * The courier's own word on whether the customer paid (orders.collection_status,
   * kept current by the Bosta webhook/recall). Only ever a suggestion: the customer
   * paying the courier is not the same event as the money reaching us.
   */
  courierSaysPaid: boolean;
  /** Unsettled fee for this order — what the courier deducts at source. */
  courierFee: number;
  /**
   * Where courierFee came from, because a bare 0 cannot tell "free" from "never
   * priced" and the accountant has to know which they are looking at.
   *  - accrued:    a real charge row, priced when the order was delivered.
   *  - suggested:  nothing accrued, but the courier's rate card covers this
   *                governorate on this order's date — a default to accept or edit.
   *  - laterRate:  the governorate IS priced, but every card for it starts after
   *                this order. Rates match on effective_from <= occurred_at, so a
   *                card saved today never reaches orders delivered before today.
   *                The amount is still offered; the fix is to backdate the card.
   *  - missing:    no charge and no rate for this governorate at all.
   */
  feeSource: "accrued" | "suggested" | "laterRate" | "missing";
  /** Governorate the fee was (or would be) priced from, for explaining a missing rate. */
  governorate: string | null;
};

export type OrderClearingList = {
  rows: ClearingRow[];
  totals: {
    orders: number;
    totalAmount: number;
    collected: number;
    outstanding: number;
    /** Unsettled fees across the listed orders. */
    courierFees: number;
  };
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
      return {
        rows: [],
        totals: { orders: 0, totalAmount: 0, collected: 0, outstanding: 0, courierFees: 0 },
      };
    const to = data.to ?? getTodayInBusinessTimezone();
    const from = data.from ?? `${to.slice(0, 4)}-01-01`;

    const orders = await fetchAllRows<{
      id: string;
      external_order_number: string | null;
      customer_name: string | null;
      occurred_at: string;
      total_amount: number;
      collection_status: string | null;
      shipping_governorate: string | null;
    }>(() => {
      let q = ctx.supabase
        .from("orders")
        .select(
          "id, external_order_number, customer_name, occurred_at, total_amount, collection_status, shipping_governorate",
        )
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
    const feeByOrder = new Map<string, number>();
    const ids = orders.map((o) => o.id);
    const CHUNK = 500;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const [cols, charges] = await Promise.all([
        fetchAllRows<{
          order_id: string;
          amount: number;
          cash_transaction_id: string | null;
        }>(() =>
          ctx.supabase
            .from("order_collections")
            .select("order_id, amount, cash_transaction_id")
            .in("order_id", chunk),
        ),
        // Only unsettled fees: a fee already closed out is not deductible from
        // a new transfer, it has been accounted for.
        fetchAllRows<{ order_id: string; amount: number }>(() =>
          ctx.supabase
            .from("courier_charges")
            .select("order_id, amount")
            .in("order_id", chunk)
            .is("settled_at", null),
        ),
      ]);
      for (const c of cols) {
        collectedByOrder.set(
          c.order_id,
          (collectedByOrder.get(c.order_id) ?? 0) + (Number(c.amount) || 0),
        );
        if (c.cash_transaction_id) postedOrders.add(c.order_id);
      }
      for (const ch of charges) feeByOrder.set(ch.order_id, Number(ch.amount) || 0);
    }

    // The accrual only priced orders whose governorate had a rate at the time of
    // delivery, and it never revisits them. Rather than show those as a bare 0 —
    // indistinguishable from genuinely free shipping — fall back to the courier's
    // current rate card so the sheet opens with a real number to accept or edit.
    const { data: rateRows, error: rateErr } = await ctx.supabase
      .from("courier_governorate_rates")
      .select("governorate, delivery_fee, effective_from, effective_to")
      .eq("courier_id", data.courierId)
      .eq("active", true)
      .order("effective_from", { ascending: false });
    if (rateErr) throw rateErr;
    const rates = (rateRows ?? []) as Array<{
      governorate: string;
      delivery_fee: number;
      effective_from: string;
      effective_to: string | null;
    }>;
    // Matched the way accrue_order_courier_charge matches: case- and
    // whitespace-insensitive, newest card in effect on the order's own date.
    //
    // When nothing is in effect we do NOT give up, because the overwhelmingly
    // common reason is a card saved today (the default effective_from) against
    // orders delivered earlier — the governorate is priced, just not yet on that
    // date. Offer the earliest card's fee and flag it, so the sheet is usable and
    // the real remedy (backdate the card) is stated rather than guessed at.
    const rateFor = (
      governorate: string | null,
      occurredAt: string,
    ): { amount: number; startsLater: boolean } | null => {
      const key = normalizeGovernorate(governorate);
      if (!key) return null;
      const day = occurredAt.slice(0, 10);
      // rates arrive newest-first, so the first in-window hit is the right card.
      const forGovernorate = rates.filter((r) => normalizeGovernorate(r.governorate) === key);
      if (forGovernorate.length === 0) return null;
      const inEffect = forGovernorate.find(
        (r) => r.effective_from <= day && (!r.effective_to || r.effective_to >= day),
      );
      if (inEffect) return { amount: Number(inEffect.delivery_fee) || 0, startsLater: false };
      const earliest = forGovernorate[forGovernorate.length - 1];
      return { amount: Number(earliest.delivery_fee) || 0, startsLater: true };
    };

    const all: ClearingRow[] = orders.map((o) => {
      const totalAmount = Number(o.total_amount) || 0;
      const collected = collectedByOrder.get(o.id) ?? 0;
      const outstanding = totalAmount - collected;
      const status: ClearingStatus =
        collected <= 0.01 ? "unpaid" : outstanding > 0.01 ? "partial" : "paid";
      const accrued = feeByOrder.get(o.id) ?? 0;
      const rate = accrued > 0 ? null : rateFor(o.shipping_governorate, o.occurred_at);
      const courierFee = accrued > 0 ? accrued : (rate?.amount ?? 0);
      const feeSource: ClearingRow["feeSource"] =
        accrued > 0
          ? "accrued"
          : rate === null
            ? "missing"
            : rate.startsLater
              ? "laterRate"
              : "suggested";
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
        courierSaysPaid: o.collection_status === "paid",
        courierFee,
        feeSource,
        governorate: o.shipping_governorate,
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
        acc.courierFees += r.courierFee;
        return acc;
      },
      { orders: 0, totalAmount: 0, collected: 0, outstanding: 0, courierFees: 0 },
    );
    return { rows, totals };
  });

export type PostClearingResult = {
  ok: true;
  postedOrders: number;
  /** Full COD collected across the batch, before the courier's fees. */
  gross: number;
  /** Fees the courier kept out of the transfer. Zero when deductFees is off. */
  fees: number;
  /** What actually lands in the treasury: gross - fees. */
  amount: number;
  settledCharges: number;
  /**
   * Orders posted with no shipping fee entered. Their charge is deliberately left
   * open so the accrual can still correct it once the missing governorate rate is
   * configured — and until then their shipping stays out of profit.
   */
  feesLeftOpen: number;
  cashTransactionId: string;
};

/**
 * Records a batch of collections and the single treasury movement that paid
 * for them — one courier transfer covering many orders, which is how the money
 * actually arrives. The cash row is written first because the collections
 * carry its id; if any collection then fails to insert, the cash row is
 * removed again so the treasury never shows money that no order accounts for.
 *
 * With deductFees on (the usual COD arrangement) the courier keeps its fees
 * out of the transfer, so the treasury movement is booked NET and the fees are
 * marked settled against it — matching the single figure the bank shows,
 * instead of a gross receipt plus a separate outflow that never happened.
 * The P&L is untouched either way: shipping cost is recognised from the
 * accrual when the order was delivered, not from how it was paid.
 */
export const postOrderClearing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      courierId: string;
      /**
       * fee is what the courier actually charged on their statement. Omitted
       * falls back to the rate-card accrual; provided overwrites it, because
       * the statement is the real number and the rate card was the estimate.
       */
      lines: Array<{ orderId: string; amount: number; fee?: number }>;
      occurredAt?: string | null;
      walletId?: string | null;
      note?: string | null;
      /** Courier keeps its fees out of the transfer. Defaults to true. */
      deductFees?: boolean;
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
    let gross = 0;
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
      gross += Number(l.amount);
      brandIds.add(order.brand_id);
    }

    const deductFees = data.deductFees !== false;
    const chargeRows = deductFees
      ? await fetchAllRows<{ id: string; order_id: string; amount: number }>(() =>
          ctx.supabase
            .from("courier_charges")
            .select("id, order_id, amount")
            .in("order_id", orderIds)
            .is("settled_at", null),
        )
      : [];
    const chargeByOrder = new Map(chargeRows.map((c) => [c.order_id, c]));

    // The fee that counts is whatever the accountant confirmed against the
    // statement; the accrual is only the default they started from.
    const feeByOrder = new Map<string, number>();
    let fees = 0;
    if (deductFees) {
      for (const l of lines) {
        const fee =
          l.fee !== undefined && l.fee !== null
            ? Math.max(0, Number(l.fee) || 0)
            : Number(chargeByOrder.get(l.orderId)?.amount ?? 0) || 0;
        feeByOrder.set(l.orderId, fee);
        fees += fee;
      }
    }
    const amount = gross - fees;
    if (amount < 0) {
      throw new Error("رسوم الشحن أكبر من المبلغ المحصَّل — راجع الرسوم قبل الترحيل");
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
        note:
          data.note?.trim() ||
          (fees > 0
            ? `تصفية أوردرات — ${lines.length} أوردر (صافي بعد خصم رسوم ${Math.round(fees)})`
            : `تصفية أوردرات — ${lines.length} أوردر`),
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

    // Mark the deducted fees settled against this very movement. Stamping the
    // id (not just settled_at) is what lets a later reversal tell a fee the
    // courier withheld here from one paid separately.
    let settledCharges = 0;
    let feesLeftOpen = 0;
    if (deductFees) {
      const settledAt = new Date().toISOString();
      try {
        for (const l of lines) {
          const fee = feeByOrder.get(l.orderId) ?? 0;
          const charge = chargeByOrder.get(l.orderId);
          // A zero fee here almost always means "not entered yet" rather than
          // "the courier charged nothing" — the usual cause is a governorate
          // with no rate configured, which accrues 0 silently. Settling it
          // would stamp settled_at, and persist_order_courier_charge only
          // refreshes rows WHERE settled_at IS NULL, so the fee would stay
          // frozen at zero even after the missing rate is added. Leave the
          // charge open to be corrected instead. The receipt and the treasury
          // movement are identical either way: a zero fee deducts nothing.
          if (fee <= 0) {
            feesLeftOpen += 1;
            continue;
          }
          if (charge) {
            // Write the confirmed fee onto the charge as it is settled, so the
            // ledger — and the P&L, which now reads it — carries the real
            // number rather than the rate-card guess.
            const { error } = await ctx.supabase
              .from("courier_charges")
              .update({
                amount: fee,
                settled_at: settledAt,
                settled_cash_transaction_id: cashTransactionId,
              })
              .eq("id", charge.id)
              .is("settled_at", null);
            if (error) throw new Error(error.message);
            settledCharges += 1;
          } else {
            // No accrual existed (no rate card for that governorate), but the
            // courier still charged something — record it so it is not lost.
            const order = orderById.get(l.orderId)!;
            const { error } = await ctx.supabase.from("courier_charges").insert({
              order_id: l.orderId,
              brand_id: order.brand_id,
              courier_id: data.courierId,
              charge_type: "delivery",
              amount: fee,
              rate_missing: true,
              note: "رسم مُدخل يدويًا من تصفية الأوردرات",
              settled_at: settledAt,
              settled_cash_transaction_id: cashTransactionId,
            });
            if (error) throw new Error(error.message);
            settledCharges += 1;
          }
        }
      } catch (e) {
        // The money is recorded correctly; only the fee ledger lagged. Surface
        // it rather than unwinding a valid receipt — the rest can be closed
        // from the statement page.
        const message = e instanceof Error ? e.message : String(e);
        throw new Error(
          `تم تسجيل التحصيل، لكن تعذر إقفال رسوم الشحن — اقفلها من كشف الحساب: ${message}`,
        );
      }
    }

    return {
      ok: true,
      postedOrders: lines.length,
      gross,
      fees,
      amount,
      settledCharges,
      feesLeftOpen,
      cashTransactionId,
    };
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

    // A fee the courier withheld inside one of these batches was never a
    // separate outflow — it was already netted off the receipt. Re-open it and
    // subtract it from what we take back out, so the movement still equals
    // (collections - fees) for whatever is left in the batch.
    const reopened = await fetchAllRows<{
      id: string;
      amount: number;
      settled_cash_transaction_id: string | null;
    }>(() =>
      ctx.supabase
        .from("courier_charges")
        .select("id, amount, settled_cash_transaction_id")
        .eq("order_id", data.orderId)
        .not("settled_cash_transaction_id", "is", null),
    );
    const feeByCash = new Map<string, number>();
    const reopenIds: string[] = [];
    for (const ch of reopened) {
      const cashId = ch.settled_cash_transaction_id as string;
      if (!byCash.has(cashId)) continue; // settled by some other movement — leave it alone
      feeByCash.set(cashId, (feeByCash.get(cashId) ?? 0) + (Number(ch.amount) || 0));
      reopenIds.push(ch.id);
    }

    const { error: delErr } = await ctx.supabase
      .from("order_collections")
      .delete()
      .eq("order_id", data.orderId);
    if (delErr) throw new Error(delErr.message);

    if (reopenIds.length > 0) {
      await ctx.supabase
        .from("courier_charges")
        .update({ settled_at: null, settled_cash_transaction_id: null })
        .in("id", reopenIds);
    }

    let adjusted = 0;
    let deleted = 0;
    for (const [cashId, removedAmount] of byCash) {
      const { data: txn } = await ctx.supabase
        .from("cash_transactions")
        .select("id, amount")
        .eq("id", cashId)
        .maybeSingle();
      if (!txn) continue;
      // The batch was booked net, so take back the net of this order too.
      const removedNet = removedAmount - (feeByCash.get(cashId) ?? 0);
      const remaining = (Number((txn as { amount: number }).amount) || 0) - removedNet;
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
