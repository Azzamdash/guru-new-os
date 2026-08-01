/**
 * Shared TanStack Query caching presets.
 *
 * Goal: cut the number of round-trips per page by giving every class of data a
 * sensible freshness window, instead of relying on the global default only.
 *
 * - reference: rarely changes (brands, couriers, products lists)
 * - report:    aggregated/heavy reports (dashboards, summaries)
 * - listing:   paginated transactional lists (orders, invoices)
 * - live:      data that must feel near real-time
 */
export const queryPresets = {
  reference: {
    staleTime: 15 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  },
  report: {
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  },
  listing: {
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  },
  live: {
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  },
} as const;

export type QueryPresetName = keyof typeof queryPresets;
