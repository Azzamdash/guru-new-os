import assert from "node:assert/strict";
import test from "node:test";

import { buildCashFlowReport } from "../src/lib/cash-flow.shared.ts";

test("cash flow uses actual cash transactions without duplicating invoices, expenses, or supplier payments", () => {
  const report = buildCashFlowReport("2026-01-01", "2026-12-31", [
    { type: "collection", amount: 3_180_000, occurred_at: "2026-07-10" },
    { type: "other_out", amount: 3_390_310, occurred_at: "2026-07-11" },
  ]);

  assert.deepEqual(report.operating, {
    inflow: 3_180_000,
    outflow: 3_390_310,
    net: -210_310,
  });
  assert.equal(report.netChange, -210_310);
  assert.deepEqual(report.byMonth, [
    {
      month: "2026-07",
      operating: -210_310,
      investing: 0,
      financing: 0,
      net: -210_310,
    },
  ]);
});

test("cash flow classifies financing and excludes wallet transfers", () => {
  const report = buildCashFlowReport("2026-01-01", "2026-12-31", [
    { type: "deposit", amount: 10_000, occurred_at: "2026-03-01" },
    { type: "personal_withdrawal", amount: 2_500, occurred_at: "2026-03-02" },
    {
      type: "collection",
      amount: 99_999,
      occurred_at: "2026-03-03",
      transfer_group: "internal-transfer",
    },
  ]);

  assert.deepEqual(report.operating, { inflow: 0, outflow: 0, net: 0 });
  assert.deepEqual(report.financing, {
    inflow: 10_000,
    outflow: 2_500,
    net: 7_500,
  });
  assert.equal(report.netChange, 7_500);
});
