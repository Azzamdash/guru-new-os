import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { unifiedOrderCount, assertOrderCountMatches } from "./salesUnify";
import { getCogsMap } from "./cogs.server";
import { fetchAllRows } from "./paginate";

export type IncomeStatement = {
  from: string; to: string;
  grossRevenue: number;
  returns: number;
  discounts: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  operatingExpenses: Array<{ name: string; amount: number }>;
  operatingExpensesTotal: number;
  operatingProfit: number;
  operatingMargin: number;
  netProfit: number;
  netMargin: number;
  orders: number;
  returnOrders: number;
  aov: number;
  perBrand: Array<{ brand_id: string; brand_name: string; netRevenue: number; cogs: number; grossProfit: number; opex: number; netProfit: number; margin: number }>;
};

export const getIncomeStatement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from?: string; to?: string; brandId?: string | null; excludeBrandIds?: string[] } = {}) => d)
  .handler(async ({ data, context }): Promise<IncomeStatement> => {
    const to = data.to ?? new Date().toISOString().slice(0, 10);
    const from = data.from ?? `${new Date(to).getFullYear()}-01-01`;
    const excluded = data.excludeBrandIds ?? [];
    const excludeList = excluded.length ? `(${excluded.join(",")})` : null;

    const brandsBuilder = () => {
      let q = context.supabase.from("brands").select("id, name, cogs_percent_default").eq("active", true);
      if (data.brandId) q = q.eq("id", data.brandId);
      if (excludeList) q = q.not("id", "in", excludeList);
      return q;
    };
    const invBuilder = () => {
      let q = context.supabase.from("sales_invoices")
        .select("id, brand_id, type, total_amount, occurred_at")
        .gte("occurred_at", from).lte("occurred_at", `${to}T23:59:59`);
      if (data.brandId) q = q.eq("brand_id", data.brandId);
      if (excludeList) q = q.not("brand_id", "in", excludeList);
      return q;
    };
    const ordBuilder = () => {
      let q = context.supabase.from("orders")
        .select("brand_id, discount_amount, occurred_at")
        .gte("occurred_at", from).lte("occurred_at", `${to}T23:59:59`);
      if (data.brandId) q = q.eq("brand_id", data.brandId);
      if (excludeList) q = q.not("brand_id", "in", excludeList);
      return q;
    };
    const expBuilder = () => {
      let q = context.supabase.from("expense_entries")
        .select("brand_id, category_id, amount, period_date, year, month");
      if (data.brandId) q = q.eq("brand_id", data.brandId);
      if (excludeList) q = q.not("brand_id", "in", excludeList);
      return q;
    };
    const catsBuilder = () => context.supabase.from("expense_categories").select("id, name");

    const [brands, invs, ords, expRows, catRows] = await Promise.all([
      fetchAllRows<{ id: string; name: string; cogs_percent_default: number | null }>(brandsBuilder),
      fetchAllRows<{ id: string; brand_id: string; type: string; total_amount: number; occurred_at: string }>(invBuilder),
      fetchAllRows<{ brand_id: string; discount_amount: number | null; occurred_at: string }>(ordBuilder),
      fetchAllRows<{ brand_id: string; category_id: string; amount: number; period_date: string | null; year: number; month: number }>(expBuilder),
      fetchAllRows<{ id: string; name: string }>(catsBuilder),
    ]);

    const brandDefaultPct = new Map(brands.map((b) => [b.id, Number(b.cogs_percent_default) || 0]));
    const catName = new Map(catRows.map((c) => [c.id, c.name]));

    const fromD = new Date(from);
    const toD = new Date(to);
    const filteredExp = expRows.filter((r) => {
      const d = r.period_date ? new Date(r.period_date) : new Date(r.year, (r.month || 1) - 1, 15);
      return d >= fromD && d <= toD;
    });

    // COGS via invoice items + brand-default fallback for uncovered revenue
    const invIds = invs.map((i) => i.id);
    const invAgg = new Map<string, { productCogs: number; coveredRev: number }>();
    if (invIds.length) {
      const CHUNK = 200;
      const itemRows: Array<{ invoice_id: string; product_id: string | null; qty: number; unit_price: number | null; subtotal: number | null }> = [];
      for (let i = 0; i < invIds.length; i += CHUNK) {
        const slice = invIds.slice(i, i + CHUNK);
        const part = await fetchAllRows<{ invoice_id: string; product_id: string | null; qty: number; unit_price: number | null; subtotal: number | null }>(() =>
          context.supabase.from("sales_invoice_items")
            .select("invoice_id, product_id, qty, unit_price, subtotal")
            .in("invoice_id", slice));
        itemRows.push(...part);
      }
      const cogsByProduct = await getCogsMap(context.supabase, itemRows.map((i) => i.product_id));
      for (const it of itemRows) {
        const q = Number(it.qty) || 0;
        const sub = Number(it.subtotal) || (Number(it.unit_price) || 0) * q;
        const per = it.product_id ? (cogsByProduct.get(it.product_id) ?? 0) : 0;
        const cur = invAgg.get(it.invoice_id) ?? { productCogs: 0, coveredRev: 0 };
        if (per > 0 && q > 0) { cur.productCogs += per * q; cur.coveredRev += sub; }
        invAgg.set(it.invoice_id, cur);
      }
    }
    const cogsByInv = new Map<string, number>();
    for (const inv of invs) {
      const agg = invAgg.get(inv.id) ?? { productCogs: 0, coveredRev: 0 };
      const amt = Number(inv.total_amount) || 0;
      const residual = Math.max(0, amt - agg.coveredRev);
      const pct = brandDefaultPct.get(inv.brand_id) ?? 0;
      const fallback = pct > 0 ? (pct / 100) * residual : 0;
      cogsByInv.set(inv.id, agg.productCogs + fallback);
    }

    let grossRevenue = 0, returns = 0, cogs = 0;
    const perBrandMap = new Map<string, { brand_id: string; brand_name: string; netRevenue: number; cogs: number; grossProfit: number; opex: number; netProfit: number; margin: number }>();
    const brandName = new Map(brands.map((b) => [b.id, b.name]));
    for (const b of brands) perBrandMap.set(b.id, { brand_id: b.id, brand_name: b.name, netRevenue: 0, cogs: 0, grossProfit: 0, opex: 0, netProfit: 0, margin: 0 });

    for (const inv of invs) {
      const amt = Number(inv.total_amount) || 0;
      const cg = cogsByInv.get(inv.id) ?? 0;
      const row = perBrandMap.get(inv.brand_id);
      if (inv.type === "return") {
        returns += amt; cogs -= cg;
        if (row) { row.netRevenue -= amt; row.cogs -= cg; }
      } else {
        grossRevenue += amt; cogs += cg;
        if (row) { row.netRevenue += amt; row.cogs += cg; }
      }
    }
    const discounts = ords.reduce((a, o) => a + (Number(o.discount_amount) || 0), 0);

    const opexByCat = new Map<string, number>();
    let opexTotal = 0;
    for (const e of filteredExp) {
      const amt = Number(e.amount) || 0;
      opexTotal += amt;
      const nm = catName.get(e.category_id) ?? "—";
      opexByCat.set(nm, (opexByCat.get(nm) ?? 0) + amt);
      const row = perBrandMap.get(e.brand_id);
      if (row) row.opex += amt;
    }

    for (const row of perBrandMap.values()) {
      row.grossProfit = row.netRevenue - row.cogs;
      row.netProfit = row.grossProfit - row.opex;
      row.margin = row.netRevenue > 0 ? row.netProfit / row.netRevenue : 0;
    }

    const netRevenue = grossRevenue - returns - discounts;
    const grossProfit = netRevenue - cogs;
    const operatingProfit = grossProfit - opexTotal;
    const netProfit = operatingProfit;

    // Unified order counts (1 invoice = 1 order); revenue stays sum(total_amount).
    const { orders, returns: returnOrders } = unifiedOrderCount(invs);
    assertOrderCountMatches(orders, invs.filter((s) => s.type !== "return"), "income-statement");
    const aov = orders > 0 ? netRevenue / orders : 0;

    return {
      from, to,
      grossRevenue, returns, discounts, netRevenue,
      cogs, grossProfit,
      grossMargin: netRevenue > 0 ? grossProfit / netRevenue : 0,
      operatingExpenses: Array.from(opexByCat.entries()).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount),
      operatingExpensesTotal: opexTotal,
      operatingProfit,
      operatingMargin: netRevenue > 0 ? operatingProfit / netRevenue : 0,
      netProfit,
      netMargin: netRevenue > 0 ? netProfit / netRevenue : 0,
      orders,
      returnOrders,
      aov,
      perBrand: Array.from(perBrandMap.values()).filter((r) => r.netRevenue !== 0 || r.opex !== 0).sort((a, b) => b.netProfit - a.netProfit),
    };
  });

