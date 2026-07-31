export type HealthScoreStatus = "healthy" | "watch" | "critical" | "insufficient";

export type HealthScoreResult = {
  score: number;
  coverage: number;
  status: HealthScoreStatus;
};

type HealthScoreInput = {
  revenue: number;
  netMargin: number;
  periodCashNet: number;
  ordersDelivered: number;
  ordersReturned: number;
  supplierOverdueCount: number;
  lowStockCount: number;
};

type WeightedMetric = {
  weight: number;
  available: boolean;
  score: number;
};

export function calculateHealthScore(input: HealthScoreInput): HealthScoreResult {
  const completedOrders = input.ordersDelivered + input.ordersReturned;
  const deliveryRate = completedOrders > 0 ? input.ordersDelivered / completedOrders : 0;
  const returnRate = completedOrders > 0 ? input.ordersReturned / completedOrders : 0;

  const metrics: WeightedMetric[] = [
    {
      weight: 25,
      available: input.revenue > 0,
      score: input.netMargin >= 0.1 ? 1 : input.netMargin >= 0.05 ? 0.5 : 0,
    },
    {
      weight: 25,
      available: true,
      score: input.periodCashNet > 0 ? 1 : input.periodCashNet === 0 ? 0.5 : 0,
    },
    {
      weight: 20,
      available: completedOrders > 0,
      score: deliveryRate >= 0.85 ? 1 : deliveryRate >= 0.75 ? 0.5 : 0,
    },
    {
      weight: 15,
      available: completedOrders > 0,
      score: returnRate <= 0.1 ? 1 : returnRate <= 0.2 ? 0.5 : 0,
    },
    {
      weight: 10,
      available: true,
      score: input.supplierOverdueCount === 0 ? 1 : input.supplierOverdueCount <= 2 ? 0.5 : 0,
    },
    {
      weight: 5,
      available: true,
      score: input.lowStockCount === 0 ? 1 : input.lowStockCount <= 2 ? 0.5 : 0,
    },
  ];

  const coverage = metrics.reduce((sum, metric) => sum + (metric.available ? metric.weight : 0), 0);
  const earned = metrics.reduce(
    (sum, metric) => sum + (metric.available ? metric.weight * metric.score : 0),
    0,
  );
  const score = coverage > 0 ? Math.round((earned / coverage) * 100) : 0;
  const status =
    coverage < 60 ? "insufficient" : score >= 75 ? "healthy" : score >= 50 ? "watch" : "critical";

  return { score, coverage, status };
}
