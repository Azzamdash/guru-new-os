/**
 * Period expense statement — the per-category and per-platform breakdown
 * shown under the expenses list.
 *
 * Pure on purpose: it takes the rows already on screen and returns plain
 * numbers, so the statement always describes exactly the filtered period the
 * user is looking at, and the arithmetic (shares, ROAS, totals) is testable
 * without a database or a rendered page.
 */

export type StatementInputRow = {
  category_id: string;
  amount: number | string | null;
  attributed_revenue?: number | string | null;
  platform?: string | null;
};

export type CategoryStatementRow = {
  categoryId: string;
  total: number;
  count: number;
  /** Fraction of the period's total spend, 0..1. 0 when nothing was spent. */
  share: number;
  attributedRevenue: number;
};

export type CategoryStatement = {
  rows: CategoryStatementRow[];
  total: number;
  totalAttributed: number;
  count: number;
};

export type PlatformStatementRow = {
  platform: string;
  spend: number;
  attributedRevenue: number;
  /** revenue / spend. null when spend is 0 — a ratio over nothing is not 0. */
  roas: number | null;
};

function num(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Spend per category, biggest first, with each category's share of the total. */
export function summariseByCategory(rows: StatementInputRow[]): CategoryStatement {
  const byCategory = new Map<string, { total: number; count: number; attributedRevenue: number }>();
  for (const row of rows) {
    const current = byCategory.get(row.category_id) ?? {
      total: 0,
      count: 0,
      attributedRevenue: 0,
    };
    current.total += num(row.amount);
    current.count += 1;
    current.attributedRevenue += num(row.attributed_revenue);
    byCategory.set(row.category_id, current);
  }

  const total = [...byCategory.values()].reduce((sum, c) => sum + c.total, 0);
  const totalAttributed = [...byCategory.values()].reduce((sum, c) => sum + c.attributedRevenue, 0);

  const summarised = [...byCategory.entries()]
    .map(([categoryId, c]) => ({
      categoryId,
      total: c.total,
      count: c.count,
      // Guard the empty/zero-spend period rather than dividing by 0 and
      // rendering NaN% across the whole table.
      share: total === 0 ? 0 : c.total / total,
      attributedRevenue: c.attributedRevenue,
    }))
    .sort((a, b) => b.total - a.total);

  return { rows: summarised, total, totalAttributed, count: rows.length };
}

/**
 * Marketing spend per ad platform. Only rows that actually carry a platform
 * count — that is what makes a row "marketing spend on a platform", rather
 * than inferring it from how the category happens to be named.
 */
export function summariseByPlatform(rows: StatementInputRow[]): PlatformStatementRow[] {
  const byPlatform = new Map<string, { spend: number; attributedRevenue: number }>();
  for (const row of rows) {
    const platform = row.platform?.trim();
    if (!platform) continue;
    const current = byPlatform.get(platform) ?? { spend: 0, attributedRevenue: 0 };
    current.spend += num(row.amount);
    current.attributedRevenue += num(row.attributed_revenue);
    byPlatform.set(platform, current);
  }

  return [...byPlatform.entries()]
    .map(([platform, p]) => ({
      platform,
      spend: p.spend,
      attributedRevenue: p.attributedRevenue,
      roas: p.spend === 0 ? null : p.attributedRevenue / p.spend,
    }))
    .sort((a, b) => b.spend - a.spend);
}
