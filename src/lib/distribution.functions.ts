import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPageWrite } from "./page-permissions.server";
import { ORDER_DISTRIBUTION_PAGE } from "./page-permission-paths";
import { balanceAssignments, getEligibleStaff, recordAssignments } from "./distribution.server";
import { ORDER_WORKFLOW_STATUSES, SHIPMENT_OUTCOMES } from "./order-lifecycle.shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

// Non-terminal order statuses — every real order_status value except the two
// terminal ones. Previously listed made-up values ("confirmed", "ready",
// "in_transit") that don't exist in ORDER_WORKFLOW_STATUSES, so "postponed"
// and "awaiting_response" orders silently never showed up in the distribution
// queue or the open-load count.
const OPEN_STATUSES = ORDER_WORKFLOW_STATUSES.filter((s) => s !== "succeeded" && s !== "cancelled");

// Terminal shipment outcomes — a closed order's courier attribution must not
// be silently rewritten by bulk (re)assignment, or courier performance
// analytics drift from what actually happened.
const TERMINAL_SHIPMENT_OUTCOMES_FILTER = `(${SHIPMENT_OUTCOMES.filter((s) => s !== "open").join(",")})`;

function norm(v: string | null | undefined) {
  return (v ?? "").trim().toLowerCase();
}

export type QueueOrder = {
  id: string;
  brandId: string;
  brandName: string;
  orderNumber: string | null;
  customerName: string | null;
  customerPhone: string | null;
  governorate: string | null;
  total: number;
  status: string;
  courierId: string | null;
  courierName: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  occurredAt: string;
  suggestedCourierId: string | null;
  suggestedCourierName: string | null;
  suggestedFee: number | null;
};

export type CourierLoad = {
  courierId: string;
  name: string;
  open: number;
  delivered: number;
  returned: number;
  deliveryRate: number;
  openAmount: number;
  governorates: number;
};

export type DistributionBoard = {
  queue: QueueOrder[];
  loads: CourierLoad[];
  couriers: Array<{ id: string; name: string; serves_all_brands: boolean; brandIds: string[] }>;
  employees: Array<{ id: string; name: string; email: string | null; brandId: string | null }>;
  governorates: string[];
  totals: { unassigned: number; assigned: number; openAmount: number };
};

