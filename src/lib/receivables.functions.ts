import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "./paginate";

export type AgingBucket = "b0_30" | "b31_60" | "b61_90" | "b90_plus";

function bucketOf(days: number): AgingBucket {
  if (days <= 30) return "b0_30";
  if (days <= 60) return "b31_60";
  if (days <= 90) return "b61_90";
  return "b90_plus";
}

export const getReceivablesAging = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    type InvoiceRow = { id: string; brand_id: string; total_amount: number; collected_amount: number; stage: string; occurred_at: string; stage_updated_at: string; customer_id: string | null; customer_name: string | null };
    const invs = await fetchAllRows<InvoiceRow>(() => supabase
      .from("sales_invoices")
      .select("id, brand_id, total_amount, collected_amount, stage, occurred_at, stage_updated_at, customer_id, customer_name")
      .not("stage", "in", '("delivered","cancelled")'));

    // Also include delivered/cancelled invoices with a remaining balance
    const unpaidDelivered = await fetchAllRows<InvoiceRow>(() => supabase
      .from("sales_invoices")
      .select("id, brand_id, total_amount, collected_amount, stage, occurred_at, stage_updated_at, customer_id, customer_name")
      .in("stage", ["delivered", "cancelled"]));

    const all = [
      ...invs,
      ...unpaidDelivered.filter((i) => Number(i.total_amount) > Number(i.collected_amount)),
    ];

    const { data: brands } = await supabase.from("brands").select("id, name");
    const brandName = new Map((brands ?? []).map((b: { id: string; name: string }) => [b.id, b.name]));

    const now = Date.now();
    type Row = {
      id: string;
      brand_id: string;
      brand_name: string;
      customer_id: string | null;
      customer_name: string;
      outstanding: number;
      days: number;
      bucket: AgingBucket;
    };
    const rows: Row[] = [];
    for (const i of all) {
      const outstanding = Number(i.total_amount || 0) - Number(i.collected_amount || 0);
      if (outstanding <= 0) continue;
      const refDate = i.stage_updated_at ? new Date(i.stage_updated_at) : new Date(i.occurred_at);
      const days = Math.max(0, Math.floor((now - refDate.getTime()) / 86400000));
      rows.push({
        id: i.id,
        brand_id: i.brand_id,
        brand_name: brandName.get(i.brand_id) ?? "—",
        customer_id: i.customer_id,
        customer_name: i.customer_name || "—",
        outstanding,
        days,
        bucket: bucketOf(days),
      });
    }

    const buckets: AgingBucket[] = ["b0_30", "b31_60", "b61_90", "b90_plus"];
    const totals: Record<AgingBucket, number> = { b0_30: 0, b31_60: 0, b61_90: 0, b90_plus: 0 };
    for (const r of rows) totals[r.bucket] += r.outstanding;

    type GroupRow = { key: string; label: string; totals: Record<AgingBucket, number>; total: number };
    const groupBy = (keyFn: (r: Row) => string, labelFn: (r: Row) => string) => {
      const map = new Map<string, GroupRow>();
      for (const r of rows) {
        const key = keyFn(r);
        let g = map.get(key);
        if (!g) {
          g = { key, label: labelFn(r), totals: { b0_30: 0, b31_60: 0, b61_90: 0, b90_plus: 0 }, total: 0 };
          map.set(key, g);
        }
        g.totals[r.bucket] += r.outstanding;
        g.total += r.outstanding;
      }
      return Array.from(map.values()).sort((a, b) => b.total - a.total);
    };

    const byBrand = groupBy((r) => r.brand_id, (r) => r.brand_name);
    const byCustomer = groupBy(
      (r) => r.customer_id ?? `name:${r.customer_name}`,
      (r) => r.customer_name,
    );

    return {
      buckets,
      totals,
      grandTotal: buckets.reduce((s, b) => s + totals[b], 0),
      byBrand,
      byCustomer,
      rows,
    };
  });
