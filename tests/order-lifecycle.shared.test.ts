import { describe, expect, it } from "bun:test";
import {
  bostaDispatchIdentifiers,
  bostaProviderEventAt,
  calculateCourierExpense,
  deriveOrderLifecycle,
  isCourierAvailableForBrand,
  isConfirmedBostaNotFound,
  isRecognizedBostaDeliveryStatus,
  isTerminalShipmentOutcome,
  lifecycleForManualShipmentOutcome,
  mapShopifyFulfillmentStatus,
  mapShopifyLifecycleFields,
  mapBostaLifecycle,
  preserveCourierTerminalStatus,
  preserveDeliveredStatusOnReturn,
  resolveBostaShipmentOutcome,
  shouldIgnoreStaleBostaLifecycle,
  shopifyActionForOrderStatus,
  shopifyLineItemTitle,
  type CourierRate,
} from "../src/lib/order-lifecycle.shared";

describe("Bosta provider event time", () => {
  it("uses a valid nested provider update timestamp", () => {
    expect(bostaProviderEventAt({ data: { state: { updatedAt: "2026-07-31T10:15:00.000Z" } } })).toBe(
      "2026-07-31T10:15:00.000Z",
    );
  });

  it("rejects malformed provider timestamps", () => {
    expect(bostaProviderEventAt({ updatedAt: "not-a-date" })).toBeNull();
  });
});

describe("Bosta provider response safety", () => {
  it("does not treat mixed auth/server/not-found failures as confirmed deletion", () => {
    expect(isConfirmedBostaNotFound(false, [500, 401, 404], 404, "not found")).toBe(false);
    expect(isConfirmedBostaNotFound(false, [404, 404], 404, "not found")).toBe(true);
  });

  it("does not substitute a delivery id for a tracking number", () => {
    expect(bostaDispatchIdentifiers({ data: { _id: "delivery-id-only" } })).toEqual({
      tracking: null,
      deliveryId: "delivery-id-only",
    });
    expect(
      bostaDispatchIdentifiers({ data: { _id: "delivery-id", trackingNumber: "TRK-123" } }),
    ).toEqual({ tracking: "TRK-123", deliveryId: "delivery-id" });
  });
});

describe("Shopify line item title", () => {
  it("appends the variant title when present", () => {
    expect(shopifyLineItemTitle("Perfume X", "50ml")).toBe("Perfume X - 50ml");
  });

  it("drops Shopify's single-variant sentinel instead of appending it", () => {
    expect(shopifyLineItemTitle("Coffee Beans", "Default Title")).toBe("Coffee Beans");
  });

  it("handles a missing or blank variant title the same way", () => {
    expect(shopifyLineItemTitle("Coffee Beans", null)).toBe("Coffee Beans");
    expect(shopifyLineItemTitle("Coffee Beans", undefined)).toBe("Coffee Beans");
    expect(shopifyLineItemTitle("Coffee Beans", "   ")).toBe("Coffee Beans");
  });

  it("trims surrounding whitespace on a real variant title", () => {
    expect(shopifyLineItemTitle("Perfume X", "  100ml  ")).toBe("Perfume X - 100ml");
  });
});

