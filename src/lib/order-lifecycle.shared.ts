export const ORDER_WORKFLOW_STATUSES = [
  "new",
  "processing",
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
  "returned",
  "customer_returned",
  "exchanged",
  "cancelled_before_dispatch",
] as const;

export type ShipmentOutcome = (typeof SHIPMENT_OUTCOMES)[number];

export type ShopifyLifecycleAction = "none" | "fulfill" | "cancel" | "review_return";

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
    "returned",
    "customer_returned",
    "exchanged",
    "cancelled_before_dispatch",
  ].includes(value ?? "");
}

export const ORDER_STATUS_LABELS_AR: Record<OrderWorkflowStatus, string> = {
  new: "جديد",
  processing: "قيد التنفيذ",
  postponed: "مؤجل",
  awaiting_response: "في انتظار ردك",
  succeeded: "تم بنجاح",
  cancelled: "ملغي",
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
    return { orderStatus: "cancelled", shipmentOutcome: "returned" };
  }
  if (/cancelled|canceled|terminated|ملغي/.test(rawStatus)) {
    return { orderStatus: "cancelled", shipmentOutcome: "cancelled_before_dispatch" };
  }
  if (/postponed|rescheduled|postpone|مؤجل/.test(rawStatus)) {
    return { orderStatus: "postponed", shipmentOutcome: "open" };
  }
  if (/awaiting.*response|waiting.*response|exception|في انتظار رد/.test(rawStatus)) {
    return { orderStatus: "awaiting_response", shipmentOutcome: "open" };
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

  const currentDelivered =
    currentOutcome === "delivered" || currentFulfillmentStatus === "delivered";
  if (currentDelivered) {
    return !["delivered", "returned", "customer_returned", "exchanged"].includes(incomingOutcome);
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

export function shopifyActionForOrderStatus(
  status: OrderWorkflowStatus,
  outcome: ShipmentOutcome = "open",
): ShopifyLifecycleAction {
  if (status === "succeeded") return "fulfill";
  if (status === "cancelled") {
    return outcome === "returned" || outcome === "customer_returned" ? "review_return" : "cancel";
  }
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
