import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getCogsMap } from "@/lib/cogs.server";
import { fetchAllRows } from "@/lib/paginate";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

async function hasAnyRole(context: Ctx, roles: string[]) {
  const results = await Promise.all(
    roles.map((r) => context.supabase.rpc("has_role", { _user_id: context.userId, _role: r })),
  );
  return results.some((r) => !r.error && r.data === true);
}
async function assertAdmin(context: Ctx) {
  if (!(await hasAnyRole(context, ["admin"]))) throw new Error("Forbidden: admin only");
}
async function assertManager(context: Ctx) {
  if (!(await hasAnyRole(context, ["admin", "manager"]))) throw new Error("Forbidden: manager only");
}
async function assertCatalog(context: Ctx) {
  if (!(await hasAnyRole(context, ["admin", "manager", "accountant"]))) throw new Error("Forbidden");
}
async function assertWriter(context: Ctx) {
  if (!(await hasAnyRole(context, ["admin", "manager", "data_entry", "accountant"]))) throw new Error("Forbidden");
}

// ============ BRANDS ============
export const listBrands = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("brands").select("*").order("sort_order").order("name");
    if (error) throw error;
    return data as Array<{ id: string; name: string; slug: string; type: "product" | "service" | "offline_branch"; active: boolean; sort_order: number; cogs_percent_default: number | null }>;
  });

export const upsertBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; name: string; slug: string; type: "product" | "service" | "offline_branch"; active: boolean; sort_order: number; cogs_percent_default?: number | null }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const { error } = await context.supabase.from("brands").upsert(data);
    if (error) throw error;
    return { ok: true };
  });

export const deleteBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("brands").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ============ EXPENSE CATEGORIES ============
export const listCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("expense_categories").select("*").order("sort_order").order("name");
    if (error) throw error;
    return data as Array<{ id: string; name: string; slug: string; active: boolean; sort_order: number }>;
  });

export const upsertCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; name: string; slug: string; active: boolean; sort_order: number }) => d)
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { error } = await context.supabase.from("expense_categories").upsert(data);
    if (error) throw error;
    return { ok: true };
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { error } = await context.supabase.from("expense_categories").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ============ SUPPLIERS ============
export const listSuppliers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("suppliers").select("*").order("name");
    if (error) throw error;
    const { data: links } = await context.supabase.from("supplier_brands").select("supplier_id, brand_id");
    const byId = new Map<string, string[]>();
    for (const l of (links ?? []) as Array<{ supplier_id: string; brand_id: string }>) {
      const arr = byId.get(l.supplier_id) ?? [];
      arr.push(l.brand_id);
      byId.set(l.supplier_id, arr);
    }
    return (data as Array<{ id: string; name: string; contact: string | null; notes: string | null; active: boolean; brand_id: string | null; opening_balance: number }>).map((s) => ({
      ...s,
      brand_ids: byId.get(s.id) ?? (s.brand_id ? [s.brand_id] : []),
    }));
  });

export const upsertSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; name: string; contact?: string | null; notes?: string | null; active: boolean; brand_id?: string | null; brand_ids?: string[]; opening_balance?: number }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    const brandIds = (data.brand_ids ?? []).filter(Boolean);
    const primary = brandIds[0] ?? data.brand_id ?? null;
    const { brand_ids: _ignored, ...rest } = data;
    const { data: saved, error } = await context.supabase
      .from("suppliers")
      .upsert({ ...rest, brand_id: primary })
      .select("id")
      .single();
    if (error) throw error;
    const supplierId = saved.id as string;
    // sync junction
    await context.supabase.from("supplier_brands").delete().eq("supplier_id", supplierId);
    if (brandIds.length > 0) {
      const { error: e2 } = await context.supabase
        .from("supplier_brands")
        .insert(brandIds.map((brand_id) => ({ supplier_id: supplierId, brand_id })));
      if (e2) throw e2;
    }
    return { ok: true };
  });

export const deleteSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("suppliers").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });


// ============ MONTHLY / PERIODIC ENTRIES ============
export const getMonthlyEntry = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; year: number; month: number; period_type?: "daily"|"weekly"|"monthly"|"yearly"|"custom"; period_date?: string | null; period_end_date?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const period = data.period_type ?? "monthly";
    let q = context.supabase.from("monthly_entries").select("*")
      .eq("brand_id", data.brandId).eq("year", data.year).eq("period_type", period);
    if (period === "monthly") q = q.eq("month", data.month);
    if ((period === "daily" || period === "weekly") && data.period_date) q = q.eq("period_date", data.period_date);
    if (period === "custom" && data.period_date && data.period_end_date) {
      q = q.eq("period_date", data.period_date).eq("period_end_date", data.period_end_date);
    }
    const { data: rows, error } = await q.limit(1);
    if (error) throw error;
    return (rows?.[0]) ?? null;
  });

export const upsertMonthlyEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    brand_id: string; year: number; month: number;
    period_type: "daily"|"weekly"|"monthly"|"yearly"|"custom"; period_date?: string | null; period_end_date?: string | null;
    revenue: number; cash_position: number;
    orders_total: number; orders_confirmed: number; orders_delivered: number; orders_returned: number;
    service_clients: number; service_projects: number;
    note?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    let q = context.supabase.from("monthly_entries").select("id")
      .eq("brand_id", data.brand_id).eq("year", data.year).eq("period_type", data.period_type);
    if (data.period_type === "monthly") q = q.eq("month", data.month);
    if ((data.period_type === "daily" || data.period_type === "weekly") && data.period_date) q = q.eq("period_date", data.period_date);
    if (data.period_type === "custom" && data.period_date && data.period_end_date) {
      q = q.eq("period_date", data.period_date).eq("period_end_date", data.period_end_date);
    }
    const { data: existing, error: fErr } = await q.limit(1);
    if (fErr) throw fErr;
    const payload = { ...data, period_date: data.period_date ?? null, period_end_date: data.period_end_date ?? null };
    if (existing?.[0]?.id) {
      const { error } = await context.supabase.from("monthly_entries").update(payload).eq("id", existing[0].id);
      if (error) throw error;
    } else {
      const { error } = await context.supabase.from("monthly_entries").insert(payload);
      if (error) throw error;
    }
    return { ok: true };
  });

// Expense entries for a brand+year+month
export const listExpenseEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string | null; year?: number | null; month?: number | null; date_from?: string | null; date_to?: string | null }) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("expense_entries")
      .select("id, brand_id, category_id, year, month, amount, note, platform, attributed_revenue, period_type, period_date, period_end_date, created_at")
      .order("created_at", { ascending: false });
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    if (data.date_from && data.date_to) {
      const from = data.date_from; const to = data.date_to;
      q = q.or(`and(period_date.gte.${from},period_date.lte.${to}),and(period_date.is.null,year.eq.${new Date(from).getFullYear()})`);
    } else {
      if (data.year != null) q = q.eq("year", data.year);
      if (data.month != null) q = q.eq("month", data.month);
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows as Array<{ id: string; brand_id: string; category_id: string; year: number; month: number; amount: number; note: string | null; platform: string | null; attributed_revenue: number; period_type: string; period_date: string | null; period_end_date: string | null }>;
  });

export const upsertExpenseEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; brand_id: string; category_id: string; year: number; month: number; amount: number; note?: string | null; platform?: "tiktok"|"meta"|"google"|"snapchat"|"whatsapp"|"sms"|"influencer"|"ugc"|"media_production"|"other"|null; attributed_revenue?: number; period_type?: "daily"|"weekly"|"monthly"|"yearly"|"custom"; period_date?: string | null; period_end_date?: string | null }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    const { id, ...rest } = data;
    const payload = { period_type: "monthly", ...rest };
    if (id) {
      const { error } = await context.supabase.from("expense_entries").update(payload).eq("id", id);
      if (error) throw error;
    } else {
      const { error } = await context.supabase.from("expense_entries").insert(payload);
      if (error) throw error;
    }
    return { ok: true };
  });

