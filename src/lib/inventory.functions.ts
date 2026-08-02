import { getTodayInBusinessTimezone } from "@/lib/timezone";
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

export type StockItem = {
  key: string;
  kind: "product" | "material";
  id: string;
  name: string;
  sku: string;
  unit: string;
  brand_id: string | null;
  brand_name: string;
  on_hand_qty: number;
  reorder_point: number;
  unit_cost: number;
  total_value: number;
  low_stock: boolean;
  updated_at: string;
};

export const listStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { kind?: "all" | "product" | "material"; brandId?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const kind = data.kind ?? "all";
    const items: StockItem[] = [];

    if (kind !== "material") {
      let q = (context as Ctx).supabase
        .from("products")
        .select("id, name, sku, unit, brand_id, on_hand_qty, moving_avg_cost, reorder_point, updated_at, brands(name)")
        .eq("active", true);
      if (data.brandId) q = q.eq("brand_id", data.brandId);
      const { data: rows, error } = await q.order("name");
      if (error) throw error;
      for (const r of rows ?? []) {
        const qty = Number(r.on_hand_qty || 0);
        const cost = Number(r.moving_avg_cost || 0);
        items.push({
          key: `product:${r.id}`,
          kind: "product",
          id: r.id,
          name: r.name,
          sku: r.sku ?? "",
          unit: r.unit ?? "piece",
          brand_id: r.brand_id ?? null,
          brand_name: r.brands?.name ?? "",
          on_hand_qty: qty,
          reorder_point: Number(r.reorder_point || 0),
          unit_cost: cost,
          total_value: qty * cost,
          low_stock: qty <= Number(r.reorder_point || 0),
          updated_at: r.updated_at,
        });
      }
    }

    if (kind !== "product") {
      const { data: rows, error } = await (context as Ctx).supabase
        .from("materials")
        .select("id, name, sku, unit, unit_cost, on_hand_qty, reorder_point, updated_at")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      for (const r of rows ?? []) {
        const qty = Number(r.on_hand_qty || 0);
        const cost = Number(r.unit_cost || 0);
        items.push({
          key: `material:${r.id}`,
          kind: "material",
          id: r.id,
          name: r.name,
          sku: r.sku ?? "",
          unit: r.unit ?? "piece",
          brand_id: null,
          brand_name: "",
          on_hand_qty: qty,
          reorder_point: Number(r.reorder_point || 0),
          unit_cost: cost,
          total_value: qty * cost,
          low_stock: qty <= Number(r.reorder_point || 0),
          updated_at: r.updated_at,
        });
      }
    }

    const totals = items.reduce(
      (a, i) => {
        a.value += i.total_value;
        a.units += i.on_hand_qty;
        a.low += i.low_stock ? 1 : 0;
        return a;
      },
      { value: 0, units: 0, low: 0 },
    );

    return { items, totals: { ...totals, count: items.length } };
  });

export const setReorderPoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { kind: "product" | "material"; id: string; reorder_point: number }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context as Ctx);
    const table = data.kind === "product" ? "products" : "materials";
    const { error } = await (context as Ctx).supabase
      .from(table)
      .update({ reorder_point: Math.max(0, Number(data.reorder_point) || 0) })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const addMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    kind: "product" | "material";
    id: string;
    direction: "in" | "out" | "adjust";
    qty: number;
    unit_cost?: number | null;
    occurred_at?: string;
    reason?: string | null;
    note?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context as Ctx);
    if (!data.id || !data.qty) throw new Error("Invalid input");
    const type = data.direction === "in" ? "production" : data.direction === "out" ? "sale" : "adjustment";
    const qty = data.direction === "adjust" ? Number(data.qty) : Math.abs(Number(data.qty));
    const row: Record<string, unknown> = {
      type,
      qty,
      occurred_at: data.occurred_at ?? getTodayInBusinessTimezone(),
      unit_cost: data.direction === "in" ? (data.unit_cost ?? null) : null,
      reason: data.reason ?? (data.direction === "in" ? "manual_in" : data.direction === "out" ? "manual_out" : "adjustment"),
      source: "manual",
      note: data.note ?? null,
      created_by: (context as Ctx).userId,
    };
    if (data.kind === "product") row.product_id = data.id;
    else row.material_id = data.id;

    const { error } = await (context as Ctx).supabase.from("inventory_movements").insert(row);
    if (error) throw error;
    return { ok: true };
  });

export type MovementRow = {
  id: string;
  occurred_at: string;
  created_at: string;
  kind: "product" | "material";
  item_name: string;
  type: string;
  direction: "in" | "out";
  qty: number;
  unit_cost: number | null;
  value: number;
  reason: string;
  source: string;
  note: string | null;
  user_name: string;
};

