import { getTodayInBusinessTimezone } from "@/lib/timezone";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "./paginate";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

async function assertSalesAccess(ctx: Ctx) {
  // Admin/manager/data_entry/accountant can also use POS; sales_man is the primary role.
  const { data: roles } = await ctx.supabase
    .from("user_roles").select("role").eq("user_id", ctx.userId);
  const list = (roles ?? []).map((r: { role: string }) => r.role);
  const allowed = ["sales_man", "admin", "manager", "data_entry", "accountant"];
  if (!list.some((r: string) => allowed.includes(r))) throw new Error("Forbidden");
}

/** Offline-branch brands the current user has access to. */
export const listMyOfflineBranches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSalesAccess(context);
    const { data, error } = await context.supabase
      .from("brands")
      .select("id,name,slug,type,active")
      .eq("type", "offline_branch")
      .eq("active", true)
      .order("sort_order").order("name");
    if (error) throw error;
    return (data ?? []) as Array<{ id: string; name: string; slug: string; type: string; active: boolean }>;
  });

/** Active products for a specific offline branch with on-hand qty. */
export const listBranchProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertSalesAccess(context);
    const { data: rows, error } = await context.supabase
      .from("products")
      .select("id,name,sku,sell_price,on_hand_qty,unit,active,brand_id")
      .eq("brand_id", data.brandId)
      .eq("active", true)
      .order("name");
    if (error) throw error;
    return (rows ?? []) as Array<{ id: string; name: string; sku: string | null; sell_price: number; on_hand_qty: number; unit: string; active: boolean; brand_id: string }>;
  });

/** Create a POS sale: one invoice + N items. Deducts stock via DB trigger. */
export const createPosSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    brandId: string;
    customerName: string;
    customerPhone: string;
    paymentMethod: "cash" | "visa" | "mixed";
    cashAmount: number;
    cardAmount: number;
    items: Array<{ productId: string; qty: number; unitPrice: number }>;
  }) => {
    if (!d.brandId) throw new Error("Branch required");
    if (!d.customerName?.trim()) throw new Error("Customer name required");
    if (!d.customerPhone?.trim()) throw new Error("Customer phone required");
    if (!Array.isArray(d.items) || d.items.length === 0) throw new Error("No items");
    if (!["cash", "visa", "mixed"].includes(d.paymentMethod)) throw new Error("Invalid payment");
    for (const it of d.items) {
      if (!it.productId) throw new Error("Product required");
      if (!(it.qty > 0)) throw new Error("Qty must be > 0");
      if (!(it.unitPrice >= 0)) throw new Error("Invalid price");
    }
    return d;
  })
  .handler(async ({ data, context }) => {
    try {
      await assertSalesAccess(context);
      // Verify brand is offline_branch and user has access
      const { data: b, error: bErr } = await context.supabase
        .from("brands").select("id,type").eq("id", data.brandId).maybeSingle();
      if (bErr) throw bErr;
      if (!b || b.type !== "offline_branch") throw new Error("Branch invalid");

      const totalAmount = data.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
      const cash = data.paymentMethod === "cash" ? totalAmount
                 : data.paymentMethod === "visa" ? 0
                 : Math.max(0, Number(data.cashAmount) || 0);
      const card = data.paymentMethod === "visa" ? totalAmount
                 : data.paymentMethod === "cash" ? 0
                 : Math.max(0, Number(data.cardAmount) || 0);
      if (data.paymentMethod === "mixed" && Math.abs(cash + card - totalAmount) > 0.5) {
        throw new Error("Cash + card must equal total");
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: prods } = await supabaseAdmin
        .from("products").select("id,name").in("id", data.items.map((i) => i.productId));
      const nameMap = new Map((prods ?? []).map((p: { id: string; name: string }) => [p.id, p.name]));

      const { getCogsMap } = await import("@/lib/cogs.server");
      const costMap = await getCogsMap(supabaseAdmin, data.items.map((i) => i.productId));
      const cost_total = data.items.reduce((s, it) => s + it.qty * (costMap.get(it.productId) ?? 0), 0);

      const nowIso = new Date().toISOString();
      const { data: orderRow, error: oErr } = await supabaseAdmin
        .from("orders")
        .insert({
          brand_id: data.brandId,
          source: "pos",
          customer_name: data.customerName.trim(),
          customer_phone: data.customerPhone.trim(),
          fulfillment_status: "delivered",
          financial_status: "paid",
          confirmation_status: "confirmed",
          subtotal_amount: totalAmount,
          shipping_amount: 0,
          discount_amount: 0,
          total_amount: totalAmount,
          cost_total,
          occurred_at: nowIso,
          note: "POS sale",
        })
        .select("id, invoice_id")
        .single();
      if (oErr) throw new Error(`orders.insert: ${oErr.message}`);
      if (!orderRow?.invoice_id) throw new Error("orders.insert: invoice_id missing");
      const invoiceId = orderRow.invoice_id as string;

      const { error: oiErr } = await supabaseAdmin.from("order_items").insert(
        data.items.map((it) => ({
          order_id: orderRow.id,
          product_id: it.productId,
          title: nameMap.get(it.productId) ?? "Item",
          qty: it.qty,
          unit_price: it.unitPrice,
          unit_cost: costMap.get(it.productId) ?? 0,
          subtotal: it.qty * it.unitPrice,
        })),
      );
      if (oiErr) throw new Error(`order_items.insert: ${oiErr.message}`);

      const { error: uErr } = await supabaseAdmin
        .from("sales_invoices")
        .update({
          payment_method: data.paymentMethod,
          cash_amount: cash,
          card_amount: card,
          collected_amount: data.paymentMethod === "mixed" ? cash + card : totalAmount,
          sold_by: context.userId,
          stage: "delivered",
          note: "POS sale",
        })
        .eq("id", invoiceId);
      if (uErr) throw new Error(`sales_invoices.update: ${uErr.message}`);

      return { id: invoiceId, totalAmount, cash, card };
    } catch (e) {
      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
      console.error("[createPosSale] failed:", msg, e);
      throw new Error(msg || "POS sale failed");
    }
  });


