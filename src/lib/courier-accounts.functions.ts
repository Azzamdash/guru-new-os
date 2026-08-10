import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "./paginate";
import { businessDateEndUTC, businessDateStartUTC, getTodayInBusinessTimezone } from "./timezone";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

async function assertManager(ctx: Ctx) {
  for (const role of ["admin", "manager"] as const) {
    const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: role });
    if (data) return;
  }
  throw new Error("Forbidden");
}

/** One courier's position with us over a period, plus its all-time open fee balance. */
export type CourierAccountRow = {
  courierId: string;
  courierName: string;
  /** Orders this courier delivered in the period. */
  deliveredOrders: number;
  /** Cash the courier collected from customers on our behalf (delivered orders' totals). */
  codValue: number;
  /** Cash actually recorded as received from that courier in the period. */
  collected: number;
  /** codValue - collected: still sitting with the courier. */
  outstandingCod: number;
  /** Fees accrued against this courier in the period (delivery/return/exchange). */
  feesInPeriod: number;
  /** Every unsettled fee for this courier regardless of period — the real open balance. */
  openFees: number;
  /** Unsettled charges with no rate card entry, so their amount is understated (usually 0). */
  rateMissingCount: number;
  /** outstandingCod - openFees. Positive = courier owes us; negative = we owe the courier. */
  netDueToUs: number;
};

export type CourierAccountStatement = {
  from: string;
  to: string;
  rows: CourierAccountRow[];
  totals: Omit<CourierAccountRow, "courierId" | "courierName">;
};

/**
 * Statement of account per courier: what they collected for us against what we
 * owe them in fees. Replaces eyeballing individual orders to work out where a
 * courier's balance stands.
 */
export const getCourierAccountStatement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from?: string; to?: string; brandId?: string | null } = {}) => d)
  .handler(async ({ data, context }): Promise<CourierAccountStatement> => {
    const ctx = context as unknown as Ctx;
    await assertManager(ctx);
    const to = data.to ?? getTodayInBusinessTimezone();
    const from = data.from ?? `${to.slice(0, 4)}-01-01`;
    const startUTC = businessDateStartUTC(from.slice(0, 10));
    const endUTC = businessDateEndUTC(to.slice(0, 10));
    const brandId = data.brandId ?? null;

    const [couriersRes, orders, collections, charges] = await Promise.all([
      ctx.supabase.from("couriers").select("id, name"),
      fetchAllRows<{
        id: string;
        courier_id: string | null;
        total_amount: number;
        shipment_outcome: string;
      }>(() => {
        let q = ctx.supabase
          .from("orders")
          .select("id, courier_id, total_amount, shipment_outcome")
          .not("courier_id", "is", null)
          .gte("occurred_at", startUTC)
          .lte("occurred_at", endUTC);
        if (brandId) q = q.eq("brand_id", brandId);
        return q;
      }),
      fetchAllRows<{ courier_id: string | null; amount: number }>(() => {
        let q = ctx.supabase
          .from("order_collections")
          .select("courier_id, amount")
          .not("courier_id", "is", null)
          .gte("collected_at", startUTC)
          .lte("collected_at", endUTC);
        if (brandId) q = q.eq("brand_id", brandId);
        return q;
      }),
      // Not period-filtered on purpose: the open balance is every unsettled
      // fee, whenever it was accrued. accrued_at is carried so the
      // in-period slice can be reported alongside it.
      fetchAllRows<{
        courier_id: string;
        amount: number;
        settled_at: string | null;
        rate_missing: boolean;
        accrued_at: string;
      }>(() => {
        let q = ctx.supabase
          .from("courier_charges")
          .select("courier_id, amount, settled_at, rate_missing, accrued_at");
        if (brandId) q = q.eq("brand_id", brandId);
        return q;
      }),
    ]);
    if (couriersRes.error) throw couriersRes.error;

    const names = new Map<string, string>(
      ((couriersRes.data ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]),
    );

    const blank = (): Omit<CourierAccountRow, "courierId" | "courierName"> => ({
      deliveredOrders: 0,
      codValue: 0,
      collected: 0,
      outstandingCod: 0,
      feesInPeriod: 0,
      openFees: 0,
      rateMissingCount: 0,
      netDueToUs: 0,
    });
    const byCourier = new Map<string, ReturnType<typeof blank>>();
    const bucket = (id: string) => {
      const hit = byCourier.get(id);
      if (hit) return hit;
      const fresh = blank();
      byCourier.set(id, fresh);
      return fresh;
    };

    for (const o of orders) {
      if (!o.courier_id) continue;
      if (o.shipment_outcome !== "delivered") continue;
      const b = bucket(o.courier_id);
      b.deliveredOrders += 1;
      b.codValue += Number(o.total_amount) || 0;
    }
    for (const c of collections) {
      if (!c.courier_id) continue;
      bucket(c.courier_id).collected += Number(c.amount) || 0;
    }
    for (const ch of charges) {
      const b = bucket(ch.courier_id);
      const amount = Number(ch.amount) || 0;
      const inPeriod = ch.accrued_at >= startUTC && ch.accrued_at <= endUTC;
      if (inPeriod) b.feesInPeriod += amount;
      if (!ch.settled_at) {
        b.openFees += amount;
        if (ch.rate_missing) b.rateMissingCount += 1;
      }
    }

    const rows: CourierAccountRow[] = Array.from(byCourier.entries())
      .map(([courierId, v]) => ({
        courierId,
        courierName: names.get(courierId) ?? "—",
        ...v,
        outstandingCod: v.codValue - v.collected,
        netDueToUs: v.codValue - v.collected - v.openFees,
      }))
      .sort((a, b) => b.netDueToUs - a.netDueToUs);

    const totals = rows.reduce((acc, r) => {
      acc.deliveredOrders += r.deliveredOrders;
      acc.codValue += r.codValue;
      acc.collected += r.collected;
      acc.outstandingCod += r.outstandingCod;
      acc.feesInPeriod += r.feesInPeriod;
      acc.openFees += r.openFees;
      acc.rateMissingCount += r.rateMissingCount;
      acc.netDueToUs += r.netDueToUs;
      return acc;
    }, blank());

    return { from, to, rows, totals };
  });

