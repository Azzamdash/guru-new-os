import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getIncomeStatement } from "@/lib/financials.functions";
import { getCourierReconciliation } from "@/lib/reconciliation.functions";
import { getCogsMap } from "@/lib/cogs.server";
import { fetchAllRows } from "@/lib/paginate";

export type ExecutiveSnapshot = {
  from: string; to: string;
  income: {
    netRevenue: number; cogs: number; grossProfit: number; grossMargin: number;
    opex: number; netProfit: number; netMargin: number;
  };
  cashFlow: { inflow: number; outflow: number; net: number };
  reconciliation: { expected: number; deposited: number; variance: number; variancePct: number };
  inventory: { units: number; valuation: number };
  alerts: Array<{ level: "critical" | "warning" | "info"; category: string; message: string; link?: string }>;
};

export const getExecutiveSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from?: string; to?: string; brandId?: string | null } = {}) => d)
  .handler(async ({ data, context }): Promise<ExecutiveSnapshot> => {
    const to = data.to ?? new Date().toISOString().slice(0, 10);
    const from = data.from ?? `${new Date(to).getFullYear()}-01-01`;
    const brandId = data.brandId ?? null;

    // Exclude offline branches entirely from the CEO/Executive view
    const { data: offlineBrands } = await context.supabase
      .from("brands").select("id").eq("type", "offline_branch");
    const excludeBrandIds = (offlineBrands ?? []).map((b: { id: string }) => b.id);
    const excludeList = excludeBrandIds.length ? `(${excludeBrandIds.join(",")})` : null;
    const isExcluded = (id: string | null | undefined) => !!id && excludeBrandIds.includes(id);
    // If the caller pinned a brand that IS an offline branch, short-circuit to zeros
    if (brandId && isExcluded(brandId)) {
      return {
        from, to,
        income: { netRevenue: 0, cogs: 0, grossProfit: 0, grossMargin: 0, opex: 0, netProfit: 0, netMargin: 0 },
        cashFlow: { inflow: 0, outflow: 0, net: 0 },
        reconciliation: { expected: 0, deposited: 0, variance: 0, variancePct: 0 },
        inventory: { units: 0, valuation: 0 },
        alerts: [],
      };
    }

    const [income, recon] = await Promise.all([
      getIncomeStatement({ data: { from, to, brandId, excludeBrandIds } }),
      getCourierReconciliation({ data: { from, to, brandId } }),
    ]);

    // Cash flow (in/out) from cash_transactions
    const cash = await fetchAllRows<{ amount: number; type: string; occurred_at: string; brand_id: string | null; transfer_group: string | null }>(() => {
      let q = context.supabase.from("cash_transactions")
        .select("amount, type, occurred_at, brand_id, transfer_group")
        .gte("occurred_at", from).lte("occurred_at", `${to}T23:59:59`)
        .is("transfer_group", null); // wallet transfers are internal, not P&L cash flow
      if (brandId) q = q.eq("brand_id", brandId);
      if (excludeList) q = q.not("brand_id", "in", excludeList);
      return q;
    });
    let inflow = 0, outflow = 0;
    const IN_TYPES = new Set(["collection", "deposit", "capital_in", "transfer_in", "other_in"]);
    for (const r of cash) {
      const amt = Number(r.amount || 0);
      if (IN_TYPES.has(r.type as string)) inflow += amt; else outflow += amt;
    }

    // Inventory
    let prodQ = context.supabase.from("products").select("id, on_hand_qty, moving_avg_cost, brand_id");
    if (brandId) prodQ = prodQ.eq("brand_id", brandId);
    if (excludeList) prodQ = prodQ.not("brand_id", "in", excludeList);
    const { data: prods } = await prodQ;
    const prodCogsMap = await getCogsMap(context.supabase, (prods ?? []).map((p) => p.id as string));
    let units = 0, valuation = 0;
    for (const p of prods ?? []) {
      const q = Number(p.on_hand_qty || 0);
      units += q;
      valuation += q * (prodCogsMap.get(p.id as string) ?? Number(p.moving_avg_cost || 0));
    }

    // Alerts
    const alerts: ExecutiveSnapshot["alerts"] = [];
    if (Math.abs(recon.totals.variance) > 1) {
      const lvl = Math.abs(recon.totals.variance_pct) > 0.05 ? "critical" : "warning";
      alerts.push({
        level: lvl,
        category: "COD",
        message: `فرق تسوية شركات الشحن: ${recon.totals.variance.toLocaleString("en-US")} EGP (${(recon.totals.variance_pct * 100).toFixed(1)}%)`,
        link: "/reports/reconciliation",
      });
    }
    if (income.netProfit < 0) {
      alerts.push({
        level: "critical",
        category: "P&L",
        message: `صافي الربح سالب: ${income.netProfit.toLocaleString("en-US")} EGP`,
        link: "/reports/income-statement",
      });
    } else if (income.netMargin < 0.05 && income.netRevenue > 0) {
      alerts.push({
        level: "warning",
        category: "P&L",
        message: `هامش صافي منخفض: ${(income.netMargin * 100).toFixed(1)}%`,
        link: "/reports/income-statement",
      });
    }
    if (outflow > inflow && inflow > 0) {
      alerts.push({
        level: "warning",
        category: "Cash",
        message: `المصروف النقدي أعلى من التحصيلات (${(outflow - inflow).toLocaleString("en-US")} EGP)`,
        link: "/reports/cash-flow",
      });
    }
    // Low stock / negative
    const negative = (prods ?? []).filter((p) => Number(p.on_hand_qty || 0) < 0).length;
    if (negative > 0) {
      alerts.push({
        level: "warning",
        category: "Inventory",
        message: `${negative} منتج برصيد سالب — راجع حركات المخزون`,
        link: "/reports/inventory-valuation",
      });
    }

    return {
      from, to,
      income: {
        netRevenue: income.netRevenue,
        cogs: income.cogs,
        grossProfit: income.grossProfit,
        grossMargin: income.grossMargin,
        opex: income.operatingExpensesTotal,
        netProfit: income.netProfit,
        netMargin: income.netMargin,
      },
      cashFlow: { inflow, outflow, net: inflow - outflow },
      reconciliation: {
        expected: recon.totals.expected_cod,
        deposited: recon.totals.deposited,
        variance: recon.totals.variance,
        variancePct: recon.totals.variance_pct,
      },
      inventory: { units, valuation },
      alerts,
    };
  });