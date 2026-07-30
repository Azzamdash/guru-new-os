import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getCogsMap } from "@/lib/cogs.server";

export const getInventoryValuation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("products")
      .select("id, name, sku, brand_id, on_hand_qty, moving_avg_cost, sell_price, reorder_point, brands(name)")
      .eq("active", true);
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    const { data: rows, error } = await q.order("name");
    if (error) throw error;

    const cogsMap = await getCogsMap(supabase, (rows ?? []).map((r) => r.id as string));

    const items = (rows ?? []).map((r) => {
      const qty = Number(r.on_hand_qty || 0);
      const cost = cogsMap.get(r.id as string) ?? Number(r.moving_avg_cost || 0);
      const value = qty * cost;
      const price = Number(r.sell_price || 0);
      const potentialRevenue = qty * price;
      return {
        id: r.id as string,
        name: r.name as string,
        sku: (r.sku as string) ?? "",
        brand_id: r.brand_id as string,
        brand_name: (r as unknown as { brands: { name: string } | null }).brands?.name ?? "",
        on_hand_qty: qty,
        moving_avg_cost: cost,
        inventory_value: value,
        sell_price: price,
        potential_revenue: potentialRevenue,
        margin: potentialRevenue - value,
        reorder_point: Number(r.reorder_point || 0),
        low_stock: qty <= Number(r.reorder_point || 0),
      };
    });

    const totals = items.reduce(
      (a, i) => {
        a.units += i.on_hand_qty;
        a.value += i.inventory_value;
        a.potential_revenue += i.potential_revenue;
        a.low_stock_count += i.low_stock ? 1 : 0;
        return a;
      },
      { units: 0, value: 0, potential_revenue: 0, low_stock_count: 0 },
    );

    const byBrand = new Map<string, { brand_id: string; brand_name: string; units: number; value: number }>();
    for (const i of items) {
      const b = byBrand.get(i.brand_id) ?? { brand_id: i.brand_id, brand_name: i.brand_name, units: 0, value: 0 };
      b.units += i.on_hand_qty;
      b.value += i.inventory_value;
      byBrand.set(i.brand_id, b);
    }

    return {
      items: items.sort((a, b) => b.inventory_value - a.inventory_value),
      totals: { ...totals, potential_margin: totals.potential_revenue - totals.value },
      byBrand: Array.from(byBrand.values()).sort((a, b) => b.value - a.value),
    };
  });