/**
 * Fetch ALL rows from a Supabase query by paginating through PostgREST's
 * max-rows limit (default 1000). The builder MUST be a closure that returns
 * a fresh query each call — awaited supabase-js builders are one-shot.
 *
 * Example:
 *   const rows = await fetchAllRows<Row>(() =>
 *     supabase.from("orders").select("id, total").eq("brand_id", id));
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAllRows<T = any>(builder: () => any): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await builder().range(start, start + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    if (batch.length === 0) break;
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}
