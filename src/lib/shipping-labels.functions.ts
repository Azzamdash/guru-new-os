import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPageWrite } from "./page-permissions.server";
import { COURIERS_PAGE } from "./page-permission-paths";

/**
 * Dispatched orders (any courier — Bosta's tracking number or a generic
 * dispatch tracking reference) that a merchant might want to (re)print a
 * label for.
 */
export const listPrintableOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string | null; search?: string | null } = {}) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("orders")
      .select(
        "id, brand_id, external_order_number, customer_name, shipping_governorate, bosta_tracking, dispatch_tracking, updated_at, courier_id, couriers(name)",
      )
      .or("bosta_tracking.not.is.null,dispatch_tracking.not.is.null")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    // PostgREST's .or() filter syntax treats "," "(" ")" as grammar, not literal
    // search text — strip them so a stray character in a search box can't
    // reshape the filter into something the merchant didn't type.
    const search = data.search?.trim().replace(/[,()]/g, "");
    if (search) {
      q = q.or(
        `external_order_number.ilike.%${search}%,bosta_tracking.ilike.%${search}%,dispatch_tracking.ilike.%${search}%,customer_name.ilike.%${search}%`,
      );
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export type OrderLabelData = {
  id: string;
  orderNumber: string;
  brandName: string;
  courierName: string;
  trackingNumber: string;
  cod: number;
  currency: string;
  customerName: string;
  customerPhone: string;
  governorate: string;
  address: string;
  buildingNumber: string | null;
  floorNumber: string | null;
  apartmentNumber: string | null;
  note: string | null;
  items: { title: string; qty: number }[];
};

type OrderLabelRow = {
  id: string;
  external_order_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  shipping_governorate: string | null;
  shipping_address: string | null;
  building_number: string | null;
  floor_number: string | null;
  apartment_number: string | null;
  total_amount: number | null;
  currency: string | null;
  collection_status: string | null;
  order_kind: string | null;
  note: string | null;
  bosta_tracking: string | null;
  dispatch_tracking: string | null;
  couriers: { name: string } | null;
  brands: { name: string } | null;
};

/**
 * Data for a self-rendered shipping label — printed from inside the system
 * instead of pulled from the courier, since Bosta's AWB endpoint's response
 * shape turned out not to match what we could confirm from their community
 * SDK (see shipping-labels history). Everything here already lives in our
 * own orders/order_items tables.
 */
export const getOrderLabelsData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderIds: string[] }) => d)
  .handler(async ({ data, context }): Promise<OrderLabelData[]> => {
    await assertPageWrite(context, COURIERS_PAGE);
    if (!data.orderIds.length) return [];

    // order_kind was added by a later migration (20260807010000) that the
    // generated Database types haven't caught up with — same gap
    // dispatchOrderToBestCourier already works around in couriers.functions.ts.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawOrders, error } = await (context.supabase as any)
      .from("orders")
      .select(
        "id, external_order_number, customer_name, customer_phone, shipping_governorate, shipping_address, building_number, floor_number, apartment_number, total_amount, currency, collection_status, order_kind, note, bosta_tracking, dispatch_tracking, couriers(name), brands(name)",
      )
      .in("id", data.orderIds);
    if (error) throw error;
    const orders = rawOrders as OrderLabelRow[] | null;
    if (!orders?.length) throw new Error("لم يتم العثور على الأوردرات المحددة");

    const { data: items, error: itemsError } = await context.supabase
      .from("order_items")
      .select("order_id, title, qty")
      .in("order_id", data.orderIds);
    if (itemsError) throw itemsError;
    const itemsByOrder = new Map<string, { title: string; qty: number }[]>();
    for (const it of items ?? []) {
      const list = itemsByOrder.get(it.order_id) ?? [];
      list.push({ title: it.title, qty: Number(it.qty) });
      itemsByOrder.set(it.order_id, list);
    }

    // Preserve the order the caller asked for (selection order), not
    // whatever order Postgres happened to return rows in.
    const byId = new Map(orders.map((o) => [o.id, o]));
    return data.orderIds
      .map((id) => byId.get(id))
      .filter((o): o is NonNullable<typeof o> => !!o)
      .map((o) => {
        const orderKind = (o.order_kind as string | null) ?? "sale";
        const cod =
          orderKind !== "sale" || o.collection_status === "paid" ? 0 : Number(o.total_amount ?? 0);
        return {
          id: o.id,
          orderNumber: String(o.external_order_number ?? o.id),
          brandName: o.brands?.name ?? "",
          courierName: o.couriers?.name ?? "",
          trackingNumber: o.bosta_tracking ?? o.dispatch_tracking ?? "",
          cod,
          currency: o.currency ?? "EGP",
          customerName: o.customer_name ?? "",
          customerPhone: o.customer_phone ?? "",
          governorate: o.shipping_governorate ?? "",
          address: o.shipping_address ?? "",
          buildingNumber: o.building_number,
          floorNumber: o.floor_number,
          apartmentNumber: o.apartment_number,
          note: o.note,
          items: itemsByOrder.get(o.id) ?? [],
        };
      });
  });
