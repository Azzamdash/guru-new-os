import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getCogsMap } from "./cogs.server";
import { fetchAllRows } from "./paginate";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

export const STAGES = ["new", "processing", "packing", "ready_to_ship", "with_courier", "delivered", "cancelled"] as const;
export type Stage = (typeof STAGES)[number];

// SLA in hours per stage (null = terminal)
export const STAGE_SLA_HOURS: Record<Stage, number | null> = {
  new: 0.5,
  processing: 3,
  packing: 2,
  ready_to_ship: 6,
  with_courier: 24,
  delivered: null,
  cancelled: null,
};

async function assertWriter(ctx: Ctx) {
  for (const r of ["admin", "manager", "data_entry"] as const) {
    const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: r });
    if (data) return;
  }
  throw new Error("Forbidden");
}

type InvRow = {
  id: string; brand_id: string; stage: Stage; stage_updated_at: string;
  customer_name: string | null; total_amount: number; prep_assignee_id: string | null;
  occurred_at: string; type: "sale" | "return";
};

type ProductRow = {
  id: string; name: string; unit: string; brand_id: string;
  reorder_point: number; lead_time_days: number;
};

type MoveRow = { product_id: string; type: string; qty: number };
type ItemRow = { product_id: string; qty: number; sales_invoices: { occurred_at: string; type: "sale"|"return" } | null };
type PurchaseRow = { product_id: string | null; qty: number; unit_cost: number };

