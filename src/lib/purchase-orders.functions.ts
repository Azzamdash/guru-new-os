import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

async function assertWriter(context: Ctx) {
  const { data, error } = await context.supabase.rpc("is_writer", { _user_id: context.userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export type PurchaseOrderStatus = "draft" | "awaiting_delivery" | "completed" | "cancelled";

export type PurchaseOrder = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  brand_id: string | null;
  brand_name: string;
  status: PurchaseOrderStatus;
  expected_delivery_at: string | null;
  note: string | null;
  invoice_id: string | null;
  total: number;
  created_at: string;
};

export const listPurchaseOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    status?: PurchaseOrderStatus | "all" | null;
    supplierId?: string | null;
    from?: string | null;
    to?: string | null;
  } = {}) => d)
  .handler(async ({ data, context }): Promise<PurchaseOrder[]> => {
    const ctx = context as Ctx;
    let q = ctx.supabase
      .from("purchase_orders")
      .select("id, supplier_id, brand_id, status, expected_delivery_at, note, invoice_id, created_at, suppliers(name), brands(name), purchase_order_items(qty, unit_cost)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.supplierId) q = q.eq("supplier_id", data.supplierId);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", `${data.to}T23:59:59`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    type Row = {
      id: string; supplier_id: string; brand_id: string | null; status: PurchaseOrderStatus;
      expected_delivery_at: string | null; note: string | null; invoice_id: string | null; created_at: string;
      suppliers: { name: string } | null; brands: { name: string } | null;
      purchase_order_items: Array<{ qty: number; unit_cost: number }>;
    };
    return ((rows ?? []) as Row[]).map((r) => ({
      id: r.id,
      supplier_id: r.supplier_id,
      supplier_name: r.suppliers?.name ?? "—",
      brand_id: r.brand_id,
      brand_name: r.brands?.name ?? "—",
      status: r.status,
      expected_delivery_at: r.expected_delivery_at,
      note: r.note,
      invoice_id: r.invoice_id,
      total: (r.purchase_order_items ?? []).reduce((a, i) => a + Number(i.qty) * Number(i.unit_cost), 0),
      created_at: r.created_at,
    }));
  });

export type PurchaseOrderItem = {
  id: string;
  purchase_order_id: string;
  product_id: string | null;
  material_id: string | null;
  item_name: string;
  qty: number;
  unit_cost: number;
};

export const getPurchaseOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { data: po, error } = await ctx.supabase
      .from("purchase_orders")
      .select("id, supplier_id, brand_id, status, expected_delivery_at, note, invoice_id, created_at, suppliers(name), brands(name)")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);

    const { data: itemRows, error: itemsError } = await ctx.supabase
      .from("purchase_order_items")
      .select("id, purchase_order_id, product_id, material_id, qty, unit_cost, products(name), materials(name)")
      .eq("purchase_order_id", data.id);
    if (itemsError) throw new Error(itemsError.message);

    type ItemRow = {
      id: string; purchase_order_id: string; product_id: string | null; material_id: string | null;
      qty: number; unit_cost: number;
      products: { name: string } | null; materials: { name: string } | null;
    };
    const items: PurchaseOrderItem[] = ((itemRows ?? []) as ItemRow[]).map((r) => ({
      id: r.id,
      purchase_order_id: r.purchase_order_id,
      product_id: r.product_id,
      material_id: r.material_id,
      item_name: r.products?.name ?? r.materials?.name ?? "—",
      qty: Number(r.qty),
      unit_cost: Number(r.unit_cost),
    }));

    return {
      id: po.id as string,
      supplier_id: po.supplier_id as string,
      supplier_name: (po.suppliers as { name: string } | null)?.name ?? "—",
      brand_id: po.brand_id as string | null,
      brand_name: (po.brands as { name: string } | null)?.name ?? "—",
      status: po.status as PurchaseOrderStatus,
      expected_delivery_at: po.expected_delivery_at as string | null,
      note: po.note as string | null,
      invoice_id: po.invoice_id as string | null,
      created_at: po.created_at as string,
      items,
      total: items.reduce((a, i) => a + i.qty * i.unit_cost, 0),
    };
  });

export const upsertPurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; supplier_id: string; brand_id?: string | null; expected_delivery_at?: string | null; note?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertWriter(ctx);
    const payload = {
      supplier_id: data.supplier_id,
      brand_id: data.brand_id ?? null,
      expected_delivery_at: data.expected_delivery_at ?? null,
      note: data.note ?? null,
    };
    if (data.id) {
      const { error } = await ctx.supabase.from("purchase_orders").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: saved, error } = await ctx.supabase
      .from("purchase_orders")
      .insert({ ...payload, created_by: ctx.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: saved.id as string };
  });

export const deletePurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    // Handles completed orders too: reverses the invoice/inventory it created
    // (blocked if payments were already recorded) before deleting the row.
    const { error } = await ctx.supabase.rpc("delete_purchase_order", { _po_id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Reverses a completed order's supplier invoice + inventory movements and
// puts it back into "awaiting_delivery" so its items can be edited again.
export const reopenPurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { error } = await ctx.supabase.rpc("reverse_purchase_order_completion", { _po_id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const upsertPurchaseOrderItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; purchase_order_id: string; product_id?: string | null; material_id?: string | null; qty: number; unit_cost: number }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertWriter(ctx);
    if (!data.product_id && !data.material_id) throw new Error("اختر منتج أو خامة");
    if (data.qty <= 0) throw new Error("الكمية يجب أن تكون أكبر من صفر");
    const payload = {
      purchase_order_id: data.purchase_order_id,
      product_id: data.product_id ?? null,
      material_id: data.material_id ?? null,
      qty: data.qty,
      unit_cost: data.unit_cost,
    };
    if (data.id) {
      const { error } = await ctx.supabase.from("purchase_order_items").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: saved, error } = await ctx.supabase.from("purchase_order_items").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: saved.id as string };
  });

export const deletePurchaseOrderItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertWriter(ctx);
    const { error } = await ctx.supabase.from("purchase_order_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markAwaitingDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertWriter(ctx);
    const { error } = await ctx.supabase
      .from("purchase_orders")
      .update({ status: "awaiting_delivery" })
      .eq("id", data.id)
      .eq("status", "draft");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelPurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertWriter(ctx);
    const { error } = await ctx.supabase
      .from("purchase_orders")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .neq("status", "completed");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const completePurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const { data: invoiceId, error } = await ctx.supabase.rpc("complete_purchase_order", { _po_id: data.id });
    if (error) throw new Error(error.message);
    return { invoiceId: invoiceId as string };
  });

export const getPurchaseOrdersSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as Ctx;
    const { data: rows, error } = await ctx.supabase.from("purchase_orders").select("status");
    if (error) throw new Error(error.message);
    const counts = { total: 0, draft: 0, awaiting_delivery: 0, completed: 0, cancelled: 0 };
    for (const r of (rows ?? []) as Array<{ status: PurchaseOrderStatus }>) {
      counts.total += 1;
      counts[r.status] += 1;
    }
    return counts;
  });
