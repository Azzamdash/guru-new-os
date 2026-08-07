import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "./paginate";

export type ReconInput = { from: string; to: string; brandId?: string | null };

export const getCourierReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: ReconInput) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { from, to, brandId } = data;

    const invs = await fetchAllRows<{ id: string; courier_id: string | null; brand_id: string; type: string; total_amount: number; collected_amount: number; occurred_at: string }>(() => {
      let q = supabase.from("sales_invoices")
        .select("id, courier_id, brand_id, type, total_amount, collected_amount, occurred_at")
        .gte("occurred_at", from).lte("occurred_at", to);
      if (brandId) q = q.eq("brand_id", brandId);
      return q;
    });

    // sales_invoices.stage only gets recomputed when its order row is
    // updated, and there's no historical backfill, so it can't be trusted
    // for old data. orders.fulfillment_status is the reliable field.
    const invoiceIds = (invs ?? []).map((inv) => inv.id);
    const deliveredInvoiceIds = new Set<string>();
    if (invoiceIds.length) {
      const orderRows = await fetchAllRows<{ invoice_id: string; fulfillment_status: string }>(() =>
        supabase.from("orders").select("invoice_id, fulfillment_status").in("invoice_id", invoiceIds));
      for (const o of orderRows) {
        if (o.fulfillment_status === "delivered") deliveredInvoiceIds.add(o.invoice_id);
      }
    }

    const cash = await fetchAllRows<{ courier_id: string | null; brand_id: string | null; amount: number; type: string; occurred_at: string }>(() => {
      let q = supabase.from("cash_transactions")
        .select("courier_id, brand_id, amount, type, occurred_at")
        .eq("type", "collection")
        .gte("occurred_at", from).lte("occurred_at", to);
      if (brandId) q = q.eq("brand_id", brandId);
      return q;
    });

    const { data: couriers } = await supabase.from("couriers").select("id, name");
    const nameOf = new Map((couriers ?? []).map((c) => [c.id as string, c.name as string]));

    type Row = {
      courier_id: string | null;
      courier_name: string;
      delivered_orders: number;
      returned_orders: number;
      expected_cod: number;
      deposited: number;
      variance: number;
      variance_pct: number;
    };
    const map = new Map<string, Row>();
    const key = (id: string | null) => id ?? "__none__";
    const ensure = (id: string | null): Row => {
      const k = key(id);
      let r = map.get(k);
      if (!r) {
        r = { courier_id: id, courier_name: id ? (nameOf.get(id) ?? "—") : "بدون شركة شحن", delivered_orders: 0, returned_orders: 0, expected_cod: 0, deposited: 0, variance: 0, variance_pct: 0 };
        map.set(k, r);
      }
      return r;
    };

    for (const inv of invs ?? []) {
      const r = ensure(inv.courier_id as string | null);
      if (inv.type === "return") {
        r.returned_orders++;
      } else if (deliveredInvoiceIds.has(inv.id)) {
        r.delivered_orders++;
        r.expected_cod += Number(inv.total_amount || 0);
      }
    }
    for (const c of cash ?? []) {
      const r = ensure(c.courier_id as string | null);
      r.deposited += Number(c.amount || 0);
    }
    const rows = Array.from(map.values()).map((r) => {
      r.variance = r.expected_cod - r.deposited;
      r.variance_pct = r.expected_cod > 0 ? r.variance / r.expected_cod : 0;
      return r;
    }).sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));

    const totals = rows.reduce(
      (acc, r) => {
        acc.expected_cod += r.expected_cod;
        acc.deposited += r.deposited;
        acc.delivered_orders += r.delivered_orders;
        acc.returned_orders += r.returned_orders;
        return acc;
      },
      { expected_cod: 0, deposited: 0, delivered_orders: 0, returned_orders: 0 },
    );

    return {
      from,
      to,
      rows,
      totals: {
        ...totals,
        variance: totals.expected_cod - totals.deposited,
        variance_pct: totals.expected_cod > 0 ? (totals.expected_cod - totals.deposited) / totals.expected_cod : 0,
      },
    };
  });