export const getOperationsSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string | null } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const brandId = data.brandId ?? null;
    const nowIso = new Date().toISOString();
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    const activeInvoices = await fetchAllRows<InvRow>(() => {
      let q = context.supabase.from("sales_invoices")
        .select("id, brand_id, stage, stage_updated_at, customer_name, total_amount, occurred_at, type, prep_assignee_id")
        .eq("type", "sale")
        .neq("stage", "delivered")
        .neq("stage", "cancelled")
        .order("stage_updated_at", { ascending: true });
      if (brandId) q = q.eq("brand_id", brandId);
      return q;
    });

    let prodQ = context.supabase.from("products").select("id, name, unit, brand_id, reorder_point, lead_time_days, sell_price, cogs_override, cogs_percent").eq("active", true);
    if (brandId) prodQ = prodQ.eq("brand_id", brandId);
    const prodR = await prodQ;
    if (prodR.error) throw prodR.error;
    const products = (prodR.data ?? []) as (ProductRow & { sell_price: number; cogs_override: number | null; cogs_percent: number | null })[];
    const productIds = products.map((p) => p.id);

    const [movesR, itemsR, brandsR, purchR] = await Promise.all([
      productIds.length
        ? context.supabase.from("inventory_movements").select("product_id, type, qty").in("product_id", productIds)
        : Promise.resolve({ data: [], error: null }),
      productIds.length
        ? context.supabase.from("sales_invoice_items")
            .select("product_id, qty, sales_invoices!inner(occurred_at, type)")
            .in("product_id", productIds)
            .gte("sales_invoices.occurred_at", cutoff)
        : Promise.resolve({ data: [], error: null }),
      context.supabase.from("brands").select("id, name, cogs_percent_default"),
      productIds.length
        ? context.supabase.from("supplier_invoice_items")
            .select("product_id, qty, unit_cost").eq("kind", "product").in("product_id", productIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (movesR.error) throw movesR.error;
    if (itemsR.error) throw itemsR.error;
    if (purchR.error) throw purchR.error;

    const brandsList = (brandsR.data ?? []) as Array<{ id: string; name: string; cogs_percent_default: number | null }>;
    const brandName = new Map<string, string>(brandsList.map((b) => [b.id, b.name]));
    const brandDefaultCogs = new Map<string, number | null>(brandsList.map((b) => [b.id, b.cogs_percent_default]));

    // Stock per product = sum(in) - sum(out) - sum(sold)
    const stockByProduct = new Map<string, number>();
    for (const m of (movesR.data ?? []) as MoveRow[]) {
      const q = Number(m.qty) || 0;
      const sign = m.type === "in" ? 1 : -1;
      stockByProduct.set(m.product_id, (stockByProduct.get(m.product_id) ?? 0) + sign * q);
    }
    // Purchases (supplier invoices, kind=product) also increment stock
    for (const p of (purchR.data ?? []) as PurchaseRow[]) {
      if (!p.product_id) continue;
      const q = Number(p.qty) || 0;
      stockByProduct.set(p.product_id, (stockByProduct.get(p.product_id) ?? 0) + q);
    }
    // Daily sales rate over last 30 days (sales - returns)
    const soldByProduct = new Map<string, number>();
    for (const it of (itemsR.data ?? []) as ItemRow[]) {
      if (!it.sales_invoices) continue;
      const q = Number(it.qty) || 0;
      const sign = it.sales_invoices.type === "return" ? -1 : 1;
      soldByProduct.set(it.product_id, (soldByProduct.get(it.product_id) ?? 0) + sign * q);
      // also subtract from stock: sales reduce inventory
      if (sign === 1) stockByProduct.set(it.product_id, (stockByProduct.get(it.product_id) ?? 0) - q);
    }

    // Latest purchase unit cost per product (fallback for valuation)
    const lastCostByProduct = new Map<string, number>();
    for (const p of (purchR.data ?? []) as PurchaseRow[]) {
      if (!p.product_id) continue;
      lastCostByProduct.set(p.product_id, Number(p.unit_cost) || 0);
    }
    const productCogsMap = await getCogsMap(context.supabase, productIds);
    const unitCost = (p: typeof products[number]) => productCogsMap.get(p.id) ?? lastCostByProduct.get(p.id) ?? 0;

    const inventory = products.map((p) => {
      const stock = stockByProduct.get(p.id) ?? 0;
      const sold30 = Math.max(0, soldByProduct.get(p.id) ?? 0);
      const dailyRate = sold30 / 30;
      const daysToEmpty = dailyRate > 0 ? stock / dailyRate : null;
      const dynamicReorder = Math.max(Number(p.reorder_point) || 0, Math.ceil(dailyRate * (Number(p.lead_time_days) || 0)));
      let status: "ok" | "low" | "critical" | "out" = "ok";
      if (stock <= 0) status = "out";
      else if (daysToEmpty !== null && daysToEmpty <= 3) status = "critical";
      else if (stock <= dynamicReorder || (daysToEmpty !== null && daysToEmpty <= 7)) status = "low";
      const cost = unitCost(p);
      return {
        id: p.id, name: p.name, unit: p.unit,
        brandId: p.brand_id, brandName: brandName.get(p.brand_id) ?? "—",
        stock, dailyRate, daysToEmpty, reorderPoint: dynamicReorder, leadTimeDays: p.lead_time_days,
        status, unitCost: cost, stockValue: Math.max(0, stock) * cost,
      };
    }).sort((a, b) => {
      const rank = { out: 0, critical: 1, low: 2, ok: 3 } as const;
      return rank[a.status] - rank[b.status];
    });

    // Per-brand inventory summary (units + total cost value)
    const brandSummaryMap = new Map<string, { brandId: string; brandName: string; skuCount: number; totalUnits: number; totalValue: number; belowReorder: number }>();
    for (const p of inventory) {
      const cur = brandSummaryMap.get(p.brandId) ?? { brandId: p.brandId, brandName: p.brandName, skuCount: 0, totalUnits: 0, totalValue: 0, belowReorder: 0 };
      cur.skuCount += 1;
      cur.totalUnits += Math.max(0, p.stock);
      cur.totalValue += p.stockValue;
      if (p.status !== "ok") cur.belowReorder += 1;
      brandSummaryMap.set(p.brandId, cur);
    }
    const brandInventory = Array.from(brandSummaryMap.values()).sort((a, b) => b.totalValue - a.totalValue);
    const totalStockValue = brandInventory.reduce((a, b) => a + b.totalValue, 0);
    const totalUnits = brandInventory.reduce((a, b) => a + b.totalUnits, 0);

    // Pipeline
    const pipeline = STAGES.filter((s) => s !== "delivered" && s !== "cancelled").map((stage) => {
      const items = activeInvoices.filter((i) => i.stage === stage);
      const sla = STAGE_SLA_HOURS[stage];
      return {
        stage,
        slaHours: sla,
        count: items.length,
        breached: sla !== null ? items.filter((i) => (Date.now() - new Date(i.stage_updated_at).getTime()) / 3600000 > sla).length : 0,
        items: items.slice(0, 6).map((i) => {
          const hoursIn = (Date.now() - new Date(i.stage_updated_at).getTime()) / 3600000;
          return {
            id: i.id,
            code: `#${i.id.slice(0, 4).toUpperCase()}`,
            customer: i.customer_name,
            brandName: brandName.get(i.brand_id) ?? "—",
            amount: Number(i.total_amount) || 0,
            hoursIn,
            breached: sla !== null && hoursIn > sla,
            prepAssigneeId: i.prep_assignee_id,
          };
        }),
      };
    });

    // Alerts feed
    const alerts: Array<{ kind: "sla"|"stock"; severity: "warn"|"danger"; message: string; when: string }> = [];
    for (const inv of activeInvoices) {
      const sla = STAGE_SLA_HOURS[inv.stage];
      if (sla === null) continue;
      const hoursIn = (Date.now() - new Date(inv.stage_updated_at).getTime()) / 3600000;
      if (hoursIn > sla) {
        alerts.push({
          kind: "sla",
          severity: hoursIn > sla * 2 ? "danger" : "warn",
          message: `#${inv.id.slice(0, 4).toUpperCase()} — ${Math.round(hoursIn - sla)}h over SLA at stage "${inv.stage}"`,
          when: inv.stage_updated_at,
        });
      }
    }
    for (const p of inventory) {
      if (p.status === "out") alerts.push({ kind: "stock", severity: "danger", message: `${p.name} — out of stock`, when: nowIso });
      else if (p.status === "critical") alerts.push({ kind: "stock", severity: "danger", message: `${p.name} — ${p.daysToEmpty?.toFixed(1)} days left`, when: nowIso });
      else if (p.status === "low") alerts.push({ kind: "stock", severity: "warn", message: `${p.name} — approaching reorder point`, when: nowIso });
    }
    alerts.sort((a, b) => (a.severity === b.severity ? b.when.localeCompare(a.when) : a.severity === "danger" ? -1 : 1));

    // KPIs
    const activeCount = activeInvoices.length;
    const breachedCount = activeInvoices.filter((i) => {
      const sla = STAGE_SLA_HOURS[i.stage];
      return sla !== null && (Date.now() - new Date(i.stage_updated_at).getTime()) / 3600000 > sla;
    }).length;
    const lowCount = inventory.filter((p) => p.status !== "ok").length;
    // average fulfillment lead time (from stage_updated_at of delivered invoices vs occurred_at) over last 30 days
    const recentDelivered = await fetchAllRows<{ occurred_at: string; stage_updated_at: string }>(() => context.supabase
      .from("sales_invoices")
      .select("occurred_at, stage_updated_at")
      .eq("stage", "delivered")
      .gte("occurred_at", cutoff));
    let avgLeadHours = 0;
    if (recentDelivered.length > 0) {
      const total = recentDelivered.reduce((sum, r) =>
        sum + Math.max(0, (new Date(r.stage_updated_at).getTime() - new Date(r.occurred_at).getTime()) / 3600000), 0);
      avgLeadHours = total / recentDelivered.length;
    }

    return {
      generatedAt: nowIso,
      kpis: { activeCount, breachedCount, lowCount, avgLeadHours, totalStockValue, totalUnits },
      pipeline,
      inventory: inventory.slice(0, 100),
      brandInventory,
      alerts: alerts.slice(0, 25),
    };
  });

/** Prep-staff performance: per assignee active/delivered/breached counts + avg lead time. */
export const getPrepStaffPerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string | null; dateFrom?: string | null; dateTo?: string | null } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    // Access: admin/manager/data_entry/accountant
    let allowed = false;
    for (const r of ["admin", "manager", "data_entry", "accountant"] as const) {
      const { data: ok } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: r });
      if (ok) { allowed = true; break; }
    }
    if (!allowed) throw new Error("Forbidden");

    const dateFrom = data.dateFrom ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const dateTo = data.dateTo ?? new Date().toISOString().slice(0, 10);

    const list = await fetchAllRows<{ id: string; prep_assignee_id: string; stage: Stage; stage_updated_at: string; occurred_at: string; brand_id: string; total_amount: number }>(() => {
      let q = context.supabase
        .from("sales_invoices")
        .select("id, prep_assignee_id, stage, stage_updated_at, occurred_at, brand_id, total_amount")
        .eq("type", "sale")
        .not("prep_assignee_id", "is", null)
        .gte("occurred_at", dateFrom)
        .lte("occurred_at", dateTo);
      if (data.brandId) q = q.eq("brand_id", data.brandId);
      return q;
    });
    type Row = { id: string; prep_assignee_id: string; stage: Stage; stage_updated_at: string; occurred_at: string; total_amount: number };

    type Agg = { assigneeId: string; total: number; handedOff: number; delivered: number; cancelled: number; active: number; breached: number; leadHoursSum: number; leadHoursCount: number; revenue: number };
    const map = new Map<string, Agg>();
    for (const r of list) {
      const cur = map.get(r.prep_assignee_id) ?? { assigneeId: r.prep_assignee_id, total: 0, handedOff: 0, delivered: 0, cancelled: 0, active: 0, breached: 0, leadHoursSum: 0, leadHoursCount: 0, revenue: 0 };
      cur.total += 1;
      cur.revenue += Number(r.total_amount) || 0;
      // Prep is considered "done" once the order is handed to the courier.
      if (r.stage === "with_courier" || r.stage === "delivered") {
        cur.handedOff += 1;
        if (r.stage === "delivered") cur.delivered += 1;
        const h = Math.max(0, (new Date(r.stage_updated_at).getTime() - new Date(r.occurred_at).getTime()) / 3600000);
        cur.leadHoursSum += h; cur.leadHoursCount += 1;
      } else if (r.stage === "cancelled") {
        cur.cancelled += 1;
      } else {
        cur.active += 1;
        const sla = STAGE_SLA_HOURS[r.stage];
        if (sla != null && (Date.now() - new Date(r.stage_updated_at).getTime()) / 3600000 > sla) cur.breached += 1;
      }
      map.set(r.prep_assignee_id, cur);
    }

    // Include every user with the order_prep role, even if no orders yet
    const { data: prepRoles } = await context.supabase
      .from("user_roles").select("user_id").eq("role", "order_prep");
    for (const pr of (prepRoles ?? []) as Array<{ user_id: string }>) {
      if (!map.has(pr.user_id)) {
        map.set(pr.user_id, { assigneeId: pr.user_id, total: 0, handedOff: 0, delivered: 0, cancelled: 0, active: 0, breached: 0, leadHoursSum: 0, leadHoursCount: 0, revenue: 0 });
      }
    }
    const prepStaffCount = (prepRoles ?? []).length;

    // Resolve emails via admin
    const ids = Array.from(map.keys());
    let emails = new Map<string, string>();
    if (ids.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: users } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
      emails = new Map((users?.users ?? []).filter((u) => ids.includes(u.id)).map((u) => [u.id, u.email ?? ""]));
    }

    const rowsOut = Array.from(map.values()).map((a) => ({
      assigneeId: a.assigneeId,
      email: emails.get(a.assigneeId) ?? a.assigneeId.slice(0, 8),
      total: a.total,
      handedOff: a.handedOff,
      delivered: a.delivered,
      cancelled: a.cancelled,
      active: a.active,
      breached: a.breached,
      revenue: a.revenue,
      deliveryRate: a.total > 0 ? a.handedOff / a.total : 0,
      avgLeadHours: a.leadHoursCount > 0 ? a.leadHoursSum / a.leadHoursCount : 0,
    })).sort((a, b) => b.handedOff - a.handedOff);

    return { rows: rowsOut, dateFrom, dateTo, prepStaffCount };
  });

