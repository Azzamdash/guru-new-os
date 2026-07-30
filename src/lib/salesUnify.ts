/**
 * Unified definition of "order" and "revenue" across every report.
 *
 * Source of truth: `sales_invoices`.
 *   - Manual sales invoices insert directly here.
 *   - Shopify / manual orders auto-mirror into here via the
 *     `orders_sync_invoice` DB trigger (orders.invoice_id → sales_invoices.id).
 * Never aggregate `orders` on top of `sales_invoices` in the same report,
 * or revenue/order counts will double.
 *
 * Rules enforced by these helpers:
 *   - 1 invoice row = 1 order (independent of qty / line items).
 *   - Revenue = sum(total_amount) with returns subtracted.
 */

export type UnifiedInvoice = {
  id: string;
  brand_id: string;
  type: string; // 'sale' | 'return'
  total_amount: number | null;
  occurred_at: string;
};

/** Financial revenue = Σ sale.total − Σ return.total. Never derived from qty. */
export function unifiedRevenue(invs: ReadonlyArray<UnifiedInvoice>): number {
  let net = 0;
  for (const s of invs) {
    const amt = Number(s.total_amount) || 0;
    net += s.type === "return" ? -amt : amt;
  }
  return net;
}

/** Order count = number of sale rows (returns tracked separately). 1 invoice = 1 order. */
export function unifiedOrderCount(invs: ReadonlyArray<UnifiedInvoice>): {
  orders: number;
  returns: number;
} {
  let orders = 0, returns = 0;
  for (const s of invs) {
    if (s.type === "return") returns += 1;
    else orders += 1;
  }
  return { orders, returns };
}

/** Average order value in money — never revenue / pieces. */
export function unifiedAOV(invs: ReadonlyArray<UnifiedInvoice>): number {
  const { orders } = unifiedOrderCount(invs);
  return orders > 0 ? unifiedRevenue(invs) / orders : 0;
}

/**
 * Dev-only invariant: guards against a report accidentally counting pieces as
 * orders. Any caller pairing an order count with these invoices should equal
 * `unifiedOrderCount(...)`. Silently no-ops in production.
 */
export function assertOrderCountMatches(
  reportedOrders: number,
  invs: ReadonlyArray<UnifiedInvoice>,
  label: string,
): void {
  if (process.env.NODE_ENV === "production") return;
  const expected = unifiedOrderCount(invs).orders;
  if (reportedOrders !== expected) {
    // eslint-disable-next-line no-console
    console.warn(
      `[salesUnify] "${label}" order count = ${reportedOrders} but unified count = ${expected}. ` +
        `Reports must use 1 invoice = 1 order.`,
    );
  }
}

/**
 * Runtime cross-report auto-verification.
 *
 * Every report that displays an "orders count" for a given (brand, period)
 * scope should call `registerReportOrderCount(reportKey, scopeKey, count)`
 * once its data resolves. All reports sharing the same `scopeKey` MUST report
 * the same count — otherwise a report is silently disagreeing with the rest
 * (double counting pieces, using a different data source, missing a filter,
 * etc.). Mismatches are surfaced as a console warning in every environment
 * and — in dev — as a toast, so the drift is impossible to miss.
 */
type Registry = Map<string, Map<string, number>>; // scopeKey → reportKey → count
const REGISTRY_GLOBAL = "__egurus_order_count_registry__";
function getRegistry(): Registry {
  if (typeof globalThis === "undefined") return new Map();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  if (!g[REGISTRY_GLOBAL]) g[REGISTRY_GLOBAL] = new Map<string, Map<string, number>>();
  return g[REGISTRY_GLOBAL] as Registry;
}

export function registerReportOrderCount(
  reportKey: string,
  scopeKey: string,
  count: number,
): { ok: boolean; mismatch?: { reportKey: string; count: number }[] } {
  const reg = getRegistry();
  const scope = reg.get(scopeKey) ?? new Map<string, number>();
  scope.set(reportKey, count);
  reg.set(scopeKey, scope);
  const distinct = new Set(scope.values());
  if (distinct.size <= 1) return { ok: true };
  const rows = Array.from(scope.entries()).map(([k, v]) => ({ reportKey: k, count: v }));
  // eslint-disable-next-line no-console
  console.warn(
    `[salesUnify] Order-count mismatch for scope "${scopeKey}":\n` +
      rows.map((r) => `  • ${r.reportKey} = ${r.count}`).join("\n") +
      `\nAll reports must agree — check that each fetcher counts 1 invoice = 1 order over the same period/brand.`,
  );
  return { ok: false, mismatch: rows };
}

/** Stable scope-key builder so every report groups its (brand, from, to) the same way. */
export function orderScopeKey(input: {
  brandId?: string | null;
  from?: string | null;
  to?: string | null;
}): string {
  const b = input.brandId ?? "all";
  const f = (input.from ?? "").slice(0, 10);
  const t = (input.to ?? "").slice(0, 10);
  return `brand=${b}|from=${f}|to=${t}`;
}