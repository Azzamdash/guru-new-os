import { getTodayInBusinessTimezone } from "@/lib/timezone";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAccountingProfitReport } from "./accounting-read-model.server";

export type ProfitBrandRow = {
  brand_id: string;
  brand_name: string;
  brand_type: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  expensesByCategory: Array<{ name: string; amount: number }>;
  /** Shipping collected from customers minus what couriers billed. Negative = shipping loses money. */
  shippingNet: number;
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
    const to = data.to ?? getTodayInBusinessTimezone();
    const from = data.from ?? `${new Date(to).getFullYear()}-01-01`;
    const report = await fetchAccountingProfitReport(context.supabase, {
      from,
      to,
      brandId: data.brandId,
    });

    const rows: ProfitBrandRow[] = report.rows.map((row) => {
      const revenue = Number(row.invoice_net_revenue) || 0;
      const cogs = Number(row.cogs) || 0;
      const expenses = Number(row.expenses) || 0;
      const grossProfit = revenue - cogs;
      // Shipping was missing from this report entirely, which happened to look right only
      // while the courier billed exactly what we charged the customer. Carry its margin so
      // this page and the income statement agree, and so an under-priced delivery shows up.
      const shippingNet =
        (Number(row.shipping_revenue_matched) || 0) - (Number(row.shipping_cost) || 0);
      const netProfit = grossProfit - expenses + shippingNet;
      const orders = Number(row.orders) || 0;
      return {
        brand_id: row.brand_id,
        brand_name: row.brand_name,
        brand_type: row.brand_type,
        revenue,
        cogs,
        grossProfit,
        expenses,
        expensesByCategory: row.expense_categories ?? [],
        shippingNet,
        netProfit,
        margin: revenue > 0 ? netProfit / revenue : 0,
        orders,
        returns: Number(row.return_orders) || 0,
        aov: orders > 0 ? revenue / orders : 0,
      };
    });
    const totals = rows.reduce(
      (acc, row) => ({
        revenue: acc.revenue + row.revenue,
        cogs: acc.cogs + row.cogs,
        grossProfit: acc.grossProfit + row.grossProfit,
        expenses: acc.expenses + row.expenses,
        shippingNet: acc.shippingNet + row.shippingNet,
        netProfit: acc.netProfit + row.netProfit,
      }),
      { revenue: 0, cogs: 0, grossProfit: 0, expenses: 0, shippingNet: 0, netProfit: 0 },
    );
    return { rows, totals, expenseCategories: report.expenseCategories ?? [], from, to };
  });