/** Recent sales made by the current salesman (today only). */
export const listMyRecentSales = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number; brandId?: string | null } = {}) => d)
  .handler(async ({ data: input, context }) => {
    const days = Math.max(1, Number(input?.days ?? 7));
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const { data, error } = await context.supabase
      .from("sales_invoices")
      .select("id,total_amount,payment_method,customer_name,customer_phone,created_at,brand_id")
      .eq("sold_by", context.userId)
      .gte("occurred_at", since)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data ?? []) as Array<{ id: string; total_amount: number; payment_method: string | null; customer_name: string | null; customer_phone: string | null; created_at: string; brand_id: string }>;
  });

/** All offline-branch invoices in the last N days (default 14) for print/whatsapp.
 *  Available to sales_man and privileged staff. Supports date/customer/brand filters. */
export const listBranchInvoicesForPrint = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number; brandId?: string; startDate?: string; endDate?: string; search?: string } = {}) => d)
  .handler(async ({ data: input, context }) => {
    await assertSalesAccess(context);
    const days = Math.max(1, Math.min(60, Number(input?.days ?? 14)));
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

    const { data: branches } = await context.supabase
      .from("brands").select("id,name").eq("type", "offline_branch").eq("active", true);
    const branchIds = (branches ?? []).map((b: { id: string }) => b.id);
    if (branchIds.length === 0) return { invoices: [], branches: [] };
    const nameById = new Map((branches ?? []).map((b: { id: string; name: string }) => [b.id, b.name]));

    const data2 = await fetchAllRows<{ id: string; brand_id: string; total_amount: number; payment_method: string | null; customer_name: string | null; customer_phone: string | null; occurred_at: string; created_at: string; sold_by: string | null }>(() => {
      let q = context.supabase
        .from("sales_invoices")
        .select("id,brand_id,total_amount,payment_method,customer_name,customer_phone,occurred_at,created_at,sold_by")
        .in("brand_id", input?.brandId ? [input.brandId] : branchIds)
        .gte("occurred_at", input?.startDate ?? since)
        .order("created_at", { ascending: false });
      if (input?.endDate) q = q.lte("occurred_at", input.endDate);
      if (input?.search?.trim()) {
        const s = input.search.trim();
        q = q.or(`customer_name.ilike.%${s}%,customer_phone.ilike.%${s}%`);
      }
      return q;
    });
    return {
      invoices: data2.map((r) => ({
        ...r,
        brand_name: nameById.get(r.brand_id) ?? "",
      })),
      branches: (branches ?? []) as Array<{ id: string; name: string }>,
    };
  });

