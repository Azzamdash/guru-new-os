import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPageWrite } from "./page-permissions.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

const DISTRIBUTION_PAGE = "/order-distribution";

const OPEN_STATUSES = ["new", "confirmed", "processing", "ready", "in_transit"];

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
  employeeId: string | null;
  employeeName: string | null;
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
  employees: Array<{ id: string; name: string; brandId: string | null }>;
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
    }) => input,
  )
  .handler(async ({ data, context }): Promise<DistributionBoard> => {
    const ctx = context as unknown as Ctx;
    const limit = Math.min(Math.max(data.limit ?? 200, 1), 500);

    let q = ctx.supabase
      .from("orders")
      .select(
        "id, brand_id, external_order_number, customer_name, customer_phone, shipping_governorate, total_amount, order_status, shipment_outcome, courier_id, employee_id, occurred_at",
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
    const empName = new Map<string, string>(staff.map((e) => [e.id, e.name]));


    const brandsOfCourier = new Map<string, string[]>();
    for (const cb of (courierBrandsRes.data ?? []) as Array<{ courier_id: string; brand_id: string }>) {
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

    const couriers: Array<{ id: string; name: string; serves_all_brands: boolean; brandIds: string[] }> = (
      couriersRes.data ?? []
    ).map((c: { id: string; name: string; serves_all_brands: boolean }) => ({
      id: c.id,
      name: c.name,
      serves_all_brands: c.serves_all_brands,
      brandIds: brandsOfCourier.get(c.id) ?? [],
    }));

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

      const employeeId = (o["employee_id"] as string | null) ?? null;
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
        employeeId,
        employeeName: employeeId ? (empName.get(employeeId) ?? "—") : null,
        occurredAt: o["occurred_at"] as string,
        suggestedCourierId: suggestion?.courierId ?? null,
        suggestedCourierName: suggestion ? (courierName.get(suggestion.courierId) ?? null) : null,
        suggestedFee: suggestion?.fee ?? null,
      };
    });

    // courier load board (last 90 days)
    const since = new Date(Date.now() - 90 * 86400000).toISOString();
    let statsQ = ctx.supabase
      .from("orders")
      .select("courier_id, order_status, shipment_outcome, total_amount")
      .not("courier_id", "is", null)
      .gte("occurred_at", since);
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
      employees: staff.map((e) => ({ id: e.id, name: e.name, brandId: e.brandId })),
      governorates: [...govSet].sort((a, b) => a.localeCompare(b, "ar")),
      totals: { unassigned, assigned, openAmount },
    };
  });

export const assignOrdersCourier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderIds: string[]; courierId: string | null }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPageWrite(ctx, DISTRIBUTION_PAGE);
    const ids = (data.orderIds ?? []).filter(Boolean).slice(0, 500);
    if (!ids.length) throw new Error("لم يتم اختيار أي أوردر");

    const { error } = await ctx.supabase
      .from("orders")
      .update({ courier_id: data.courierId })
      .in("id", ids);
    if (error) throw new Error(error.message);
    return { updated: ids.length };
  });

export const assignOrdersEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderIds: string[]; employeeId: string | null }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPageWrite(ctx, DISTRIBUTION_PAGE);
    const ids = (data.orderIds ?? []).filter(Boolean).slice(0, 500);
    if (!ids.length) throw new Error("لم يتم اختيار أي أوردر");

    const { error } = await ctx.supabase
      .from("orders")
      .update({ employee_id: data.employeeId })
      .in("id", ids);
    if (error) throw new Error(error.message);
    return { updated: ids.length };
  });

export const autoAssignOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { assignments: Array<{ orderId: string; courierId: string }> }) => input)
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertPageWrite(ctx, DISTRIBUTION_PAGE);
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
      const { error } = await ctx.supabase.from("orders").update({ courier_id: courierId }).in("id", ids);
      if (error) failed += ids.length;
      else updated += ids.length;
    }
    return { updated, failed };
  });