async function loadMovements(
  context: Ctx,
  filters: { from?: string; to?: string; kind?: "all" | "product" | "material"; itemId?: string | null; source?: string | null; limit?: number },
) {
  let q = context.supabase
    .from("inventory_movements")
    .select("id, occurred_at, created_at, product_id, material_id, type, qty, unit_cost, reason, source, note, created_by")
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 1000);
  if (filters.from) q = q.gte("occurred_at", filters.from);
  if (filters.to) q = q.lte("occurred_at", filters.to);
  if (filters.source) q = q.eq("source", filters.source);
  if (filters.kind === "product") q = q.not("product_id", "is", null);
  if (filters.kind === "material") q = q.not("material_id", "is", null);
  if (filters.itemId) {
    q = filters.kind === "material" ? q.eq("material_id", filters.itemId) : q.eq("product_id", filters.itemId);
  }
  const { data: rows, error } = await q;
  if (error) throw error;

  const [{ data: prods }, { data: mats }, { data: emps }] = await Promise.all([
    context.supabase.from("products").select("id, name"),
    context.supabase.from("materials").select("id, name"),
    context.supabase.from("employees").select("user_id, name").not("user_id", "is", null),
  ]);
  const pName = new Map<string, string>((prods ?? []).map((p: { id: string; name: string }) => [p.id, p.name]));
  const mName = new Map<string, string>((mats ?? []).map((m: { id: string; name: string }) => [m.id, m.name]));
  const uName = new Map<string, string>((emps ?? []).map((e: { user_id: string; name: string }) => [e.user_id, e.name]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rows ?? []).map((r: any): MovementRow => {
    const kind: "product" | "material" = r.product_id ? "product" : "material";
    const isIn = r.type === "production" || r.type === "return" || (r.type === "adjustment" && Number(r.qty) > 0);
    const qty = Math.abs(Number(r.qty || 0));
    const cost = r.unit_cost === null || r.unit_cost === undefined ? null : Number(r.unit_cost);
    return {
      id: r.id,
      occurred_at: r.occurred_at,
      created_at: r.created_at,
      kind,
      item_name: (kind === "product" ? pName.get(r.product_id) : mName.get(r.material_id)) ?? "—",
      type: r.type,
      direction: isIn ? "in" : "out",
      qty,
      unit_cost: cost,
      value: qty * (cost ?? 0),
      reason: r.reason ?? r.type,
      source: r.source ?? "manual",
      note: r.note,
      user_name: (r.created_by ? uName.get(r.created_by) : "") || "—",
    };
  });
}

export const listMovements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from?: string; to?: string; kind?: "all" | "product" | "material"; itemId?: string | null; source?: string | null; limit?: number }) => d)
  .handler(async ({ data, context }) => loadMovements(context as Ctx, data));

export const getInventoryReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from: string; to: string }) => d)
  .handler(async ({ data, context }) => {
    const moves = await loadMovements(context as Ctx, { from: data.from, to: data.to, limit: 5000 });

    const days = Math.max(
      1,
      Math.round((new Date(data.to).getTime() - new Date(data.from).getTime()) / 86400000) + 1,
    );

    const byItem = new Map<string, {
      item_name: string; kind: "product" | "material";
      in_qty: number; out_qty: number; in_value: number; out_value: number;
      first_cost: number | null; last_cost: number | null; movements: number;
    }>();

    const totals = { in_qty: 0, out_qty: 0, in_value: 0, out_value: 0 };

    // moves are newest-first; walk oldest-first for cost trend
    for (const m of [...moves].reverse()) {
      const key = `${m.kind}:${m.item_name}`;
      const e = byItem.get(key) ?? {
        item_name: m.item_name, kind: m.kind,
        in_qty: 0, out_qty: 0, in_value: 0, out_value: 0,
        first_cost: null, last_cost: null, movements: 0,
      };
      e.movements += 1;
      if (m.direction === "in") {
        e.in_qty += m.qty; e.in_value += m.value;
        totals.in_qty += m.qty; totals.in_value += m.value;
        if (m.unit_cost !== null) {
          if (e.first_cost === null) e.first_cost = m.unit_cost;
          e.last_cost = m.unit_cost;
        }
      } else {
        e.out_qty += m.qty; e.out_value += m.value;
        totals.out_qty += m.qty; totals.out_value += m.value;
      }
      byItem.set(key, e);
    }

    const items = Array.from(byItem.values()).map((e) => ({
      ...e,
      net_qty: e.in_qty - e.out_qty,
      avg_daily_consumption: e.out_qty / days,
      cost_change_pct:
        e.first_cost && e.last_cost && e.first_cost > 0
          ? ((e.last_cost - e.first_cost) / e.first_cost) * 100
          : 0,
    }));

    const bySource = new Map<string, { source: string; in_qty: number; out_qty: number; count: number }>();
    for (const m of moves) {
      const e = bySource.get(m.source) ?? { source: m.source, in_qty: 0, out_qty: 0, count: 0 };
      e.count += 1;
      if (m.direction === "in") e.in_qty += m.qty; else e.out_qty += m.qty;
      bySource.set(m.source, e);
    }

    return {
      days,
      totals,
      movements: moves,
      items: items.sort((a, b) => b.out_qty - a.out_qty),
      bySource: Array.from(bySource.values()).sort((a, b) => b.count - a.count),
    };
  });
