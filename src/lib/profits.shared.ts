import { getCogsMap } from "./cogs.server";
import { fetchAllRows } from "./paginate";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

/**
 * Canonical brand net-profit definition, shared by CEO reports (profits/executive)
 * and investor P&L so both always agree:
 *   net_profit = revenue - COGS(product_cogs) - expense_entries(brand, period)
 */
export async function computeBrandNetProfit(
  supabase: SupabaseAny,
  brandId: string,
  from?: string,
  to?: string,
): Promise<{ revenue: number; cogs: number; grossProfit: number; expenses: number; netProfit: number }> {
  const invoices = await fetchAllRows<{ id: string; type: string; total_amount: number; occurred_at: string }>(() => {
    let q = supabase.from("sales_invoices")
      .select("id, type, total_amount, occurred_at")
      .eq("brand_id", brandId);
    if (from) q = q.gte("occurred_at", from);
    if (to) q = q.lte("occurred_at", to);
    return q;
  });

  const revenue = invoices.reduce((s, r) => s + (r.type === "return" ? -1 : 1) * (Number(r.total_amount) || 0), 0);

  const invIds = invoices.map((i) => i.id);
  let cogs = 0;
  // Brand default fallback percentage for lines / invoices with no product-level COGS.
  const { data: brandRow } = await supabase.from("brands").select("cogs_percent_default").eq("id", brandId).maybeSingle();
  const brandPct = Number((brandRow as { cogs_percent_default: number | null } | null)?.cogs_percent_default ?? 0) || 0;
  if (invIds.length) {
    const itemRows = await fetchAllRows<{ invoice_id: string; product_id: string | null; qty: number; unit_price: number | null; subtotal: number | null }>(() =>
      supabase.from("sales_invoice_items")
        .select("invoice_id, product_id, qty, unit_price, subtotal")
        .in("invoice_id", invIds));
    const cogsMap = await getCogsMap(supabase, itemRows.map((i) => i.product_id));
    const invById = new Map(invoices.map((i) => [i.id, i]));
    const invAgg = new Map<string, { productCogs: number; coveredRev: number }>();
    for (const it of itemRows) {
      const q = Number(it.qty) || 0;
      const sub = Number(it.subtotal) || (Number(it.unit_price) || 0) * q;
      const per = it.product_id ? (cogsMap.get(it.product_id) ?? 0) : 0;
      const cur = invAgg.get(it.invoice_id) ?? { productCogs: 0, coveredRev: 0 };
      if (per > 0 && q > 0) { cur.productCogs += per * q; cur.coveredRev += sub; }
      invAgg.set(it.invoice_id, cur);
    }
    for (const inv of invoices) {
      const agg = invAgg.get(inv.id) ?? { productCogs: 0, coveredRev: 0 };
      const amt = Number(inv.total_amount) || 0;
      const residual = Math.max(0, amt - agg.coveredRev);
      const fallback = brandPct > 0 ? (brandPct / 100) * residual : 0;
      const c = agg.productCogs + fallback;
      cogs += inv.type === "return" ? -c : c;
    }
  }

  const expRows = await fetchAllRows<{ amount: number; period_date: string | null; year: number; month: number }>(() =>
    supabase.from("expense_entries")
      .select("amount, period_date, year, month")
      .eq("brand_id", brandId));
  const fromD = from ? new Date(from) : null;
  const toD = to ? new Date(to) : null;
  const expenses = expRows
    .filter((r) => {
      const d = r.period_date ? new Date(r.period_date) : new Date(r.year, (r.month || 1) - 1, 15);
      if (fromD && d < fromD) return false;
      if (toD && d > toD) return false;
      return true;
    })
    .reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - expenses;
  return { revenue, cogs, grossProfit, expenses, netProfit };
}
