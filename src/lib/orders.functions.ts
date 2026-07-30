import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getCogsMap } from "./cogs.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

async function assertWriter(ctx: Ctx) {
  for (const role of ["admin", "manager", "data_entry", "accountant"] as const) {
    const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: role });
    if (data) return;
  }
  throw new Error("Forbidden");
}

async function assertManager(ctx: Ctx) {
  for (const role of ["admin", "manager"] as const) {
    const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: role });
    if (data) return;
  }
  throw new Error("Forbidden");
}

export type OrderRow = {
  id: string;
  brand_id: string;
  brand_name: string;
  source: string;
  external_order_number: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  courier_id: string | null;
  courier_name: string | null;
  employee_id: string | null;
  financial_status: string;
  fulfillment_status: string;
  confirmation_status: string;
  total_amount: number;
  cost_total: number;
  shipping_amount: number;
  currency: string;
  occurred_at: string;
  items_qty: number;
  items_summary: Array<{ title: string; qty: number }>;
  shipping_governorate: string | null;
  bosta_tracking: string | null;
};

export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string | null; days?: number; from?: string | null; to?: string | null } = {}) => d)
  .handler(async ({ data, context }) => {
    const buildQ = () => {
      let q = context.supabase
        .from("orders")
        .select("id, brand_id, source, external_order_number, customer_id, customer_name, customer_phone, courier_id, employee_id, financial_status, fulfillment_status, confirmation_status, total_amount, cost_total, shipping_amount, currency, occurred_at, shipping_governorate, raw, brands(name), couriers(name)")
        .order("occurred_at", { ascending: false });
      if (data.from) q = q.gte("occurred_at", data.from);
      if (data.to) q = q.lte("occurred_at", `${data.to.slice(0, 10)}T23:59:59`);
      if (!data.from && !data.to) {
        const days = data.days ?? 90;
        const since = new Date(Date.now() - days * 86400000).toISOString();
        q = q.gte("occurred_at", since);
      }
      if (data.brandId) q = q.eq("brand_id", data.brandId);
      return q;
    };
    const PAGE = 1000;
    const rows: unknown[] = [];
    for (let start = 0; ; start += PAGE) {
      const { data: batch, error } = await buildQ().range(start, start + PAGE - 1);
      if (error) throw error;
      if (!batch || batch.length === 0) break;
      rows.push(...batch);
      if (batch.length < PAGE) break;
    }
    const orderIds = (rows as Array<{ id: string }>).map((r) => r.id);
    const qtyByOrder = new Map<string, number>();
    const itemsByOrder = new Map<string, Array<{ title: string; qty: number }>>();
    if (orderIds.length) {
      const { data: items } = await context.supabase
        .from("order_items")
        .select("order_id, qty, title")
        .in("order_id", orderIds);
      for (const it of (items ?? []) as Array<{ order_id: string; qty: number; title: string | null }>) {
        const q2 = Number(it.qty) || 0;
        qtyByOrder.set(it.order_id, (qtyByOrder.get(it.order_id) ?? 0) + q2);
        const arr = itemsByOrder.get(it.order_id) ?? [];
        arr.push({ title: it.title ?? "—", qty: q2 });
        itemsByOrder.set(it.order_id, arr);
      }
    }
    return (rows as Array<{
      id: string; brand_id: string; source: string; external_order_number: string | null;
      customer_id: string | null; customer_name: string | null; customer_phone: string | null;
      courier_id: string | null; employee_id: string | null; financial_status: string;
      fulfillment_status: string; confirmation_status: string; total_amount: number; cost_total: number; shipping_amount: number;
      currency: string; occurred_at: string; shipping_governorate: string | null; raw: unknown;
      brands: { name: string } | null; couriers: { name: string } | null;
    }>).map((r): OrderRow => ({
      id: r.id, brand_id: r.brand_id, brand_name: r.brands?.name ?? "—",
      source: r.source, external_order_number: r.external_order_number,
      customer_id: r.customer_id, customer_name: r.customer_name, customer_phone: r.customer_phone,
      courier_id: r.courier_id, courier_name: r.couriers?.name ?? null, employee_id: r.employee_id,
      financial_status: r.financial_status, fulfillment_status: r.fulfillment_status,
      confirmation_status: r.confirmation_status ?? "pending",
      total_amount: Number(r.total_amount), cost_total: Number(r.cost_total),
      shipping_amount: Number(r.shipping_amount), currency: r.currency, occurred_at: r.occurred_at,
      items_qty: qtyByOrder.get(r.id) ?? 0,
      items_summary: itemsByOrder.get(r.id) ?? [],
      shipping_governorate: r.shipping_governorate ?? null,
      bosta_tracking: typeof r.raw === "object" && r.raw !== null && "bosta_tracking" in r.raw
        ? String((r.raw as { bosta_tracking?: unknown }).bosta_tracking ?? "") || null
        : null,
    }));
  });