export const updateInvoiceStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; stage: Stage }) => d)
  .handler(async ({ data, context }) => {
    // Writers can always advance; assigned order_prep can also advance their own
    let allowed = false;
    for (const r of ["admin", "manager", "data_entry"] as const) {
      const { data: ok } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: r });
      if (ok) { allowed = true; break; }
    }
    if (!allowed) {
      const { data: isPrep } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "order_prep" });
      if (isPrep) {
        const { data: inv } = await context.supabase
          .from("sales_invoices").select("prep_assignee_id").eq("id", data.id).single();
        if (inv?.prep_assignee_id === context.userId) allowed = true;
      }
    }
    if (!allowed) throw new Error("Forbidden");
    if (!STAGES.includes(data.stage)) throw new Error("Invalid stage");
    const { error } = await context.supabase.from("sales_invoices").update({ stage: data.stage }).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/** Assign an invoice's prep responsibility to a specific user (or clear it). Admin/manager only. */
export const assignInvoicePrep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; assigneeId: string | null }) => d)
  .handler(async ({ data, context }) => {
    const [adminR, mgrR] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "manager" }),
    ]);
    if (!adminR.data && !mgrR.data) throw new Error("Forbidden");
    const { error } = await context.supabase.from("sales_invoices")
      .update({ prep_assignee_id: data.assigneeId }).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/** Order-prep employee's personal pipeline: only invoices assigned to them. */