describe("Bosta lifecycle mapping", () => {
  it("does not treat an unknown webhook state as an in-transit shipment", () => {
    expect(isRecognizedBostaDeliveryStatus("mystery provider state")).toBe(false);
    expect(isRecognizedBostaDeliveryStatus("Out for delivery")).toBe(true);
  });

  it("maps delivered orders to succeeded and paid collection", () => {
    expect(mapBostaLifecycle("Delivered", "Collected")).toEqual({
      orderStatus: "succeeded",
      collectionStatus: "paid",
      shipmentOutcome: "delivered",
    });
  });

  it("routes courier-side delays and cancellations to awaiting_response (needs intervention)", () => {
    expect(mapBostaLifecycle("Postponed", "Pending").orderStatus).toBe("awaiting_response");
    expect(mapBostaLifecycle("Cancelled", "N/A").orderStatus).toBe("awaiting_response");
    expect(mapBostaLifecycle("Cancelled", "N/A").shipmentOutcome).toBe("open");
    expect(mapBostaLifecycle("Exception - Awaiting your response", "Pending").orderStatus).toBe(
      "awaiting_response",
    );
  });

  it("maps out-for-delivery/in-transit states to shipped", () => {
    expect(mapBostaLifecycle("Out for delivery", "Pending").orderStatus).toBe("shipped");
    expect(mapBostaLifecycle("In transit", "Pending").orderStatus).toBe("shipped");
  });

  it("never auto-finalizes a return: it lands in return_in_transit, not returned", () => {
    expect(mapBostaLifecycle("Returned to business", "Not Collected").shipmentOutcome).toBe(
      "return_in_transit",
    );
    expect(mapBostaLifecycle("Returning", "Not Collected").shipmentOutcome).toBe(
      "return_in_transit",
    );
  });

  it("ignores stale non-terminal Bosta events after a terminal shipment outcome", () => {
    expect(shouldIgnoreStaleBostaLifecycle("delivered", "delivered", "open")).toBe(true);
    expect(shouldIgnoreStaleBostaLifecycle("returned", "returned", "open")).toBe(true);
    expect(shouldIgnoreStaleBostaLifecycle("open", "shipped", "open")).toBe(false);
  });

  it("allows a delivered shipment to become returned", () => {
    expect(shouldIgnoreStaleBostaLifecycle("delivered", "delivered", "returned")).toBe(false);
  });

  it("does not let an older delivered event overwrite a returned shipment", () => {
    expect(shouldIgnoreStaleBostaLifecycle("returned", "returned", "delivered")).toBe(true);
  });
});

describe("Shopify lifecycle action", () => {
  it("treats Shopify fulfilled as shipped, not delivered", () => {
    expect(mapShopifyFulfillmentStatus("fulfilled", null)).toBe("shipped");
    expect(mapShopifyFulfillmentStatus(null, "2026-07-31T00:00:00Z")).toBe("cancelled");
  });

  it("persists modern lifecycle fields for cancelled Shopify imports", () => {
    expect(mapShopifyLifecycleFields(null, "2026-07-31T00:00:00Z", "voided")).toEqual({
      fulfillmentStatus: "cancelled",
      orderStatus: "cancelled",
      collectionStatus: "unavailable",
      shipmentOutcome: "cancelled_before_dispatch",
    });
  });

  it("normalizes partially refunded Shopify collection state", () => {
    expect(
      mapShopifyLifecycleFields("fulfilled", null, "partially_refunded").collectionStatus,
    ).toBe("unavailable");
  });

  it("does not let a Shopify pull downgrade a courier terminal state", () => {
    expect(preserveCourierTerminalStatus("delivered", "shipped")).toBe("delivered");
    expect(preserveCourierTerminalStatus("returned", "unfulfilled")).toBe("returned");
    expect(preserveCourierTerminalStatus("processing", "shipped")).toBe("shipped");
  });

  it("preserves a precise courier outcome during Shopify imports", () => {
    expect(
      mapShopifyLifecycleFields("fulfilled", null, "paid", "returned", "customer_returned")
        .shipmentOutcome,
    ).toBe("customer_returned");
  });

  it("collects payment on delivery and cancels a finalized/before-dispatch cancellation", () => {
    expect(shopifyActionForOrderStatus("succeeded", "delivered")).toBe("collect_payment");
    expect(shopifyActionForOrderStatus("cancelled")).toBe("cancel");
    expect(shopifyActionForOrderStatus("cancelled", "returned")).toBe("cancel");
    expect(shopifyActionForOrderStatus("processing")).toBe("none");
  });

  it("does not cancel while a return is merely in transit back to us", () => {
    expect(shopifyActionForOrderStatus("cancelled", "return_in_transit")).toBe("none");
  });

  it("fulfilling on Shopify no longer happens from this mapping — it's fired at dispatch time", () => {
    expect(shopifyActionForOrderStatus("succeeded")).toBe("none");
  });
});

describe("legacy order compatibility", () => {
  it("derives the new workflow from existing order fields before the migration is applied", () => {
    expect(
      deriveOrderLifecycle({ legacyFulfillmentStatus: "delivered", legacyFinancialStatus: "paid" }),
    ).toEqual({
      orderStatus: "succeeded",
      collectionStatus: "paid",
      shipmentOutcome: "delivered",
    });
  });

  it("prefers the courier raw state when available", () => {
    expect(
      deriveOrderLifecycle({
        courierDeliveryStatus: "Postponed",
        courierCollectionStatus: "Not Collected",
        legacyFulfillmentStatus: "shipped",
        legacyFinancialStatus: "pending",
      }),
    ).toMatchObject({ orderStatus: "awaiting_response", collectionStatus: "unpaid" });
  });
});

