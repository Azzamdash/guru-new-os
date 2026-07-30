import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

async function assertWriter(context: Ctx) {
  const results = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "manager" }),
  ]);
  if (!results.some((r) => !r.error && r.data === true)) throw new Error("Forbidden");
}

export const listOfflineBranches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("brands")
      .select("id, name")
      .eq("type", "offline_branch")
      .eq("active", true)
      .order("name");
    if (error) throw error;
    return (data ?? []) as Array<{ id: string; name: string }>;
  });

export const listBranchStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string }) => d)
  .handler(async ({ data, context }) => {
    if (!data.brandId) throw new Error("brandId required");
    const { data: rows, error } = await context.supabase
      .from("products")
      .select("id, name, sku, unit, on_hand_qty, moving_avg_cost, sell_price")
      .eq("brand_id", data.brandId)
      .eq("active", true)
      .order("name");
    if (error) throw error;
    return (rows ?? []) as Array<{
      id: string; name: string; sku: string | null; unit: string;
      on_hand_qty: number; moving_avg_cost: number | null; sell_price: number;
    }>;
  });

export const addBranchStockMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    product_id: string;
    qty: number;
    direction: "in" | "out";
    unit_cost?: number | null;
    occurred_at?: string;
    note?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    if (!data.product_id || !data.qty || data.qty <= 0) throw new Error("Invalid input");
    // 'production' → treated as inflow (adds stock, updates WAC)
    // 'sale' → treated as outflow (removes stock)
    const type = data.direction === "in" ? "production" : "sale";
    const { error } = await context.supabase.from("inventory_movements").insert({
      product_id: data.product_id,
      type,
      qty: data.qty,
      unit_cost: data.direction === "in" ? (data.unit_cost ?? null) : null,
      occurred_at: data.occurred_at ?? new Date().toISOString(),
      note: data.note ?? (data.direction === "in" ? "Branch stock addition" : "Branch stock adjustment"),
    });
    if (error) throw error;
    return { ok: true };
  });

export const listBranchStockMovements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; limit?: number }) => d)
  .handler(async ({ data, context }) => {
    const { data: prods } = await context.supabase
      .from("products").select("id, name").eq("brand_id", data.brandId);
    const ids = (prods ?? []).map((p: { id: string }) => p.id);
    if (ids.length === 0) return [];
    const nameOf = new Map((prods ?? []).map((p: { id: string; name: string }) => [p.id, p.name]));
    const { data: rows, error } = await context.supabase
      .from("inventory_movements")
      .select("id, product_id, type, qty, occurred_at, note")
      .in("product_id", ids)
      .order("occurred_at", { ascending: false })
      .limit(data.limit ?? 200);
    if (error) throw error;
    return (rows ?? []).map((r: { id: string; product_id: string | null; type: string; qty: number; occurred_at: string; note: string | null }) => ({
      ...r,
      product_name: (r.product_id ? (nameOf.get(r.product_id) as string) : "") || "—",
    }));
  });