export type CashFlowReport = {
  from: string; to: string;
  operating: { inflow: number; outflow: number; net: number };
  investing: { inflow: number; outflow: number; net: number };
  financing: { inflow: number; outflow: number; net: number };
  netChange: number;
  byMonth: Array<{ month: string; operating: number; investing: number; financing: number; net: number }>;
  breakdown: Array<{ label: string; labelAr?: string; direction: "in" | "out"; category: "operating" | "investing" | "financing"; amount: number }>;
};

export const getCashFlow = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from?: string; to?: string; brandId?: string | null } = {}) => d)
  .handler(async ({ data, context }): Promise<CashFlowReport> => {
    const to = data.to ?? new Date().toISOString().slice(0, 10);
    const from = data.from ?? `${new Date(to).getFullYear()}-01-01`;

    const invBuilder = () => {
      let q = context.supabase.from("sales_invoices")
        .select("brand_id, type, total_amount, occurred_at")
        .gte("occurred_at", from).lte("occurred_at", `${to}T23:59:59`);
      if (data.brandId) q = q.eq("brand_id", data.brandId);
      return q;
    };
    const expBuilder = () => {
      let q = context.supabase.from("expense_entries")
        .select("brand_id, amount, period_date, year, month");
      if (data.brandId) q = q.eq("brand_id", data.brandId);
      return q;
    };
    const cashBuilder = () => {
      let q = context.supabase.from("cash_transactions")
        .select("type, amount, occurred_at, brand_id, transfer_group")
        .gte("occurred_at", from).lte("occurred_at", to)
        .is("transfer_group", null); // wallet transfers are internal movements, not cash flow
      if (data.brandId) q = q.eq("brand_id", data.brandId);
      return q;
    };
    const supPayBuilder = () => context.supabase.from("supplier_payments")
      .select("id, amount, paid_at, invoice_id, supplier_invoices(brand_id)")
      .gte("paid_at", from).lte("paid_at", `${to}T23:59:59`);

    const [invRows, expRowsCF, cashRows, spRows] = await Promise.all([
      fetchAllRows<{ type: string; total_amount: number; occurred_at: string }>(invBuilder),
      fetchAllRows<{ amount: number; period_date: string | null; year: number; month: number }>(expBuilder),
      fetchAllRows<{ type: string; amount: number; occurred_at: string }>(cashBuilder),
      fetchAllRows<{ amount: number; paid_at: string; supplier_invoices: { brand_id: string | null } | null }>(supPayBuilder),
    ]);

    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const months = new Map<string, { month: string; operating: number; investing: number; financing: number; net: number }>();
    const getMonth = (k: string) => {
      let m = months.get(k);
      if (!m) { m = { month: k, operating: 0, investing: 0, financing: 0, net: 0 }; months.set(k, m); }
      return m;
    };

    let opIn = 0, opOut = 0, fIn = 0, fOut = 0;
    const breakdown: CashFlowReport["breakdown"] = [];

    for (const inv of invRows) {
      const amt = Number(inv.total_amount) || 0;
      const m = getMonth(monthKey(new Date(inv.occurred_at)));
      if (inv.type === "return") { opOut += amt; m.operating -= amt; }
      else { opIn += amt; m.operating += amt; }
    }
    for (const e of expRowsCF) {
      const d = e.period_date ? new Date(e.period_date) : new Date(e.year, (e.month || 1) - 1, 15);
      if (d < new Date(from) || d > new Date(to)) continue;
      const amt = Number(e.amount) || 0;
      opOut += amt;
      const m = getMonth(monthKey(d));
      m.operating -= amt;
    }
    for (const c of cashRows) {
      const amt = Number(c.amount) || 0;
      const m = getMonth(monthKey(new Date(c.occurred_at)));
      if (c.type === "personal_withdrawal") { fOut += amt; m.financing -= amt; }
      else if (c.type === "deposit") { fIn += amt; m.financing += amt; }
      else if (c.type === "collection") { /* mirrored by sales invoice */ }
      else if (c.type === "other_out") { opOut += amt; m.operating -= amt; }
    }

    let supplierPaymentsTotal = 0;
    for (const sp of spRows) {
      if (data.brandId && sp.supplier_invoices?.brand_id !== data.brandId) continue;
      const amt = Number(sp.amount) || 0;
      supplierPaymentsTotal += amt;
      opOut += amt;
      const m = getMonth(monthKey(new Date(sp.paid_at)));
      m.operating -= amt;
    }

    breakdown.push(
      { label: "Sales revenue", labelAr: "إيرادات المبيعات", direction: "in", category: "operating", amount: opIn },
      { label: "Operating outflow (expenses + returns + cash out)", labelAr: "مصروفات تشغيلية (مصاريف + مرتجعات + نقد خارج)", direction: "out", category: "operating", amount: opOut - supplierPaymentsTotal },
      { label: "Supplier Payments", labelAr: "مدفوعات موردين", direction: "out", category: "operating", amount: supplierPaymentsTotal },
      { label: "Owner/Investor deposits", labelAr: "إيداعات الملاك/المستثمرين", direction: "in", category: "financing", amount: fIn },
      { label: "Owner/Investor withdrawals", labelAr: "مسحوبات الملاك/المستثمرين", direction: "out", category: "financing", amount: fOut },
    );

    for (const m of months.values()) m.net = m.operating + m.investing + m.financing;
    const byMonth = Array.from(months.values()).sort((a, b) => a.month.localeCompare(b.month));

    return {
      from, to,
      operating: { inflow: opIn, outflow: opOut, net: opIn - opOut },
      investing: { inflow: 0, outflow: 0, net: 0 },
      financing: { inflow: fIn, outflow: fOut, net: fIn - fOut },
      netChange: (opIn - opOut) + (fIn - fOut),
      byMonth,
      breakdown,
    };
  });