export const getOrdersSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number; brandId?: string | null; from?: string | null; to?: string | null } = {}) => d)
  .handler(async ({ data, context }) => {
    const buildQ = () => {
      let q = context.supabase.from("orders")
        .select("brand_id, source, fulfillment_status, financial_status, total_amount, cost_total, brands(name)")
        .order("occurred_at", { ascending: false });
      if (data.from) q = q.gte("occurred_at", data.from);
      if (data.to) q = q.lte("occurred_at", `${data.to.slice(0, 10)}T23:59:59`);
      if (!data.from && !data.to) {
        const days = data.days ?? 30;
        const since = new Date(Date.now() - days * 86400000).toISOString();
        q = q.gte("occurred_at", since);
      }
      if (data.brandId) q = q.eq("brand_id", data.brandId);
      return q;
    };
    type R = { brand_id: string; brands: { name: string } | null; source: string; fulfillment_status: string; financial_status: string; total_amount: number; cost_total: number };
    const PAGE = 1000;
    const arr: R[] = [];
    for (let start = 0; ; start += PAGE) {
      const { data: batch, error } = await buildQ().range(start, start + PAGE - 1);
      if (error) throw error;
      if (!batch || batch.length === 0) break;
      arr.push(...(batch as unknown as R[]));
      if (batch.length < PAGE) break;
    }
    let totalOrders = 0, delivered = 0, returned = 0, revenue = 0, cogs = 0;
    const byBrand = new Map<string, { name: string; count: number; revenue: number; cogs: number; delivered: number; returned: number }>();
    for (const r of arr) {
      totalOrders += 1;
      const rev = Number(r.total_amount) || 0;
      const c = Number(r.cost_total) || 0;
      revenue += rev; cogs += c;
      if (r.fulfillment_status === "delivered") delivered += 1;
      if (r.fulfillment_status === "returned") returned += 1;
      const entry = byBrand.get(r.brand_id) ?? { name: r.brands?.name ?? "—", count: 0, revenue: 0, cogs: 0, delivered: 0, returned: 0 };
      entry.count += 1; entry.revenue += rev; entry.cogs += c;
      if (r.fulfillment_status === "delivered") entry.delivered += 1;
      if (r.fulfillment_status === "returned") entry.returned += 1;
      byBrand.set(r.brand_id, entry);
    }
    return {
      totalOrders, delivered, returned, revenue, cogs,
      grossProfit: revenue - cogs,
      perBrand: Array.from(byBrand.entries()).map(([id, v]) => ({ brandId: id, ...v })).sort((a, b) => b.revenue - a.revenue),
    };
  });

/**
 * COGS on top of sales_invoice_items using the product_cogs() SQL function.
 * Provides accurate profit = revenue − cogs even before orders backfill.
 */