export const deleteExpenseEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    const { error } = await context.supabase.from("expense_entries").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ============ SUPPLIER INVOICES & PAYMENTS ============
export const listInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("supplier_invoices")
      .select("id, supplier_id, brand_id, amount, issued_at, due_at, status, note")
      .order("issued_at", { ascending: false });
    if (error) throw error;
    return data as Array<{ id: string; supplier_id: string; brand_id: string | null; amount: number; issued_at: string; due_at: string | null; status: "open" | "paid"; note: string | null }>;
  });

export const listPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from?: string | null; to?: string | null; supplier_id?: string | null } = {}) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("supplier_payments")
      .select("id, invoice_id, supplier_id, amount, paid_at, note, cash_transaction_id, supplier_invoices(supplier_id, brand_id, amount, note)")
      .order("paid_at", { ascending: false });
    if (data.from) q = q.gte("paid_at", data.from);
    if (data.to) q = q.lte("paid_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw error;
    let filtered = (rows ?? []) as Array<{
      id: string; invoice_id: string | null; supplier_id: string | null; amount: number; paid_at: string; note: string | null;
      cash_transaction_id: string | null;
      supplier_invoices: { supplier_id: string; brand_id: string | null; amount: number; note: string | null } | null;
    }>;
    if (data.supplier_id) filtered = filtered.filter((r) => (r.supplier_id ?? r.supplier_invoices?.supplier_id) === data.supplier_id);
    return filtered;
  });


export const upsertInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; supplier_id: string; brand_id?: string | null; amount?: number; issued_at: string; due_at?: string | null; status: "open" | "paid"; note?: string | null }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    if (data.id) {
      const { id, amount: _amount, ...patch } = data;
      const { error } = await context.supabase.from("supplier_invoices").update(patch).eq("id", id);
      if (error) throw error;
    } else {
      const { amount, ...rest } = data;
      const { error } = await context.supabase.from("supplier_invoices").insert({ ...rest, amount: amount ?? 0 });
      if (error) throw error;
    }
    return { ok: true };
  });

export const deleteInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payments, error: paymentsErr } = await supabaseAdmin
      .from("supplier_payments")
      .select("id, cash_transaction_id")
      .eq("invoice_id", data.id);
    if (paymentsErr) throw paymentsErr;

    const cashIds = (payments ?? [])
      .map((payment: { cash_transaction_id: string | null }) => payment.cash_transaction_id)
      .filter((id: string | null): id is string => Boolean(id));

    if ((payments ?? []).length > 0) {
      const { error } = await supabaseAdmin.from("supplier_payments").delete().eq("invoice_id", data.id);
      if (error) throw error;
    }

    if (cashIds.length > 0) {
      const { error } = await supabaseAdmin.from("cash_transactions").delete().in("id", cashIds);
      if (error) throw error;
    }

    const { error: itemsError } = await supabaseAdmin.from("supplier_invoice_items").delete().eq("invoice_id", data.id);
    if (itemsError) throw itemsError;

    const { error: invoiceError } = await supabaseAdmin.from("supplier_invoices").delete().eq("id", data.id);
    if (invoiceError) throw invoiceError;
    return { ok: true };
  });

export const upsertPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; invoice_id?: string | null; supplier_id?: string | null; amount: number; paid_at: string; note?: string | null }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    if (!data.invoice_id && !data.supplier_id) throw new Error("لازم تحدد فاتورة أو مورد");
    if (!(data.amount > 0)) throw new Error("المبلغ لازم يكون أكبر من صفر");
    const payload = {
      id: data.id,
      invoice_id: data.invoice_id ?? null,
      supplier_id: data.supplier_id ?? null,
      amount: data.amount,
      paid_at: data.paid_at,
      note: data.note ?? null,
    };
    const { error } = await context.supabase.from("supplier_payments").upsert(payload);
    if (error) throw error;
    return { ok: true };
  });

export const deletePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Fetch payment to unlink cash txn first (bypasses any RLS gaps on legacy rows)
    const { data: pay, error: fErr } = await supabaseAdmin
      .from("supplier_payments")
      .select("id, invoice_id, cash_transaction_id")
      .eq("id", data.id)
      .maybeSingle();
    if (fErr) throw fErr;
    if (!pay) return { ok: true };
    const { error: dErr } = await supabaseAdmin.from("supplier_payments").delete().eq("id", data.id);
    if (dErr) throw dErr;
    if (pay.cash_transaction_id) {
      await supabaseAdmin.from("cash_transactions").delete().eq("id", pay.cash_transaction_id);
    }
    return { ok: true };
  });

// ============ SUPPLIER INVOICE ITEMS ============
type InvoiceItem = {
  id?: string;
  invoice_id: string;
  kind: "product" | "material" | "other";
  product_id?: string | null;
  material_id?: string | null;
  description?: string | null;
  qty: number;
  unit_cost: number;
  subtotal?: number;
};

export const listInvoiceItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { invoice_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("supplier_invoice_items")
      .select("id, invoice_id, kind, product_id, material_id, description, qty, unit_cost, subtotal")
      .eq("invoice_id", data.invoice_id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return rows as Array<Required<Pick<InvoiceItem, "id" | "invoice_id" | "kind" | "qty" | "unit_cost">> & { product_id: string | null; material_id: string | null; description: string | null; subtotal: number }>;
  });

export const upsertInvoiceItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: InvoiceItem) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    const payload = {
      ...data,
      product_id: data.kind === "product" ? data.product_id ?? null : null,
      material_id: data.kind === "material" ? data.material_id ?? null : null,
      subtotal: Number(data.qty) * Number(data.unit_cost),
    };
    const { error } = await context.supabase.from("supplier_invoice_items").upsert(payload);
    if (error) throw error;
    // Recompute parent invoice total
    const { data: items } = await context.supabase
      .from("supplier_invoice_items").select("subtotal").eq("invoice_id", data.invoice_id);
    const total = (items ?? []).reduce((a: number, r: { subtotal: number }) => a + Number(r.subtotal || 0), 0);
    await context.supabase.from("supplier_invoices").update({ amount: total }).eq("id", data.invoice_id);
    return { ok: true };
  });

export const deleteInvoiceItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; invoice_id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    const { error } = await context.supabase.from("supplier_invoice_items").delete().eq("id", data.id);
    if (error) throw error;
    const { data: items } = await context.supabase
      .from("supplier_invoice_items").select("subtotal").eq("invoice_id", data.invoice_id);
    const total = (items ?? []).reduce((a: number, r: { subtotal: number }) => a + Number(r.subtotal || 0), 0);
    await context.supabase.from("supplier_invoices").update({ amount: total }).eq("id", data.invoice_id);
    return { ok: true };
  });

