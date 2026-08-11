import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { businessDateEndUTC, businessDateStartUTC } from "@/lib/timezone";

type Ctx = { supabase: SupabaseClient<Database>; userId: string };

async function assertWriter(context: Ctx) {
  const roles = ["admin", "manager", "accountant"] as const;
  for (const r of roles) {
    const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: r });
    if (data) return;
  }
  throw new Error("Forbidden");
}

export type WalletKind = "cash" | "bank" | "ewallet";
export type Wallet = {
  id: string;
  name: string;
  kind: WalletKind;
  opening_balance: number;
  active: boolean;
  sort_order: number;
  note: string | null;
};

export const listWallets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("wallets")
      .select("id, name, kind, opening_balance, active, sort_order, note")
      .order("sort_order").order("name");
    if (error) throw error;
    return (data ?? []) as Wallet[];
  });

export const upsertWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; name: string; kind: WalletKind; opening_balance: number; active?: boolean; sort_order?: number; note?: string | null }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    const payload = {
      name: data.name,
      kind: data.kind,
      opening_balance: Number(data.opening_balance) || 0,
      active: data.active ?? true,
      sort_order: data.sort_order ?? 0,
      note: data.note ?? null,
    };
    if (data.id) {
      const { error } = await context.supabase.from("wallets").update(payload).eq("id", data.id);
      if (error) throw error;
    } else {
      const { error } = await context.supabase.from("wallets").insert(payload);
      if (error) throw error;
    }
    return { ok: true };
  });

export const deleteWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    const { count } = await context.supabase.from("cash_transactions").select("id", { count: "exact", head: true }).eq("wallet_id", data.id);
    if ((count ?? 0) > 0) throw new Error("لا يمكن حذف محفظة عليها حركات — عطّلها بدل الحذف.");
    const { error } = await context.supabase.from("wallets").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export type WalletBalance = Wallet & { balance: number; periodIn: number; periodOut: number };

export type TreasuryReconciliation = {
  /** Sum of every wallet's balance — the money the wallet cards account for. */
  walletsTotal: number;
  /** Signed total of cash movements carrying no wallet_id. In no wallet card, but real cash. */
  unassignedNet: number;
  unassignedCount: number;
  /** Expenses recorded with no cash_transaction — the treasury subtracts these, no wallet can. */
  unbookedExpenses: number;
  unbookedExpensesCount: number;
  /** walletsTotal + unassignedNet: what the headline balance should equal, now that it is cash-only. */
  expectedBalance: number;
};

/**
 * Explains why the headline treasury balance and the wallet cards disagree.
 *
 * They are computed from different places and always have been.
 * cash_summary_report reads the cash_daily_metrics rollup and adds every
 * wallet's opening balance; getWalletBalances reads cash_transactions directly
 * and skips any row without a wallet_id. So a movement carrying no wallet moves
 * the headline while appearing in no wallet card.
 *
 * unbookedExpenses no longer belongs in that arithmetic — 20260810250000 stopped
 * the headline subtracting accrued expenses — but it is still reported, since
 * "recorded but never paid from a wallet" is worth seeing on its own.
 *
 * This does not change either number — it accounts for the distance between
 * them, so the gap is a figure with a name instead of two totals that look
 * broken next to each other.
 */
export const getTreasuryReconciliation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TreasuryReconciliation> => {
    const [walletsR, txnR, expR] = await Promise.all([
      context.supabase.from("wallets").select("id, opening_balance"),
      context.supabase.from("cash_transactions").select("wallet_id, type, amount"),
      context.supabase.from("expense_entries").select("amount, cash_transaction_id"),
    ]);
    if (walletsR.error) throw walletsR.error;
    if (txnR.error) throw txnR.error;
    if (expR.error) throw expR.error;

    let walletsTotal = 0;
    for (const w of (walletsR.data ?? []) as Array<{ opening_balance: number }>) {
      walletsTotal += Number(w.opening_balance) || 0;
    }

    let unassignedNet = 0;
    let unassignedCount = 0;
    for (const r of (txnR.data ?? []) as Array<{
      wallet_id: string | null;
      type: string;
      amount: number;
    }>) {
      const amt = Number(r.amount) || 0;
      const signed = r.type === "collection" || r.type === "deposit" ? amt : -amt;
      if (r.wallet_id) walletsTotal += signed;
      else {
        unassignedNet += signed;
        unassignedCount += 1;
      }
    }

    let unbookedExpenses = 0;
    let unbookedExpensesCount = 0;
    for (const e of (expR.data ?? []) as Array<{
      amount: number;
      cash_transaction_id: string | null;
    }>) {
      if (e.cash_transaction_id) continue;
      unbookedExpenses += Number(e.amount) || 0;
      unbookedExpensesCount += 1;
    }

    return {
      walletsTotal,
      unassignedNet,
      unassignedCount,
      unbookedExpenses,
      unbookedExpensesCount,
      // 20260810250000 stopped the headline subtracting accrued expenses, so the
      // only thing still standing between it and the wallets is unassigned cash.
      expectedBalance: walletsTotal + unassignedNet,
    };
  });

