import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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

    const prodQb = () => context.supabase.from("products").select("id, name, brand_id, sell_price, cogs_override, unit, reorder_point").eq("active", true);
    const operationsQ = (context.supabase as any).rpc("dashboard_operational_report", {
      _from: fromISO,
      _to: toISO,
      _brand_id: brandId || null,
    });
    const supplierDebtQ = (context.supabase as any).rpc("dashboard_supplier_debt_summary", {
      _brand_id: brandId || null,
    });

    const timed = async <T>(label: string, promise: PromiseLike<T>): Promise<T> => {
      const startedAt = Date.now();
      try {
        return await promise;
      } finally {
        console.info(`[dashboard-timing] ${label} ${Date.now() - startedAt}ms`);
      }
    };

    const [brandsR, catsR, meR, eeR, prodRowsA, operationsR, supplierDebtR] =
      await Promise.all([
        timed("brands", brandsQ), timed("categories", catsQ),
        timed("monthly_entries", meQ), timed("expense_entries", eeQ),
        timed("products", fetchAllRows(prodQb)),
        timed<{ data: unknown; error: unknown }>("operations_rpc", operationsQ),
        timed<{ data: unknown; error: unknown }>("supplier_debt_rpc", supplierDebtQ),
      ]);
    for (const r of [brandsR, catsR, meR, eeR]) if (r.error) throw r.error;
    if (operationsR.error) throw operationsR.error;
    if (supplierDebtR.error) throw supplierDebtR.error;
    const prodR = { data: prodRowsA, error: null };
    const supplierDebtSummary = (supplierDebtR.data ?? {}) as {
      totalOutstanding?: number;
      overdueCount?: number;
      topSuppliers?: Array<{ name: string; outstanding: number; overdue: number }>;
    };
    const operations = (operationsR.data ?? {}) as {
      monthlySales: Array<{ month: number; brandId: string; revenue: number; cogs: number }>;
      productSales: Array<{ productId: string; sold: number; returned: number }>;
      monthlyOrders: Array<{ month: number; total: number; confirmed: number; delivered: number; returned: number }>;
      couriers: Array<{ id: string; name: string; type: string; delivered: number; returned: number; collected: number }>;
      inventoryProducts: Array<{ productId: string; stock: number; produced: number }>;
      workers: Array<{ name: string; produced: number; productCount: number }>;
      fulfillment: Array<{ name: string; prepared: number; days: number }>;
    };

    const brands = (brandsR.data ?? []) as Array<{ id: string; name: string; type: "product" | "service" }>;
    const cats = (catsR.data ?? []) as Array<{ id: string; name: string }>;
    const catName = new Map(cats.map((c) => [c.id, c.name]));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meRows = (meR.data ?? []) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eeRows = (eeR.data ?? []) as any[];


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

    const salesRevByBrand = new Map<string, number>();
    for (const sale of operations.monthlySales ?? []) {
      const monthIdx = Number(sale.month) - 1;
      const revenue = Number(sale.revenue) || 0;
      salesRevByBrand.set(sale.brandId, (salesRevByBrand.get(sale.brandId) ?? 0) + revenue);
      if (monthly[monthIdx]) monthly[monthIdx].revenue += revenue;
    }

    for (const order of operations.monthlyOrders ?? []) {
      const monthIdx = Number(order.month) - 1;
      const m = monthly[monthIdx];
      if (!m) continue;
      m.ordersTotal += Number(order.total) || 0;
      m.ordersConfirmed += Number(order.confirmed) || 0;
      m.ordersDelivered += Number(order.delivered) || 0;
      m.ordersReturned += Number(order.returned) || 0;
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

    // Supplier debts (computed in the database via RPC)
    const totalOutstanding = Number(supplierDebtSummary.totalOutstanding) || 0;
    const overdueCount = Number(supplierDebtSummary.overdueCount) || 0;
    const topSuppliers = (supplierDebtSummary.topSuppliers ?? []).map((s) => ({
      name: s.name,
      outstanding: Number(s.outstanding) || 0,
      overdue: Number(s.overdue) || 0,
    }));


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
    const stockByProduct = new Map((operations.inventoryProducts ?? []).map((row) => [row.productId, Number(row.stock) || 0]));
    const producedByProduct = new Map((operations.inventoryProducts ?? []).map((row) => [row.productId, Number(row.produced) || 0]));
    const soldByProduct = new Map((operations.productSales ?? []).map((row) => [row.productId, Number(row.sold) || 0]));
    const returnedByProduct = new Map((operations.productSales ?? []).map((row) => [row.productId, Number(row.returned) || 0]));

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

    const topWorkers = (operations.workers ?? []).slice(0, 5).map((row) => ({
      name: row.name,
      produced: Number(row.produced) || 0,
      productCount: Number(row.productCount) || 0,
    }));

    const courierPerf = (operations.couriers ?? []).map((c) => {
      const delivered = Number(c.delivered) || 0;
      const returned = Number(c.returned) || 0;
      const total = delivered + returned;
      return {
        id: c.id, name: c.name, type: c.type, delivered, returned,
        collected: Number(c.collected) || 0,
        deliveryRate: total > 0 ? delivered / total : 0,
        returnRate: total > 0 ? returned / total : 0,
      };
    }).sort((a, b) => b.delivered - a.delivered);

    const fulfillment = (operations.fulfillment ?? []).map((row) => {
      const prepared = Number(row.prepared) || 0;
      const days = Number(row.days) || 0;
      return { name: row.name, prepared, days, avgPerDay: days > 0 ? prepared / days : 0 };
    });
    const totalPrepared = fulfillment.reduce((a, f) => a + f.prepared, 0);

    const cogsByBrand = new Map<string, number>();
    const monthlyCogs = Array.from({ length: 12 }, () => 0);
    for (const sale of operations.monthlySales ?? []) {
      const monthIdx = Number(sale.month) - 1;
      const cogs = Number(sale.cogs) || 0;
      if (monthlyCogs[monthIdx] !== undefined) monthlyCogs[monthIdx] += cogs;
      cogsByBrand.set(sale.brandId, (cogsByBrand.get(sale.brandId) ?? 0) + cogs);
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
    const { data, error } = await context.supabase
      .from("couriers")
      .select("*, courier_brands(brand_id)")
      .order("name");
    if (error) throw error;
    return (data ?? []).map((row) => ({
      ...row,
      brand_ids: (row.courier_brands ?? []).map((item: { brand_id: string }) => item.brand_id),
      courier_brands: undefined,
    })) as Array<{ id: string; name: string; type: "courier_company"|"rep"|"offline_branch"; contact: string | null; brand_id: string | null; brand_ids: string[]; serves_all_brands: boolean; active: boolean; opening_balance: number }>;
  });

