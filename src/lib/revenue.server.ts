// Annual revenue aggregation used by valuation reports.
// PostgREST caps rows at 1000 per request, so summing orders without
// pagination silently under-counts revenue (and therefore valuation).
// This helper pages through every matching order.

import { businessDateStartUTC, formatBusinessDate } from "@/lib/timezone";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const PAGE = 1000;

/**
 * Revenue for the whole company, by brand, since a given date — the single
 * source of truth for valuation (getValuationReport, investors'
 * buildValuationContext). Reads orders.total_amount directly (a real
 * timestamptz occurred_at, unlike sales_invoices.occurred_at which is a
 * plain date column and historically got written in the wrong timezone —
 * see 20260807220000_orders_sync_invoice_business_timezone_date.sql).
 *
 * Recognition rule differs by brand type, because "money realized" means
 * something different for each:
 *   - offline_branch: paid in full at the point of sale, so every order
 *     counts the moment it's recorded — no delivery to wait for.
 *   - product (online, Shopify or manual): only counts once the courier
 *     confirms delivery (shipment_outcome = 'delivered') — matches "revenue
 *     that actually entered the till", not merely shipped or dispatched.
 *   - service: has no orders at all — see serviceRevenueByBrandSince.
 * order_kind carries the sign (a manually-booked 'return' order is stored
 * total_amount-positive but subtracts; 'exchange' is already net because
 * upsertManualOrder nets its in/out items into total_amount itself).
 */
export async function valuationRevenueByBrand(
  supabase: Db,
  sinceDate: string,
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();

  const { data: brandRows, error: bErr } = await supabase.from("brands").select("id, type");
  if (bErr) throw bErr;
  const brandType = new Map<string, string>(
    (brandRows ?? []).map((b: { id: string; type: string }) => [b.id, b.type]),
  );
  const serviceBrandIds = Array.from(brandType.entries())
    .filter(([, type]) => type === "service")
    .map(([id]) => id);

  let offset = 0;
  // Hard safety bound: 200k orders.
  for (let i = 0; i < 200; i++) {
    const { data, error } = await supabase
      .from("orders")
      .select("id, brand_id, total_amount, order_kind, shipment_outcome")
      .gte("occurred_at", businessDateStartUTC(sinceDate.slice(0, 10)))
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as Array<{
      id: string;
      brand_id: string;
      total_amount: number;
      order_kind: string | null;
      shipment_outcome: string;
    }>;

    for (const r of rows) {
      const type = brandType.get(r.brand_id);
      if (type === "service") continue; // has no orders — handled separately below
      if (type !== "offline_branch" && r.shipment_outcome !== "delivered") continue;
      const sign = r.order_kind === "return" ? -1 : 1;
      totals.set(r.brand_id, (totals.get(r.brand_id) ?? 0) + sign * (Number(r.total_amount) || 0));
    }
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  const serviceRevenue = await serviceRevenueByBrandSince(supabase, sinceDate, serviceBrandIds);
  for (const [brandId, amount] of serviceRevenue) {
    totals.set(brandId, (totals.get(brandId) ?? 0) + amount);
  }

  return totals;
}

/**
 * Revenue for service brands, which never create an orders row —
 * their money comes from service_projects (done projects, by pricing type)
 * and monthly_entries.revenue (the same "total revenue" definition
 * getServiceBrandOverview uses).
 */
export async function serviceRevenueByBrandSince(
  supabase: Db,
  sinceDate: string,
  serviceBrandIds: string[],
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (serviceBrandIds.length === 0) return totals;

  const { data: projects, error: pErr } = await supabase
    .from("service_projects")
    .select("brand_id, status, pricing_type, cost, commission, started_at, finished_at")
    .in("brand_id", serviceBrandIds)
    .eq("status", "done");
  if (pErr) throw pErr;
  for (const p of (projects ?? []) as Array<{
    brand_id: string;
    pricing_type: string;
    cost: number;
    commission: number;
    started_at: string | null;
    finished_at: string | null;
  }>) {
    const d = p.finished_at ?? p.started_at;
    if (d && d.slice(0, 10) < sinceDate.slice(0, 10)) continue;
    const amt = Number(p.pricing_type === "commission" ? p.commission : p.cost) || 0;
    totals.set(p.brand_id, (totals.get(p.brand_id) ?? 0) + amt);
  }

  const sinceYear = Number(sinceDate.slice(0, 4));
  const sinceMonth = Number(sinceDate.slice(5, 7));
  const { data: monthly, error: mErr } = await supabase
    .from("monthly_entries")
    .select("brand_id, revenue, year, month")
    .in("brand_id", serviceBrandIds);
  if (mErr) throw mErr;
  for (const m of (monthly ?? []) as Array<{
    brand_id: string;
    revenue: number;
    year: number;
    month: number;
  }>) {
    if (m.year < sinceYear || (m.year === sinceYear && m.month < sinceMonth)) continue;
    totals.set(m.brand_id, (totals.get(m.brand_id) ?? 0) + (Number(m.revenue) || 0));
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