export const getDistributionBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      brandId?: string | null;
      governorate?: string | null;
      onlyUnassigned?: boolean;
      search?: string | null;
      limit?: number;
      dateFrom?: string | null;
      dateTo?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }): Promise<DistributionBoard> => {
    const ctx = context as unknown as Ctx;
    const limit = Math.min(Math.max(data.limit ?? 200, 1), 500);

    let q = ctx.supabase
      .from("orders")
      .select(
        "id, brand_id, external_order_number, customer_name, customer_phone, shipping_governorate, total_amount, order_status, shipment_outcome, courier_id, assigned_user_id, occurred_at",
      )
      .in("order_status", OPEN_STATUSES)
      .order("occurred_at", { ascending: false })
      .limit(limit);

    if (data.brandId) q = q.eq("brand_id", data.brandId);
    if (data.governorate) q = q.eq("shipping_governorate", data.governorate);
    if (data.onlyUnassigned) q = q.is("courier_id", null);
    if (data.search?.trim()) {
      const s = data.search.trim();
      q = q.or(
        `customer_name.ilike.%${s}%,customer_phone.ilike.%${s}%,external_order_number.ilike.%${s}%`,
      );
    }

    const [{ data: rows, error }, brandsRes, couriersRes, courierBrandsRes, ratesRes, staff] =
      await Promise.all([
        q,
        ctx.supabase.from("brands").select("id, name"),
        ctx.supabase.from("couriers").select("id, name, serves_all_brands").eq("active", true),
        ctx.supabase.from("courier_brands").select("courier_id, brand_id"),
        ctx.supabase
          .from("courier_governorate_rates")
          .select("courier_id, governorate, delivery_fee")
          .eq("active", true),
        getEligibleStaff(ctx.supabase),
      ]);
    if (error) throw new Error(error.message);

    const brandName = new Map<string, string>(
      (brandsRes.data ?? []).map((b: { id: string; name: string }) => [b.id, b.name]),
    );
    const courierName = new Map<string, string>(
      (couriersRes.data ?? []).map((c: { id: string; name: string }) => [c.id, c.name]),
    );
    const staffName = new Map<string, string>(staff.map((e) => [e.id, e.name]));

    const brandsOfCourier = new Map<string, string[]>();
    for (const cb of (courierBrandsRes.data ?? []) as Array<{
      courier_id: string;
      brand_id: string;
    }>) {
      const arr = brandsOfCourier.get(cb.courier_id) ?? [];
      arr.push(cb.brand_id);
      brandsOfCourier.set(cb.courier_id, arr);
    }

    // cheapest active courier per governorate
    const bestByGov = new Map<string, { courierId: string; fee: number }>();
    const govCountByCourier = new Map<string, Set<string>>();
    for (const r of (ratesRes.data ?? []) as Array<{
      courier_id: string;
      governorate: string;
      delivery_fee: number;
    }>) {
      if (!courierName.has(r.courier_id)) continue;
      const g = norm(r.governorate);
      const set = govCountByCourier.get(r.courier_id) ?? new Set<string>();
      set.add(g);
      govCountByCourier.set(r.courier_id, set);
      const cur = bestByGov.get(g);
      if (!cur || Number(r.delivery_fee) < cur.fee) {
        bestByGov.set(g, { courierId: r.courier_id, fee: Number(r.delivery_fee) });
      }
    }

    const couriers: Array<{
      id: string;
      name: string;
      serves_all_brands: boolean;
      brandIds: string[];
    }> = (couriersRes.data ?? []).map(
      (c: { id: string; name: string; serves_all_brands: boolean }) => ({
        id: c.id,
        name: c.name,
        serves_all_brands: c.serves_all_brands,
        brandIds: brandsOfCourier.get(c.id) ?? [],
      }),
    );

    const canServe = (courierId: string, brandId: string) => {
      const c = couriers.find((x) => x.id === courierId);
      if (!c) return false;
      return c.serves_all_brands || c.brandIds.includes(brandId);
    };

    const govSet = new Set<string>();
    let unassigned = 0;
    let assigned = 0;
    let openAmount = 0;

    const queue: QueueOrder[] = ((rows ?? []) as Array<Record<string, unknown>>).map((o) => {
      const gov = (o["shipping_governorate"] as string | null) ?? null;
      if (gov) govSet.add(gov);
      const total = Number(o["total_amount"] ?? 0);
      openAmount += total;
      const courierId = (o["courier_id"] as string | null) ?? null;
      if (courierId) assigned += 1;
      else unassigned += 1;

      const brandId = o["brand_id"] as string;
      const best = gov ? bestByGov.get(norm(gov)) : undefined;
      const suggestion = best && canServe(best.courierId, brandId) ? best : undefined;

      const assignedUserId = (o["assigned_user_id"] as string | null) ?? null;
      return {
        id: o["id"] as string,
        brandId,
        brandName: brandName.get(brandId) ?? "—",
        orderNumber: (o["external_order_number"] as string | null) ?? null,
        customerName: (o["customer_name"] as string | null) ?? null,
        customerPhone: (o["customer_phone"] as string | null) ?? null,
        governorate: gov,
        total,
        status: (o["order_status"] as string) ?? "new",
        courierId,
        courierName: courierId ? (courierName.get(courierId) ?? "—") : null,
        assignedUserId,
        assignedUserName: assignedUserId ? (staffName.get(assignedUserId) ?? "—") : null,
        occurredAt: o["occurred_at"] as string,
        suggestedCourierId: suggestion?.courierId ?? null,
        suggestedCourierName: suggestion ? (courierName.get(suggestion.courierId) ?? null) : null,
        suggestedFee: suggestion?.fee ?? null,
      };
    });

    // courier load board (defaults to the last 90 days when no date filter is set)
    const since = data.dateFrom ?? new Date(Date.now() - 90 * 86400000).toISOString();
    let statsQ = ctx.supabase
      .from("orders")
      .select("courier_id, order_status, shipment_outcome, total_amount")
      .not("courier_id", "is", null)
      .gte("occurred_at", since);
    if (data.dateTo) statsQ = statsQ.lte("occurred_at", `${data.dateTo}T23:59:59.999Z`);
    if (data.brandId) statsQ = statsQ.eq("brand_id", data.brandId);
    const { data: statRows } = await statsQ;

    const loadMap = new Map<string, CourierLoad>();
    for (const c of couriers) {
      loadMap.set(c.id, {
        courierId: c.id,
        name: c.name,
        open: 0,
        delivered: 0,
        returned: 0,
        deliveryRate: 0,
        openAmount: 0,
        governorates: govCountByCourier.get(c.id)?.size ?? 0,
      });
    }
    for (const r of (statRows ?? []) as Array<Record<string, unknown>>) {
      const id = r["courier_id"] as string;
      const l = loadMap.get(id);
      if (!l) continue;
      const status = (r["order_status"] as string) ?? "";
      const outcome = (r["shipment_outcome"] as string) ?? "";
      if (status === "delivered" || outcome === "delivered") l.delivered += 1;
      else if (status === "returned" || outcome === "returned") l.returned += 1;
      else {
        l.open += 1;
        l.openAmount += Number(r["total_amount"] ?? 0);
      }
    }
    const loads = [...loadMap.values()]
      .map((l) => {
        const finished = l.delivered + l.returned;
        return { ...l, deliveryRate: finished ? (l.delivered / finished) * 100 : 0 };
      })
      .sort((a, b) => b.open - a.open);

    return {
      queue,
      loads,
      couriers,
      employees: staff.map((e) => ({ id: e.id, name: e.name, email: e.email, brandId: e.brandId })),
      governorates: [...govSet].sort((a, b) => a.localeCompare(b, "ar")),
      totals: { unassigned, assigned, openAmount },
    };
  });

