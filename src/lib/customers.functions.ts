import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "./paginate";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

async function assertWriter(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (data) return;
  const { data: m } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "manager" });
  if (m) return;
  const { data: d } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "data_entry" });
  if (d) return;
  throw new Error("Forbidden");
}

type InvoiceRow = {
  id: string;
  brand_id: string;
  type: "sale" | "return";
  total_amount: number | string;
  occurred_at: string;
  customer_id: string | null;
};

export type CustomerListRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  governorate: string | null;
  isGeneral: boolean;
  assignedBrandIds: string[];
  ltv: number;
  orders: number;
  avgOrder: number;
  lastOrderAt: string | null;
  firstOrderAt: string | null;
  brandCount: number;
  brandIds: string[];
  segment: "vip" | "active" | "at_risk" | "new";
};

function segmentOf(orders: number, ltv: number, lastOrderAt: string | null, firstOrderAt: string | null): CustomerListRow["segment"] {
  const now = Date.now();
  const daysSinceLast = lastOrderAt ? (now - new Date(lastOrderAt).getTime()) / 86400000 : Infinity;
  const daysSinceFirst = firstOrderAt ? (now - new Date(firstOrderAt).getTime()) / 86400000 : 0;
  if (ltv >= 10000 || orders >= 5) return daysSinceLast > 120 ? "at_risk" : "vip";
  if (daysSinceLast > 90) return "at_risk";
  if (daysSinceFirst <= 30 && orders <= 1) return "new";
  return "active";
}

export const listCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [customers, invoices, assignments] = await Promise.all([
      fetchAllRows<{ id: string; name: string; phone: string | null; email: string | null; governorate: string | null; is_general: boolean; first_seen_at: string; last_seen_at: string | null }>(() =>
        context.supabase.from("customers").select("id, name, phone, email, governorate, is_general, first_seen_at, last_seen_at").order("last_seen_at", { ascending: false, nullsFirst: false })),
      fetchAllRows<InvoiceRow>(() =>
        context.supabase.from("sales_invoices").select("id, brand_id, type, total_amount, occurred_at, customer_id").not("customer_id", "is", null)),
      fetchAllRows<{ customer_id: string; brand_id: string }>(() =>
        context.supabase.from("customer_brands").select("customer_id, brand_id")),
    ]);
    const invByCustomer = new Map<string, InvoiceRow[]>();
    for (const inv of invoices) {
      if (!inv.customer_id) continue;
      const list = invByCustomer.get(inv.customer_id) ?? [];
      list.push(inv);
      invByCustomer.set(inv.customer_id, list);
    }
    const assignByCustomer = new Map<string, string[]>();
    for (const a of assignments) {
      const list = assignByCustomer.get(a.customer_id) ?? [];
      list.push(a.brand_id);
      assignByCustomer.set(a.customer_id, list);
    }
    const rows: CustomerListRow[] = customers.map((c) => {
      const invs = invByCustomer.get(c.id) ?? [];
      let ltv = 0, orders = 0;
      const brandIds = new Set<string>();
      let last: string | null = null; let first: string | null = null;
      for (const inv of invs) {
        const amt = Number(inv.total_amount) || 0;
        if (inv.type === "sale") { ltv += amt; orders += 1; }
        else ltv -= amt;
        brandIds.add(inv.brand_id);
        if (!last || inv.occurred_at > last) last = inv.occurred_at;
        if (!first || inv.occurred_at < first) first = inv.occurred_at;
      }
      const lastOrderAt = last ?? c.last_seen_at;
      const firstOrderAt = first ?? c.first_seen_at;
      const assigned = assignByCustomer.get(c.id) ?? [];
      for (const bid of assigned) brandIds.add(bid);
      return {
        id: c.id, name: c.name, phone: c.phone, email: c.email,
        governorate: c.governorate, isGeneral: c.is_general,
        assignedBrandIds: assigned,
        ltv, orders,
        avgOrder: orders > 0 ? ltv / orders : 0,
        lastOrderAt, firstOrderAt,
        brandCount: brandIds.size,
        brandIds: Array.from(brandIds),
        segment: segmentOf(orders, ltv, lastOrderAt, firstOrderAt),
      };
    });
    return rows;
  });

