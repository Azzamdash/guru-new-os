import { getTodayInBusinessTimezone } from "@/lib/timezone";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPageWrite } from "./page-permissions.server";
import { COURIERS_PAGE } from "./page-permission-paths";
import { normalizeGovernorate } from "./governorate.shared";

const rateInput = (data: {
  id?: string;
  courierId: string;
  governorate: string;
  deliveryFee: number;
  customerReturnFee: number;
  failedDeliveryFee: number;
  exchangeFee: number;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  active?: boolean;
}) => data;

export const listCourierRates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("courier_governorate_rates")
      .select(
        "id, courier_id, governorate, delivery_fee, customer_return_fee, failed_delivery_fee, exchange_fee, active, effective_from, effective_to, couriers(name, brand_id, serves_all_brands)",
      )
      .order("governorate")
      .order("effective_from", { ascending: false });
    if (error) {
      const message = String(error.message ?? "");
      if (
        error.code === "42P01" ||
        error.code === "PGRST205" ||
        message.includes("courier_governorate_rates")
      ) {
        return { ready: false as const, rates: [] };
      }
      throw error;
    }
    return { ready: true as const, rates: data ?? [] };
  });

export const upsertCourierRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(rateInput)
  .handler(async ({ data, context }) => {
    await assertPageWrite(context, COURIERS_PAGE);
    const governorate = data.governorate.trim();
    if (!governorate) throw new Error("Governorate is required");
    if (
      data.deliveryFee < 0 ||
      data.customerReturnFee < 0 ||
      data.failedDeliveryFee < 0 ||
      data.exchangeFee < 0
    ) {
      throw new Error("Courier fees cannot be negative");
    }

    const payload = {
      ...(data.id ? { id: data.id } : {}),
      courier_id: data.courierId,
      governorate,
      delivery_fee: data.deliveryFee,
      return_fee: data.failedDeliveryFee,
      customer_return_fee: data.customerReturnFee,
      failed_delivery_fee: data.failedDeliveryFee,
      exchange_fee: data.exchangeFee,
      effective_from: data.effectiveFrom ?? getTodayInBusinessTimezone(),
      effective_to: data.effectiveTo ?? null,
      active: data.active ?? true,
      updated_at: new Date().toISOString(),
    };
    const { data: saved, error } = await context.supabase
      .from("courier_governorate_rates")
      .upsert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: saved.id as string };
  });

/**
 * Sets a whole rate card in one call — one courier, one effective date, every
 * governorate at once.
 *
 * Filling these one dialog at a time meant 27 round trips per courier, which is
 * why they tend to go unset; and an unset governorate is not a loud failure but
 * a silent zero fee (accrue_order_courier_charge finds no rate and lands on
 * COALESCE(charge_amount, 0)), which then keeps that order's shipping out of
 * profit entirely.
 *
 * Conflicts resolve on the natural key rather than the primary key, so re-saving
 * the same courier and date updates the card instead of colliding with
 * courier_governorate_rates_courier_id_governorate_effective__key. Sending the
 * same card twice is therefore a no-op, and a later effective_from leaves the
 * earlier card intact as history.
 */
export const bulkUpsertCourierRates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      courierId: string;
      effectiveFrom?: string;
      rows: Array<{
        governorate: string;
        deliveryFee: number;
        customerReturnFee: number;
        failedDeliveryFee: number;
        exchangeFee: number;
      }>;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    await assertPageWrite(context, COURIERS_PAGE);
    if (!data.courierId) throw new Error("Courier is required");
    const effectiveFrom = data.effectiveFrom ?? getTodayInBusinessTimezone();
    const now = new Date().toISOString();

    const seen = new Set<string>();
    const payload = data.rows.map((row) => {
      const governorate = row.governorate.trim();
      if (!governorate) throw new Error("Governorate is required");
      const key = normalizeGovernorate(governorate);
      // The unique key is per (courier, governorate, date); two rows for the same
      // governorate in one payload would make the upsert order decide the winner.
      if (seen.has(key)) throw new Error(`محافظة مكررة في نفس الكشف: ${governorate}`);
      seen.add(key);
      const fees = [
        row.deliveryFee,
        row.customerReturnFee,
        row.failedDeliveryFee,
        row.exchangeFee,
      ].map((fee) => Number(fee) || 0);
      if (fees.some((fee) => fee < 0)) throw new Error("Courier fees cannot be negative");
      const [deliveryFee, customerReturnFee, failedDeliveryFee, exchangeFee] = fees;
      return {
        courier_id: data.courierId,
        governorate,
        delivery_fee: deliveryFee,
        // Legacy NOT NULL column with no default; kept in step with the fee that
        // replaced it, exactly as upsertCourierRate does.
        return_fee: failedDeliveryFee,
        customer_return_fee: customerReturnFee,
        failed_delivery_fee: failedDeliveryFee,
        exchange_fee: exchangeFee,
        effective_from: effectiveFrom,
        effective_to: null,
        active: true,
        updated_at: now,
      };
    });
    if (payload.length === 0) return { ok: true, saved: 0 };

    const { error } = await context.supabase
      .from("courier_governorate_rates")
      .upsert(payload, { onConflict: "courier_id,governorate,effective_from" });
    if (error) throw error;
    return { ok: true, saved: payload.length };
  });

