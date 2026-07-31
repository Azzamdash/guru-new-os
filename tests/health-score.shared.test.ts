import assert from "node:assert/strict";
import test from "node:test";

import { calculateHealthScore } from "../src/lib/health-score.shared.ts";

test("healthy dashboard metrics produce a fully covered healthy score", () => {
  const result = calculateHealthScore({
    revenue: 200_000,
    netMargin: 0.15,
    periodCashNet: 25_000,
    ordersDelivered: 90,
    ordersReturned: 5,
    supplierOverdueCount: 0,
    lowStockCount: 0,
  });

  assert.deepEqual(result, { score: 100, coverage: 100, status: "healthy" });
});

test("an empty trading period is insufficient rather than healthy", () => {
  const result = calculateHealthScore({
    revenue: 0,
    netMargin: 0,
    periodCashNet: 0,
    ordersDelivered: 0,
    ordersReturned: 0,
    supplierOverdueCount: 0,
    lowStockCount: 0,
  });

  assert.equal(result.coverage, 40);
  assert.equal(result.status, "insufficient");
});
