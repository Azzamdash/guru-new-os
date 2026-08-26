import { describe, expect, it } from "bun:test";
import {
  summariseByCategory,
  summariseByPlatform,
  type StatementInputRow,
} from "../src/lib/expense-statement.shared";

const rows: StatementInputRow[] = [
  { category_id: "mkt", amount: 600, attributed_revenue: 1800, platform: "meta" },
  { category_id: "mkt", amount: 400, attributed_revenue: 400, platform: "tiktok" },
  { category_id: "rent", amount: 1000, attributed_revenue: 0, platform: null },
];

describe("summariseByCategory", () => {
  it("totals, counts and shares each category, biggest first", () => {
    const result = summariseByCategory(rows);
    expect(result.total).toBe(2000);
    expect(result.count).toBe(3);
    expect(result.totalAttributed).toBe(2200);
    expect(result.rows.map((r) => r.categoryId)).toEqual(["mkt", "rent"]);

    const [marketing, rent] = result.rows;
    expect(marketing).toMatchObject({ total: 1000, count: 2, attributedRevenue: 2200 });
    expect(marketing!.share).toBeCloseTo(0.5);
    expect(rent).toMatchObject({ total: 1000, count: 1, attributedRevenue: 0 });
    expect(rent!.share).toBeCloseTo(0.5);
  });

  it("shares always add up to the whole", () => {
    const result = summariseByCategory(rows);
    const sum = result.rows.reduce((a, r) => a + r.share, 0);
    expect(sum).toBeCloseTo(1);
  });

  it("returns zeroes rather than NaN for an empty period", () => {
    const result = summariseByCategory([]);
    expect(result).toEqual({ rows: [], total: 0, totalAttributed: 0, count: 0 });
  });

  it("does not divide by zero when every entry is zero", () => {
    const result = summariseByCategory([{ category_id: "a", amount: 0 }]);
    expect(result.total).toBe(0);
    expect(result.rows[0]!.share).toBe(0);
    expect(Number.isNaN(result.rows[0]!.share)).toBe(false);
  });

  it("coerces numeric strings and treats missing values as zero", () => {
    const result = summariseByCategory([
      { category_id: "a", amount: "150.5", attributed_revenue: "10" },
      { category_id: "a", amount: null },
    ]);
    expect(result.total).toBeCloseTo(150.5);
    expect(result.rows[0]!.attributedRevenue).toBe(10);
    expect(result.rows[0]!.count).toBe(2);
  });
});

describe("summariseByPlatform", () => {
  it("splits marketing spend per platform with ROAS, biggest spend first", () => {
    const result = summariseByPlatform(rows);
    expect(result.map((r) => r.platform)).toEqual(["meta", "tiktok"]);
    expect(result[0]).toEqual({
      platform: "meta",
      spend: 600,
      attributedRevenue: 1800,
      roas: 3,
    });
    expect(result[1]!.roas).toBe(1);
  });

  it("ignores rows carrying no platform", () => {
    expect(summariseByPlatform([{ category_id: "rent", amount: 1000 }])).toEqual([]);
    expect(summariseByPlatform([{ category_id: "x", amount: 5, platform: "   " }])).toEqual([]);
  });

  it("reports ROAS as null — not 0 — when nothing was spent", () => {
    const result = summariseByPlatform([
      { category_id: "mkt", amount: 0, attributed_revenue: 500, platform: "meta" },
    ]);
    expect(result[0]!.roas).toBeNull();
  });

  it("aggregates repeated entries on the same platform", () => {
    const result = summariseByPlatform([
      { category_id: "mkt", amount: 100, attributed_revenue: 200, platform: "meta" },
      { category_id: "mkt", amount: 100, attributed_revenue: 600, platform: "meta" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      platform: "meta",
      spend: 200,
      attributedRevenue: 800,
      roas: 4,
    });
  });
});
