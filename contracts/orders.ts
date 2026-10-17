/**
 * Order + payment contract.
 *
 * Pure data only — no Firebase, no DOM — so the browser, the tRPC server and
 * the unit tests can all import it. Every value that the customer sees in the
 * cart and every value that the server stores comes from these definitions,
 * which is what keeps the checkout UI and the order documents in step.
 */

/** How the customer receives the goods. */
export const FULFILLMENT_METHODS = ["pickup", "delivery"] as const;
export type FulfillmentMethod = (typeof FULFILLMENT_METHODS)[number];

export const FULFILLMENT_LABELS: Record<FulfillmentMethod, string> = {
  pickup: "In-store pickup",
  delivery: "Local delivery",
};

/** How the customer pays. `card_online` needs Stripe to be configured. */
export const PAYMENT_METHODS = [
  "card_online",
  "card_in_store",
  "cash",
  "zelle",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  card_online: "Card online",
  card_in_store: "Card in store",
  cash: "Cash",
  zelle: "Zelle",
};

/** Where the order is in the shop's workflow. */
export const ORDER_STATUSES = ["new", "ready", "completed", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Money state. Kept separate from the fulfilment status on purpose: an order
 *  can be paid before it is ready, or ready before it is paid. */
export const PAYMENT_STATUSES = ["unpaid", "paid", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Top of the quantity stepper — a guard rail, not a stock limit. */
export const MAX_ITEM_QTY = 10;
/** Lines accepted in one order; also bounds the Firestore document size. */
export const MAX_ORDER_LINES = 20;

export type OrderLine = {
  productId: number;
  name: string;
  /** Server-side price at the time of the order, in cents. */
  unitCents: number;
  qty: number;
  lineCents: number;
};

export type OrderSummary = {
  id: number;
  token: string;
  orderNumber: string;
  customerName: string;
  phone: string;
  email: string | null;
  fulfillment: FulfillmentMethod;
  address: string | null;
  notes: string | null;
  lines: OrderLine[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  paidAt: string | null;
  createdAt: string;
};

/** `123` → `#PPR-O123`, matching the booking/receipt naming convention. */
export function orderNumber(id: number): string {
  return `PPR-O${id}`;
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function isFulfillmentMethod(v: unknown): v is FulfillmentMethod {
  return typeof v === "string" && (FULFILLMENT_METHODS as readonly string[]).includes(v);
}

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return typeof v === "string" && (PAYMENT_METHODS as readonly string[]).includes(v);
}

export function isOrderStatus(v: unknown): v is OrderStatus {
  return typeof v === "string" && (ORDER_STATUSES as readonly string[]).includes(v);
}

export function isPaymentStatus(v: unknown): v is PaymentStatus {
  return typeof v === "string" && (PAYMENT_STATUSES as readonly string[]).includes(v);
}

/** Tax for a subtotal, rounded to whole cents. Exported for the checkout UI and
 *  for tests that assert the browser's estimate matches the server's charge. */
export function taxFor(subtotalCents: number, percent: number): number {
  if (!Number.isFinite(subtotalCents) || subtotalCents <= 0) return 0;
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return Math.round((subtotalCents * percent) / 100);
}

/**
 * Sanitise `ORDER_TAX_PERCENT`-style input.
 *
 * Invalid or negative values disable tax (0) rather than guessing; the upper
 * bound is a guard rail against a misplaced decimal point (e.g. `800` meaning
 * 8%). Rounding to two decimals keeps the browser estimate and the server
 * charge identical. This is a configuration guard, not tax advice.
 */
export function normaliseTaxPercent(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(25, Math.round(parsed * 100) / 100);
}

/** The shop charges in one currency; kept explicit for Stripe and reporting. */
export const ORDER_CURRENCY = "usd" as const;

/** Client-generated idempotency key format (UUIDs and slug-like ids fit). */
export const IDEMPOTENCY_KEY_MIN_LENGTH = 16;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 100;

export function isIdempotencyKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= IDEMPOTENCY_KEY_MIN_LENGTH &&
    value.length <= IDEMPOTENCY_KEY_MAX_LENGTH &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

/**
 * Stock is reserved when an order is created. Once the goods have been handed
 * over (`completed`) or the order was already cancelled, a later cancellation
 * or deletion must NOT put that stock back on the shelf.
 */
export function shouldRestock(status: OrderStatus): boolean {
  return status === "new" || status === "ready";
}

/**
 * Fulfilment-state transitions accepted by the admin API.
 *
 * `cancelled` is terminal: its stock has already been returned, so reopening it
 * would create an order with no reservation. `completed` is terminal apart from
 * a refund, which changes only the payment status (the customer keeps the item).
 */
export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true;
  if (from === "new") return to === "ready" || to === "completed" || to === "cancelled";
  if (from === "ready") return to === "completed" || to === "cancelled";
  return false;
}

/**
 * Payment-status transitions accepted by the admin API.
 *
 * `unpaid → paid` is a staff-recorded collection (cash/card in store).
 * `paid → refunded` must go through the refund endpoint, which asks Stripe
 * first for card-online orders. `refunded` is terminal.
 */
export function canTransitionPaymentStatus(
  from: PaymentStatus,
  to: PaymentStatus,
): boolean {
  if (from === to) return true;
  if (from === "unpaid") return to === "paid";
  if (from === "paid") return to === "refunded";
  return false;
}