export const getInvoiceCogsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number; brandId?: string | null; from?: string | null; to?: string | null } = {}) => d)
  .handler(async ({ data, context }) => {
    let invQ = context.supabase.from("sales_invoices")
      .select("id, brand_id, type, total_amount, brands(name)");
    if (data.from) invQ = invQ.gte("occurred_at", data.from);
    if (data.to) invQ = invQ.lte("occurred_at", `${data.to.slice(0, 10)}T23:59:59`);
    if (!data.from && !data.to) {
      const days = data.days ?? 30;
      const since = new Date(Date.now() - days * 86400000).toISOString();
      invQ = invQ.gte("occurred_at", since);
    }
    if (data.brandId) invQ = invQ.eq("brand_id", data.brandId);

    const { data: invoices, error } = await invQ;
    if (error) throw error;
    type Inv = { id: string; brand_id: string; type: "sale" | "return"; total_amount: number; brands: { name: string } | null };
    const invList = ((invoices ?? []) as Inv[]);
    const invById = new Map(invList.map((i) => [i.id, i]));
    const invIds = invList.map((i) => i.id);

    let itemsRows: Array<{ invoice_id: string; product_id: string | null; qty: number; subtotal: number | null; unit_price: number | null }> = [];
    if (invIds.length) {
      const { data: it } = await context.supabase
        .from("sales_invoice_items").select("invoice_id, product_id, qty, subtotal, unit_price").in("invoice_id", invIds);
      itemsRows = (it ?? []) as typeof itemsRows;
    }
    const cogsByProduct = await getCogsMap(context.supabase, itemsRows.map((i) => i.product_id));

    // brand-level fallback percentage
    const { data: bR } = await context.supabase.from("brands").select("id, cogs_percent_default");
    const brandPct = new Map<string, number>();
    for (const b of ((bR ?? []) as Array<{ id: string; cogs_percent_default: number | null }>)) {
      brandPct.set(b.id, Number(b.cogs_percent_default) || 0);
    }

    // per-invoice aggregate — per-line: use product cogs if > 0, otherwise brand% × line revenue
    const agg = new Map<string, { lineCogs: number; itemsRev: number }>();
    for (const it of itemsRows) {
      const inv = invById.get(it.invoice_id);
      if (!inv) continue;
      const rev = Number(it.subtotal) || (Number(it.unit_price) || 0) * (Number(it.qty) || 0);
      const productCogs = (it.product_id ? cogsByProduct.get(it.product_id) ?? 0 : 0) * Number(it.qty);
      let c = productCogs;
      if (c <= 0 && rev > 0) {
        const pct = brandPct.get(inv.brand_id) ?? 0;
        if (pct > 0) c = (pct / 100) * rev;
      }
      const cur = agg.get(it.invoice_id) ?? { lineCogs: 0, itemsRev: 0 };
      cur.lineCogs += c; cur.itemsRev += rev;
      agg.set(it.invoice_id, cur);
    }

    let revenue = 0, cogs = 0;
    const perBrand = new Map<string, { name: string; revenue: number; cogs: number }>();
    for (const inv of invList) {
      const amt = Number(inv.total_amount) || 0;
      const sign = inv.type === "sale" ? 1 : -1;
      const a = agg.get(inv.id) ?? { lineCogs: 0, itemsRev: 0 };
      // fallback on residual revenue not covered by any items
      const residual = Math.max(0, amt - a.itemsRev);
      const pct = brandPct.get(inv.brand_id) ?? 0;
      const fallback = pct > 0 ? (pct / 100) * residual : 0;
      const c = (a.lineCogs + fallback) * sign;
      revenue += amt * sign; cogs += c;
      const e = perBrand.get(inv.brand_id) ?? { name: inv.brands?.name ?? "—", revenue: 0, cogs: 0 };
      e.revenue += amt * sign; e.cogs += c;
      perBrand.set(inv.brand_id, e);
    }
    return {
      revenue, cogs, grossProfit: revenue - cogs,
      grossMargin: revenue > 0 ? (revenue - cogs) / revenue : 0,
      perBrand: Array.from(perBrand.entries()).map(([id, v]) => ({ brandId: id, ...v, profit: v.revenue - v.cogs })).sort((a, b) => b.revenue - a.revenue),
    };
  });