// ============ DASHBOARD AGGREGATION ============
export const getInternalDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    year: number; brandId?: string | null;
    periodType?: "daily"|"monthly"|"yearly"|"custom" | null;
    dateFrom?: string | null; dateTo?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const { year, brandId } = data;
    const periodType = data.periodType ?? null;
    const dateFrom = data.dateFrom ?? null;
    const dateTo = data.dateTo ?? null;

    const brandsQ = context.supabase.from("brands").select("*").eq("active", true).order("sort_order").order("name");
    const catsQ = context.supabase.from("expense_categories").select("id, name").eq("active", true);
    let meQ = context.supabase.from("monthly_entries").select("*").eq("year", year);
    let eeQ = context.supabase.from("expense_entries").select("brand_id, category_id, year, month, amount, platform, attributed_revenue").eq("year", year);
    if (brandId) { meQ = meQ.eq("brand_id", brandId); eeQ = eeQ.eq("brand_id", brandId); }
    if (periodType && periodType !== "custom") meQ = meQ.eq("period_type", periodType);
    if (periodType === "custom" && dateFrom && dateTo) {
      meQ = meQ.gte("period_date", dateFrom).lte("period_date", dateTo);
      // Approximate expense_entries filter by month/year when range within one year
      const df = new Date(dateFrom); const dt = new Date(dateTo);
      if (df.getFullYear() === dt.getFullYear()) {
        eeQ = context.supabase.from("expense_entries")
          .select("brand_id, category_id, year, month, amount, platform, attributed_revenue")
          .eq("year", df.getFullYear())
          .gte("month", df.getMonth() + 1).lte("month", dt.getMonth() + 1);
        if (brandId) eeQ = eeQ.eq("brand_id", brandId);
      }
    }
    const isCustom = periodType === "custom" && dateFrom && dateTo;
    const fromISO = isCustom ? dateFrom! : `${year}-01-01`;
    const toISO = isCustom ? `${dateTo}T23:59:59` : `${year}-12-31T23:59:59`;
    const fromDay = isCustom ? dateFrom! : `${year}-01-01`;
    const toDay = isCustom ? dateTo! : `${year}-12-31`;

    const invQb = () => context.supabase.from("supplier_invoices").select("id, supplier_id, brand_id, amount, due_at, status");
    const payQb = () => context.supabase.from("supplier_payments").select("invoice_id, supplier_id, amount");
    const supQb = () => context.supabase.from("suppliers").select("id, name, brand_id, opening_balance");
    const prodQb = () => context.supabase.from("products").select("id, name, brand_id, sell_price, cogs_override, unit, reorder_point").eq("active", true);
    const couriersQb = () => context.supabase.from("couriers").select("id, name, type, brand_id").eq("active", true);
    const itemsQb = () => context.supabase.from("sales_invoice_items").select("invoice_id, product_id, qty, unit_price, subtotal");
    const salesQb = () => {
      let q = context.supabase.from("sales_invoices").select("id, brand_id, courier_id, product_id, type, qty, total_amount, collected_amount, occurred_at")
        .gte("occurred_at", fromISO).lte("occurred_at", toISO);
      if (brandId) q = q.eq("brand_id", brandId);
      return q;
    };
    const ordersQb = () => {
      let q = context.supabase.from("orders").select("id, brand_id, courier_id, fulfillment_status, confirmation_status, total_amount, occurred_at")
        .gte("occurred_at", fromISO).lte("occurred_at", toISO);
      if (brandId) q = q.eq("brand_id", brandId);
      return q;
    };
    const invMoveQb = () => context.supabase.from("inventory_movements").select("product_id, type, qty, occurred_at, worker_name")
      .gte("occurred_at", fromISO).lte("occurred_at", toISO);
    const fulfillQb = () => {
      let q = context.supabase.from("fulfillment_entries").select("id, brand_id, employee_name, orders_prepared, occurred_at")
        .gte("occurred_at", fromDay).lte("occurred_at", toDay);
      if (brandId) q = q.eq("brand_id", brandId);
      return q;
    };

    const [brandsR, catsR, meR, eeR, invRowsA, payRowsA, supRowsA, prodRowsA, salesRowsA, ordersRowsA, invMoveRowsA, couriersRowsA, itemsRowsA, fulfillRowsA] =
      await Promise.all([
        brandsQ, catsQ, meQ, eeQ,
        fetchAllRows(invQb), fetchAllRows(payQb), fetchAllRows(supQb), fetchAllRows(prodQb),
        fetchAllRows(salesQb), fetchAllRows(ordersQb), fetchAllRows(invMoveQb),
        fetchAllRows(couriersQb), fetchAllRows(itemsQb), fetchAllRows(fulfillQb),
      ]);
    for (const r of [brandsR, catsR, meR, eeR]) if (r.error) throw r.error;
    const invR = { data: invRowsA, error: null };
    const payR = { data: payRowsA, error: null };
    const supR = { data: supRowsA, error: null };
    const prodR = { data: prodRowsA, error: null };
    const salesR = { data: salesRowsA, error: null };
    const ordersR = { data: ordersRowsA, error: null };
    const invMoveR = { data: invMoveRowsA, error: null };
    const couriersR = { data: couriersRowsA, error: null };
    const itemsR = { data: itemsRowsA, error: null };
    const fulfillR = { data: fulfillRowsA, error: null };

    const brands = (brandsR.data ?? []) as Array<{ id: string; name: string; type: "product" | "service" }>;
    const cats = (catsR.data ?? []) as Array<{ id: string; name: string }>;
    const catName = new Map(cats.map((c) => [c.id, c.name]));
    const supName = new Map((supR.data ?? []).map((s: { id: string; name: string }) => [s.id, s.name]));
    const supBrand = new Map((supR.data ?? []).map((s: { id: string; brand_id: string | null }) => [s.id, s.brand_id ?? null]));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meRows = (meR.data ?? []) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eeRows = (eeR.data ?? []) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invRows = (invR.data ?? []) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payRows = (payR.data ?? []) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supRows = (supR.data ?? []) as any[];

    const monthly = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1, revenue: 0, expenses: 0, cogs: 0, grossProfit: 0, netProfit: 0, cash: 0,
      ordersTotal: 0, ordersConfirmed: 0, ordersDelivered: 0, ordersReturned: 0,
      clients: 0, projects: 0,
    }));
    for (const r of meRows) {
      // Aggregate monthly & daily rows into month buckets (yearly rows sum into full year via totals)
      if (r.period_type === "yearly") continue;
      const monthIdx = ((r.period_type === "daily" || r.period_type === "weekly" || r.period_type === "custom") && r.period_date) ? (new Date(r.period_date).getMonth()) : (r.month - 1);
      const m = monthly[monthIdx];
      if (!m) continue;
      m.revenue += Number(r.revenue) || 0;
      m.cash += Number(r.cash_position) || 0;
      m.clients += Number(r.service_clients) || 0;
      m.projects += Number(r.service_projects) || 0;
    }
    // Add yearly rows as month=12 revenue overlay? Skip to avoid double-count; expose via totals only.
    for (const r of eeRows) monthly[r.month - 1].expenses += Number(r.amount) || 0;

    // ==== Real revenue from sales_invoices (net of returns), bucketed by occurred_at month ====
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const salesRowsAll = ((salesR.data ?? []) as any[]);
    const salesRevByBrand = new Map<string, number>();
    for (const s of salesRowsAll) {
      if (!s.occurred_at) continue;
      const monthIdx = new Date(s.occurred_at).getMonth();
      const amt = Number(s.total_amount) || 0;
      const signed = s.type === "return" ? -amt : amt;
      salesRevByBrand.set(s.brand_id, (salesRevByBrand.get(s.brand_id) ?? 0) + signed);
      // Merge into monthly buckets (all brands or the filtered brand)
      monthly[monthIdx].revenue += signed;
    }

    // Operational order statuses come from orders.fulfillment_status, not from
    // financial invoices. A sale invoice is revenue; it is not necessarily delivered.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderRows = ((ordersR.data ?? []) as any[]);
    for (const o of orderRows) {
      if (!o.occurred_at) continue;
      const monthIdx = new Date(o.occurred_at).getMonth();
      const m = monthly[monthIdx];
      if (!m) continue;
      m.ordersTotal += 1;
      if (o.confirmation_status === "confirmed") m.ordersConfirmed += 1;
      if (o.fulfillment_status === "delivered") m.ordersDelivered += 1;
      else if (o.fulfillment_status === "returned") m.ordersReturned += 1;
    }

    for (const m of monthly) m.netProfit = m.revenue - m.expenses;

    let yearlyRevenue = 0, yearlyCash = 0;
    for (const r of meRows) if (r.period_type === "yearly") { yearlyRevenue += Number(r.revenue) || 0; yearlyCash += Number(r.cash_position) || 0; }

    const totals = monthly.reduce(
      (a, m) => ({
        revenue: a.revenue + m.revenue, expenses: a.expenses + m.expenses,
        cogs: a.cogs + m.cogs, grossProfit: a.grossProfit + m.grossProfit,
        netProfit: a.netProfit + m.netProfit, cash: a.cash + m.cash,
        ordersTotal: a.ordersTotal + m.ordersTotal, ordersConfirmed: a.ordersConfirmed + m.ordersConfirmed,
        ordersDelivered: a.ordersDelivered + m.ordersDelivered, ordersReturned: a.ordersReturned + m.ordersReturned,
        clients: a.clients + m.clients, projects: a.projects + m.projects,
      }),
      { revenue: 0, expenses: 0, cogs: 0, grossProfit: 0, netProfit: 0, cash: 0, ordersTotal: 0, ordersConfirmed: 0, ordersDelivered: 0, ordersReturned: 0, clients: 0, projects: 0 },
    );
    totals.revenue += yearlyRevenue;
    totals.cash += yearlyCash;
    totals.netProfit = totals.revenue - totals.expenses;

    // Per-brand totals + top category
    const perBrand = brands.filter((b) => !brandId || b.id === brandId).map((b) => {
      let rev = 0, exp = 0, cash = 0;
      for (const r of meRows) if (r.brand_id === b.id) {
        rev += Number(r.revenue) || 0;
        cash += Number(r.cash_position) || 0;
      }
      // Add real sales revenue (net of returns) from sales_invoices
      rev += salesRevByBrand.get(b.id) ?? 0;
      const catTotals = new Map<string, number>();
      for (const r of eeRows) if (r.brand_id === b.id) {
        exp += Number(r.amount) || 0;
        catTotals.set(r.category_id, (catTotals.get(r.category_id) ?? 0) + (Number(r.amount) || 0));
      }
      let topCatId: string | null = null; let topCatAmt = 0;
      for (const [cid, amt] of catTotals) if (amt > topCatAmt) { topCatId = cid; topCatAmt = amt; }
      return {
        id: b.id, name: b.name, type: b.type,
        revenue: rev, cogs: 0, grossProfit: 0, expenses: exp, netProfit: rev - exp, cash,
        margin: rev > 0 ? (rev - exp) / rev : 0,
        topCategory: topCatId ? { name: catName.get(topCatId) ?? "—", amount: topCatAmt, pct: exp > 0 ? topCatAmt / exp : 0 } : null,
      };
    });

    const catAgg = new Map<string, number>();
    for (const r of eeRows) catAgg.set(r.category_id, (catAgg.get(r.category_id) ?? 0) + (Number(r.amount) || 0));
    const expensesByCategory = Array.from(catAgg.entries())
      .map(([cid, amt]) => ({ name: catName.get(cid) ?? "—", value: amt }))
      .sort((a, b) => b.value - a.value);

    // Supplier debts
    const paidByInv = new Map<string, number>();
    const paidBySupplierStandalone = new Map<string, number>();
    for (const p of payRows) {
      if (p.invoice_id) paidByInv.set(p.invoice_id, (paidByInv.get(p.invoice_id) ?? 0) + (Number(p.amount) || 0));
      else if (p.supplier_id) paidBySupplierStandalone.set(p.supplier_id, (paidBySupplierStandalone.get(p.supplier_id) ?? 0) + (Number(p.amount) || 0));
    }
    const today = new Date().toISOString().slice(0, 10);
    const supplierDebt = new Map<string, { name: string; outstanding: number; overdue: number }>();
    const remainingStandalone = new Map<string, number>(paidBySupplierStandalone);
    let totalOutstanding = 0, overdueCount = 0;
    // Seed opening balances (respect brand filter); reduce by standalone first
    for (const s of supRows as Array<{ id: string; name: string; brand_id: string | null; opening_balance: number }>) {
      if (brandId && s.brand_id && s.brand_id !== brandId) continue;
      const opening = Number(s.opening_balance) || 0;
      const standalone = remainingStandalone.get(s.id) ?? 0;
      const applied = Math.min(opening, standalone);
      remainingStandalone.set(s.id, standalone - applied);
      const net = opening - applied;
      if (net === 0) continue;
      const entry = supplierDebt.get(s.id) ?? { name: s.name, outstanding: 0, overdue: 0 };
      entry.outstanding += net;
      supplierDebt.set(s.id, entry);
      totalOutstanding += net;
    }
    for (const inv of invRows) {
      if (brandId) {
        const invBrand = inv.brand_id ?? supBrand.get(inv.supplier_id) ?? null;
        if (invBrand && invBrand !== brandId) continue;
        if (!invBrand && supBrand.get(inv.supplier_id) && supBrand.get(inv.supplier_id) !== brandId) continue;
      }
      const paid = paidByInv.get(inv.id) ?? 0;
      let remaining = Math.max(0, (Number(inv.amount) || 0) - paid);
      if (remaining <= 0) continue;
      // Apply any leftover standalone payments to reduce invoice remaining
      const leftover = remainingStandalone.get(inv.supplier_id) ?? 0;
      if (leftover > 0) {
        const applied = Math.min(leftover, remaining);
        remaining -= applied;
        remainingStandalone.set(inv.supplier_id, leftover - applied);
      }
      if (remaining <= 0) continue;
      totalOutstanding += remaining;
      const isOverdue = inv.due_at && inv.due_at < today && inv.status !== "paid";
      if (isOverdue) overdueCount += 1;
      const entry = supplierDebt.get(inv.supplier_id) ?? { name: supName.get(inv.supplier_id) ?? "—", outstanding: 0, overdue: 0 };
      entry.outstanding += remaining;
      if (isOverdue) entry.overdue += remaining;
      supplierDebt.set(inv.supplier_id, entry);
    }
    const topSuppliers = Array.from(supplierDebt.values()).sort((a, b) => b.outstanding - a.outstanding).slice(0, 5);

    const mkAgg = new Map<string, { spend: number; revenue: number }>();
    for (const r of eeRows) {
      if (!r.platform) continue;
      const cur = mkAgg.get(r.platform) ?? { spend: 0, revenue: 0 };
      cur.spend += Number(r.amount) || 0;
      cur.revenue += Number(r.attributed_revenue) || 0;
      mkAgg.set(r.platform, cur);
    }
    const marketing = Array.from(mkAgg.entries()).map(([platform, v]) => ({
      platform, spend: v.spend, revenue: v.revenue,
      roi: v.spend > 0 ? (v.revenue - v.spend) / v.spend : 0,
    })).sort((a, b) => b.spend - a.spend);
    const marketingTotal = marketing.reduce((a, m) => a + m.spend, 0);

    // Products & inventory
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const products = ((prodR.data ?? []) as any[]).filter((p) => !brandId || p.brand_id === brandId);
    const productIds = new Set(products.map((p) => p.id));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const salesRows = ((salesR.data ?? []) as any[]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemRows = ((itemsR.data ?? []) as any[]);
    const salesById = new Map(salesRows.map((s) => [s.id, s]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const moveRows = ((invMoveR.data ?? []) as any[]).filter((m) => productIds.size === 0 || productIds.has(m.product_id));

    const stockByProduct = new Map<string, number>();
    const producedByProduct = new Map<string, number>();
    for (const m of moveRows) {
      const q = Number(m.qty) || 0;
      const sign = m.type === "production" || m.type === "return" || m.type === "adjustment" ? 1 : -1;
      stockByProduct.set(m.product_id, (stockByProduct.get(m.product_id) ?? 0) + sign * q);
      if (m.type === "production") producedByProduct.set(m.product_id, (producedByProduct.get(m.product_id) ?? 0) + q);
    }

    const soldByProduct = new Map<string, number>();
    const returnedByProduct = new Map<string, number>();
    // Prefer items when present
    for (const it of itemRows) {
      const s = salesById.get(it.invoice_id);
      if (!s) continue;
      const q = Number(it.qty) || 0;
      if (s.type === "sale") soldByProduct.set(it.product_id, (soldByProduct.get(it.product_id) ?? 0) + q);
      else returnedByProduct.set(it.product_id, (returnedByProduct.get(it.product_id) ?? 0) + q);
    }
    // Fallback for legacy single-product invoices with no items
    const invoicesWithItems = new Set(itemRows.map((it) => it.invoice_id));
    for (const s of salesRows) {
      if (!s.product_id || invoicesWithItems.has(s.id)) continue;
      const q = Number(s.qty) || 0;
      if (s.type === "sale") soldByProduct.set(s.product_id, (soldByProduct.get(s.product_id) ?? 0) + q);
      else returnedByProduct.set(s.product_id, (returnedByProduct.get(s.product_id) ?? 0) + q);
    }

    const productStats = products.map((p) => ({
      id: p.id, name: p.name, brand_id: p.brand_id, unit: p.unit ?? "piece",
      stock: stockByProduct.get(p.id) ?? 0,
      produced: producedByProduct.get(p.id) ?? 0,
      sold: soldByProduct.get(p.id) ?? 0,
      returned: returnedByProduct.get(p.id) ?? 0,
      sellPrice: Number(p.sell_price) || 0,
      reorderPoint: Number(p.reorder_point) || 0,
    }));
    const topSelling = [...productStats].sort((a, b) => b.sold - a.sold).slice(0, 5);
    const leastSelling = [...productStats].filter((p) => p.sold > 0 || p.stock > 0).sort((a, b) => a.sold - b.sold).slice(0, 5);
    const inventoryValue = productStats.reduce((a, p) => a + p.stock * p.sellPrice, 0);
    const totalProduced = productStats.reduce((a, p) => a + p.produced, 0);
    const lowStock = productStats
      .filter((p) => p.reorderPoint > 0 && p.stock <= p.reorderPoint)
      .sort((a, b) => (a.stock - a.reorderPoint) - (b.stock - b.reorderPoint));

    // Workers production aggregation
    const workerAgg = new Map<string, { produced: number; byProduct: Map<string, number> }>();
    for (const m of moveRows) {
      if (m.type !== "production" || !m.worker_name) continue;
      const q = Number(m.qty) || 0;
      const cur = workerAgg.get(m.worker_name) ?? { produced: 0, byProduct: new Map() };
      cur.produced += q;
      cur.byProduct.set(m.product_id, (cur.byProduct.get(m.product_id) ?? 0) + q);
      workerAgg.set(m.worker_name, cur);
    }
    const topWorkers = Array.from(workerAgg.entries())
      .map(([name, v]) => ({ name, produced: v.produced, productCount: v.byProduct.size }))
      .sort((a, b) => b.produced - a.produced).slice(0, 5);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const couriers = ((couriersR.data ?? []) as any[]);
    const courierPerf = couriers.map((c) => {
      let delivered = 0, returned = 0, collected = 0;
      for (const o of orderRows) {
        if (o.courier_id !== c.id) continue;
        if (o.fulfillment_status === "delivered") { delivered += 1; collected += Number(o.total_amount) || 0; }
        else if (o.fulfillment_status === "returned") returned += 1;
      }
      const total = delivered + returned;
      return {
        id: c.id, name: c.name, type: c.type, delivered, returned, collected,
        deliveryRate: total > 0 ? delivered / total : 0,
        returnRate: total > 0 ? returned / total : 0,
      };
    }).sort((a, b) => b.delivered - a.delivered);

    // Fulfillment employees aggregation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fulfillRows = ((fulfillR.data ?? []) as any[]);
    const fulfillAgg = new Map<string, { prepared: number; days: Set<string> }>();
    for (const f of fulfillRows) {
      const name = (f.employee_name || "").trim();
      if (!name) continue;
      const cur = fulfillAgg.get(name) ?? { prepared: 0, days: new Set<string>() };
      cur.prepared += Number(f.orders_prepared) || 0;
      cur.days.add(String(f.occurred_at));
      fulfillAgg.set(name, cur);
    }
    const fulfillment = Array.from(fulfillAgg.entries())
      .map(([name, v]) => ({ name, prepared: v.prepared, days: v.days.size, avgPerDay: v.days.size > 0 ? v.prepared / v.days.size : 0 }))
      .sort((a, b) => b.prepared - a.prepared);
    const totalPrepared = fulfillment.reduce((a, f) => a + f.prepared, 0);

    // ==== COGS enrichment (cost of goods sold from sales_invoices items) ====
    // Priority per line:
    //   1) product-level COGS × qty (cogs_override / moving_avg / cogs_percent / brand default / BOM)
    //   2) fallback: brand.cogs_percent_default × line revenue when the line
    //      has no product link (POS custom items, bulk/aggregate invoices) or
    //      product COGS resolves to zero.
    const cogsProductIds = Array.from(new Set<string>([
      ...(itemRows.map((it) => it.product_id as string).filter(Boolean)),
      ...(salesRows.filter((s) => s.product_id && !invoicesWithItems.has(s.id)).map((s) => s.product_id as string)),
    ]));
    const cogsByProduct = await getCogsMap(context.supabase, cogsProductIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const brandDefaultPct = new Map<string, number>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const b of ((brandsR.data ?? []) as any[])) {
      brandDefaultPct.set(b.id, Number(b.cogs_percent_default) || 0);
    }
    const cogsByBrand = new Map<string, number>();
    const monthlyCogs = Array.from({ length: 12 }, () => 0);
    const addCogsLine = (pid: string | null, qty: number, lineRevenue: number, brand: string, occurredAt: string, type: string) => {
      const q = Number(qty) || 0;
      const rev = Number(lineRevenue) || 0;
      let c = pid ? (cogsByProduct.get(pid) ?? 0) * q : 0;
      if (c <= 0 && rev > 0) {
        const pct = brandDefaultPct.get(brand) ?? 0;
        if (pct > 0) c = (pct / 100) * rev;
      }
      if (c <= 0) return;
      const signed = type === "return" ? -c : c;
      const mi = new Date(occurredAt).getMonth();
      if (mi >= 0 && mi < 12) monthlyCogs[mi] += signed;
      cogsByBrand.set(brand, (cogsByBrand.get(brand) ?? 0) + signed);
    };
    for (const it of itemRows) {
      const s = salesById.get(it.invoice_id);
      if (!s || !s.occurred_at) continue;
      const lineRev = Number(it.subtotal) || (Number(it.unit_price) || 0) * (Number(it.qty) || 0);
      addCogsLine(it.product_id, it.qty, lineRev, s.brand_id, s.occurred_at, s.type);
    }
    for (const s of salesRows) {
      if (invoicesWithItems.has(s.id) || !s.occurred_at) continue;
      const lineRev = Number(s.total_amount) || 0;
      addCogsLine(s.product_id, s.qty, lineRev, s.brand_id, s.occurred_at, s.type);
    }
    let totalCogs = 0;
    monthly.forEach((m, i) => {
      m.cogs = monthlyCogs[i];
      m.grossProfit = m.revenue - m.cogs;
      m.netProfit = m.revenue - m.cogs - m.expenses;
      totalCogs += m.cogs;
    });
    totals.cogs = totalCogs;
    totals.grossProfit = totals.revenue - totalCogs;
    totals.netProfit = totals.revenue - totalCogs - totals.expenses;
    for (const b of perBrand) {
      const c = cogsByBrand.get(b.id) ?? 0;
      b.cogs = c;
      b.grossProfit = b.revenue - c;
      b.netProfit = b.revenue - c - b.expenses;
      b.margin = b.revenue > 0 ? b.netProfit / b.revenue : 0;
    }

    return {
      year, monthly, totals, perBrand, expensesByCategory,
      supplierDebt: { totalOutstanding, overdueCount, topSuppliers },
      marketing: { total: marketingTotal, byPlatform: marketing },
      inventory: { value: inventoryValue, totalProduced, topSelling, leastSelling, allProducts: productStats, lowStock },
      couriers: courierPerf,
      workers: topWorkers,
      fulfillment: { totalPrepared, employees: fulfillment },
      allBrands: brands.map((b) => ({ id: b.id, name: b.name, type: b.type })),
      scopeBrand: brandId ? brands.find((b) => b.id === brandId) ?? null : null,
      filter: { periodType, dateFrom, dateTo },
    };
  });

// ============ MATERIALS / PRODUCTS / INVENTORY ============
export const listMaterials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("materials")
      .select("*, material_brands(brand_id)")
      .order("name");
    if (error) throw error;
    type Row = { id: string; name: string; unit: string; unit_cost: number; active: boolean; material_brands?: Array<{ brand_id: string }> };
    return (data as Row[]).map((m) => ({
      id: m.id, name: m.name, unit: m.unit, unit_cost: m.unit_cost, active: m.active,
      brand_ids: (m.material_brands ?? []).map((x) => x.brand_id),
    }));
  });