export const createCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    name: string;
    phone?: string | null;
    email?: string | null;
    governorate?: string | null;
    isGeneral?: boolean;
    brandIds?: string[];
  }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    const name = data.name?.trim();
    if (!name) throw new Error("Name required");
    const phone = data.phone?.trim() || null;
    const email = data.email?.trim() || null;
    const pnorm = phone ? phone.replace(/\D/g, "") : "";
    const enorm = email ? email.toLowerCase() : "";
    // Try to find existing by phone/email
    let existingId: string | null = null;
    if (pnorm) {
      const { data: hit } = await context.supabase.from("customers").select("id").eq("phone_norm", pnorm).maybeSingle();
      if (hit?.id) existingId = hit.id;
    }
    if (!existingId && enorm) {
      const { data: hit } = await context.supabase.from("customers").select("id").eq("email_norm", enorm).maybeSingle();
      if (hit?.id) existingId = hit.id;
    }
    let customerId: string;
    if (existingId) {
      const { error } = await context.supabase.from("customers").update({
        name, phone, email,
        governorate: data.governorate?.trim() || null,
        is_general: !!data.isGeneral,
      }).eq("id", existingId);
      if (error) throw error;
      customerId = existingId;
    } else {
      const { data: inserted, error } = await context.supabase.from("customers").insert({
        name, phone, email,
        governorate: data.governorate?.trim() || null,
        is_general: !!data.isGeneral,
      }).select("id").single();
      if (error) throw error;
      customerId = inserted.id;
    }
    // Reset brand assignments
    await context.supabase.from("customer_brands").delete().eq("customer_id", customerId);
    const brandIds = (data.brandIds ?? []).filter((x) => !!x);
    if (brandIds.length > 0) {
      const rows = brandIds.map((brand_id) => ({ customer_id: customerId, brand_id }));
      const { error } = await context.supabase.from("customer_brands").insert(rows);
      if (error) throw error;
    }
    return { ok: true, id: customerId };
  });

export const getCustomersSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [customers, invoices] = await Promise.all([
      fetchAllRows<{ id: string; name: string; first_seen_at: string; last_seen_at: string | null }>(() =>
        context.supabase.from("customers").select("id, name, first_seen_at, last_seen_at")),
      fetchAllRows<{ customer_id: string; type: "sale"|"return"; total_amount: number; occurred_at: string }>(() =>
        context.supabase.from("sales_invoices").select("customer_id, type, total_amount, occurred_at").not("customer_id", "is", null)),
    ]);
    type Agg = { id: string; name: string; ltv: number; orders: number; lastOrderAt: string | null; firstOrderAt: string | null };
    const map = new Map<string, Agg>();
    for (const c of customers) {
      map.set(c.id, { id: c.id, name: c.name, ltv: 0, orders: 0, lastOrderAt: c.last_seen_at, firstOrderAt: c.first_seen_at });
    }
    for (const inv of invoices) {
      const a = map.get(inv.customer_id);
      if (!a) continue;
      const amt = Number(inv.total_amount) || 0;
      if (inv.type === "sale") { a.ltv += amt; a.orders += 1; }
      else a.ltv -= amt;
      if (!a.lastOrderAt || inv.occurred_at > a.lastOrderAt) a.lastOrderAt = inv.occurred_at;
      if (!a.firstOrderAt || inv.occurred_at < a.firstOrderAt) a.firstOrderAt = inv.occurred_at;
    }
    const rows = Array.from(map.values());
    const total = rows.length;
    const ltvSum = rows.reduce((s, r) => s + r.ltv, 0);
    const repeat = rows.filter((r) => r.orders >= 2).length;
    const now = Date.now();
    const atRisk = rows.filter((r) => r.lastOrderAt && (now - new Date(r.lastOrderAt).getTime()) / 86400000 > 90).length;
    const top = rows.sort((a, b) => b.ltv - a.ltv).slice(0, 5).map((r) => ({ id: r.id, name: r.name, ltv: r.ltv, orders: r.orders }));
    return {
      total,
      avgLtv: total > 0 ? ltvSum / total : 0,
      repeatRate: total > 0 ? repeat / total : 0,
      atRisk,
      top,
    };
  });