export const assignOrdersCourier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderIds: string[]; courierId: string | null }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPageWrite(ctx, ORDER_DISTRIBUTION_PAGE);
    const ids = (data.orderIds ?? []).filter(Boolean).slice(0, 500);
    if (!ids.length) throw new Error("لم يتم اختيار أي أوردر");

    const { error } = await ctx.supabase
      .from("orders")
      .update({ courier_id: data.courierId })
      .in("id", ids)
      .not("shipment_outcome", "in", TERMINAL_SHIPMENT_OUTCOMES_FILTER);
    if (error) throw new Error(error.message);
    return { updated: ids.length };
  });

export const assignOrdersEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { orderIds: string[]; employeeId: string | null; reason?: string }) => input,
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPageWrite(ctx, ORDER_DISTRIBUTION_PAGE);
    const ids = (data.orderIds ?? []).filter(Boolean).slice(0, 500);
    if (!ids.length) throw new Error("لم يتم اختيار أي أوردر");

    await recordAssignments({
      supabase: ctx.supabase,
      userId: ctx.userId,
      assignments: ids.map((orderId) => ({ orderId, assignedUserId: data.employeeId })),
      method: data.employeeId ? "manual" : "unassign",
      reason: data.reason ?? null,
    });

    const { error } = await ctx.supabase
      .from("orders")
      .update({ assigned_user_id: data.employeeId })
      .in("id", ids);
    if (error) throw new Error(error.message);
    return { updated: ids.length };
  });

export const autoAssignOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { assignments: Array<{ orderId: string; courierId: string }> }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPageWrite(ctx, ORDER_DISTRIBUTION_PAGE);
    const list = (data.assignments ?? []).filter((a) => a.orderId && a.courierId).slice(0, 500);
    if (!list.length) return { updated: 0, failed: 0 };

    const byCourier = new Map<string, string[]>();
    for (const a of list) {
      const arr = byCourier.get(a.courierId) ?? [];
      arr.push(a.orderId);
      byCourier.set(a.courierId, arr);
    }

    let updated = 0;
    let failed = 0;
    for (const [courierId, ids] of byCourier) {
      const { error } = await ctx.supabase
        .from("orders")
        .update({ courier_id: courierId })
        .in("id", ids)
        .not("shipment_outcome", "in", TERMINAL_SHIPMENT_OUTCOMES_FILTER);
      if (error) failed += ids.length;
      else updated += ids.length;
    }
    return { updated, failed };
  });