export const upsertMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; name: string; unit: string; unit_cost: number; active: boolean; brand_ids?: string[] }) => d)
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { brand_ids, ...row } = data;
    const { data: saved, error } = await context.supabase.from("materials").upsert(row).select("id").single();
    if (error) throw error;
    const mid = saved.id as string;
    if (Array.isArray(brand_ids)) {
      await context.supabase.from("material_brands").delete().eq("material_id", mid);
      if (brand_ids.length) {
        const rows = brand_ids.map((b) => ({ material_id: mid, brand_id: b }));
        const { error: e2 } = await context.supabase.from("material_brands").insert(rows);
        if (e2) throw e2;
      }
    }
    return { ok: true };
  });

export const deleteMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { error } = await context.supabase.from("materials").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const listProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("products")
      .select("id, brand_id, name, sku, sell_price, cogs_override, cogs_percent, unit, reorder_point, active").order("name");
    if (error) throw error;
    return data as Array<{ id: string; brand_id: string; name: string; sku: string | null; sell_price: number; cogs_override: number | null; cogs_percent: number | null; unit: string; reorder_point: number; active: boolean }>;
  });

export const upsertProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; brand_id: string; name: string; sku?: string | null; sell_price: number; cogs_override?: number | null; cogs_percent?: number | null; unit?: string; reorder_point?: number; active: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { error } = await context.supabase.from("products").upsert({ unit: "piece", reorder_point: 0, ...data });
    if (error) throw error;
    return { ok: true };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertCatalog(context);
    const { error } = await context.supabase.from("products").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// Import ALL products from Shopify for a given brand (Admin API, paginated).