export type FeeReconIssue = "fee_mismatch" | "missing_rate" | "no_system_charge";

export type FeeReconRow = {
  orderId: string;
  orderNumber: string | null;
  tracking: string | null;
  governorate: string | null;
  chargeType: string | null;
  /** Fee the courier declared on their own statement line. */
  declaredFee: number;
  /** Fee our rate card says it should be (courier_charges.amount). */
  systemFee: number;
  /** declaredFee - systemFee. Positive = courier charged more than our rate card. */
  diff: number;
  issue: FeeReconIssue;
};

export type FeeReconciliation = {
  summary: {
    totalLines: number;
    /** Lines whose declared fee matches the rate card — deliberately not listed. */
    matched: number;
    mismatched: number;
    missingRate: number;
    noSystemCharge: number;
    declaredTotal: number;
    systemTotal: number;
    diffTotal: number;
  };
  /** Only the lines needing a human. Matching lines are counted, never listed. */
  rows: FeeReconRow[];
};

/**
 * Compares the shipping fee a courier declared on each statement line against
 * the fee our own rate card accrued for that order, and returns only the lines
 * that disagree. The existing per-line view lists every order, which makes
 * finding the handful of real disputes a manual scan; this inverts that.
 */
export const getSettlementFeeReconciliation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { settlementId: string }) => d)
  .handler(async ({ data, context }): Promise<FeeReconciliation> => {
    const ctx = context as unknown as Ctx;
    await assertManager(ctx);

    const lines = await fetchAllRows<{
      order_id: string | null;
      tracking: string | null;
      order_number: string | null;
      shipping_fee: number;
    }>(() =>
      ctx.supabase
        .from("courier_settlement_lines")
        .select("order_id, tracking, order_number, shipping_fee")
        .eq("settlement_id", data.settlementId)
        .not("order_id", "is", null),
    );

    const orderIds = [...new Set(lines.map((l) => l.order_id).filter(Boolean))] as string[];
    const charges = new Map<string, { amount: number; type: string; rateMissing: boolean }>();
    const governorates = new Map<string, string | null>();
    if (orderIds.length) {
      const CHUNK = 500;
      for (let i = 0; i < orderIds.length; i += CHUNK) {
        const chunk = orderIds.slice(i, i + CHUNK);
        const [chargeRows, orderRows] = await Promise.all([
          fetchAllRows<{
            order_id: string;
            amount: number;
            charge_type: string;
            rate_missing: boolean;
          }>(() =>
            ctx.supabase
              .from("courier_charges")
              .select("order_id, amount, charge_type, rate_missing")
              .in("order_id", chunk),
          ),
          fetchAllRows<{ id: string; shipping_governorate: string | null }>(() =>
            ctx.supabase.from("orders").select("id, shipping_governorate").in("id", chunk),
          ),
        ]);
        for (const c of chargeRows) {
          charges.set(c.order_id, {
            amount: Number(c.amount) || 0,
            type: c.charge_type,
            rateMissing: Boolean(c.rate_missing),
          });
        }
        for (const o of orderRows) governorates.set(o.id, o.shipping_governorate);
      }
    }

    const rows: FeeReconRow[] = [];
    const summary = {
      totalLines: lines.length,
      matched: 0,
      mismatched: 0,
      missingRate: 0,
      noSystemCharge: 0,
      declaredTotal: 0,
      systemTotal: 0,
      diffTotal: 0,
    };

    for (const l of lines) {
      const orderId = l.order_id as string;
      const declaredFee = Number(l.shipping_fee) || 0;
      const charge = charges.get(orderId);
      const systemFee = charge?.amount ?? 0;
      const diff = declaredFee - systemFee;
      summary.declaredTotal += declaredFee;
      summary.systemTotal += systemFee;

      let issue: FeeReconIssue | null = null;
      if (!charge) issue = "no_system_charge";
      else if (charge.rateMissing) issue = "missing_rate";
      else if (Math.abs(diff) > 0.01) issue = "fee_mismatch";

      if (!issue) {
        summary.matched += 1;
        continue;
      }
      summary.diffTotal += diff;
      if (issue === "fee_mismatch") summary.mismatched += 1;
      else if (issue === "missing_rate") summary.missingRate += 1;
      else summary.noSystemCharge += 1;

      rows.push({
        orderId,
        orderNumber: l.order_number,
        tracking: l.tracking,
        governorate: governorates.get(orderId) ?? null,
        chargeType: charge?.type ?? null,
        declaredFee,
        systemFee,
        diff,
        issue,
      });
    }

    rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    return { summary, rows };
  });

