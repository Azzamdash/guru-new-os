export const ORDER_WORKFLOW_STATUSES = [
  "new",
  "processing",
  "shipped",
  "postponed",
  "awaiting_response",
  "succeeded",
  "cancelled",
] as const;

export type OrderWorkflowStatus = (typeof ORDER_WORKFLOW_STATUSES)[number];

export const COLLECTION_STATUSES = ["processing", "unavailable", "paid", "unpaid"] as const;

export type CollectionStatus = (typeof COLLECTION_STATUSES)[number];

export const SHIPMENT_OUTCOMES = [
  "open",
  "delivered",
  "return_in_transit",
  "returned",
  "customer_returned",
  "exchanged",
  "cancelled_before_dispatch",
] as const;

export type ShipmentOutcome = (typeof SHIPMENT_OUTCOMES)[number];

export type ShopifyLifecycleAction = "none" | "fulfill" | "collect_payment" | "cancel";

export type CourierRate = {
  deliveryFee: number;
  customerReturnFee: number;
  failedDeliveryFee: number;
  exchangeFee: number;
};

export type OrderLifecycle = {
  orderStatus: OrderWorkflowStatus;
  collectionStatus: CollectionStatus;
  shipmentOutcome: ShipmentOutcome;
};

export function isTerminalShipmentOutcome(value: string | null | undefined): boolean {
  return [
    "delivered",
    "return_in_transit",
    "returned",
    "customer_returned",
    "exchanged",
    "cancelled_before_dispatch",
  ].includes(value ?? "");
}

export const ORDER_STATUS_LABELS_AR: Record<OrderWorkflowStatus, string> = {
  new: "جديد",
  processing: "قيد التنفيذ",
  shipped: "في الطريق للعميل",
  postponed: "مؤجل",
  awaiting_response: "يحتاج تدخل",
  succeeded: "تم بنجاح",
  cancelled: "ملغي",
};

export const SHIPMENT_OUTCOME_LABELS_AR: Record<ShipmentOutcome, string> = {
  open: "مفتوح",
  delivered: "تم التسليم",
  return_in_transit: "في الطريق إليك",
  returned: "تم الإرجاع",
  customer_returned: "مرتجع من العميل",
  exchanged: "تبديل",
  cancelled_before_dispatch: "ملغي قبل الشحن",
};

export const COLLECTION_STATUS_LABELS_AR: Record<CollectionStatus, string> = {
  processing: "قيد التنفيذ",
  unavailable: "غير متوفر",
  paid: "مدفوع",
  unpaid: "غير مدفوع",
};

function normalize(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ");
}

export function bostaProviderEventAt(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const data =
    root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : undefined;
  const stateSource = data?.state ?? root.state;
  const state =
    stateSource && typeof stateSource === "object"
      ? (stateSource as Record<string, unknown>)
      : undefined;
  const delivery =
    root.delivery && typeof root.delivery === "object"
      ? (root.delivery as Record<string, unknown>)
      : undefined;
  const candidates = [
    state?.updatedAt,
    data?.updatedAt,
    delivery?.updatedAt,
    root.updatedAt,
    root.timestamp,
    root.createdAt,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    const timestamp = Date.parse(candidate);
    if (!Number.isNaN(timestamp)) return new Date(timestamp).toISOString();
  }
  return null;
}

export function isConfirmedBostaNotFound(
  successfulResponse: boolean,
  attemptedStatuses: number[],
  _lastStatus?: number,
  _responseReason?: string,
): boolean {
  return (
    !successfulResponse &&
    attemptedStatuses.length > 0 &&
    attemptedStatuses.every((status) => status === 404)
  );
}

export function bostaDispatchIdentifiers(payload: unknown): {
  tracking: string | null;
  deliveryId: string | null;
} {
  if (!payload || typeof payload !== "object") return { tracking: null, deliveryId: null };
  const root = payload as Record<string, unknown>;
  const data =
    root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : undefined;
  const asNonEmptyString = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : null;
  return {
    tracking: asNonEmptyString(data?.trackingNumber ?? root.trackingNumber),
    deliveryId: asNonEmptyString(data?._id ?? root._id),
  };
}