export const runShopifyProductsSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const { data: hasAccess } = await context.supabase.rpc("has_brand_access", { _user_id: context.userId, _brand_id: data.brandId });
    if (!hasAccess) throw new Error("Forbidden: brand access denied");
    const { syncShopifyProductsForBrand } = await import("@/server/shopifyProductsSync.server");
    return await syncShopifyProductsForBrand(data.brandId);
  });



export const getProductBOM = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { productId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("product_materials")
      .select("id, product_id, material_id, qty_per_unit, materials(name, unit, unit_cost)")
      .eq("product_id", data.productId);
    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (rows ?? []) as any[];
  });

export const upsertBOMLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; product_id: string; material_id: string; qty_per_unit: number }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const { error } = await context.supabase.from("product_materials").upsert(data, { onConflict: "product_id,material_id" });
    if (error) throw error;
    return { ok: true };
  });

export const deleteBOMLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const { error } = await context.supabase.from("product_materials").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const listInventoryMovements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { productId?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const rows = await fetchAllRows(() => {
      let q = context.supabase.from("inventory_movements")
        .select("id, product_id, type, qty, occurred_at, note, worker_name, employee_id")
        .order("occurred_at", { ascending: false });
      if (data.productId) q = q.eq("product_id", data.productId);
      return q;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows as any[];
  });

export const upsertInventoryMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; product_id: string; type: "production"|"sale"|"return"|"adjustment"; qty: number; occurred_at: string; note?: string | null; worker_name?: string | null; employee_id?: string | null }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    const { error } = await context.supabase.from("inventory_movements").upsert({ ...data, worker_name: data.worker_name ?? null, employee_id: data.employee_id ?? null });
    if (error) throw error;
    return { ok: true };
  });