export const upsertManualOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string;
    brand_id: string;
    external_order_number?: string | null;
    customer_name?: string | null;
    customer_phone?: string | null;
    customer_email?: string | null;
    shipping_governorate?: string | null;
    shipping_address?: string | null;
    building_number?: string | null;
    floor_number?: string | null;
    apartment_number?: string | null;
    courier_id?: string | null;
    employee_id?: string | null;
    fulfillment_status?: string;
    financial_status?: string;
    confirmation_status?: string;
    shipping_amount?: number;
    discount_amount?: number;
    occurred_at?: string;
    note?: string | null;
    items: Array<{ product_id?: string | null; title: string; qty: number; unit_price: number }>;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    // Compute COGS per item using product_cogs()
    const costMap = await getCogsMap(context.supabase, data.items.map((i) => i.product_id));
    let subtotal = 0, cost_total = 0;
    const enriched = data.items.map((i) => {
      const unit_cost = i.product_id ? costMap.get(i.product_id) ?? 0 : 0;
      const line = Number(i.qty) * Number(i.unit_price);
      subtotal += line;
      cost_total += Number(i.qty) * unit_cost;
      return { ...i, unit_cost, subtotal: line };
    });
    const total_amount = subtotal + Number(data.shipping_amount ?? 0) - Number(data.discount_amount ?? 0);
    const orderPayload = {
      brand_id: data.brand_id, source: "manual",
      external_order_number: data.external_order_number ?? null,
      customer_name: data.customer_name ?? null,
      customer_phone: data.customer_phone ?? null,
      customer_email: data.customer_email ?? null,
      shipping_governorate: data.shipping_governorate ?? null,
      shipping_address: data.shipping_address ?? null,
      building_number: data.building_number ?? null,
      floor_number: data.floor_number ?? null,
      apartment_number: data.apartment_number ?? null,
      courier_id: data.courier_id ?? null,
      employee_id: data.employee_id ?? null,
      fulfillment_status: data.fulfillment_status ?? "unfulfilled",
      financial_status: data.financial_status ?? "pending",
      confirmation_status: data.confirmation_status ?? "pending",
      subtotal_amount: subtotal,
      shipping_amount: Number(data.shipping_amount ?? 0),
      discount_amount: Number(data.discount_amount ?? 0),
      total_amount, cost_total,
      occurred_at: data.occurred_at ?? new Date().toISOString(),
      note: data.note ?? null,
    };
    let orderId: string;
    if (data.id) {
      const { error } = await context.supabase.from("orders").update(orderPayload).eq("id", data.id);
      if (error) throw error;
      orderId = data.id;
      await context.supabase.from("order_items").delete().eq("order_id", orderId);
    } else {
      const { data: inserted, error } = await context.supabase.from("orders").insert(orderPayload).select("id").single();
      if (error) throw error;
      orderId = inserted.id;
    }
    if (enriched.length) {
      const { error } = await context.supabase.from("order_items").insert(enriched.map((i) => ({
        order_id: orderId, product_id: i.product_id ?? null, title: i.title,
        qty: i.qty, unit_price: i.unit_price, unit_cost: i.unit_cost, subtotal: i.subtotal,
      })));
      if (error) throw error;
    }
    return { ok: true, id: orderId };
  });


export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; fulfillment_status?: string; financial_status?: string; confirmation_status?: string; courier_id?: string | null; employee_id?: string | null }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {};
    if (data.fulfillment_status) payload.fulfillment_status = data.fulfillment_status;
    if (data.financial_status) payload.financial_status = data.financial_status;
    if (data.confirmation_status) payload.confirmation_status = data.confirmation_status;
    if (data.courier_id !== undefined) payload.courier_id = data.courier_id;
    if (data.employee_id !== undefined) payload.employee_id = data.employee_id;
    const { error } = await context.supabase.from("orders").update(payload).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const { error } = await context.supabase.from("orders").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const getOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase
      .from("orders")
      .select("id, brand_id, external_order_number, customer_name, customer_phone, customer_email, shipping_governorate, shipping_address, building_number, floor_number, apartment_number, courier_id, employee_id, fulfillment_status, financial_status, confirmation_status, shipping_amount, discount_amount, occurred_at, note, source")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    const { data: items } = await context.supabase
      .from("order_items")
      .select("product_id, title, qty, unit_price")
      .eq("order_id", data.id);
    return { ...order, items: (items ?? []) as Array<{ product_id: string | null; title: string; qty: number; unit_price: number }> };
  });