export const upsertCourier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; name: string; type: "courier_company"|"rep"|"offline_branch"; contact?: string | null; brand_id?: string | null; brand_ids?: string[]; serves_all_brands?: boolean; active: boolean; opening_balance?: number }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const brandIds = data.brand_ids ?? (data.brand_id ? [data.brand_id] : []);
    const servesAllBrands = data.serves_all_brands ?? !data.brand_id;
    const { error } = await context.supabase.rpc("upsert_courier_with_brands", {
      // PostgreSQL accepts NULL for creates; generated types do not express argument nullability.
      _courier_id: (data.id ?? null) as unknown as string,
      _name: data.name,
      _type: data.type,
      _contact: data.contact ?? "",
      _active: data.active,
      _opening_balance: data.opening_balance ?? 0,
      _serves_all_brands: servesAllBrands,
      _brand_ids: servesAllBrands ? [] : brandIds,
    });
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
  .inputValidator((d: { brandId?: string | null; limit?: number; since?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const since = data.since ?? new Date(Date.now() - 90 * 86400000).toISOString();
    const rows = await fetchAllRows(() => {
      let q = context.supabase.from("sales_invoices")
        .select("id, brand_id, courier_id, product_id, type, qty, total_amount, collected_amount, occurred_at, note, sales_invoice_items(id, product_id, qty, unit_price, subtotal)")
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false });
      if (data.brandId) q = q.eq("brand_id", data.brandId);
      return q;
    }, { maxRows: data.limit ?? 2000 });
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
    const { data: result, error } = await (context.supabase as any).rpc("cash_summary_report", {
      _from: data.from || null,
      _to: data.to || null,
      _for_user_id: data.forUserId || null,
    });
    if (error) throw error;
    return result as {
      balance: number;
      periodIn: number;
      periodOut: number;
      periodNet: number;
      personalTotal: number;
      courierDebts: Array<{
        id: string;
        name: string;
        type: string;
        brand_id: string | null;
        active: boolean;
        totalOwed: number;
        totalCollected: number;
        remaining: number;
      }>;
      byUser: Array<{ userId: string; total: number }>;
    };
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
    const { data: result, error } = await (context.supabase as any).rpc(
      "revenue_comparison_report",
      { _year: data.year, _brand_id: data.brandId || null },
    );
    if (error) throw error;
    return result as {
      rows: Array<{
        brandId: string;
        brandName: string;
        month: number;
        manual: number;
        invoices: number;
        diff: number;
        absDiff: number;
      }>;
      totals: { manual: number; invoices: number; diff: number };
      year: number;
    };
  });
