import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderRow } from "../server/queries/store.js";

/**
 * Webhook state machine.
 *
 * Signature verification is tested separately (`payments.test.ts`); these
 * tests feed already-authenticated events to `handleStripeEvent` and assert the
 * idempotent, amount-checked state transitions.
 */

vi.mock("../server/queries/store.js", () => ({
  store: {
    orderByToken: vi.fn(),
    markOrderPaid: vi.fn(),
    cancelOrder: vi.fn(),
  },
}));

vi.mock("../server/orderEmails.js", () => ({
  sendOrderEmails: vi.fn(async () => undefined),
}));

vi.mock("../server/payments.js", () => ({
  retrieveStripeSession: vi.fn(),
}));

import { handleStripeEvent } from "../server/stripeWebhook.js";
import { store } from "../server/queries/store.js";
import { sendOrderEmails } from "../server/orderEmails.js";
import { retrieveStripeSession } from "../server/payments.js";

const mockedStore = vi.mocked(store);
const mockedEmails = vi.mocked(sendOrderEmails);
const mockedRetrieve = vi.mocked(retrieveStripeSession);

const TOKEN = "order-capability-token-123456";

function order(overrides: Partial<OrderRow> = {}): OrderRow {
  const now = new Date("2026-03-01T12:00:00Z");
  return {
    id: 42,
    token: TOKEN,
    customerName: "Ada Lovelace",
    phone: "2155550100",
    email: "ada@example.com",
    fulfillment: "pickup",
    address: null,
    notes: null,
    staffNotes: null,
    items: [
      {
        productId: 7,
        name: "iPhone",
        unitCents: 45_000,
        qty: 2,
        lineCents: 90_000,
      },
    ],
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
    reservationExpiresAt: "2099-01-01T00:00:00.000Z",
    stockRestoredAt: null,
    cancelledReason: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function completedEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_test",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_123",
        status: "complete",
        payment_status: "paid",
        amount_total: 90_000,
        currency: "usd",
        payment_intent: "pi_test_123",
        client_reference_id: "42",
        metadata: { orderToken: TOKEN, orderId: "42" },
        ...overrides,
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedStore.orderByToken.mockResolvedValue(order());
  mockedStore.markOrderPaid.mockResolvedValue({
    order: order({ paymentStatus: "paid", paidAt: "2026-03-02" }),
    changed: true,
  });
  mockedStore.cancelOrder.mockResolvedValue({
    order: order({ status: "cancelled", cancelledReason: "payment_expired" }),
    changed: true,
    restocked: true,
  });
  mockedRetrieve.mockResolvedValue({
    id: "cs_test_123",
    url: null,
    status: "expired",
    paymentStatus: "unpaid",
    amountTotal: 90_000,
    currency: "usd",
    paymentIntentId: null,
    expiresAt: Math.floor(Date.now() / 1000) - 60,
    metadata: { orderToken: TOKEN, orderId: "42" },
  });
});

describe("checkout.session.completed", () => {
  it("marks the order paid and emails once", async () => {
    const result = await handleStripeEvent(completedEvent());

    expect(mockedStore.markOrderPaid).toHaveBeenCalledWith(42, {
      paidAt: expect.any(String),
      stripeSessionId: "cs_test_123",
      paymentIntentId: "pi_test_123",
    });
    expect(mockedEmails).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ received: true, changed: true });
  });

  it("is idempotent across replayed deliveries", async () => {
    mockedStore.markOrderPaid.mockResolvedValue({
      order: order({ paymentStatus: "paid" }),
      changed: false,
    });

    const result = await handleStripeEvent(completedEvent());

    expect(result.changed).toBe(false);
    expect(mockedEmails).not.toHaveBeenCalled();
  });

  it("ignores events with no order token", async () => {
    const result = await handleStripeEvent(
      completedEvent({ metadata: { orderId: "42" } }),
    );
    expect(result.ignored).toBe(true);
    expect(mockedStore.orderByToken).not.toHaveBeenCalled();
  });

  it("does not mark an order paid when Stripe reports an unpaid session", async () => {
    const result = await handleStripeEvent(
      completedEvent({ payment_status: "unpaid" }),
    );
    expect(result.pending).toBe(true);
    expect(mockedStore.markOrderPaid).not.toHaveBeenCalled();
  });

  it("rejects an amount mismatch without changing anything", async () => {
    const result = await handleStripeEvent(completedEvent({ amount_total: 100 }));
    expect(result.mismatch).toBe(true);
    expect(mockedStore.markOrderPaid).not.toHaveBeenCalled();
    expect(mockedEmails).not.toHaveBeenCalled();
  });

  it("rejects a currency mismatch", async () => {
    const result = await handleStripeEvent(completedEvent({ currency: "eur" }));
    expect(result.mismatch).toBe(true);
    expect(mockedStore.markOrderPaid).not.toHaveBeenCalled();
  });

  it("rejects a client reference that names a different order", async () => {
    const result = await handleStripeEvent(
      completedEvent({ client_reference_id: "999" }),
    );
    expect(result.mismatch).toBe(true);
    expect(mockedStore.markOrderPaid).not.toHaveBeenCalled();
  });

  it("rejects metadata that names a different order", async () => {
    const result = await handleStripeEvent(
      completedEvent({ metadata: { orderToken: TOKEN, orderId: "999" } }),
    );
    expect(result.mismatch).toBe(true);
    expect(mockedStore.markOrderPaid).not.toHaveBeenCalled();
  });

  it("still records a payment that lands after the order expired", async () => {
    mockedStore.orderByToken.mockResolvedValue(
      order({ status: "cancelled", cancelledReason: "payment_expired" }),
    );

    const result = await handleStripeEvent(completedEvent());

    expect(result.changed).toBe(true);
    expect(mockedStore.markOrderPaid).toHaveBeenCalled();
    // The order stays cancelled; staff can see it and refund. Stock is not
    // silently taken a second time.
    expect(mockedStore.cancelOrder).not.toHaveBeenCalled();
  });

  it("handles async payment success the same as a completed card payment", async () => {
    const event = { ...completedEvent(), type: "checkout.session.async_payment_succeeded" };
    const result = await handleStripeEvent(event);
    expect(result.changed).toBe(true);
    expect(mockedStore.markOrderPaid).toHaveBeenCalled();
  });
});

