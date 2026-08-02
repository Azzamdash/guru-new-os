import { getTodayInBusinessTimezone } from "@/lib/timezone";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAccountingProfitReport } from "./accounting-read-model.server";
import {
  buildCashFlowReport,
  type CashFlowCashRow,
  type CashFlowReport,
} from "./cash-flow.shared";

export type { CashFlowReport } from "./cash-flow.shared";

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
    const to = data.to ?? getTodayInBusinessTimezone();
    const from = data.from ?? `${new Date(to).getFullYear()}-01-01`;
    const report = await fetchAccountingProfitReport(context.supabase, {
      from,
      to,
      brandId: data.brandId,
      excludeBrandIds: data.excludeBrandIds,
    });
    const totals = report.totals;
    const grossRevenue = Number(totals.grossRevenue) || 0;
    const returns = Number(totals.returns) || 0;
    const discounts = Number(totals.discounts) || 0;
    const netRevenue = Number(totals.netRevenue) || 0;
    const cogs = Number(totals.cogs) || 0;
    const operatingExpensesTotal = Number(totals.expenses) || 0;
    const grossProfit = netRevenue - cogs;
    const operatingProfit = grossProfit - operatingExpensesTotal;
    const orders = Number(totals.orders) || 0;
    return {
      from,
      to,
      grossRevenue,
      returns,
      discounts,
      netRevenue,
      cogs,
      grossProfit,
      grossMargin: netRevenue > 0 ? grossProfit / netRevenue : 0,
      operatingExpenses: (report.expenseCategories ?? []).map((row) => ({
        name: row.name,
        amount: Number(row.value) || 0,
      })),
      operatingExpensesTotal,
      operatingProfit,
      operatingMargin: netRevenue > 0 ? operatingProfit / netRevenue : 0,
      netProfit: operatingProfit,
      netMargin: netRevenue > 0 ? operatingProfit / netRevenue : 0,
      orders,
      returnOrders: Number(totals.returnOrders) || 0,
      aov: orders > 0 ? netRevenue / orders : 0,
      perBrand: report.rows
        .map((row) => {
          const brandRevenue = Number(row.net_revenue) || 0;
          const brandCogs = Number(row.cogs) || 0;
          const opex = Number(row.expenses) || 0;
          const brandGrossProfit = brandRevenue - brandCogs;
          const netProfit = brandGrossProfit - opex;
          return {
            brand_id: row.brand_id,
            brand_name: row.brand_name,
            netRevenue: brandRevenue,
            cogs: brandCogs,
            grossProfit: brandGrossProfit,
            opex,
            netProfit,
            margin: brandRevenue > 0 ? netProfit / brandRevenue : 0,
          };
        })
        .filter((row) => row.netRevenue !== 0 || row.opex !== 0)
        .sort((a, b) => b.netProfit - a.netProfit),
    };
  });

export const getCashFlow = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from?: string; to?: string; brandId?: string | null } = {}) => d)
  .handler(async ({ data, context }): Promise<CashFlowReport> => {
    const to = data.to ?? getTodayInBusinessTimezone();
    const from = data.from ?? `${new Date(to).getFullYear()}-01-01`;

    const { data: grouped, error } = await (context.supabase as any).rpc("cash_flow_grouped", {
      _from: from,
      _to: to,
      _brand_id: data.brandId || null,
    });
    if (error) throw error;
    const cashRows = (grouped ?? []) as CashFlowCashRow[];
    return buildCashFlowReport(from, to, cashRows);
  });