/**
 * Governorates that priced an order at zero because no rate matched, grouped so
 * the gap reads as "this courier needs these governorates" rather than as a list
 * of individual orders. rate_missing is set by persist_order_courier_charge at
 * accrual time, so this is the system's own record of what it could not price.
 */
export const getCourierRateGaps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("courier_charges")
      .select("courier_id, orders(shipping_governorate), couriers(name)")
      .eq("rate_missing", true)
      .is("settled_at", null)
      .limit(2000);
    if (error) throw error;

    const gaps = new Map<
      string,
      { courierId: string; courierName: string; governorate: string; orders: number }
    >();
    for (const row of (data ?? []) as unknown as Array<{
      courier_id: string;
      orders: { shipping_governorate: string | null } | null;
      couriers: { name: string } | null;
    }>) {
      const governorate = (row.orders?.shipping_governorate ?? "").trim();
      if (!governorate) continue;
      const key = `${row.courier_id}::${normalizeGovernorate(governorate)}`;
      const hit = gaps.get(key);
      if (hit) hit.orders += 1;
      else
        gaps.set(key, {
          courierId: row.courier_id,
          courierName: row.couriers?.name ?? "—",
          governorate,
          orders: 1,
        });
    }
    return Array.from(gaps.values()).sort((a, b) => b.orders - a.orders);
  });

/**
 * Re-prices open courier charges from the current rate card.
 *
 * Adding a governorate rate does nothing to the orders that already needed it —
 * the accrual triggers watch public.orders, not courier_governorate_rates — so
 * an order delivered before its rate existed keeps the zero it accrued. This
 * re-fires those triggers so the fee is recomputed by the same logic that
 * priced it originally, instead of a second implementation drifting from it.
 * Settled charges are left untouched.
 */
export const recalculateCourierCharges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { courierId?: string | null } = {}) => data)
  .handler(async ({ data, context }) => {
    await assertPageWrite(context, COURIERS_PAGE);
    const { data: result, error } = await context.supabase.rpc("recalculate_courier_charges", {
      _courier_id: data.courierId || null,
    });
    if (error) throw error;
    const updated = Number((result as { updated?: number } | null)?.updated) || 0;
    return { ok: true, updated };
  });

export const upsertCourierStatusMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      id?: string;
      courierId: string;
      rawStatus: string;
      rawCollectionStatus?: string;
      orderStatus: string;
      collectionStatus: string;
      shipmentOutcome: string;
      active?: boolean;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    await assertPageWrite(context, COURIERS_PAGE);
    const { data: saved, error } = await context.supabase
      .from("courier_status_mappings")
      .upsert({
        ...(data.id ? { id: data.id } : {}),
        courier_id: data.courierId,
        raw_status: data.rawStatus.trim(),
        raw_collection_status: data.rawCollectionStatus?.trim() ?? "",
        order_status: data.orderStatus,
        collection_status: data.collectionStatus,
        shipment_outcome: data.shipmentOutcome,
        active: data.active ?? true,
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: saved.id as string };
  });

export const getCourierChargeExceptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("courier_charges")
      .select(
        "id, order_id, courier_id, charge_type, amount, rate_missing, accrued_at, orders(external_order_number, shipping_governorate), couriers(name)",
      )
      .eq("rate_missing", true)
      .is("settled_at", null)
      .order("accrued_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  });
