// Annual revenue aggregation used by valuation reports.
// PostgREST caps rows at 1000 per request, so summing invoices without
// pagination silently under-counts revenue (and therefore valuation).
// This helper pages through every matching invoice.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const PAGE = 1000;

export async function revenueByBrandSince(
  supabase: Db,
  sinceDate: string,
  brandId?: string,
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  let offset = 0;
  // Hard safety bound: 200k invoices.
  for (let i = 0; i < 200; i++) {
    let q = supabase
      .from("sales_invoices")
      .select("brand_id,total_amount,type")
      .gte("occurred_at", sinceDate)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (brandId) q = q.eq("brand_id", brandId);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as Array<{ brand_id: string | null; total_amount: number; type: string }>;
    for (const r of rows) {
      const key = r.brand_id ?? "";
      const sign = r.type === "return" ? -1 : 1;
      totals.set(key, (totals.get(key) ?? 0) + sign * (Number(r.total_amount) || 0));
    }
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return totals;
}
