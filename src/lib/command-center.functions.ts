import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SupplierDebtSummary = {
  totalOutstanding: number;
  overdueCount: number;
  topSuppliers: Array<{ name: string; outstanding: number; overdue: number }>;
};

/**
 * Thin wrapper around the existing `dashboard_supplier_debt_summary` RPC
 * (already used by the full internal dashboard) so the Command Center can
 * get just the totals + top suppliers without paying for the rest of that
 * heavy aggregate.
 */
export const getSupplierDebtSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SupplierDebtSummary> => {
    const r = await context.supabase.rpc("dashboard_supplier_debt_summary", {});
    if (r.error) throw r.error;
    const d = (r.data ?? {}) as {
      totalOutstanding?: number;
      overdueCount?: number;
      topSuppliers?: Array<{ name: string; outstanding: number; overdue: number }>;
    };
    return {
      totalOutstanding: Number(d.totalOutstanding) || 0,
      overdueCount: Number(d.overdueCount) || 0,
      topSuppliers: d.topSuppliers ?? [],
    };
  });
