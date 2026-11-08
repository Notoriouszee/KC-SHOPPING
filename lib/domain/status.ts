/** Order and payment vocabulary shared by the dashboard, forms and public pages. */

export const ORDER_STATUSES = [
  "new",
  "confirmed",
  "processing",
  "ready",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ["unpaid", "partial", "paid", "refunded"] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const ORDER_SOURCES = ["manual", "product_link", "shop"] as const;

export type OrderSource = (typeof ORDER_SOURCES)[number];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === "string" && (PAYMENT_STATUSES as readonly string[]).includes(value);
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: "New",
  confirmed: "Confirmed",
  processing: "Processing",
  ready: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  partial: "Part paid",
  paid: "Paid",
  refunded: "Refunded",
};

export const ORDER_SOURCE_LABELS: Record<OrderSource, string> = {
  manual: "Added by seller",
  product_link: "Product link",
  shop: "Shop page",
};

export type Tone = "neutral" | "info" | "warn" | "success" | "danger";

export const ORDER_STATUS_TONES: Record<OrderStatus, Tone> = {
  new: "info",
  confirmed: "info",
  processing: "warn",
  ready: "warn",
  delivered: "success",
  cancelled: "danger",
};

export const PAYMENT_STATUS_TONES: Record<PaymentStatus, Tone> = {
  unpaid: "danger",
  partial: "warn",
  paid: "success",
  refunded: "neutral",
};

/**
 * Statuses a seller can move an order to from a given state. Cancelled and
 * delivered orders are terminal so history stays trustworthy.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ["confirmed", "processing", "cancelled"],
  confirmed: ["processing", "ready", "cancelled"],
  processing: ["ready", "delivered", "cancelled"],
  ready: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function isOpenStatus(status: OrderStatus): boolean {
  return status !== "delivered" && status !== "cancelled";
}

/**
 * Derives the payment state from money actually recorded, so an order is never
 * shown as paid just because it was created.
 *
 * `dueKobo` is the amount that has to be transferred (goods only when delivery is
 * paid on delivery). It defaults to the order total so existing orders keep
 * behaving exactly as before.
 */
export function derivePaymentStatus(
  totalKobo: number,
  paidKobo: number,
  dueKobo: number = totalKobo,
): PaymentStatus {
  if (paidKobo <= 0) return "unpaid";
  const target = dueKobo > 0 ? dueKobo : totalKobo;
  if (target <= 0) return paidKobo > 0 ? "paid" : "unpaid";
  if (paidKobo >= target) return "paid";
  return "partial";
}

/* -------------------------------------------------------------------------- */
/* Products                                                                    */
/* -------------------------------------------------------------------------- */

export const PUBLICATION_STATUSES = ["draft", "published"] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const AVAILABILITIES = ["available", "out_of_stock"] as const;
export type Availability = (typeof AVAILABILITIES)[number];

export function isPublicationStatus(value: unknown): value is PublicationStatus {
  return typeof value === "string" && (PUBLICATION_STATUSES as readonly string[]).includes(value);
}

export function isAvailability(value: unknown): value is Availability {
  return typeof value === "string" && (AVAILABILITIES as readonly string[]).includes(value);
}

export const PUBLICATION_LABELS: Record<PublicationStatus, string> = {
  draft: "Draft",
  published: "Published",
};

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  available: "Available",
  out_of_stock: "Out of stock",
};

export const PUBLICATION_TONES: Record<PublicationStatus, Tone> = {
  draft: "neutral",
  published: "success",
};

export const AVAILABILITY_TONES: Record<Availability, Tone> = {
  available: "success",
  out_of_stock: "warn",
};
