import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getCogsMap } from "./cogs.server";
import {
  COLLECTION_STATUSES,
  lifecycleForManualShipmentOutcome,
  SHIPMENT_OUTCOMES,
  shopifyActionForOrderStatus,
  type CollectionStatus,
  type OrderWorkflowStatus,
  type ShipmentOutcome,
} from "./order-lifecycle.shared";
import { assertPageWrite } from "./page-permissions.server";
import { ORDERS_PAGE } from "./page-permission-paths";
import { normalizePageRequest } from "./scalable-pagination.shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

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
  order_status: OrderWorkflowStatus;
  collection_status: CollectionStatus;
  shipment_outcome: ShipmentOutcome;
  lifecycle_source: "system" | "manual" | "bosta" | "shopify";
  lifecycle_updated_at: string;
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

export type OrderPageResult = {
  rows: OrderRow[];
  hasMore: boolean;
  nextCursor: { occurredAt: string; id: string } | null;
};

export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (
      d: {
        brandId?: string | null;
        days?: number;
        from?: string | null;
        to?: string | null;
        orderStatus?: string | null;
        search?: string | null;
        pageSize?: number | null;
        cursorAt?: string | null;
        cursorId?: string | null;
      } = {},
    ) => d,
  )
  .handler(async ({ data, context }): Promise<OrderPageResult> => {
    const normalized = normalizePageRequest({ pageSize: data.pageSize, search: data.search });
    const from = data.from ?? new Date(Date.now() - (data.days ?? 90) * 86400000).toISOString();
    const to = data.to ? `${data.to.slice(0, 10)}T23:59:59.999Z` : new Date().toISOString();
    const { data: result, error } = await (context.supabase as any).rpc("orders_page", {
      _from: from,
      _to: to,
      _brand_id: data.brandId || null,
      _order_status: data.orderStatus && data.orderStatus !== "all" ? data.orderStatus : null,
      _search: normalized.search,
      _cursor_at: data.cursorAt || null,
      _cursor_id: data.cursorId || null,
      _limit: normalized.pageSize,
    });
    if (error) throw error;
    const payload = (result ?? {}) as {
      rows?: OrderRow[];
      hasMore?: boolean;
      nextCursor?: { occurredAt: string; id: string } | null;
    };
    return {
      rows: payload.rows ?? [],
      hasMore: payload.hasMore === true,
      nextCursor: payload.nextCursor ?? null,
    };
  });

export const getOrdersFilterSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    brandId?: string | null;
    days?: number;
    from?: string | null;
    to?: string | null;
    orderStatus?: string | null;
    search?: string | null;
  } = {}) => d)
  .handler(async ({ data, context }) => {
    const normalized = normalizePageRequest({ search: data.search });
    const from = data.from ?? new Date(Date.now() - (data.days ?? 90) * 86400000).toISOString();
    const to = data.to ? `${data.to.slice(0, 10)}T23:59:59.999Z` : new Date().toISOString();
    const { data: result, error } = await (context.supabase as any).rpc("orders_filter_summary", {
      _from: from,
      _to: to,
      _brand_id: data.brandId || null,
      _order_status: data.orderStatus && data.orderStatus !== "all" ? data.orderStatus : null,
      _search: normalized.search,
    });
    if (error) throw error;
    const payload = (result ?? {}) as { total?: number | string; amount?: number | string };
    return { total: Number(payload.total ?? 0), amount: Number(payload.amount ?? 0) };
  });

export const getOrdersSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (
      d: { days?: number; brandId?: string | null; from?: string | null; to?: string | null } = {},
    ) => d,
  )
  .handler(async ({ data, context }) => {
    const from = data.from ?? new Date(Date.now() - (data.days ?? 30) * 86400000).toISOString();
    const to = data.to ? `${data.to.slice(0, 10)}T23:59:59.999Z` : new Date().toISOString();
    const { data: result, error } = await (context.supabase as any).rpc("orders_summary", {
      _from: from,
      _to: to,
      _brand_id: data.brandId || null,
    });
    if (error) throw error;
    return result as {
      totalOrders: number;
      delivered: number;
      returned: number;
      revenue: number;
      cogs: number;
      grossProfit: number;
      perBrand: Array<{
        brandId: string;
        name: string;
        count: number;
        revenue: number;
        cogs: number;
        delivered: number;
        returned: number;
      }>;
    };
  });

