export type AccountingProfitRpcRow = {
  brand_id: string;
  brand_name: string;
  brand_type: string;
  gross_revenue: number;
  returns: number;
  /** Shipping fee charged to the customer — a pass-through owed to the courier, not our revenue. */
  shipping_revenue: number;
  discounts: number;
  invoice_net_revenue: number;
  net_revenue: number;
  cogs: number;
  expenses: number;
  orders: number;
  return_orders: number;
  /** Revenue for orders still in flight (not yet delivered/returned) — not included in net_revenue. */
  projected_net_revenue: number;
  expense_categories: Array<{ name: string; amount: number }>;
};

export type AccountingProfitRpcResult = {
  from: string;
  to: string;
  rows: AccountingProfitRpcRow[];
  expenseCategories: Array<{ name: string; value: number }>;
  totals: {
    grossRevenue: number;
    returns: number;
    /** Shipping fee charged to the customer — a pass-through owed to the courier, not our revenue. */
    shippingRevenue: number;
    discounts: number;
    invoiceNetRevenue: number;
    netRevenue: number;
    cogs: number;
    expenses: number;
    orders: number;
    returnOrders: number;
    /** Revenue for orders still in flight (not yet delivered/returned) — not included in netRevenue. */
    projectedNetRevenue: number;
  };
};

export async function fetchAccountingProfitReport(
  supabase: unknown,
  input: {
    from: string;
    to: string;
    brandId?: string | null;
    excludeBrandIds?: string[];
    /** false = every invoice counts as if settled, i.e. plain order-based totals (no delivery gate). Defaults to true. */
    settledOnly?: boolean;
  },
): Promise<AccountingProfitRpcResult> {
  const client = supabase as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: Error | null }>;
  };
  const { data, error } = await client.rpc("accounting_profit_report", {
    _from: input.from,
    _to: input.to,
    _brand_id: input.brandId || null,
    _exclude_brand_ids: input.excludeBrandIds ?? [],
    _settled_only: input.settledOnly ?? true,
  });
  if (error) throw error;
  return data as AccountingProfitRpcResult;
}
