// Annual revenue aggregation used by valuation reports.
// PostgREST caps rows at 1000 per request, so summing invoices without
// pagination silently under-counts revenue (and therefore valuation).
// This helper pages through every matching invoice.

import { businessDateStartUTC, formatBusinessDate } from "@/lib/timezone";

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
      .select("id,brand_id,total_amount,type")
      .gte("occurred_at", businessDateStartUTC(sinceDate.slice(0, 10)))
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (brandId) q = q.eq("brand_id", brandId);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as Array<{ id: string; brand_id: string | null; total_amount: number; type: string }>;

    // Only orders that actually settled (delivered or returned) count as
    // realized revenue — see computeBrandNetProfit in profits.shared.ts for
    // the same rule and rationale. Invoices with no linked order still count.
    const ids = rows.map((r) => r.id);
    const settled = new Set<string>();
    if (ids.length) {
      const { data: orderRows, error: oErr } = await supabase
        .from("orders")
        .select("invoice_id,fulfillment_status")
        .in("invoice_id", ids);
      if (oErr) throw oErr;
      const linked = new Set<string>();
      for (const o of (orderRows ?? []) as Array<{ invoice_id: string; fulfillment_status: string }>) {
        linked.add(o.invoice_id);
        if (o.fulfillment_status === "delivered" || o.fulfillment_status === "returned") {
          settled.add(o.invoice_id);
        }
      }
      for (const id of ids) if (!linked.has(id)) settled.add(id);
    }

    for (const r of rows) {
      if (!settled.has(r.id)) continue;
      const key = r.brand_id ?? "";
      const sign = r.type === "return" ? -1 : 1;
      totals.set(key, (totals.get(key) ?? 0) + sign * (Number(r.total_amount) || 0));
    }
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return totals;
}

// Start date of the trailing 12-month window (rolling calendar months),
// used as the single source of truth for valuation revenue.
export function trailing12mStart(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCMonth(d.getUTCMonth() - 12);
  return formatBusinessDate(d);
}