/** Full details for one invoice (for print/whatsapp). Uses admin client
 *  after asserting the caller has sales access and the invoice belongs to
 *  an offline branch — otherwise a freshly-created invoice may not be visible
 *  under sales_man RLS in the same request. */
export const getPosInvoice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertSalesAccess(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv, error } = await supabaseAdmin
      .from("sales_invoices")
      .select("id,total_amount,cash_amount,card_amount,payment_method,customer_name,customer_phone,created_at,brand_id,sold_by")
      .eq("id", data.id).maybeSingle();
    if (error) throw error;
    if (!inv) throw new Error("Not found");
    const { data: brand } = await supabaseAdmin
      .from("brands").select("name,type").eq("id", inv.brand_id).maybeSingle();
    if (!brand || brand.type !== "offline_branch") throw new Error("Not found");
    const { data: items } = await supabaseAdmin
      .from("sales_invoice_items")
      .select("id,qty,unit_price,subtotal,product_id,products(name)")
      .eq("invoice_id", data.id);
    return {
      ...inv,
      brand_name: brand?.name ?? "",
      items: (items ?? []).map((r: { id: string; qty: number; unit_price: number; subtotal: number; product_id: string | null; products: { name: string } | null }) => ({
        id: r.id, qty: r.qty, unit_price: r.unit_price, subtotal: r.subtotal,
        product_id: r.product_id,
        product_name: r.products?.name ?? "",
      })),
    };
  });

/** List offline-branch invoices with filters. Admin/manager only. */
export const listOfflineInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { startDate?: string; endDate?: string; brandId?: string; search?: string }) => d)
  .handler(async ({ data, context }) => {
    const [adminR, mgrR] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "manager" }),
    ]);
    const isAdmin = !!adminR.data;
    const isPrivileged = isAdmin || !!mgrR.data;
    if (!isPrivileged) throw new Error("Forbidden");

    const { data: branches } = await context.supabase
      .from("brands").select("id,name").eq("type", "offline_branch");
    const branchIds = (branches ?? []).map((b: { id: string }) => b.id);
    if (branchIds.length === 0) return { invoices: [], canDelete: isAdmin, canEdit: isPrivileged };
    const nameById = new Map((branches ?? []).map((b: { id: string; name: string }) => [b.id, b.name]));

    const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const rows = await fetchAllRows(() => {
      let q = context.supabase
        .from("sales_invoices")
        .select("id,brand_id,customer_id,total_amount,cash_amount,card_amount,payment_method,customer_name,customer_phone,customer_email,occurred_at,created_at,sold_by,note,qty")
        .in("brand_id", data.brandId ? [data.brandId] : branchIds)
        .gte("occurred_at", data.startDate ?? since)
        .order("created_at", { ascending: false });
      if (data.endDate) q = q.lte("occurred_at", data.endDate);
      if (data.search?.trim()) {
        const s = data.search.trim();
        q = q.or(`customer_name.ilike.%${s}%,customer_phone.ilike.%${s}%`);
      }
      return q;
    }, { maxRows: 2000 });

    // Resolve seller emails
    const sellerIds = Array.from(new Set((rows ?? []).map((r: { sold_by: string | null }) => r.sold_by).filter(Boolean))) as string[];
    const emailById = new Map<string, string>();
    if (sellerIds.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: users } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
      for (const u of users?.users ?? []) emailById.set(u.id, u.email ?? "");
    }

    return {
      canDelete: isAdmin,
      canEdit: isPrivileged,
      invoices: (rows ?? []).map((r: { id: string; brand_id: string; customer_id: string | null; total_amount: number; cash_amount: number | null; card_amount: number | null; payment_method: string | null; customer_name: string | null; customer_phone: string | null; customer_email: string | null; occurred_at: string; created_at: string; sold_by: string | null; note: string | null; qty: number }) => ({
        id: r.id,
        brand_id: r.brand_id,
        customer_id: r.customer_id,
        brand_name: nameById.get(r.brand_id) ?? "",
        total_amount: Number(r.total_amount) || 0,
        cash_amount: Number(r.cash_amount) || 0,
        card_amount: Number(r.card_amount) || 0,
        payment_method: r.payment_method,
        customer_name: r.customer_name,
        customer_phone: r.customer_phone,
        customer_email: r.customer_email,
        occurred_at: r.occurred_at,
        created_at: r.created_at,
        sold_by_email: r.sold_by ? (emailById.get(r.sold_by) ?? "") : "",
        note: r.note,
        qty: Number(r.qty) || 0,
      })),
    };
  });