export const getMyPrepPipeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const nowIso = new Date().toISOString();
    const { data, error } = await context.supabase
      .from("sales_invoices")
      .select("id, brand_id, stage, stage_updated_at, customer_name, customer_phone, total_amount, occurred_at")
      .eq("prep_assignee_id", context.userId)
      .eq("type", "sale")
      .neq("stage", "delivered")
      .neq("stage", "cancelled")
      .order("stage_updated_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ id: string; brand_id: string; stage: Stage; stage_updated_at: string; customer_name: string | null; customer_phone: string | null; total_amount: number; occurred_at: string }>;
    const { data: bR } = await context.supabase.from("brands").select("id, name");
    const brandName = new Map<string, string>(((bR ?? []) as Array<{ id: string; name: string }>).map((b) => [b.id, b.name]));

    const pipeline = STAGES.filter((s) => s !== "delivered" && s !== "cancelled").map((stage) => {
      const items = rows.filter((r) => r.stage === stage);
      const sla = STAGE_SLA_HOURS[stage];
      return {
        stage,
        slaHours: sla,
        count: items.length,
        breached: sla !== null ? items.filter((i) => (Date.now() - new Date(i.stage_updated_at).getTime()) / 3600000 > sla).length : 0,
        items: items.map((i) => {
          const hoursIn = (Date.now() - new Date(i.stage_updated_at).getTime()) / 3600000;
          return {
            id: i.id,
            code: `#${i.id.slice(0, 4).toUpperCase()}`,
            customer: i.customer_name,
            customerPhone: i.customer_phone,
            brandName: brandName.get(i.brand_id) ?? "—",
            amount: Number(i.total_amount) || 0,
            hoursIn,
            breached: sla !== null && hoursIn > sla,
          };
        }),
      };
    });

    const kpis = {
      totalAssigned: rows.length,
      breachedCount: rows.filter((r) => {
        const sla = STAGE_SLA_HOURS[r.stage];
        return sla !== null && (Date.now() - new Date(r.stage_updated_at).getTime()) / 3600000 > sla;
      }).length,
    };

    return { generatedAt: nowIso, kpis, pipeline };
  });