describe("checkout.session.expired", () => {
  function expiredEvent() {
    return {
      type: "checkout.session.expired",
      data: {
        object: {
          id: "cs_test_123",
          status: "expired",
          payment_status: "unpaid",
          amount_total: 90_000,
          currency: "usd",
          metadata: { orderToken: TOKEN, orderId: "42" },
        },
      },
    };
  }

  it("cancels an unpaid order and releases its stock exactly once", async () => {
    const first = await handleStripeEvent(expiredEvent());
    expect(mockedStore.cancelOrder).toHaveBeenCalledWith(42, "payment_expired");
    expect(first.expired).toBe(true);

    mockedStore.cancelOrder.mockResolvedValue({
      order: order({ status: "cancelled" }),
      changed: false,
      restocked: false,
    });
    const second = await handleStripeEvent(expiredEvent());
    expect(second.expired).toBe(false);
  });

  it("never cancels or restocks an already-paid order", async () => {
    mockedStore.orderByToken.mockResolvedValue(order({ paymentStatus: "paid" }));

    const result = await handleStripeEvent(expiredEvent());

    expect(result.ignored).toBe(true);
    expect(mockedStore.cancelOrder).not.toHaveBeenCalled();
  });

  it("recovers the payment if Stripe says the session is actually paid", async () => {
    mockedRetrieve.mockResolvedValue({
      id: "cs_test_123",
      url: null,
      status: "complete",
      paymentStatus: "paid",
      amountTotal: 90_000,
      currency: "usd",
      paymentIntentId: "pi_test_123",
      expiresAt: null,
      metadata: { orderToken: TOKEN, orderId: "42" },
    });

    const result = await handleStripeEvent(expiredEvent());

    expect(mockedStore.cancelOrder).not.toHaveBeenCalled();
    expect(mockedStore.markOrderPaid).toHaveBeenCalled();
    expect(result.recovered).toBe(true);
  });

  it("ignores a delayed expiry for a superseded session", async () => {
    mockedStore.orderByToken.mockResolvedValue(
      order({ stripeSessionId: "cs_newer_session" }),
    );

    const result = await handleStripeEvent(expiredEvent());

    expect(result.ignored).toBe(true);
    expect(mockedRetrieve).not.toHaveBeenCalled();
    expect(mockedStore.cancelOrder).not.toHaveBeenCalled();
  });

  it("does not release stock when Stripe cannot verify the session", async () => {
    mockedRetrieve.mockRejectedValue(new Error("network"));

    const result = await handleStripeEvent(expiredEvent());

    expect(mockedStore.cancelOrder).not.toHaveBeenCalled();
    expect(result.ignored).toBe(true);
  });

  it("does not release stock while the session is still open", async () => {
    mockedRetrieve.mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.com/x",
      status: "open",
      paymentStatus: "unpaid",
      amountTotal: 90_000,
      currency: "usd",
      paymentIntentId: null,
      expiresAt: Math.floor(Date.now() / 1000) + 600,
      metadata: { orderToken: TOKEN, orderId: "42" },
    });

    const result = await handleStripeEvent(expiredEvent());

    expect(mockedStore.cancelOrder).not.toHaveBeenCalled();
    expect(result.ignored).toBe(true);
  });

  it("swallows a paid-race conflict so Stripe still gets a 2xx", async () => {
    mockedStore.cancelOrder.mockRejectedValue(new Error("paid"));

    const result = await handleStripeEvent(expiredEvent());
    expect(result.ignored).toBe(true);
  });
});

describe("other events", () => {
  it("acknowledges a failed async payment without marking it paid", async () => {
    const result = await handleStripeEvent({
      type: "checkout.session.async_payment_failed",
      data: {
        object: {
          id: "cs_test_123",
          payment_status: "unpaid",
          metadata: { orderToken: TOKEN },
        },
      },
    });
    expect(result.failed).toBe(true);
    expect(mockedStore.markOrderPaid).not.toHaveBeenCalled();
  });

  it("ignores unknown event types and non-object payloads", async () => {
    expect((await handleStripeEvent({ type: "customer.created" })).ignored).toBe(true);
    expect((await handleStripeEvent(null)).ignored).toBe(true);
    expect((await handleStripeEvent({ type: "x", data: null })).ignored).toBe(true);
  });
});