export const deleteInventoryMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const { error } = await context.supabase.from("inventory_movements").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ============ COURIERS ============
export const listCouriers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("couriers").select("*").order("name");
    if (error) throw error;
    return data as Array<{ id: string; name: string; type: "courier_company"|"rep"|"offline_branch"; contact: string | null; brand_id: string | null; active: boolean; opening_balance: number }>;
  });

export const upsertCourier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; name: string; type: "courier_company"|"rep"|"offline_branch"; contact?: string | null; brand_id?: string | null; active: boolean; opening_balance?: number }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const { error } = await context.supabase.from("couriers").upsert(data);
    if (error) throw error;
    return { ok: true };
  });

export const deleteCourier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("couriers").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ============ SALES INVOICES (multi-line) ============
export const listSalesInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string | null; limit?: number }) => d)
  .handler(async ({ data, context }) => {
    const rows = await fetchAllRows(() => {
      let q = context.supabase.from("sales_invoices")
        .select("id, brand_id, courier_id, product_id, type, qty, total_amount, collected_amount, occurred_at, note, sales_invoice_items(id, product_id, qty, unit_price, subtotal)")
        .order("occurred_at", { ascending: false });
      if (data.brandId) q = q.eq("brand_id", data.brandId);
      return q;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rows as any[];
  });

export const getSalesInvoice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("sales_invoices")
      .select("*, sales_invoice_items(id, product_id, qty, unit_price, subtotal)")
      .eq("id", data.id).maybeSingle();
    if (error) throw error;
    return row;
  });

export const upsertSalesInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string; brand_id: string; courier_id?: string | null;
    type: "sale"|"return"; occurred_at: string; note?: string | null;
    collected_amount: number;
    customer_name?: string | null; customer_phone?: string | null; customer_email?: string | null;
    items: Array<{ product_id: string; qty: number; unit_price: number }>;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    if (!data.items?.length) throw new Error("يجب إضافة منتج واحد على الأقل");
    const items = data.items.map((it) => ({ ...it, subtotal: (Number(it.qty)||0) * (Number(it.unit_price)||0) }));
    const total = items.reduce((a, it) => a + it.subtotal, 0);
    const totalQty = items.reduce((a, it) => a + (Number(it.qty)||0), 0);

    // Editing existing invoices requires writer role (admin/manager/data_entry)
    if (data.id) {
      if (!(await hasAnyRole(context, ["admin", "manager", "data_entry"]))) throw new Error("لا تملك صلاحية تعديل الفواتير");
    }

    const invoicePayload = {
      id: data.id, brand_id: data.brand_id, courier_id: data.courier_id ?? null,
      type: data.type, occurred_at: data.occurred_at, note: data.note ?? null,
      qty: totalQty, total_amount: total, collected_amount: data.collected_amount,
      product_id: items.length === 1 ? items[0].product_id : null,
      customer_name: data.customer_name?.trim() || null,
      customer_phone: data.customer_phone?.trim() || null,
      customer_email: data.customer_email?.trim() || null,
    };
    const { data: saved, error } = await context.supabase.from("sales_invoices").upsert(invoicePayload).select("id").single();
    if (error) throw error;
    const invoiceId = saved.id as string;

    // Replace items
    await context.supabase.from("sales_invoice_items").delete().eq("invoice_id", invoiceId);
    const { error: iErr } = await context.supabase.from("sales_invoice_items").insert(
      items.map((it) => ({ invoice_id: invoiceId, product_id: it.product_id, qty: it.qty, unit_price: it.unit_price, subtotal: it.subtotal }))
    );
    if (iErr) throw iErr;
    return { ok: true, id: invoiceId };
  });

export const deleteSalesInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    const { error } = await context.supabase.from("sales_invoices").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ============ FULFILLMENT ENTRIES ============
export const listFulfillmentEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string | null; dateFrom?: string | null; dateTo?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const rows = await fetchAllRows(() => {
      let q = context.supabase.from("fulfillment_entries")
        .select("id, brand_id, employee_name, orders_prepared, occurred_at, note, employee_id")
        .order("occurred_at", { ascending: false });
      if (data.brandId) q = q.eq("brand_id", data.brandId);
      if (data.dateFrom) q = q.gte("occurred_at", data.dateFrom);
      if (data.dateTo) q = q.lte("occurred_at", data.dateTo);
      return q;
    });
    return rows as Array<{ id: string; brand_id: string | null; employee_name: string; orders_prepared: number; occurred_at: string; note: string | null; employee_id: string | null }>;
  });