/** Fetch a single invoice with items + product names, for the prep print slip.
 *  Access: writers, or the order_prep user this invoice is assigned to. */
export const getInvoiceForPrint = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    // authz
    let allowed = false;
    for (const r of ["admin", "manager", "data_entry"] as const) {
      const { data: ok } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: r });
      if (ok) { allowed = true; break; }
    }
    if (!allowed) {
      const { data: isPrep } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "order_prep" });
      if (isPrep) {
        const { data: chk } = await context.supabase
          .from("sales_invoices").select("prep_assignee_id").eq("id", data.id).single();
        if (chk?.prep_assignee_id === context.userId) allowed = true;
      }
    }
    if (!allowed) throw new Error("Forbidden");

    const { data: inv, error } = await context.supabase
      .from("sales_invoices")
      .select("id, brand_id, courier_id, occurred_at, stage, total_amount, collected_amount, note, customer_id, customer_name, customer_phone, customer_email, sales_invoice_items(product_id, qty, unit_price, subtotal)")
      .eq("id", data.id).maybeSingle();
    if (error) throw error;
    if (!inv) throw new Error("Not found");

    const [{ data: brand }, { data: courierRow }, custRes] = await Promise.all([
      context.supabase.from("brands").select("name").eq("id", inv.brand_id).maybeSingle(),
      inv.courier_id
        ? context.supabase.from("couriers").select("name").eq("id", inv.courier_id).maybeSingle()
        : Promise.resolve({ data: null }),
      inv.customer_id
        ? context.supabase.from("customers").select("governorate").eq("id", inv.customer_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const cust = (custRes as { data: { governorate: string | null } | null }).data;
    const items = (inv.sales_invoice_items ?? []) as Array<{ product_id: string; qty: number; unit_price: number; subtotal: number }>;
    const pids = items.map((i) => i.product_id).filter(Boolean);
    const { data: prods } = pids.length
      ? await context.supabase.from("products").select("id, name, sku, unit").in("id", pids)
      : { data: [] as Array<{ id: string; name: string; sku: string | null; unit: string | null }> };
    const pMap = new Map<string, { name: string; sku: string | null; unit: string | null }>();
    for (const p of (prods ?? []) as Array<{ id: string; name: string; sku: string | null; unit: string | null }>) {
      pMap.set(p.id, { name: p.name, sku: p.sku, unit: p.unit });
    }

    return {
      id: inv.id as string,
      code: `#${(inv.id as string).slice(0, 6).toUpperCase()}`,
      brandName: (brand?.name as string) ?? "—",
      courierName: (courierRow?.name as string | undefined) ?? null,
      occurredAt: inv.occurred_at as string,
      stage: inv.stage as Stage,
      customer: {
        name: inv.customer_name as string | null,
        phone: inv.customer_phone as string | null,
        email: inv.customer_email as string | null,
        governorate: cust?.governorate ?? null,
        address: null as string | null,
      },
      totals: {
        total: Number(inv.total_amount) || 0,
        collected: Number(inv.collected_amount) || 0,
      },
      note: (inv.note as string | null) ?? null,
      items: items.map((i) => ({
        productId: i.product_id,
        name: pMap.get(i.product_id)?.name ?? i.product_id,
        sku: pMap.get(i.product_id)?.sku ?? null,
        unit: pMap.get(i.product_id)?.unit ?? null,
        qty: Number(i.qty) || 0,
        unitPrice: Number(i.unit_price) || 0,
        subtotal: Number(i.subtotal) || 0,
      })),
    };
  });