/**
 * COGS on top of sales_invoice_items using the product_cogs() SQL function.
 * Provides accurate profit = revenue − cogs even before orders backfill.
 */
export const getInvoiceCogsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (
      d: { days?: number; brandId?: string | null; from?: string | null; to?: string | null } = {},
    ) => d,
  )
  .handler(async ({ data, context }) => {
    let invQ = context.supabase
      .from("sales_invoices")
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
    type Inv = {
      id: string;
      brand_id: string;
      type: "sale" | "return";
      total_amount: number;
      brands: { name: string } | null;
    };
    const invList = (invoices ?? []) as Inv[];
    const invById = new Map(invList.map((i) => [i.id, i]));
    const invIds = invList.map((i) => i.id);

    let itemsRows: Array<{
      invoice_id: string;
      product_id: string | null;
      qty: number;
      subtotal: number | null;
      unit_price: number | null;
    }> = [];
    if (invIds.length) {
      const { data: it } = await context.supabase
        .from("sales_invoice_items")
        .select("invoice_id, product_id, qty, subtotal, unit_price")
        .in("invoice_id", invIds);
      itemsRows = (it ?? []) as typeof itemsRows;
    }
    const cogsByProduct = await getCogsMap(
      context.supabase,
      itemsRows.map((i) => i.product_id),
    );

    // brand-level fallback percentage
    const { data: bR } = await context.supabase.from("brands").select("id, cogs_percent_default");
    const brandPct = new Map<string, number>();
    for (const b of (bR ?? []) as Array<{ id: string; cogs_percent_default: number | null }>) {
      brandPct.set(b.id, Number(b.cogs_percent_default) || 0);
    }

    // per-invoice aggregate — per-line: use product cogs if > 0, otherwise brand% × line revenue
    const agg = new Map<string, { lineCogs: number; itemsRev: number }>();
    for (const it of itemsRows) {
      const inv = invById.get(it.invoice_id);
      if (!inv) continue;
      const rev = Number(it.subtotal) || (Number(it.unit_price) || 0) * (Number(it.qty) || 0);
      const productCogs =
        (it.product_id ? (cogsByProduct.get(it.product_id) ?? 0) : 0) * Number(it.qty);
      let c = productCogs;
      if (c <= 0 && rev > 0) {
        const pct = brandPct.get(inv.brand_id) ?? 0;
        if (pct > 0) c = (pct / 100) * rev;
      }
      const cur = agg.get(it.invoice_id) ?? { lineCogs: 0, itemsRev: 0 };
      cur.lineCogs += c;
      cur.itemsRev += rev;
      agg.set(it.invoice_id, cur);
    }

    let revenue = 0,
      cogs = 0;
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
      revenue += amt * sign;
      cogs += c;
      const e = perBrand.get(inv.brand_id) ?? {
        name: inv.brands?.name ?? "—",
        revenue: 0,
        cogs: 0,
      };
      e.revenue += amt * sign;
      e.cogs += c;
      perBrand.set(inv.brand_id, e);
    }
    return {
      revenue,
      cogs,
      grossProfit: revenue - cogs,
      grossMargin: revenue > 0 ? (revenue - cogs) / revenue : 0,
      perBrand: Array.from(perBrand.entries())
        .map(([id, v]) => ({ brandId: id, ...v, profit: v.revenue - v.cogs }))
        .sort((a, b) => b.revenue - a.revenue),
    };
  });