/** Update editable fields on an offline invoice. Admin/manager only. */
export const updateOfflineInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id: string;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string | null;
    note?: string | null;
    occurredAt?: string;
  }) => {
    if (!d.id) throw new Error("Invoice required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const [adminR, mgrR] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "manager" }),
    ]);
    if (!adminR.data && !mgrR.data) throw new Error("Forbidden");

    const patch: {
      customer_name?: string;
      customer_phone?: string;
      customer_email?: string | null;
      note?: string | null;
      occurred_at?: string;
    } = {};
    if (data.customerName !== undefined) patch.customer_name = data.customerName.trim();
    if (data.customerPhone !== undefined) patch.customer_phone = data.customerPhone.trim();
    if (data.customerEmail !== undefined) patch.customer_email = data.customerEmail?.trim() || null;
    if (data.note !== undefined) patch.note = data.note;
    if (data.occurredAt !== undefined) patch.occurred_at = data.occurredAt;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("sales_invoices").update(patch).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/** Delete an offline invoice (and its order/items via cascade). Admin only. */
export const deleteOfflineInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    if (!d.id) throw new Error("Invoice required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Delete linked order first (has ON DELETE trigger removing invoice); fallback: delete invoice directly.
    const { data: ord } = await supabaseAdmin.from("orders").select("id").eq("invoice_id", data.id).maybeSingle();
    if (ord?.id) {
      const { error: oErr } = await supabaseAdmin.from("orders").delete().eq("id", ord.id);
      if (oErr) throw oErr;
    }
    // Ensure invoice is gone (in case no order linked)
    await supabaseAdmin.from("sales_invoices").delete().eq("id", data.id);
    return { ok: true };
  });