export const getCustomerProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const [customerR, invoicesR, ordersR, notesR, brandsR] = await Promise.all([
      context.supabase.from("customers").select("*").eq("id", data.id).maybeSingle(),
      context.supabase.from("sales_invoices").select("id, brand_id, type, total_amount, collected_amount, qty, occurred_at, note").eq("customer_id", data.id).order("occurred_at", { ascending: false }),
      context.supabase.from("orders").select("id, brand_id, source, external_order_number, financial_status, fulfillment_status, total_amount, occurred_at").eq("customer_id", data.id).order("occurred_at", { ascending: false }),
      context.supabase.from("customer_notes").select("id, author_id, body, created_at").eq("customer_id", data.id).order("created_at", { ascending: false }),
      context.supabase.from("brands").select("id, name"),
    ]);
    if (customerR.error) throw customerR.error;
    if (!customerR.data) throw new Error("Customer not found");
    const invoices = (invoicesR.data ?? []) as Array<{ id: string; brand_id: string; type: "sale"|"return"; total_amount: number; collected_amount: number; qty: number; occurred_at: string; note: string | null }>;
    const orders = (ordersR.data ?? []) as Array<{ id: string; brand_id: string; source: string; external_order_number: string | null; financial_status: string; fulfillment_status: string; total_amount: number; occurred_at: string }>;
    const brands = (brandsR.data ?? []) as Array<{ id: string; name: string }>;
    const brandName = new Map(brands.map((b) => [b.id, b.name]));
    let ltv = 0, orderCount = 0;
    const brandSpend = new Map<string, number>();
    let last: string | null = null; let firstO: string | null = null;
    for (const inv of invoices) {
      const amt = Number(inv.total_amount) || 0;
      if (inv.type === "sale") { ltv += amt; orderCount += 1; }
      else ltv -= amt;
      brandSpend.set(inv.brand_id, (brandSpend.get(inv.brand_id) ?? 0) + (inv.type === "sale" ? amt : -amt));
      if (!last || inv.occurred_at > last) last = inv.occurred_at;
      if (!firstO || inv.occurred_at < firstO) firstO = inv.occurred_at;
    }
    const brandDistribution = Array.from(brandSpend.entries())
      .map(([id, spend]) => ({ brandId: id, name: brandName.get(id) ?? "—", spend, pct: ltv > 0 ? spend / ltv : 0 }))
      .sort((a, b) => b.spend - a.spend);
    type HistoryItem = {
      kind: "order" | "payment" | "refund";
      id: string;
      date: string;
      brandId: string;
      brandName: string;
      amount: number;
      label: string;
      detail: string;
      source: string;
    };
    const history: HistoryItem[] = [];
    for (const inv of invoices) {
      const bn = brandName.get(inv.brand_id) ?? "—";
      const amt = Number(inv.total_amount) || 0;
      const collected = Number(inv.collected_amount) || 0;
      if (inv.type === "sale") {
        history.push({ kind: "order", id: `inv-${inv.id}`, date: inv.occurred_at, brandId: inv.brand_id, brandName: bn, amount: amt, label: `Invoice #${inv.id.slice(0, 8)}`, detail: `${inv.qty} ${inv.qty === 1 ? "item" : "items"}${inv.note ? ` · ${inv.note}` : ""}`, source: "invoice" });
        if (collected > 0) history.push({ kind: "payment", id: `pay-${inv.id}`, date: inv.occurred_at, brandId: inv.brand_id, brandName: bn, amount: collected, label: `Payment on #${inv.id.slice(0, 8)}`, detail: collected >= amt ? "Paid in full" : `Partial (${((collected / amt) * 100).toFixed(0)}%)`, source: "invoice" });
      } else {
        history.push({ kind: "refund", id: `ref-${inv.id}`, date: inv.occurred_at, brandId: inv.brand_id, brandName: bn, amount: amt, label: `Return #${inv.id.slice(0, 8)}`, detail: inv.note ?? "Return", source: "invoice" });
      }
    }
    for (const o of orders) {
      const bn = brandName.get(o.brand_id) ?? "—";
      const amt = Number(o.total_amount) || 0;
      const ref = o.external_order_number ?? o.id.slice(0, 8);
      const isRefund = o.fulfillment_status === "returned" || o.financial_status === "refunded";
      if (isRefund) {
        history.push({ kind: "refund", id: `ord-${o.id}`, date: o.occurred_at, brandId: o.brand_id, brandName: bn, amount: amt, label: `Refund · ${ref}`, detail: `${o.source} · ${o.financial_status}`, source: o.source });
      } else {
        history.push({ kind: "order", id: `ord-${o.id}`, date: o.occurred_at, brandId: o.brand_id, brandName: bn, amount: amt, label: `Order · ${ref}`, detail: `${o.source} · ${o.fulfillment_status}`, source: o.source });
        if (o.financial_status === "paid") {
          history.push({ kind: "payment", id: `ordpay-${o.id}`, date: o.occurred_at, brandId: o.brand_id, brandName: bn, amount: amt, label: `Payment · ${ref}`, detail: `${o.source} · paid`, source: o.source });
        }
      }
    }
    history.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return {
      customer: customerR.data,
      metrics: {
        ltv, orders: orderCount,
        avgOrder: orderCount > 0 ? ltv / orderCount : 0,
        lastOrderAt: last, firstOrderAt: firstO,
        segment: segmentOf(orderCount, ltv, last, firstO),
      },
      invoices: invoices.map((i) => ({ ...i, brandName: brandName.get(i.brand_id) ?? "—" })),
      notes: notesR.data ?? [],
      brandDistribution,
      history,
    };
  });

