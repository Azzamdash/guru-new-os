/**
 * Automated performance budgets for the heaviest read paths.
 *
 * These hit the real database API with the current session and assert that the
 * warm median latency stays under an agreed budget. They are integration
 * tests: when no session/API credentials are present (plain CI), they skip
 * instead of failing.
 *
 * Run: bunx vitest run tests/perf-budgets.test.ts
 */
import { describe, expect, it } from "vitest";

const url = process.env["SUPABASE_URL"];
const apikey = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
const token = process.env["LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN"];
const enabled = Boolean(url && apikey && token);

/** Warm-up runs are discarded; we assert on the median of the measured runs. */
const WARMUP_RUNS = 1;
const MEASURED_RUNS = 3;

/** Milliseconds. Budgets include network round-trip from the test runner. */
export const PERF_BUDGETS_MS = {
  orders_page: 600,
  orders_summary: 600,
  orders_filter_summary: 600,
  dashboard_operational_report: 2500,
  customers_page: 600,
  cash_summary_report: 800,
} as const;

const now = new Date();
const to = now.toISOString();
const from = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
const dateFrom = from.slice(0, 10);
const dateTo = to.slice(0, 10);

async function callRpc(fn: string, body: Record<string, unknown>): Promise<number> {
  const started = performance.now();
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: apikey!,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const elapsed = performance.now() - started;
  if (!res.ok) throw new Error(`${fn} failed (${res.status}): ${text.slice(0, 200)}`);
  return elapsed;
}

async function medianLatency(fn: string, body: Record<string, unknown>): Promise<number> {
  for (let i = 0; i < WARMUP_RUNS; i++) await callRpc(fn, body);
  const samples: number[] = [];
  for (let i = 0; i < MEASURED_RUNS; i++) samples.push(await callRpc(fn, body));
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)]!;
}

const cases: Array<{ name: keyof typeof PERF_BUDGETS_MS; body: Record<string, unknown> }> = [
  {
    name: "orders_page",
    body: {
      _from: from,
      _to: to,
      _brand_id: null,
      _order_status: null,
      _search: null,
      _cursor_at: null,
      _cursor_id: null,
      _limit: 50,
    },
  },
  { name: "orders_summary", body: { _from: from, _to: to, _brand_id: null } },
  {
    name: "orders_filter_summary",
    body: { _from: from, _to: to, _brand_id: null, _order_status: null, _search: null },
  },
  {
    name: "dashboard_operational_report",
    body: { _from: from, _to: to, _brand_id: null },
  },
  {
    name: "customers_page",
    body: {
      _search: null,
      _segment: null,
      _brand_id: null,
      _cursor_at: null,
      _cursor_id: null,
      _limit: 50,
    },
  },
  {
    name: "cash_summary_report",
    body: { _from: dateFrom, _to: dateTo, _for_user_id: null },
  },
];

describe.skipIf(!enabled)("performance budgets (orders / invoices / dashboard)", () => {
  for (const c of cases) {
    it(
      `${c.name} responds under ${PERF_BUDGETS_MS[c.name]}ms (warm median)`,
      async () => {
        const ms = await medianLatency(c.name, c.body);
        // eslint-disable-next-line no-console
        console.log(`[perf] ${c.name}: ${ms.toFixed(0)}ms (budget ${PERF_BUDGETS_MS[c.name]}ms)`);
        expect(ms).toBeLessThan(PERF_BUDGETS_MS[c.name]);
      },
      60_000,
    );
  }
});

describe("performance budget definitions", () => {
  it("every measured endpoint has a budget", () => {
    for (const c of cases) expect(PERF_BUDGETS_MS[c.name]).toBeGreaterThan(0);
    expect(Object.keys(PERF_BUDGETS_MS).sort()).toEqual(cases.map((c) => c.name).sort());
  });
});