/** Reports: per-branch revenue/expenses/stock and top salesmen. Admin/manager only. */
export const getBranchesReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { startDate?: string; endDate?: string }) => d)
  .handler(async ({ data, context }) => {
    // Check admin/manager
    const [adminR, mgrR] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "manager" }),
    ]);
    if (!adminR.data && !mgrR.data) throw new Error("Forbidden");

    const start = data.startDate ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const end = data.endDate ?? getTodayInBusinessTimezone();

    const { data: branches } = await context.supabase
      .from("brands").select("id,name").eq("type", "offline_branch").eq("active", true);
    const branchIds = (branches ?? []).map((b: { id: string }) => b.id);
    if (branchIds.length === 0) return { branches: [], topSellers: [], start, end };

    const [invRes, expRes, prodRes, sellersRes] = await Promise.all([
      context.supabase.from("sales_invoices")
        .select("id,brand_id,total_amount,cash_amount,card_amount,payment_method,sold_by,occurred_at")
        .in("brand_id", branchIds).gte("occurred_at", start).lte("occurred_at", end),
      context.supabase.from("expense_entries")
        .select("brand_id,amount,year,month")
        .in("brand_id", branchIds),
      context.supabase.from("products")
        .select("brand_id,on_hand_qty,sell_price,moving_avg_cost,cogs_override")
        .in("brand_id", branchIds),
      context.supabase.from("sales_invoices")
        .select("sold_by,total_amount,brand_id")
        .in("brand_id", branchIds).gte("occurred_at", start).lte("occurred_at", end).not("sold_by", "is", null),
    ]);

    const branchMap = new Map<string, { id: string; name: string; revenue: number; cash: number; card: number; orders: number; pieces: number; expenses: number; stockUnits: number; stockValue: number }>();
    for (const b of branches ?? []) {
      branchMap.set(b.id, { id: b.id, name: b.name, revenue: 0, cash: 0, card: 0, orders: 0, pieces: 0, expenses: 0, stockUnits: 0, stockValue: 0 });
    }
    for (const inv of invRes.data ?? []) {
      const row = branchMap.get(inv.brand_id);
      if (!row) continue;
      row.revenue += Number(inv.total_amount) || 0;
      row.cash += Number(inv.cash_amount) || 0;
      row.card += Number(inv.card_amount) || 0;
      row.orders += 1;
    }
    // Pieces sold: sum qty from sales_invoice_items across the fetched invoices
    const invIds = (invRes.data ?? []).map((i: { id: string }) => i.id);
    if (invIds.length) {
      const invBrand = new Map((invRes.data ?? []).map((i: { id: string; brand_id: string }) => [i.id, i.brand_id]));
      const { data: itemsRows } = await context.supabase
        .from("sales_invoice_items").select("invoice_id, qty").in("invoice_id", invIds);
      for (const it of (itemsRows ?? []) as Array<{ invoice_id: string; qty: number }>) {
        const bid = invBrand.get(it.invoice_id);
        if (!bid) continue;
        const row = branchMap.get(bid);
        if (!row) continue;
        row.pieces += Number(it.qty) || 0;
      }
    }
    // expense filter by date period (year/month within range)
    const sy = Number(start.slice(0, 4)), sm = Number(start.slice(5, 7));
    const ey = Number(end.slice(0, 4)), em = Number(end.slice(5, 7));
    for (const e of expRes.data ?? []) {
      const key = e.year * 12 + e.month;
      if (key < sy * 12 + sm || key > ey * 12 + em) continue;
      const row = branchMap.get(e.brand_id);
      if (!row) continue;
      row.expenses += Number(e.amount) || 0;
    }
    for (const p of prodRes.data ?? []) {
      const row = branchMap.get(p.brand_id);
      if (!row) continue;
      const q = Number(p.on_hand_qty) || 0;
      row.stockUnits += q;
      const cost = Number(p.cogs_override ?? p.moving_avg_cost ?? 0) || 0;
      row.stockValue += q * cost;
    }

    // Top salesmen: aggregate by sold_by then attach email via admin listUsers
    const bySeller = new Map<string, { userId: string; revenue: number; orders: number }>();
    for (const inv of sellersRes.data ?? []) {
      const sid = inv.sold_by as string;
      const cur = bySeller.get(sid) ?? { userId: sid, revenue: 0, orders: 0 };
      cur.revenue += Number(inv.total_amount) || 0;
      cur.orders += 1;
      bySeller.set(sid, cur);
    }
    let topSellers: Array<{ userId: string; email: string; revenue: number; orders: number }> = [];
    if (bySeller.size > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: users } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
      const emailById = new Map((users?.users ?? []).map((u) => [u.id, u.email ?? ""]));
      topSellers = Array.from(bySeller.values())
        .map((r) => ({ ...r, email: emailById.get(r.userId) ?? r.userId }))
        .sort((a, b) => b.revenue - a.revenue);
    }

    return {
      branches: Array.from(branchMap.values())
        .map((b) => ({ ...b, profit: b.revenue - b.expenses }))
        .sort((a, b) => b.revenue - a.revenue),
      topSellers,
      start,
      end,
    };
  });