describe("courier expense by governorate rate", () => {
  const rate: CourierRate = {
    deliveryFee: 70,
    customerReturnFee: 55,
    failedDeliveryFee: 35,
    exchangeFee: 80,
  };

  it("charges delivery on success and return fee on returned shipment", () => {
    expect(calculateCourierExpense("delivered", rate)).toBe(70);
    expect(calculateCourierExpense("returned", rate)).toBe(35);
    expect(calculateCourierExpense("customer_returned", rate)).toBe(55);
    expect(calculateCourierExpense("exchanged", rate)).toBe(80);
  });

  it("does not charge cancelled-before-dispatch or open shipments", () => {
    expect(calculateCourierExpense("cancelled_before_dispatch", rate)).toBe(0);
    expect(calculateCourierExpense("open", rate)).toBe(0);
  });
});

describe("courier outcome transitions", () => {
  it("recognizes every non-open lifecycle outcome as terminal", () => {
    expect(isTerminalShipmentOutcome("open")).toBe(false);
    for (const outcome of [
      "delivered",
      "return_in_transit",
      "returned",
      "customer_returned",
      "exchanged",
      "cancelled_before_dispatch",
    ]) {
      expect(isTerminalShipmentOutcome(outcome)).toBe(true);
    }
  });

  it("preserves succeeded/delivered status through the return-in-transit stage so a later confirm can tell a customer return apart from a failed delivery", () => {
    expect(
      preserveDeliveredStatusOnReturn("succeeded", "delivered", {
        orderStatus: "processing",
        shipmentOutcome: "return_in_transit",
      }),
    ).toEqual({ orderStatus: "succeeded", shipmentOutcome: "return_in_transit" });
    expect(
      preserveDeliveredStatusOnReturn("new", "open", {
        orderStatus: "processing",
        shipmentOutcome: "return_in_transit",
      }),
    ).toEqual({ orderStatus: "processing", shipmentOutcome: "return_in_transit" });
    expect(
      preserveDeliveredStatusOnReturn("new", "open", {
        orderStatus: "shipped",
        shipmentOutcome: "open",
      }),
    ).toEqual({ orderStatus: "shipped", shipmentOutcome: "open" });
  });

  it("treats a Bosta return after delivery as a customer return", () => {
    const resolved = resolveBostaShipmentOutcome("delivered", "returned");
    expect(resolved).toBe("customer_returned");
    expect(shouldIgnoreStaleBostaLifecycle("delivered", resolved, "delivered")).toBe(false);
    expect(shouldIgnoreStaleBostaLifecycle("delivered", "exchanged", "delivered")).toBe(false);
    expect(resolveBostaShipmentOutcome("open", "returned")).toBe("returned");
  });

  it("maps manual outcomes to compatible lifecycle fields", () => {
    expect(lifecycleForManualShipmentOutcome("exchanged", "paid")).toEqual({
      orderStatus: "succeeded",
      collectionStatus: "paid",
      shipmentOutcome: "exchanged",
      fulfillmentStatus: "delivered",
    });
    expect(lifecycleForManualShipmentOutcome("customer_returned", "unavailable")).toEqual({
      orderStatus: "cancelled",
      collectionStatus: "unavailable",
      shipmentOutcome: "customer_returned",
      fulfillmentStatus: "returned",
    });
  });
});

describe("multi-brand courier availability", () => {
  const courier = {
    brandId: null,
    servesAllBrands: false,
    brandIds: ["brand-a", "brand-b"],
  };

  it("allows assigned brands and blocks unassigned brands", () => {
    expect(isCourierAvailableForBrand(courier, "brand-a")).toBe(true);
    expect(isCourierAvailableForBrand(courier, "brand-c")).toBe(false);
  });

  it("allows couriers configured for every brand", () => {
    expect(isCourierAvailableForBrand({ ...courier, servesAllBrands: true }, "brand-c")).toBe(true);
  });
});