function mapBostaOrderStatus(rawStatus: string): {
  orderStatus: OrderWorkflowStatus;
  shipmentOutcome: ShipmentOutcome;
} {
  if (/delivered|تم التسليم/.test(rawStatus)) {
    return { orderStatus: "succeeded", shipmentOutcome: "delivered" };
  }
  if (/exchange|replacement|استبدال|تبديل/.test(rawStatus)) {
    return { orderStatus: "succeeded", shipmentOutcome: "exchanged" };
  }
  if (/returned|returning|return to business|rtb|مرتجع/.test(rawStatus)) {
    // Never auto-finalize a return: Bosta saying "returned"/"returning" only
    // means the parcel is on its way back to us. Only a manual confirm-
    // receipt action (confirm_return_received) finalizes it, once it's
    // physically back in the warehouse.
    return { orderStatus: "processing", shipmentOutcome: "return_in_transit" };
  }
  if (/cancelled|canceled|terminated|ملغي|postponed|rescheduled|postpone|مؤجل/.test(rawStatus)) {
    // A courier-side delay or cancellation always needs a human decision —
    // never a silent final state.
    return { orderStatus: "awaiting_response", shipmentOutcome: "open" };
  }
  if (/awaiting.*response|waiting.*response|exception|في انتظار رد/.test(rawStatus)) {
    return { orderStatus: "awaiting_response", shipmentOutcome: "open" };
  }
  if (/out.?for.?delivery|in.?transit|قيد التوصيل/.test(rawStatus)) {
    return { orderStatus: "shipped", shipmentOutcome: "open" };
  }
  if (/new|created|جديد/.test(rawStatus)) {
    return { orderStatus: "new", shipmentOutcome: "open" };
  }
  return { orderStatus: "processing", shipmentOutcome: "open" };
}

function mapBostaCollectionStatus(rawStatus: string): CollectionStatus {
  if (/not collected|unpaid|غير مدفوع/.test(rawStatus)) return "unpaid";
  if (/not available|unavailable|n\/a|غير متوفر/.test(rawStatus)) return "unavailable";
  if (/collected|paid|مدفوع/.test(rawStatus)) return "paid";
  return "processing";
}

export function isRecognizedBostaDeliveryStatus(status: string | null | undefined): boolean {
  return /delivered|تم التسليم|exchange|replacement|استبدال|تبديل|returned|returning|return to business|rtb|مرتجع|cancelled|canceled|terminated|ملغي|postponed|rescheduled|postpone|مؤجل|awaiting.*response|waiting.*response|exception|في انتظار رد|new|created|جديد|pickup|picked|received|transit|out for delivery|قيد التوصيل/.test(
    normalize(status),
  );
}

export function mapBostaLifecycle(
  deliveryStatus: string | null | undefined,
  collectionStatus: string | null | undefined,
): OrderLifecycle {
  const shipment = mapBostaOrderStatus(normalize(deliveryStatus));
  return {
    ...shipment,
    collectionStatus: mapBostaCollectionStatus(normalize(collectionStatus)),
  };
}

export function shouldIgnoreStaleBostaLifecycle(
  currentOutcome: string | null | undefined,
  currentFulfillmentStatus: string | null | undefined,
  incomingOutcome: ShipmentOutcome,
): boolean {
  if (currentOutcome === "customer_returned" || currentOutcome === "exchanged") {
    return incomingOutcome !== currentOutcome;
  }
  const currentReturned = currentOutcome === "returned" || currentFulfillmentStatus === "returned";
  if (currentReturned) return incomingOutcome !== "returned";

  // A return already in transit only accepts further "in transit" updates —
  // physically confirming receipt happens through confirm_return_received,
  // not through a Bosta webhook/recall event.
  if (currentOutcome === "return_in_transit") return incomingOutcome !== "return_in_transit";

  const currentDelivered =
    currentOutcome === "delivered" || currentFulfillmentStatus === "delivered";
  if (currentDelivered) {
    return !["delivered", "return_in_transit", "returned", "customer_returned", "exchanged"].includes(
      incomingOutcome,
    );
  }

  const currentCancelled =
    currentOutcome === "cancelled_before_dispatch" || currentFulfillmentStatus === "cancelled";
  return currentCancelled && incomingOutcome === "open";
}