/** Replace the items of an offline invoice. Admin/manager only. */
export const updateOfflineInvoiceItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id: string;
    items: Array<{ productId: string; qty: number; unitPrice: number }>;
  }) => {
    if (!d.id) throw new Error("Invoice required");
    if (!Array.isArray(d.items) || d.items.length === 0) throw new Error("At least one item required");
    for (const it of d.items) {
      if (!it.productId) throw new Error("Product required");
      if (!(Number(it.qty) > 0)) throw new Error("Qty must be > 0");
      if (!(Number(it.unitPrice) >= 0)) throw new Error("Invalid price");
    }
    return d;
  })
  .handler(async ({ data, context }) => {
    const [adminR, mgrR] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "manager" }),
    ]);
    if (!adminR.data && !mgrR.data) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find the underlying order to keep orders/invoice in sync via triggers.
    const { data: ord } = await supabaseAdmin
      .from("orders").select("id").eq("invoice_id", data.id).maybeSingle();
    if (!ord?.id) throw new Error("Order not found for this invoice");

    const { data: prods } = await supabaseAdmin
      .from("products").select("id,name").in("id", data.items.map((i) => i.productId));
    const nameMap = new Map((prods ?? []).map((p: { id: string; name: string }) => [p.id, p.name]));

    const newTotal = data.items.reduce((s, it) => s + Number(it.qty) * Number(it.unitPrice), 0);

    // Replace order_items — trigger syncs into sales_invoice_items + invoice qty.
    const { error: delErr } = await supabaseAdmin.from("order_items").delete().eq("order_id", ord.id);
    if (delErr) throw delErr;
    const { error: insErr } = await supabaseAdmin.from("order_items").insert(
      data.items.map((it) => ({
        order_id: ord.id,
        product_id: it.productId,
        title: nameMap.get(it.productId) ?? "Item",
        qty: it.qty,
        unit_price: it.unitPrice,
        unit_cost: 0,
        subtotal: Number(it.qty) * Number(it.unitPrice),
      })),
    );
    if (insErr) throw insErr;

    // Update order totals — orders_sync_invoice trigger propagates to sales_invoices.
    const { error: uOrdErr } = await supabaseAdmin
      .from("orders")
      .update({ subtotal_amount: newTotal, total_amount: newTotal })
      .eq("id", ord.id);
    if (uOrdErr) throw uOrdErr;

    // Recompute cash/card split proportionally so payment_method stays valid.
    const { data: inv } = await supabaseAdmin
      .from("sales_invoices").select("payment_method,cash_amount,card_amount").eq("id", data.id).maybeSingle();
    let cash = 0, card = 0;
    if (inv?.payment_method === "cash") cash = newTotal;
    else if (inv?.payment_method === "visa") card = newTotal;
    else {
      const prev = Number(inv?.cash_amount ?? 0) + Number(inv?.card_amount ?? 0);
      if (prev > 0) {
        const ratio = Number(inv?.cash_amount ?? 0) / prev;
        cash = Math.round(newTotal * ratio * 100) / 100;
        card = Math.max(0, newTotal - cash);
      } else { cash = newTotal; }
    }
    await supabaseAdmin.from("sales_invoices")
      .update({ collected_amount: newTotal, cash_amount: cash, card_amount: card })
      .eq("id", data.id);

    return { ok: true, total: newTotal };
  });