import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AgingBucket = "b0_30" | "b31_60" | "b61_90" | "b90_plus";

type BucketTotals = Record<AgingBucket, number>;
type GroupRow = { key: string; label: string; totals: BucketTotals; total: number };
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

type ReportPayload = {
  totals?: Partial<BucketTotals>;
  grand_total?: number;
  by_brand?: Array<{ key: string; label: string; total: number; totals: Partial<BucketTotals> }>;
  by_customer?: Array<{ key: string; label: string; total: number; totals: Partial<BucketTotals> }>;
  top_rows?: Array<Partial<Row>>;
};

const emptyTotals = (): BucketTotals => ({ b0_30: 0, b31_60: 0, b61_90: 0, b90_plus: 0 });

const normTotals = (t?: Partial<BucketTotals>): BucketTotals => ({
  b0_30: Number(t?.b0_30 ?? 0),
  b31_60: Number(t?.b31_60 ?? 0),
  b61_90: Number(t?.b61_90 ?? 0),
  b90_plus: Number(t?.b90_plus ?? 0),
});

const normGroups = (list?: ReportPayload["by_brand"]): GroupRow[] =>
  (list ?? []).map((g) => ({
    key: String(g.key),
    label: g.label || "—",
    totals: normTotals(g.totals),
    total: Number(g.total ?? 0),
  }));

export const getReceivablesAging = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("receivables_aging_report");
    if (error) throw error;

    const payload = (data ?? {}) as ReportPayload;
    const buckets: AgingBucket[] = ["b0_30", "b31_60", "b61_90", "b90_plus"];
    const totals = payload.totals ? normTotals(payload.totals) : emptyTotals();

    const rows: Row[] = (payload.top_rows ?? []).map((r) => ({
      id: String(r.id),
      brand_id: String(r.brand_id ?? ""),
      brand_name: r.brand_name || "—",
      customer_id: r.customer_id ?? null,
      customer_name: r.customer_name || "—",
      outstanding: Number(r.outstanding ?? 0),
      days: Number(r.days ?? 0),
      bucket: (r.bucket ?? "b0_30") as AgingBucket,
    }));

    return {
      buckets,
      totals,
      grandTotal: Number(payload.grand_total ?? 0),
      byBrand: normGroups(payload.by_brand),
      byCustomer: normGroups(payload.by_customer),
      rows,
    };
  });