export function resolveBostaShipmentOutcome(
  currentOutcome: string | null | undefined,
  incomingOutcome: ShipmentOutcome,
): ShipmentOutcome {
  return currentOutcome === "delivered" && incomingOutcome === "returned"
    ? "customer_returned"
    : incomingOutcome;
}

/**
 * A return that started after the order was already counted delivered is a
 * customer return, not a plain failed-delivery return — that distinction
 * drives a different courier fee (calculateCourierExpense) and must survive
 * the "in transit back to us" stage, not just the final one. Preserves
 * order_status = "succeeded" while shipment_outcome moves to
 * "return_in_transit", so confirm_return_received can tell the two apart
 * once the parcel is physically back.
 */
export function preserveDeliveredStatusOnReturn(
  currentOrderStatus: string | null | undefined,
  currentOutcome: string | null | undefined,
  incoming: { orderStatus: OrderWorkflowStatus; shipmentOutcome: ShipmentOutcome },
): { orderStatus: OrderWorkflowStatus; shipmentOutcome: ShipmentOutcome } {
  if (
    incoming.shipmentOutcome === "return_in_transit" &&
    (currentOutcome === "delivered" || currentOrderStatus === "succeeded")
  ) {
    return { orderStatus: "succeeded", shipmentOutcome: "return_in_transit" };
  }
  return incoming;
}

export function lifecycleForManualShipmentOutcome(
  outcome: ShipmentOutcome,
  collectionStatus: CollectionStatus,
): OrderLifecycle & { fulfillmentStatus: string } {
  const orderStatus: OrderWorkflowStatus =
    outcome === "delivered" || outcome === "exchanged"
      ? "succeeded"
      : outcome === "returned" ||
          outcome === "customer_returned" ||
          outcome === "cancelled_before_dispatch"
        ? "cancelled"
        : "processing";
  const fulfillmentStatus =
    outcome === "delivered" || outcome === "exchanged"
      ? "delivered"
      : outcome === "returned" || outcome === "customer_returned"
        ? "returned"
        : outcome === "cancelled_before_dispatch"
          ? "cancelled"
          : "processing";
  return { orderStatus, collectionStatus, shipmentOutcome: outcome, fulfillmentStatus };
}

export function isCourierAvailableForBrand(
  courier: { brandId: string | null; servesAllBrands: boolean; brandIds: string[] },
  brandId: string,
): boolean {
  return (
    courier.servesAllBrands || courier.brandId === brandId || courier.brandIds.includes(brandId)
  );
}

export function deriveOrderLifecycle(input: {
  courierDeliveryStatus?: string | null;
  courierCollectionStatus?: string | null;
  legacyFulfillmentStatus?: string | null;
  legacyFinancialStatus?: string | null;
}): OrderLifecycle {
  if (input.courierDeliveryStatus || input.courierCollectionStatus) {
    return mapBostaLifecycle(input.courierDeliveryStatus, input.courierCollectionStatus);
  }

  const fulfillment = normalize(input.legacyFulfillmentStatus);
  const financial = normalize(input.legacyFinancialStatus);
  const shipment =
    fulfillment === "delivered"
      ? { orderStatus: "succeeded" as const, shipmentOutcome: "delivered" as const }
      : fulfillment === "returned"
        ? { orderStatus: "cancelled" as const, shipmentOutcome: "returned" as const }
        : fulfillment === "cancelled"
          ? {
              orderStatus: "cancelled" as const,
              shipmentOutcome: "cancelled_before_dispatch" as const,
            }
          : fulfillment === "unfulfilled"
            ? { orderStatus: "new" as const, shipmentOutcome: "open" as const }
            : { orderStatus: "processing" as const, shipmentOutcome: "open" as const };

  const collectionStatus: CollectionStatus =
    financial === "paid"
      ? "paid"
      : financial === "voided" || financial === "refunded"
        ? "unavailable"
        : financial === "unpaid"
          ? "unpaid"
          : "processing";

  return { ...shipment, collectionStatus };
}

