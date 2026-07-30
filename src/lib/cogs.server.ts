// Shared helper: batched COGS lookup delegating to the canonical DB function
// `public.product_cogs` (via `public.products_cogs_map`). Every place in the
// app that needs product cost/COGS must go through this helper instead of
// re-implementing the cogs_override -> moving_avg_cost -> cogs_percent ->
// brand default -> BOM fallback chain in JS.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

export async function getCogsMap(supabase: SupabaseAny, productIds: Array<string | null | undefined>): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const ids = Array.from(new Set(productIds.filter(Boolean))) as string[];
  if (!ids.length) return map;
  const { data, error } = await supabase.rpc("products_cogs_map", { _ids: ids });
  if (error) throw error;
  for (const r of (data ?? []) as Array<{ product_id: string; cogs: number }>) {
    map.set(r.product_id, Number(r.cogs) || 0);
  }
  return map;
}

/** Convenience for a single product. Prefer getCogsMap for batches (avoids N+1). */
export async function getCogsForProduct(supabase: SupabaseAny, productId: string): Promise<number> {
  const { data, error } = await supabase.rpc("product_cogs", { _product_id: productId });
  if (error) throw error;
  return Number(data) || 0;
}