export const upsertManualOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
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
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertPageWrite(context, ORDERS_PAGE);
    // Compute COGS per item using product_cogs()
    const costMap = await getCogsMap(
      context.supabase,
      data.items.map((i) => i.product_id),
    );
    let subtotal = 0,
      cost_total = 0;
    const enriched = data.items.map((i) => {
      const unit_cost = i.product_id ? (costMap.get(i.product_id) ?? 0) : 0;
      const line = Number(i.qty) * Number(i.unit_price);
      subtotal += line;
      cost_total += Number(i.qty) * unit_cost;
      return { ...i, unit_cost, subtotal: line };
    });
    const total_amount =
      subtotal + Number(data.shipping_amount ?? 0) - Number(data.discount_amount ?? 0);
    const orderPayload = {
      brand_id: data.brand_id,
      source: "manual",
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
      total_amount,
      cost_total,
      occurred_at: data.occurred_at ?? new Date().toISOString(),
      note: data.note ?? null,
    };
    const { data: orderId, error } = await context.supabase.rpc("upsert_order_with_items", {
      // Supabase's generator omits SQL argument nullability; PostgreSQL accepts NULL here.
      _order_id: (data.id ?? null) as unknown as string,
      _order_patch: orderPayload,
      _items: enriched.map((i) => ({
        product_id: i.product_id ?? null,
        sku: null,
        title: i.title,
        qty: i.qty,
        unit_price: i.unit_price,
        unit_cost: i.unit_cost,
        subtotal: i.subtotal,
      })),
    });
    if (error) throw error;
    return { ok: true, id: orderId };
  });

export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id: string;
      fulfillment_status?: string;
      financial_status?: string;
      confirmation_status?: string;
      courier_id?: string | null;
      employee_id?: string | null;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertPageWrite(context, ORDERS_PAGE);
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

export const transitionOrderLifecycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      id: string;
      orderStatus: OrderWorkflowStatus;
      collectionStatus?: CollectionStatus;
      shipmentOutcome?: ShipmentOutcome;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    await assertPageWrite(context, ORDERS_PAGE);
    const { data: order, error } = await context.supabase
      .from("orders")
      .select("id, brand_id, source, external_id, fulfillment_status, financial_status, raw")
      .eq("id", data.id)
      .single();
    if (error) throw error;

    const outcome =
      data.shipmentOutcome ??
      (data.orderStatus === "succeeded"
        ? "delivered"
        : data.orderStatus === "cancelled"
          ? "cancelled_before_dispatch"
          : "open");
    const shopifyAction = shopifyActionForOrderStatus(data.orderStatus, outcome);
    const shouldSyncShopify =
      order.source === "shopify" && (shopifyAction === "fulfill" || shopifyAction === "cancel");
    if (shouldSyncShopify && !order.external_id) throw new Error("Shopify order id is missing");

    const fulfillmentStatus =
      outcome === "delivered" || outcome === "exchanged"
        ? "delivered"
        : outcome === "returned" || outcome === "customer_returned"
          ? "returned"
          : data.orderStatus === "cancelled"
            ? "cancelled"
            : data.orderStatus === "new"
              ? "unfulfilled"
              : "processing";
    const confirmationStatus =
      data.orderStatus === "succeeded"
        ? "confirmed"
        : data.orderStatus === "cancelled"
          ? "cancelled"
          : "pending";
    const financialStatus =
      data.collectionStatus === "paid"
        ? "paid"
        : data.collectionStatus === "unavailable"
          ? "voided"
          : order.financial_status;
    const raw = {
      ...((order.raw as Record<string, unknown> | null) ?? {}),
      erp_order_status: data.orderStatus,
      erp_collection_status: data.collectionStatus ?? null,
      erp_shipment_outcome: outcome,
      erp_lifecycle_updated_at: new Date().toISOString(),
    };
    const shopifySyncStatus = shouldSyncShopify
        ? "pending"
        : shopifyAction === "review_return"
          ? "pending"
          : "not_applicable";
    const shopifySyncError =
      shopifyAction === "review_return" ? "Returned order requires return/refund review" : null;
    const updated = await context.supabase.rpc("update_order_lifecycle_manually", {
      _order_id: data.id,
      _order_status: data.orderStatus,
      _collection_status: data.collectionStatus ?? "processing",
      _shipment_outcome: outcome,
      _fulfillment_status: fulfillmentStatus,
      _confirmation_status: confirmationStatus,
      _financial_status: financialStatus,
      _shopify_sync_status: shopifySyncStatus,
      // PostgreSQL accepts NULL here; generated RPC types do not expose parameter nullability.
      _shopify_sync_error: shopifySyncError as unknown as string,
      _raw: raw,
    });
    if (updated.error) throw updated.error;

    if (shouldSyncShopify && order.external_id) {
      try {
        const { applyShopifyOrderAction } = await import("@/server/shopifySync.server");
        await applyShopifyOrderAction({
          brandId: order.brand_id,
          externalOrderId: order.external_id,
          action: shopifyAction,
        });
      } catch (shopifyError) {
        const message = shopifyError instanceof Error ? shopifyError.message : String(shopifyError);
        await context.supabase
          .from("orders")
          .update({
            shopify_sync_status: "error",
            shopify_sync_error: message.slice(0, 500),
          })
          .eq("id", data.id);
        throw shopifyError;
      }

      const syncUpdate = await context.supabase
        .from("orders")
        .update({ shopify_sync_status: "synced", shopify_sync_error: null })
        .eq("id", data.id);
      if (syncUpdate.error) throw syncUpdate.error;
    }

    return {
      ok: true,
      shopifyAction,
      needsReturnReview: shopifyAction === "review_return",
    };
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
      .select(
        "id, brand_id, external_order_number, customer_name, customer_phone, customer_email, shipping_governorate, shipping_address, building_number, floor_number, apartment_number, courier_id, employee_id, fulfillment_status, financial_status, confirmation_status, shipping_amount, discount_amount, occurred_at, note, source",
      )
      .eq("id", data.id)
      .single();
    if (error) throw error;
    const { data: items } = await context.supabase
      .from("order_items")
      .select("product_id, title, qty, unit_price")
      .eq("order_id", data.id);
    return {
      ...order,
      items: (items ?? []) as Array<{
        product_id: string | null;
        title: string;
        qty: number;
        unit_price: number;
      }>,
    };
  });

