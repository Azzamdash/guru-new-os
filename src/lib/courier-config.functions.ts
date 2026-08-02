import { getTodayInBusinessTimezone } from "@/lib/timezone";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPageWrite } from "./page-permissions.server";

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
    await assertPageWrite(context, "/couriers");
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
    await assertPageWrite(context, "/couriers");
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