export const addCustomerNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerId: string; body: string }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    const body = data.body.trim();
    if (!body) throw new Error("Empty note");
    const { error } = await context.supabase.from("customer_notes").insert({
      customer_id: data.customerId,
      author_id: context.userId,
      body,
    });
    if (error) throw error;
    return { ok: true };
  });

export const deleteCustomerNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    const { error } = await context.supabase.from("customer_notes").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const updateCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id: string;
    name?: string;
    phone?: string | null;
    email?: string | null;
    governorate?: string | null;
    isGeneral?: boolean;
    tags?: string[];
    brandIds?: string[];
  }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {};
    if (data.name !== undefined) payload.name = data.name.trim();
    if (data.phone !== undefined) payload.phone = data.phone?.trim() || null;
    if (data.email !== undefined) payload.email = data.email?.trim() || null;
    if (data.governorate !== undefined) payload.governorate = data.governorate?.trim() || null;
    if (data.isGeneral !== undefined) payload.is_general = !!data.isGeneral;
    if (data.tags !== undefined) payload.tags = data.tags;
    if (Object.keys(payload).length > 0) {
      const { error } = await context.supabase.from("customers").update(payload).eq("id", data.id);
      if (error) throw error;
    }
    if (data.brandIds) {
      await context.supabase.from("customer_brands").delete().eq("customer_id", data.id);
      if (data.brandIds.length > 0) {
        const rows = data.brandIds.map((brand_id) => ({ customer_id: data.id, brand_id }));
        const { error } = await context.supabase.from("customer_brands").insert(rows);
        if (error) throw error;
      }
    }
    return { ok: true };
  });

export const deleteCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    // manager+ only
    for (const role of ["admin", "manager"] as const) {
      const { data: r } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: role });
      if (r) {
        const { error } = await context.supabase.from("customers").delete().eq("id", data.id);
        if (error) throw error;
        return { ok: true };
      }
    }
    throw new Error("Forbidden");
  });