/** Distributes orders evenly across eligible staff, continuing from current load. */
export const autoAssignOrdersToStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderIds: string[] }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPageWrite(ctx, ORDER_DISTRIBUTION_PAGE);
    const ids = (data.orderIds ?? []).filter(Boolean).slice(0, 500);
    if (!ids.length) throw new Error("لم يتم اختيار أي أوردر");

    const staff = await getEligibleStaff(ctx.supabase);
    const staffIds = staff.map((s) => s.id);
    if (!staffIds.length) throw new Error("لا يوجد موظفون لديهم صلاحية استلام الأوردرات");

    const { data: openRows } = await ctx.supabase
      .from("orders")
      .select("assigned_user_id")
      .in("order_status", OPEN_STATUSES)
      .not("assigned_user_id", "is", null);

    const load = new Map<string, number>();
    for (const r of (openRows ?? []) as Array<{ assigned_user_id: string }>) {
      load.set(r.assigned_user_id, (load.get(r.assigned_user_id) ?? 0) + 1);
    }

    const plan = balanceAssignments(ids, staffIds, load);
    const byEmployee = new Map<string, string[]>();
    for (const p of plan) {
      const arr = byEmployee.get(p.employeeId) ?? [];
      arr.push(p.orderId);
      byEmployee.set(p.employeeId, arr);
    }

    await recordAssignments({
      supabase: ctx.supabase,
      userId: ctx.userId,
      assignments: plan.map((p) => ({ orderId: p.orderId, assignedUserId: p.employeeId })),
      method: "auto",
      reason: "توزيع تلقائي بالتساوي حسب الحمل الحالي",
    });

    let updated = 0;
    let failed = 0;
    for (const [employeeId, orderIds] of byEmployee) {
      const { error } = await ctx.supabase
        .from("orders")
        .update({ assigned_user_id: employeeId })
        .in("id", orderIds);
      if (error) failed += orderIds.length;
      else updated += orderIds.length;
    }
    return { updated, failed, staffCount: staffIds.length };
  });

export type AssignmentLogRow = {
  id: string;
  createdAt: string;
  orderId: string;
  orderNumber: string | null;
  fromName: string | null;
  toName: string | null;
  method: string;
  reason: string | null;
  byName: string | null;
};

/** Audit trail of who received which order, when, and why. */
export const listAssignmentLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId?: string; employeeId?: string; limit?: number }) => input)
  .handler(async ({ data, context }): Promise<AssignmentLogRow[]> => {
    const ctx = context as unknown as Ctx;
    let q = ctx.supabase
      .from("order_assignment_log")
      .select(
        "id, created_at, order_id, previous_assigned_user_id, assigned_user_id, method, reason, performed_by",
      )
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(data.limit ?? 100, 1), 300));
    if (data.orderId) q = q.eq("order_id", data.orderId);
    if (data.employeeId) q = q.eq("assigned_user_id", data.employeeId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as Array<{
      id: string;
      created_at: string;
      order_id: string;
      previous_assigned_user_id: string | null;
      assigned_user_id: string | null;
      method: string;
      reason: string | null;
      performed_by: string | null;
    }>;
    if (!list.length) return [];

    const [{ data: orders }, staff] = await Promise.all([
      ctx.supabase
        .from("orders")
        .select("id, external_order_number")
        .in("id", [...new Set(list.map((r) => r.order_id))]),
      getEligibleStaff(),
    ]);
    const orderNum = new Map(
      ((orders ?? []) as Array<{ id: string; external_order_number: string | null }>).map((o) => [
        o.id,
        o.external_order_number,
      ]),
    );
    const byUser = new Map(staff.map((s) => [s.id, s.name]));

    return list.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      orderId: r.order_id,
      orderNumber: orderNum.get(r.order_id) ?? null,
      fromName: r.previous_assigned_user_id
        ? (byUser.get(r.previous_assigned_user_id) ?? null)
        : null,
      toName: r.assigned_user_id ? (byUser.get(r.assigned_user_id) ?? null) : null,
      method: r.method,
      reason: r.reason,
      byName: r.performed_by ? (byUser.get(r.performed_by) ?? null) : null,
    }));
  });

export type MyOrderRow = {
  id: string;
  brandId: string;
  brandName: string;
  orderNumber: string | null;
  customerName: string | null;
  customerPhone: string | null;
  governorate: string | null;
  total: number;
  orderStatus: string;
  confirmationStatus: string;
  courierId: string | null;
  courierName: string | null;
  occurredAt: string;
};

