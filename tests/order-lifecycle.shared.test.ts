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
  resolveBostaShipmentOutcome,
  shouldIgnoreStaleBostaLifecycle,
  shopifyActionForOrderStatus,
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

  it("keeps postponed and awaiting-response states actionable", () => {
    expect(mapBostaLifecycle("Postponed", "Pending").orderStatus).toBe("postponed");
    expect(mapBostaLifecycle("Exception - Awaiting your response", "Pending").orderStatus).toBe(
      "awaiting_response",
    );
  });

  it("distinguishes a returned shipment from cancellation before dispatch", () => {
    expect(mapBostaLifecycle("Returned to business", "Not Collected").shipmentOutcome).toBe(
      "returned",
    );
    expect(mapBostaLifecycle("Cancelled", "N/A").shipmentOutcome).toBe("cancelled_before_dispatch");
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

  it("fulfills successful orders and cancels cancelled orders", () => {
    expect(shopifyActionForOrderStatus("succeeded")).toBe("fulfill");
    expect(shopifyActionForOrderStatus("cancelled")).toBe("cancel");
    expect(shopifyActionForOrderStatus("processing")).toBe("none");
  });

  it("does not cancel a fulfilled Shopify order when the shipment is returned", () => {
    expect(shopifyActionForOrderStatus("cancelled", "returned")).toBe("review_return");
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
    ).toMatchObject({ orderStatus: "postponed", collectionStatus: "unpaid" });
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
      "returned",
      "customer_returned",
      "exchanged",
      "cancelled_before_dispatch",
    ]) {
      expect(isTerminalShipmentOutcome(outcome)).toBe(true);
    }
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