export const upsertFulfillmentEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; brand_id?: string | null; employee_name: string; orders_prepared: number; occurred_at: string; note?: string | null; employee_id?: string | null }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    const { error } = await context.supabase.from("fulfillment_entries").upsert({ ...data, brand_id: data.brand_id ?? null, note: data.note ?? null, employee_id: data.employee_id ?? null });
    if (error) throw error;
    return { ok: true };
  });

export const deleteFulfillmentEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const { error } = await context.supabase.from("fulfillment_entries").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ============ CASH TRANSACTIONS (خزنة) ============
export type CashTxnType = "collection"|"personal_withdrawal"|"deposit"|"other_out";

export const listCashTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from?: string | null; to?: string | null; type?: CashTxnType | null; brandId?: string | null; courierId?: string | null; forUserId?: string | null; walletId?: string | null }) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("cash_transactions")
      .select("id, type, amount, occurred_at, brand_id, courier_id, for_user_id, created_by, note, created_at, category_id, expense_entry_id, wallet_id, transfer_group")
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false });
    if (data.from) q = q.gte("occurred_at", data.from);
    if (data.to) q = q.lte("occurred_at", data.to);
    if (data.type) q = q.eq("type", data.type);
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    if (data.courierId) q = q.eq("courier_id", data.courierId);
    if (data.forUserId) q = q.eq("for_user_id", data.forUserId);
    if (data.walletId) q = q.eq("wallet_id", data.walletId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []) as Array<{
      id: string; type: CashTxnType; amount: number; occurred_at: string;
      brand_id: string | null; courier_id: string | null; for_user_id: string | null;
      created_by: string | null; note: string | null; created_at: string;
      category_id: string | null; expense_entry_id: string | null;
      wallet_id: string | null; transfer_group: string | null;
    }>;
  });

export const upsertCashTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; type: CashTxnType; amount: number; occurred_at: string; brand_id?: string | null; courier_id?: string | null; for_user_id?: string | null; category_id?: string | null; note?: string | null; wallet_id?: string | null; platform?: "tiktok"|"meta"|"google"|"snapchat"|"whatsapp"|"sms"|"influencer"|"ugc"|"media_production"|"other"|null; attributed_revenue?: number | null }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    if (data.type === "collection" && !data.courier_id) throw new Error("لازم تختار المندوب/شركة الشحن للتحصيل");
    if (data.amount <= 0) throw new Error("المبلغ لازم يكون أكبر من صفر");
    // Resolve wallet
    let walletId = data.wallet_id ?? null;
    if (!walletId) {
      const { data: w } = await context.supabase.from("wallets").select("id").eq("active", true).order("sort_order").limit(1).maybeSingle();
      walletId = (w as { id: string } | null)?.id ?? null;
    }
    const payload = {
      id: data.id,
      type: data.type,
      amount: data.amount,
      occurred_at: data.occurred_at,
      brand_id: data.brand_id ?? null,
      courier_id: data.courier_id ?? null,
      category_id: data.category_id ?? null,
      for_user_id: data.for_user_id ?? (data.type === "personal_withdrawal" ? context.userId : null),
      note: data.note ?? null,
      wallet_id: walletId,
      created_by: context.userId,
    };
    let cashId = data.id;
    if (data.id) {
      const { error } = await context.supabase.from("cash_transactions").update(payload).eq("id", data.id);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await context.supabase.from("cash_transactions").insert(payload).select("id").single();
      if (error) throw error;
      cashId = inserted?.id;
    }
    // Propagate marketing platform / attributed revenue to the expense row auto-created by the trigger.
    if (cashId && data.type === "other_out" && (data.platform || data.attributed_revenue != null)) {
      const patch: { platform?: typeof data.platform; attributed_revenue?: number } = {};
      if (data.platform) patch.platform = data.platform;
      if (data.attributed_revenue != null) patch.attributed_revenue = data.attributed_revenue;
      if (Object.keys(patch).length > 0) {
        await context.supabase.from("expense_entries").update(patch).eq("cash_transaction_id", cashId);
      }
    }
    return { ok: true };
  });