/** Orders currently assigned to the calling user — for their own "My Orders" view. */
export const getMyAssignedOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: string | null; limit?: number } = {}) => input)
  .handler(async ({ data, context }): Promise<MyOrderRow[]> => {
    const ctx = context as unknown as Ctx;
    const limit = Math.min(Math.max(data.limit ?? 200, 1), 500);

    let q = ctx.supabase
      .from("orders")
      .select(
        "id, brand_id, external_order_number, customer_name, customer_phone, shipping_governorate, total_amount, order_status, confirmation_status, courier_id, occurred_at",
      )
      .eq("assigned_user_id", ctx.userId)
      .order("occurred_at", { ascending: false })
      .limit(limit);
    if (data.status && data.status !== "all") q = q.eq("order_status", data.status);

    const [{ data: rows, error }, brandsRes, couriersRes] = await Promise.all([
      q,
      ctx.supabase.from("brands").select("id, name"),
      ctx.supabase.from("couriers").select("id, name"),
    ]);
    if (error) throw new Error(error.message);

    const brandName = new Map<string, string>(
      (brandsRes.data ?? []).map((b: { id: string; name: string }) => [b.id, b.name]),
    );
    const courierName = new Map<string, string>(
      (couriersRes.data ?? []).map((c: { id: string; name: string }) => [c.id, c.name]),
    );

    return ((rows ?? []) as Array<Record<string, unknown>>).map((o) => {
      const brandId = o["brand_id"] as string;
      const courierId = (o["courier_id"] as string | null) ?? null;
      return {
        id: o["id"] as string,
        brandId,
        brandName: brandName.get(brandId) ?? "—",
        orderNumber: (o["external_order_number"] as string | null) ?? null,
        customerName: (o["customer_name"] as string | null) ?? null,
        customerPhone: (o["customer_phone"] as string | null) ?? null,
        governorate: (o["shipping_governorate"] as string | null) ?? null,
        total: Number(o["total_amount"] ?? 0),
        orderStatus: (o["order_status"] as string) ?? "new",
        confirmationStatus: (o["confirmation_status"] as string) ?? "pending",
        courierId,
        courierName: courierId ? (courierName.get(courierId) ?? "—") : null,
        occurredAt: o["occurred_at"] as string,
      };
    });
  });

export type EmployeeOrdersPerformanceRow = {
  employeeId: string;
  employeeName: string;
  total: number;
  succeeded: number;
  cancelled: number;
  confirmed: number;
  pendingConfirmation: number;
};

/** Per-employee order counts for the selected period — how each rep's assigned orders are progressing. */
export const getEmployeeOrdersPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { dateFrom?: string | null; dateTo?: string | null; brandId?: string | null }) => input,
  )
  .handler(async ({ data, context }): Promise<EmployeeOrdersPerformanceRow[]> => {
    const ctx = context as unknown as Ctx;

    let q = ctx.supabase
      .from("orders")
      .select("assigned_user_id, order_status, confirmation_status")
      .not("assigned_user_id", "is", null);
    if (data.dateFrom) q = q.gte("occurred_at", data.dateFrom);
    if (data.dateTo) q = q.lte("occurred_at", `${data.dateTo}T23:59:59.999Z`);
    if (data.brandId) q = q.eq("brand_id", data.brandId);

    const [{ data: rows, error }, staff] = await Promise.all([q, getEligibleStaff(ctx.supabase)]);
    if (error) throw new Error(error.message);

    const staffName = new Map(staff.map((s) => [s.id, s.name]));

    const byUser = new Map<
      string,
      {
        total: number;
        succeeded: number;
        cancelled: number;
        confirmed: number;
        pendingConfirmation: number;
      }
    >();
    for (const r of (rows ?? []) as Array<{
      assigned_user_id: string;
      order_status: string | null;
      confirmation_status: string | null;
    }>) {
      const id = r.assigned_user_id;
      const entry = byUser.get(id) ?? {
        total: 0,
        succeeded: 0,
        cancelled: 0,
        confirmed: 0,
        pendingConfirmation: 0,
      };
      entry.total += 1;
      if (r.order_status === "succeeded") entry.succeeded += 1;
      if (r.order_status === "cancelled") entry.cancelled += 1;
      if (r.confirmation_status === "confirmed") entry.confirmed += 1;
      if (!r.confirmation_status || r.confirmation_status === "pending")
        entry.pendingConfirmation += 1;
      byUser.set(id, entry);
    }

    return [...byUser.entries()]
      .map(([employeeId, stats]) => ({
        employeeId,
        employeeName: staffName.get(employeeId) ?? employeeId.slice(0, 8),
        ...stats,
      }))
      .sort((a, b) => b.total - a.total);
  });