// Trigger Shopify pull for one brand on demand (manager+ only)
export const runShopifySyncNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const { data: hasAccess } = await context.supabase.rpc("has_brand_access", { _user_id: context.userId, _brand_id: data.brandId });
    if (!hasAccess) throw new Error("Forbidden: brand access denied");
    const { syncShopifyOrdersForBrand } = await import("@/server/shopifySync.server");
    const sinceISO = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const result = await syncShopifyOrdersForBrand(data.brandId, { sinceISO, paginate: true });
    return result;
  });

// Trigger Shopify pull for all connected brands (manager+ only)
export const runShopifySyncAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertManager(context);
    const { data: rows, error } = await context.supabase
      .from("brand_integrations")
      .select("brand_id")
      .eq("provider", "shopify")
      .eq("status", "connected");
    if (error) throw error;
    const { syncShopifyOrdersForBrand } = await import("@/server/shopifySync.server");
    const sinceISO = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const results: Array<{ brand_id: string; ok: boolean; upserted?: number; fetched?: number; error?: string }> = [];
    for (const r of (rows ?? []) as Array<{ brand_id: string }>) {
      try {
        const res = await syncShopifyOrdersForBrand(r.brand_id, { sinceISO, paginate: true });
        results.push({ brand_id: r.brand_id, ok: true, upserted: res.upserted, fetched: res.fetched });
      } catch (e) {
        results.push({ brand_id: r.brand_id, ok: false, error: (e as Error).message });
      }
    }
    const upserted = results.reduce((s, x) => s + (x.upserted ?? 0), 0);
    const fetched = results.reduce((s, x) => s + (x.fetched ?? 0), 0);
    return { ok: true, upserted, fetched, brands: results.length, results };
  });

// Full month backfill: pull every order in [fromISO, toISO) and delete existing
// shopify orders outside that window (per brand). Great for "reset July".
export const runShopifyBackfillWindow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string | null; fromISO: string; toISO: string; deleteOutside?: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const { syncShopifyOrdersForBrand } = await import("@/server/shopifySync.server");
    let brands: Array<{ brand_id: string }> = [];
    if (data.brandId) {
      const { data: ok } = await context.supabase.rpc("has_brand_access", { _user_id: context.userId, _brand_id: data.brandId });
      if (!ok) throw new Error("Forbidden: brand access denied");
      brands = [{ brand_id: data.brandId }];
    } else {
      const { data: rows, error } = await context.supabase
        .from("brand_integrations").select("brand_id")
        .eq("provider", "shopify").eq("status", "connected");
      if (error) throw error;
      brands = (rows ?? []) as Array<{ brand_id: string }>;
    }
    const results: Array<{ brand_id: string; ok: boolean; upserted?: number; fetched?: number; error?: string }> = [];
    for (const r of brands) {
      try {
        const res = await syncShopifyOrdersForBrand(r.brand_id, {
          sinceISO: data.fromISO,
          untilISO: data.toISO,
          paginate: true,
          deleteBeforeISO: data.deleteOutside ? data.fromISO : undefined,
          deleteAfterISO: data.deleteOutside ? data.toISO : undefined,
        });
        results.push({ brand_id: r.brand_id, ok: true, upserted: res.upserted, fetched: res.fetched });
      } catch (e) {
        results.push({ brand_id: r.brand_id, ok: false, error: (e as Error).message });
      }
    }
    const upserted = results.reduce((s, x) => s + (x.upserted ?? 0), 0);
    const fetched = results.reduce((s, x) => s + (x.fetched ?? 0), 0);
    return { ok: true, upserted, fetched, brands: results.length, results };
  });