/**
 * Fulfilling on Shopify happens the moment an order is dispatched to a
 * courier (see couriers.functions.ts), not from this status-driven mapping —
 * by the time an order reaches "succeeded" it's already long fulfilled.
 * From here on there are only two Shopify-facing events: the customer paid
 * (collect_payment, fired on delivery) or the order came back unpaid
 * (cancel, fired once a return is physically confirmed received — never
 * while it's merely "in transit" back to us).
 */
export function shopifyActionForOrderStatus(
  status: OrderWorkflowStatus,
  outcome: ShipmentOutcome = "open",
): ShopifyLifecycleAction {
  if (outcome === "delivered") return "collect_payment";
  if (status === "cancelled" && outcome !== "return_in_transit") return "cancel";
  return "none";
}

/** Shopify fulfillment means handed to fulfillment, not delivered to the customer. */
export function mapShopifyFulfillmentStatus(
  status: string | null,
  cancelledAt: string | null,
): "unfulfilled" | "shipped" | "returned" | "cancelled" {
  if (cancelledAt) return "cancelled";
  if (status === "fulfilled" || status === "partial" || status === "in_transit") {
    return "shipped";
  }
  if (status === "restocked") return "returned";
  return "unfulfilled";
}

export function mapShopifyLifecycleFields(
  fulfillmentStatus: string | null,
  cancelledAt: string | null,
  financialStatus: string | null,
  currentFulfillmentStatus?: string | null,
  currentShipmentOutcome?: string | null,
) {
  const incomingFulfillment = mapShopifyFulfillmentStatus(fulfillmentStatus, cancelledAt);
  const effectiveFulfillment = preserveCourierTerminalStatus(
    currentFulfillmentStatus,
    incomingFulfillment,
  );
  const normalizedFinancial = ["paid", "partially_paid"].includes(financialStatus ?? "")
    ? "paid"
    : ["refunded", "partially_refunded"].includes(financialStatus ?? "")
      ? "refunded"
      : financialStatus;
  const lifecycle = deriveOrderLifecycle({
    legacyFulfillmentStatus: effectiveFulfillment,
    legacyFinancialStatus: normalizedFinancial,
  });
  if (currentShipmentOutcome === "customer_returned" || currentShipmentOutcome === "exchanged") {
    return lifecycleForManualShipmentOutcome(currentShipmentOutcome, lifecycle.collectionStatus);
  }
  return { fulfillmentStatus: effectiveFulfillment, ...lifecycle };
}

/** Courier outcomes are authoritative and must not be downgraded by a Shopify pull. */
export function preserveCourierTerminalStatus(
  currentStatus: string | null | undefined,
  incomingShopifyStatus: string,
): string {
  if (["delivered", "returned", "cancelled"].includes(currentStatus ?? "")) {
    return currentStatus as string;
  }
  return incomingShopifyStatus;
}

export function calculateCourierExpense(outcome: ShipmentOutcome, rate: CourierRate): number {
  if (outcome === "delivered") return Math.max(0, Number(rate.deliveryFee) || 0);
  if (outcome === "returned") return Math.max(0, Number(rate.failedDeliveryFee) || 0);
  if (outcome === "customer_returned") {
    return Math.max(0, Number(rate.customerReturnFee) || 0);
  }
  if (outcome === "exchanged") return Math.max(0, Number(rate.exchangeFee) || 0);
  return 0;
}
