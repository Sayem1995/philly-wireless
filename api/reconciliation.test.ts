import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderRow } from "../server/queries/store.js";
import type { StripeSession } from "../server/payments.js";

/**
 * Abandoned-checkout reconciliation.
 *
 * Expiring a reservation must never release stock that Stripe has already been
 * paid for, so every candidate is checked against Stripe first.
 */

vi.mock("../server/queries/store.js", () => {
  class StockError extends Error {}
  class OrderStateError extends Error {}
  return {
    StockError,
    OrderStateError,
    store: {
      staleCardOrders: vi.fn(),
      markOrderPaid: vi.fn(),
      cancelOrder: vi.fn(),
      updateOrder: vi.fn(),
      cleanupIdempotency: vi.fn(),
    },
  };
});

vi.mock("../server/payments.js", () => ({
  retrieveStripeSession: vi.fn(),
}));

vi.mock("../server/orderEmails.js", () => ({
  sendOrderEmails: vi.fn(async () => undefined),
}));

import { reconcileAbandonedOrders } from "../server/orderReconciliation.js";
import { OrderStateError, store } from "../server/queries/store.js";
import { retrieveStripeSession } from "../server/payments.js";
import { sendOrderEmails } from "../server/orderEmails.js";

const mockedStore = vi.mocked(store);
const mockedRetrieve = vi.mocked(retrieveStripeSession);
const mockedEmails = vi.mocked(sendOrderEmails);

function order(overrides: Partial<OrderRow> = {}): OrderRow {
  const now = new Date("2026-03-01T12:00:00Z");
  return {
    id: 42,
    token: "order-capability-token-123456",
    customerName: "Ada Lovelace",
    phone: "2155550100",
    email: "ada@example.com",
    fulfillment: "pickup",
    address: null,
    notes: null,
    staffNotes: null,
    items: [{ productId: 7, name: "iPhone", unitCents: 45_000, qty: 2, lineCents: 90_000 }],
    subtotalCents: 90_000,
    taxCents: 0,
    totalCents: 90_000,
    paymentMethod: "card_online",
    paymentStatus: "unpaid",
    status: "new",
    stripeSessionId: "cs_test_123",
    paymentIntentId: null,
    refundId: null,
    paidAt: null,
    idempotencyKey: "checkout-key-1234567890",
    reservationExpiresAt: "2026-03-01T11:00:00.000Z",
    stockRestoredAt: null,
    cancelledReason: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function session(overrides: Partial<StripeSession> = {}): StripeSession {
  return {
    id: "cs_test_123",
    url: null,
    status: "expired",
    paymentStatus: "unpaid",
    amountTotal: 90_000,
    currency: "usd",
    paymentIntentId: "pi_test_123",
    expiresAt: Math.floor(Date.now() / 1000) - 60,
    metadata: { orderToken: order().token },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedStore.staleCardOrders.mockResolvedValue([order()]);
  mockedStore.markOrderPaid.mockResolvedValue({
    order: order({ paymentStatus: "paid" }),
    changed: true,
  });
  mockedStore.cancelOrder.mockResolvedValue({
    order: order({ status: "cancelled", cancelledReason: "payment_expired" }),
    changed: true,
    restocked: true,
  });
  mockedStore.cleanupIdempotency.mockResolvedValue(0);
  mockedStore.updateOrder.mockResolvedValue(undefined);
  mockedRetrieve.mockResolvedValue(session());
});

describe("reconcileAbandonedOrders", () => {
  it("recovers a paid session instead of releasing its stock", async () => {
    mockedRetrieve.mockResolvedValue(
      session({ status: "complete", paymentStatus: "paid" }),
    );

    const result = await reconcileAbandonedOrders();

    expect(mockedStore.markOrderPaid).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ paymentIntentId: "pi_test_123" }),
    );
    expect(mockedEmails).toHaveBeenCalledTimes(1);
    expect(mockedStore.cancelOrder).not.toHaveBeenCalled();
    expect(result).toMatchObject({ recovered: 1, expired: 0 });
  });

  it("does not cancel a session that is still open, and realigns its hold", async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 60;
    mockedRetrieve.mockResolvedValue(session({ status: "open", expiresAt }));

    const result = await reconcileAbandonedOrders();

    expect(mockedStore.cancelOrder).not.toHaveBeenCalled();
    expect(mockedStore.updateOrder).toHaveBeenCalledWith(42, {
      reservationExpiresAt: new Date((expiresAt + 15 * 60) * 1000).toISOString(),
    });
    expect(result).toMatchObject({ skipped: 1, expired: 0 });
  });

  it("does not cancel a complete session with an unsettled payment", async () => {
    mockedRetrieve.mockResolvedValue(
      session({ status: "complete", paymentStatus: "unpaid" }),
    );

    const result = await reconcileAbandonedOrders();

    expect(mockedStore.cancelOrder).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });

  it("releases an expired, unpaid session exactly through cancelOrder", async () => {
    const result = await reconcileAbandonedOrders();

    expect(mockedStore.cancelOrder).toHaveBeenCalledWith(42, "payment_expired");
    expect(result).toMatchObject({ expired: 1, restocked: 1 });
  });

  it("releases stock for an order that never got a session", async () => {
    mockedStore.staleCardOrders.mockResolvedValue([
      order({ stripeSessionId: null }),
    ]);

    await reconcileAbandonedOrders();

    expect(mockedRetrieve).not.toHaveBeenCalled();
    expect(mockedStore.cancelOrder).toHaveBeenCalledWith(42, "payment_expired");
  });

  it("leaves the order alone when Stripe cannot be reached", async () => {
    mockedRetrieve.mockRejectedValue(new Error("network"));

    const result = await reconcileAbandonedOrders();

    expect(mockedStore.cancelOrder).not.toHaveBeenCalled();
    expect(mockedStore.markOrderPaid).not.toHaveBeenCalled();
    expect(result).toMatchObject({ skipped: 1, expired: 0 });
  });

  it("skips an order that a concurrent refund already moved", async () => {
    mockedRetrieve.mockResolvedValue(
      session({ status: "complete", paymentStatus: "paid" }),
    );
    mockedStore.markOrderPaid.mockRejectedValue(
      new OrderStateError("A refunded order cannot be marked paid."),
    );

    const result = await reconcileAbandonedOrders();

    expect(result).toMatchObject({ skipped: 1, recovered: 0 });
  });

  it("treats a paid-race cancel conflict as skipped, not a crash", async () => {
    mockedStore.cancelOrder.mockRejectedValue(
      new OrderStateError("A paid order must be refunded before it can be cancelled."),
    );

    await expect(reconcileAbandonedOrders()).resolves.toMatchObject({ skipped: 1 });
  });

  it("prunes old idempotency keys as part of the sweep", async () => {
    mockedStore.cleanupIdempotency.mockResolvedValue(9);

    const result = await reconcileAbandonedOrders();

    expect(mockedStore.cleanupIdempotency).toHaveBeenCalledTimes(1);
    expect(result.idempotencyDeleted).toBe(9);
  });
});