// Trigger Shopify pull for one brand on demand (manager+ only)
export const runShopifySyncNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const { data: hasAccess } = await context.supabase.rpc("has_brand_access", {
      _user_id: context.userId,
      _brand_id: data.brandId,
    });
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
    const results: Array<{
      brand_id: string;
      ok: boolean;
      upserted?: number;
      fetched?: number;
      error?: string;
    }> = [];
    for (const r of (rows ?? []) as Array<{ brand_id: string }>) {
      try {
        const res = await syncShopifyOrdersForBrand(r.brand_id, { sinceISO, paginate: true });
        results.push({
          brand_id: r.brand_id,
          ok: true,
          upserted: res.upserted,
          fetched: res.fetched,
        });
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
  .inputValidator(
    (d: { brandId?: string | null; fromISO: string; toISO: string; deleteOutside?: boolean }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const { syncShopifyOrdersForBrand } = await import("@/server/shopifySync.server");
    let brands: Array<{ brand_id: string }> = [];
    if (data.brandId) {
      const { data: ok } = await context.supabase.rpc("has_brand_access", {
        _user_id: context.userId,
        _brand_id: data.brandId,
      });
      if (!ok) throw new Error("Forbidden: brand access denied");
      brands = [{ brand_id: data.brandId }];
    } else {
      const { data: rows, error } = await context.supabase
        .from("brand_integrations")
        .select("brand_id")
        .eq("provider", "shopify")
        .eq("status", "connected");
      if (error) throw error;
      brands = (rows ?? []) as Array<{ brand_id: string }>;
    }
    const results: Array<{
      brand_id: string;
      ok: boolean;
      upserted?: number;
      fetched?: number;
      error?: string;
    }> = [];
    for (const r of brands) {
      try {
        const res = await syncShopifyOrdersForBrand(r.brand_id, {
          sinceISO: data.fromISO,
          untilISO: data.toISO,
          paginate: true,
          deleteBeforeISO: data.deleteOutside ? data.fromISO : undefined,
          deleteAfterISO: data.deleteOutside ? data.toISO : undefined,
        });
        results.push({
          brand_id: r.brand_id,
          ok: true,
          upserted: res.upserted,
          fetched: res.fetched,
        });
      } catch (e) {
        results.push({ brand_id: r.brand_id, ok: false, error: (e as Error).message });
      }
    }
    const upserted = results.reduce((s, x) => s + (x.upserted ?? 0), 0);
    const fetched = results.reduce((s, x) => s + (x.fetched ?? 0), 0);
    return { ok: true, upserted, fetched, brands: results.length, results };
  });
