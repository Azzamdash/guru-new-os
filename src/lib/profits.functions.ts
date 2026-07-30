import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { unifiedRevenue, unifiedOrderCount, assertOrderCountMatches } from "./salesUnify";
import { getCogsMap } from "./cogs.server";

export type ProfitBrandRow = {
  brand_id: string;
  brand_name: string;
  brand_type: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  expensesByCategory: Array<{ name: string; amount: number }>;
  netProfit: number;
  margin: number;
  orders: number;
  returns: number;
  aov: number;
};

export const getProfitsReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from?: string; to?: string; brandId?: string | null } = {}) => d)
  .handler(async ({ data, context }) => {
    const to = data.to ?? new Date().toISOString().slice(0, 10);
    const from = data.from ?? `${new Date(to).getFullYear()}-01-01`;

    let brandsQ = context.supabase.from("brands").select("id, name, type, cogs_percent_default").eq("active", true);
    if (data.brandId) brandsQ = brandsQ.eq("id", data.brandId);
    let salesQ = context.supabase
      .from("sales_invoices")
      .select("id, brand_id, type, total_amount, occurred_at")
      .gte("occurred_at", from)
      .lte("occurred_at", `${to}T23:59:59`);
    if (data.brandId) salesQ = salesQ.eq("brand_id", data.brandId);
    let expQ = context.supabase
      .from("expense_entries")
      .select("brand_id, category_id, amount, period_date, year, month");
    if (data.brandId) expQ = expQ.eq("brand_id", data.brandId);
    const catsQ = context.supabase.from("expense_categories").select("id, name");

    const [brandsR, salesR, expR, catsR] = await Promise.all([brandsQ, salesQ, expQ, catsQ]);
    for (const r of [brandsR, salesR, expR, catsR]) if (r.error) throw r.error;

    const brands = (brandsR.data ?? []) as Array<{ id: string; name: string; type: string; cogs_percent_default: number | null }>;
    const sales = (salesR.data ?? []) as Array<{ id: string; brand_id: string; type: string; total_amount: number; occurred_at: string }>;
    const expRows = (expR.data ?? []) as Array<{ brand_id: string; category_id: string; amount: number; period_date: string | null; year: number; month: number }>;
    const cats = (catsR.data ?? []) as Array<{ id: string; name: string }>;
    const catName = new Map(cats.map((c) => [c.id, c.name]));
    const brandDefaultPct = new Map(brands.map((b) => [b.id, Number(b.cogs_percent_default) || 0]));

    // Filter expenses by date window (period_date if set, else year+month)
    const fromD = new Date(from);
    const toD = new Date(to);
    const inRange = (r: { period_date: string | null; year: number; month: number }) => {
      const d = r.period_date ? new Date(r.period_date) : new Date(r.year, (r.month || 1) - 1, 15);
      return d >= fromD && d <= toD;
    };
    const filteredExp = expRows.filter(inRange);

    // COGS via invoice items with brand-default fallback for uncovered revenue
    const invIds = sales.map((s) => s.id);
    let itemRows: Array<{ invoice_id: string; product_id: string | null; qty: number; unit_price: number | null; subtotal: number | null }> = [];
    if (invIds.length) {
      const { data: it } = await context.supabase
        .from("sales_invoice_items")
        .select("invoice_id, product_id, qty, unit_price, subtotal")
        .in("invoice_id", invIds);
      itemRows = (it ?? []) as typeof itemRows;
    }
    const cogsByProduct = await getCogsMap(context.supabase, itemRows.map((i) => i.product_id));
    
    const invAgg = new Map<string, { productCogs: number; coveredRev: number }>();
    for (const it of itemRows) {
      const q = Number(it.qty) || 0;
      const sub = Number(it.subtotal) || (Number(it.unit_price) || 0) * q;
      const per = it.product_id ? (cogsByProduct.get(it.product_id) ?? 0) : 0;
      const cur = invAgg.get(it.invoice_id) ?? { productCogs: 0, coveredRev: 0 };
      if (per > 0 && q > 0) { cur.productCogs += per * q; cur.coveredRev += sub; }
      invAgg.set(it.invoice_id, cur);
    }
    const cogsByInv = new Map<string, number>();
    for (const s of sales) {
      const agg = invAgg.get(s.id) ?? { productCogs: 0, coveredRev: 0 };
      const amt = Number(s.total_amount) || 0;
      const residual = Math.max(0, amt - agg.coveredRev);
      const pct = brandDefaultPct.get(s.brand_id) ?? 0;
      const fallback = pct > 0 ? (pct / 100) * residual : 0;
      cogsByInv.set(s.id, agg.productCogs + fallback);
    }

    const rows: ProfitBrandRow[] = brands.map((b) => {
      let cogs = 0;
      let expenses = 0;
      const catAgg = new Map<string, number>();
      const brandInvs = sales.filter((s) => s.brand_id === b.id);
      const revenue = unifiedRevenue(brandInvs);
      const { orders, returns } = unifiedOrderCount(brandInvs);
      for (const s of brandInvs) {
        const c = cogsByInv.get(s.id) ?? 0;
        cogs += s.type === "return" ? -c : c;
      }
      for (const e of filteredExp) {
        if (e.brand_id !== b.id) continue;
        const amt = Number(e.amount) || 0;
        expenses += amt;
        const nm = catName.get(e.category_id) ?? "—";
        catAgg.set(nm, (catAgg.get(nm) ?? 0) + amt);
      }
      const grossProfit = revenue - cogs;
      const netProfit = grossProfit - expenses;
      assertOrderCountMatches(orders, brandInvs.filter((s) => s.type !== "return"), `profits:${b.name}`);
      return {
        brand_id: b.id,
        brand_name: b.name,
        brand_type: b.type,
        revenue,
        cogs,
        grossProfit,
        expenses,
        expensesByCategory: Array.from(catAgg.entries()).map(([name, amount]) => ({ name, amount })).sort((a, b2) => b2.amount - a.amount),
        netProfit,
        margin: revenue > 0 ? netProfit / revenue : 0,
        orders,
        returns,
        aov: orders > 0 ? revenue / orders : 0,
      };
    });

    const totals = rows.reduce(
      (a, r) => ({
        revenue: a.revenue + r.revenue,
        cogs: a.cogs + r.cogs,
        grossProfit: a.grossProfit + r.grossProfit,
        expenses: a.expenses + r.expenses,
        netProfit: a.netProfit + r.netProfit,
      }),
      { revenue: 0, cogs: 0, grossProfit: 0, expenses: 0, netProfit: 0 },
    );

    const catTotals = new Map<string, number>();
    for (const r of rows) for (const c of r.expensesByCategory) catTotals.set(c.name, (catTotals.get(c.name) ?? 0) + c.amount);
    const expenseCategories = Array.from(catTotals.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return { rows, totals, expenseCategories, from, to };
  });