/**
 * Files historical cash movements that carry no wallet into one the user picks.
 *
 * New rows can no longer land without a wallet — the database defaults it
 * (20260810250000). Existing ones still have none, and no rule can infer where
 * that money actually sat, so it is asked for rather than guessed: the caller
 * names the wallet, and only rows with no wallet at all are touched.
 */
export const assignOrphanCashToWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { walletId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    if (!data.walletId) throw new Error("اختر المحفظة الأول");
    const { data: updated, error } = await context.supabase
      .from("cash_transactions")
      .update({ wallet_id: data.walletId })
      .is("wallet_id", null)
      .select("id");
    if (error) throw error;
    return { ok: true, assigned: (updated ?? []).length };
  });

export const getWalletBalances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from?: string | null; to?: string | null } = {}) => d)
  .handler(async ({ data, context }): Promise<WalletBalance[]> => {
    const walletsR = await context.supabase.from("wallets").select("id, name, kind, opening_balance, active, sort_order, note").order("sort_order").order("name");
    if (walletsR.error) throw walletsR.error;
    const wallets = (walletsR.data ?? []) as Wallet[];

    const allR = await context.supabase.from("cash_transactions").select("wallet_id, type, amount, transfer_group");
    if (allR.error) throw allR.error;
    const balMap = new Map<string, number>();
    for (const w of wallets) balMap.set(w.id, Number(w.opening_balance) || 0);
    for (const r of (allR.data ?? []) as Array<{ wallet_id: string | null; type: string; amount: number; transfer_group: string | null }>) {
      if (!r.wallet_id) continue;
      const amt = Number(r.amount) || 0;
      // Transfers use other_out/deposit today; they cancel globally and are excluded from period KPIs below.
      const signed = (r.type === "collection" || r.type === "deposit") ? amt : -amt;
      balMap.set(r.wallet_id, (balMap.get(r.wallet_id) ?? 0) + signed);
    }

    const periodMap = new Map<string, { periodIn: number; periodOut: number }>();
    if (data.from || data.to) {
      let pQ = context.supabase.from("cash_transactions").select("wallet_id, type, amount, occurred_at, transfer_group");
      if (data.from) pQ = pQ.gte("occurred_at", businessDateStartUTC(data.from.slice(0, 10)));
      if (data.to) pQ = pQ.lte("occurred_at", businessDateEndUTC(data.to.slice(0, 10)));
      const pR = await pQ;
      if (pR.error) throw pR.error;
      for (const r of (pR.data ?? []) as Array<{ wallet_id: string | null; type: string; amount: number; transfer_group: string | null }>) {
        if (!r.wallet_id || r.transfer_group) continue;
        const cur = periodMap.get(r.wallet_id) ?? { periodIn: 0, periodOut: 0 };
        const amt = Number(r.amount) || 0;
        if (r.type === "collection" || r.type === "deposit") cur.periodIn += amt; else cur.periodOut += amt;
        periodMap.set(r.wallet_id, cur);
      }
    }

    return wallets.map((w) => ({
      ...w,
      balance: balMap.get(w.id) ?? (Number(w.opening_balance) || 0),
      periodIn: periodMap.get(w.id)?.periodIn ?? 0,
      periodOut: periodMap.get(w.id)?.periodOut ?? 0,
    }));
  });

export const transferBetweenWallets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from_wallet_id: string; to_wallet_id: string; amount: number; occurred_at: string; note?: string | null }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    if (data.from_wallet_id === data.to_wallet_id) throw new Error("اختر محفظتين مختلفتين");
    if (!(data.amount > 0)) throw new Error("المبلغ لازم يكون أكبر من صفر");
    const wR = await context.supabase.from("wallets").select("id, name").in("id", [data.from_wallet_id, data.to_wallet_id]);
    if (wR.error) throw wR.error;
    const names = new Map((wR.data ?? []).map((w: { id: string; name: string }) => [w.id, w.name]));
    const fromName = names.get(data.from_wallet_id) ?? "?";
    const toName = names.get(data.to_wallet_id) ?? "?";
    const group = crypto.randomUUID();
    const baseNote = data.note ? ` - ${data.note}` : "";
    const rows = [
      { type: "other_out" as const, amount: data.amount, occurred_at: data.occurred_at, wallet_id: data.from_wallet_id, transfer_group: group, note: `تحويل إلى ${toName}${baseNote}`, created_by: context.userId },
      { type: "deposit"   as const, amount: data.amount, occurred_at: data.occurred_at, wallet_id: data.to_wallet_id,   transfer_group: group, note: `تحويل من ${fromName}${baseNote}`, created_by: context.userId },
    ];
    const { error } = await context.supabase.from("cash_transactions").insert(rows);
    if (error) throw error;
    return { ok: true, transfer_group: group };
  });