export type SettleCourierChargesResult = {
  ok: true;
  settledCount: number;
  amount: number;
  cashTransactionId: string | null;
};

/**
 * Closes out a courier's open fees: stamps settled_at on every unsettled
 * charge up to a cut-off date and books the total as one cash movement out.
 * Until this existed nothing ever wrote settled_at, so the fee ledger only
 * ever grew.
 *
 * The two writes cannot share a transaction from here, so the order matters:
 * charges are stamped first (guarded by settled_at IS NULL, which makes two
 * people settling at once safe — the second gets zero rows and books
 * nothing), and the cash row is written from the rows that actually changed.
 * If the cash write fails, the stamp is rolled back on exactly those ids so
 * a settled charge is never left without its matching cash movement.
 */
export const settleCourierCharges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      courierId: string;
      brandId?: string | null;
      /** Settle charges accrued on or before this business date. Defaults to today. */
      upToDate?: string | null;
      walletId?: string | null;
      note?: string | null;
    }) => d,
  )
  .handler(async ({ data, context }): Promise<SettleCourierChargesResult> => {
    const ctx = context as unknown as Ctx;
    await assertManager(ctx);
    if (!data.courierId) throw new Error("لازم تختار شركة الشحن");
    const upTo = data.upToDate ?? getTodayInBusinessTimezone();
    const cutoffUTC = businessDateEndUTC(upTo.slice(0, 10));

    let openQ = ctx.supabase
      .from("courier_charges")
      .select("id")
      .eq("courier_id", data.courierId)
      .is("settled_at", null)
      .lte("accrued_at", cutoffUTC);
    if (data.brandId) openQ = openQ.eq("brand_id", data.brandId);
    const { data: openRows, error: openErr } = await openQ;
    if (openErr) throw new Error(openErr.message);
    const ids = ((openRows ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (ids.length === 0) return { ok: true, settledCount: 0, amount: 0, cashTransactionId: null };

    const settledAt = new Date().toISOString();
    const { data: settled, error: setErr } = await ctx.supabase
      .from("courier_charges")
      .update({ settled_at: settledAt })
      .in("id", ids)
      .is("settled_at", null)
      .select("id, amount");
    if (setErr) throw new Error(setErr.message);
    const settledRows = (settled ?? []) as Array<{ id: string; amount: number }>;
    if (settledRows.length === 0) {
      return { ok: true, settledCount: 0, amount: 0, cashTransactionId: null };
    }
    const amount = settledRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const settledIds = settledRows.map((r) => r.id);

    const revert = async () => {
      await ctx.supabase
        .from("courier_charges")
        .update({ settled_at: null })
        .in("id", settledIds)
        .eq("settled_at", settledAt);
    };

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

    // Zero-value close-outs are legitimate (e.g. every charge sat on a
    // governorate with no rate card) but there is no cash to book for them.
    if (!(amount > 0))
      return { ok: true, settledCount: settledRows.length, amount: 0, cashTransactionId: null };

    const { data: cash, error: cashErr } = await ctx.supabase
      .from("cash_transactions")
      .insert({
        type: "other_out",
        amount,
        occurred_at: upTo.slice(0, 10),
        brand_id: data.brandId ?? null,
        courier_id: data.courierId,
        wallet_id: walletId,
        note: data.note?.trim() || `إقفال رسوم شحن حتى ${upTo.slice(0, 10)}`,
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (cashErr) {
      await revert();
      throw new Error(`تعذر تسجيل حركة الخزنة، وتم التراجع عن الإقفال: ${cashErr.message}`);
    }

    return {
      ok: true,
      settledCount: settledRows.length,
      amount,
      cashTransactionId: (cash as { id: string } | null)?.id ?? null,
    };
  });