export const deleteCashTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    const { error } = await context.supabase.from("cash_transactions").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// Cash box summary: balance = deposits + collections - personal_withdrawals - other_out.
// Courier debt = SUM(sales_invoices.total_amount - collected_amount) - SUM(collections for that courier).
export const getCashSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from?: string | null; to?: string | null; forUserId?: string | null }) => d)
  .handler(async ({ data, context }) => {
    // Overall (all-time) balance: cash txns + wallet opening balances.
    // Wallet-to-wallet transfers share a transfer_group and net to zero globally,
    // so they are excluded from periodIn/periodOut KPIs.
    const allQ = context.supabase.from("cash_transactions").select("type, amount, transfer_group");
    const walletsQ = context.supabase.from("wallets").select("opening_balance");
    const perQ = (() => {
      let q = context.supabase.from("cash_transactions").select("id, type, amount, for_user_id, occurred_at, expense_entry_id, transfer_group");
      if (data.from) q = q.gte("occurred_at", data.from);
      if (data.to) q = q.lte("occurred_at", data.to);
      return q;
    })();
    const expenseQ = (() => {
      let q = context.supabase.from("expense_entries")
        .select("id, amount, year, month, period_type, period_date, period_end_date, cash_transaction_id");
      const fromYear = data.from ? new Date(data.from).getFullYear() - 1 : null;
      const toYear = data.to ? new Date(data.to).getFullYear() + 1 : null;
      if (fromYear != null) q = q.gte("year", fromYear);
      if (toYear != null) q = q.lte("year", toYear);
      return q;
    })();
    const unlinkedExpenseQ = context.supabase.from("expense_entries").select("amount").is("cash_transaction_id", null);
    const salesQ = context.supabase.from("sales_invoices").select("courier_id, type, total_amount, collected_amount");
    const collectionsQ = context.supabase.from("cash_transactions").select("courier_id, amount").eq("type","collection");
    const couriersQ = context.supabase.from("couriers").select("id, name, type, brand_id, active");

    const [allR, walletsR, perR, expenseR, unlinkedExpenseR, salesR, collR, coursR] = await Promise.all([allQ, walletsQ, perQ, expenseQ, unlinkedExpenseQ, salesQ, collectionsQ, couriersQ]);
    for (const r of [allR, walletsR, perR, expenseR, unlinkedExpenseR, salesR, collR, coursR]) if (r.error) throw r.error;

    const signed = (t: string, a: number) => (t === "collection" || t === "deposit") ? a : -a;
    let balance = 0;
    for (const w of (walletsR.data ?? []) as Array<{ opening_balance: number }>) balance += Number(w.opening_balance) || 0;
    for (const r of (allR.data ?? []) as Array<{ type: string; amount: number }>) balance += signed(r.type, Number(r.amount)||0);
    for (const r of (unlinkedExpenseR.data ?? []) as Array<{ amount: number }>) balance -= Number(r.amount) || 0;

    let periodIn = 0, periodOut = 0, personalTotal = 0;
    const byUserMap = new Map<string, number>();
    const countedExpenseIds = new Set<string>();
    for (const r of (perR.data ?? []) as Array<{ type: string; amount: number; for_user_id: string | null; expense_entry_id: string | null; transfer_group: string | null }>) {
      if (r.transfer_group) continue; // internal wallet transfer
      const amt = Number(r.amount) || 0;
      if (r.type === "collection" || r.type === "deposit") periodIn += amt;
      else periodOut += amt;
      if (r.expense_entry_id) countedExpenseIds.add(r.expense_entry_id);
      if (r.type === "personal_withdrawal") {
        if (!data.forUserId || r.for_user_id === data.forUserId) personalTotal += amt;
        if (r.for_user_id) byUserMap.set(r.for_user_id, (byUserMap.get(r.for_user_id) ?? 0) + amt);
      }
    }
    const parseDate = (value: string | null) => value ? new Date(`${value}T00:00:00`) : null;
    const fromBoundary = parseDate(data.from ?? null);
    const toBoundary = parseDate(data.to ?? null);
    const overlapsSelectedPeriod = (row: { year: number; month: number; period_type: string | null; period_date: string | null; period_end_date: string | null }) => {
      let start = parseDate(row.period_date);
      let end = parseDate(row.period_end_date);
      if (!start) {
        if (row.period_type === "yearly") {
          start = new Date(row.year, 0, 1);
          end = new Date(row.year, 11, 31);
        } else {
          const month = Math.max(1, Math.min(12, Number(row.month) || 1));
          start = new Date(row.year, month - 1, 1);
          end = new Date(row.year, month, 0);
        }
      } else if (!end) {
        if (row.period_type === "weekly") {
          end = new Date(start);
          end.setDate(end.getDate() + 6);
        } else if (row.period_type === "yearly") {
          start = new Date(row.year, 0, 1);
          end = new Date(row.year, 11, 31);
        } else {
          end = start;
        }
      }
      if (fromBoundary && end < fromBoundary) return false;
      if (toBoundary && start > toBoundary) return false;
      return true;
    };
    for (const e of (expenseR.data ?? []) as Array<{ id: string; amount: number; year: number; month: number; period_type: string | null; period_date: string | null; period_end_date: string | null }>) {
      if (countedExpenseIds.has(e.id)) continue;
      if (!overlapsSelectedPeriod(e)) continue;
      periodOut += Number(e.amount) || 0;
    }
    const byUser = Array.from(byUserMap.entries()).map(([userId, total]) => ({ userId, total })).sort((a,b) => b.total - a.total);

    // Courier debts — sales_invoices are the source of truth for what's OWED,
    // cash_transactions (type='collection') are the source of truth for what's COLLECTED.
    // Do NOT subtract sales_invoices.collected_amount here (that legacy field would
    // double-count collections and freeze "remaining" at the original total).
    const owed = new Map<string, number>();
    for (const s of (salesR.data ?? []) as Array<{ courier_id: string | null; type: string; total_amount: number; collected_amount: number }>) {
      if (!s.courier_id) continue;
      const amt = Number(s.total_amount) || 0;
      const signedAmt = s.type === "return" ? -amt : amt;
      owed.set(s.courier_id, (owed.get(s.courier_id) ?? 0) + signedAmt);
    }
    const collected = new Map<string, number>();
    for (const c of (collR.data ?? []) as Array<{ courier_id: string | null; amount: number }>) {
      if (!c.courier_id) continue;
      collected.set(c.courier_id, (collected.get(c.courier_id) ?? 0) + (Number(c.amount)||0));
    }
    const courierDebts = ((coursR.data ?? []) as Array<{ id: string; name: string; type: string; brand_id: string | null; active: boolean }>).map((c) => {
      const totalOwed = owed.get(c.id) ?? 0;
      const totalCollected = collected.get(c.id) ?? 0;
      return {
        id: c.id, name: c.name, type: c.type, brand_id: c.brand_id, active: c.active,
        totalOwed, totalCollected, remaining: totalOwed - totalCollected,
      };
    });
    courierDebts.sort((a, b) => b.remaining - a.remaining);

    return { balance, periodIn, periodOut, periodNet: periodIn - periodOut, personalTotal, courierDebts, byUser };
  });

// Users that can appear as the recipient of a personal withdrawal (owners + investors).
export const listWithdrawalActors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const { data: manager } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "manager" });
    if (!admin && !manager) throw new Error("Forbidden");
    const investorsR = await context.supabase.from("investors").select("user_id, name").not("user_id", "is", null);
    if (investorsR.error) throw investorsR.error;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rolesR = await supabaseAdmin.from("user_roles").select("user_id, role").in("role", ["admin", "manager"]);
    if (rolesR.error) throw rolesR.error;
    const usersR = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const nameById = new Map<string, string>();
    for (const u of usersR.data?.users ?? []) {
      nameById.set(u.id, (u.user_metadata?.name as string) || u.email || u.id.slice(0, 6));
    }
    const seen = new Set<string>();
    const rows: Array<{ userId: string; name: string; kind: "owner" | "investor" }> = [];
    for (const inv of (investorsR.data ?? []) as Array<{ user_id: string | null; name: string }>) {
      if (!inv.user_id || seen.has(inv.user_id)) continue;
      seen.add(inv.user_id);
      rows.push({ userId: inv.user_id, name: inv.name, kind: "investor" });
    }
    for (const r of (rolesR.data ?? []) as Array<{ user_id: string }>) {
      if (seen.has(r.user_id)) continue;
      seen.add(r.user_id);
      rows.push({ userId: r.user_id, name: nameById.get(r.user_id) ?? r.user_id.slice(0, 6), kind: "owner" });
    }
    return rows;
  });

// ============ REVENUE COMPARISON (monthly_entries vs sales_invoices net) ============
export const getRevenueComparison = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { year: number; brandId?: string | null }) => d)
  .handler(async ({ data, context }) => {
    let meQ = context.supabase.from("monthly_entries")
      .select("brand_id, year, month, revenue, period_type").eq("year", data.year);
    let siQ = context.supabase.from("sales_invoices")
      .select("brand_id, type, total_amount, occurred_at")
      .gte("occurred_at", `${data.year}-01-01`).lte("occurred_at", `${data.year}-12-31`);
    const brandsQ = context.supabase.from("brands").select("id, name").order("name");
    if (data.brandId) {
      meQ = meQ.eq("brand_id", data.brandId);
      siQ = siQ.eq("brand_id", data.brandId);
    }
    const [meR, siR, brR] = await Promise.all([meQ, siQ, brandsQ]);
    for (const r of [meR, siR, brR]) if (r.error) throw r.error;

    const brandsMap = new Map<string, string>();
    for (const b of (brR.data ?? []) as Array<{ id: string; name: string }>) brandsMap.set(b.id, b.name);

    // key = brand_id + month
    type Cell = { brandId: string; brandName: string; month: number; manual: number; invoices: number };
    const cells = new Map<string, Cell>();
    const keyOf = (bid: string, m: number) => `${bid}|${m}`;
    const ensure = (bid: string, m: number): Cell => {
      const k = keyOf(bid, m);
      let c = cells.get(k);
      if (!c) { c = { brandId: bid, brandName: brandsMap.get(bid) ?? "—", month: m, manual: 0, invoices: 0 }; cells.set(k, c); }
      return c;
    };

    for (const r of (meR.data ?? []) as Array<{ brand_id: string; month: number; revenue: number; period_type: string }>) {
      if (r.period_type === "yearly") continue;
      ensure(r.brand_id, r.month).manual += Number(r.revenue) || 0;
    }
    for (const s of (siR.data ?? []) as Array<{ brand_id: string; type: string; total_amount: number; occurred_at: string }>) {
      const m = new Date(s.occurred_at).getMonth() + 1;
      const amt = Number(s.total_amount) || 0;
      const signed = s.type === "return" ? -amt : amt;
      ensure(s.brand_id, m).invoices += signed;
    }

    const rows = Array.from(cells.values())
      .map((c) => ({ ...c, diff: c.manual - c.invoices, absDiff: Math.abs(c.manual - c.invoices) }))
      .sort((a, b) => a.brandName.localeCompare(b.brandName) || a.month - b.month);

    const totals = rows.reduce((acc, r) => ({ manual: acc.manual + r.manual, invoices: acc.invoices + r.invoices }), { manual: 0, invoices: 0 });
    return { rows, totals: { ...totals, diff: totals.manual - totals.invoices }, year: data.year };
  });
