import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderRow, ProductRow } from "../server/queries/store.js";
import type { StripeSession } from "../server/payments.js";

/**
 * Checkout contract tests.
 *
 * Firestore, Stripe and the mailer are mocked so these tests exercise the real
 * tRPC surface: validation, server-side re-pricing, idempotency, atomic stock
 * transitions, Stripe verification and admin authorization.
 */

vi.mock("../server/queries/store.js", () => {
  class StockError extends Error {}
  class OrderStateError extends Error {}
  return {
    StockError,
    OrderStateError,
    store: {
      getProductsByIds: vi.fn(),
      orderByIdempotencyKey: vi.fn(),
      createOrderWithReservation: vi.fn(),
      cancelOrder: vi.fn(),
      markOrderPaid: vi.fn(),
      markOrderRefunded: vi.fn(),
      deleteOrderSafely: vi.fn(),
      staleCardOrders: vi.fn(),
      cleanupIdempotency: vi.fn(),
      orderByToken: vi.fn(),
      orderById: vi.fn(),
      orders: vi.fn(),
      updateOrder: vi.fn(),
    },
  };
});

vi.mock("../server/payments.js", () => ({
  paymentsConfigured: vi.fn(() => false),
  createStripeCheckout: vi.fn(),
  retrieveStripeSession: vi.fn(),
  refundStripePayment: vi.fn(),
  stripeMode: vi.fn(() => "disabled"),
  webhookConfigured: vi.fn(() => false),
}));

vi.mock("../server/orderEmails.js", () => ({
  sendOrderEmails: vi.fn(async () => undefined),
}));

vi.mock("../server/orderReconciliation.js", () => ({
  reconcileAbandonedOrders: vi.fn(),
}));

vi.mock("../server/email.js", () => ({
  sendEmail: vi.fn(async () => ({ delivered: false })),
  staffNotificationHtml: vi.fn(() => "<html>staff</html>"),
}));

vi.mock("../server/notifications.js", () => ({
  notifyCustomer: vi.fn(async () => undefined),
}));

import { appRouter } from "../server/router.js";
import {
  OrderStateError,
  StockError,
  store,
} from "../server/queries/store.js";
import {
  createStripeCheckout,
  paymentsConfigured,
  refundStripePayment,
  retrieveStripeSession,
  stripeMode,
  webhookConfigured,
} from "../server/payments.js";
import { sendOrderEmails } from "../server/orderEmails.js";
import { reconcileAbandonedOrders } from "../server/orderReconciliation.js";
import { resetRateLimits } from "../server/lib/rateLimit.js";
import { env } from "../server/lib/env.js";

const mockedStore = vi.mocked(store);
const mockedConfigured = vi.mocked(paymentsConfigured);
const mockedCreateCheckout = vi.mocked(createStripeCheckout);
const mockedRetrieveSession = vi.mocked(retrieveStripeSession);
const mockedRefund = vi.mocked(refundStripePayment);
const mockedStripeMode = vi.mocked(stripeMode);
const mockedWebhookConfigured = vi.mocked(webhookConfigured);
const mockedSendEmails = vi.mocked(sendOrderEmails);
const mockedReconcile = vi.mocked(reconcileAbandonedOrders);

const adminUser = {
  id: 1,
  uid: "admin-uid",
  name: "Admin",
  email: "admin@example.com",
  avatar: null,
  role: "admin" as const,
};

function caller(user?: typeof adminUser) {
  return appRouter.createCaller({
    req: new Request("http://localhost/api/trpc", {
      headers: { "x-forwarded-for": "203.0.113.10" },
    }),
    resHeaders: new Headers(),
    user,
  });
}

const TOKEN = "order-capability-token-123456";
const KEY = "checkout-key-1234567890";
const ORDER_ID = 42;

function product(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: 7,
    name: "iPhone 15 (Refurbished)",
    kind: "device_refurb",
    subcategory: "Apple",
    price: 45_000,
    stock: 3,
    description: null,
    badge: null,
    imagePath: null,
    active: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function order(overrides: Partial<OrderRow> = {}): OrderRow {
  const now = new Date("2026-03-01T12:00:00Z");
  return {
    id: ORDER_ID,
    token: TOKEN,
    customerName: "Ada Lovelace",
    phone: "2155550100",
    email: "ada@example.com",
    fulfillment: "pickup",
    address: null,
    notes: null,
    staffNotes: "Call before arriving",
    items: [
      {
        productId: 7,
        name: "iPhone 15 (Refurbished)",
        unitCents: 45_000,
        qty: 2,
        lineCents: 90_000,
      },
    ],
    subtotalCents: 90_000,
    taxCents: 0,
    totalCents: 90_000,
    paymentMethod: "card_in_store",
    paymentStatus: "unpaid",
    status: "new",
    stripeSessionId: null,
    paymentIntentId: null,
    refundId: null,
    paidAt: null,
    idempotencyKey: KEY,
    reservationExpiresAt: null,
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
    url: "https://checkout.stripe.com/c/pay/cs_test_123",
    status: "open",
    paymentStatus: "unpaid",
    amountTotal: 90_000,
    currency: "usd",
    paymentIntentId: null,
    expiresAt: null,
    metadata: { orderToken: TOKEN, orderId: String(ORDER_ID), orderNumber: "PPR-O42" },
    ...overrides,
  };
}

const checkoutInput = {
  items: [{ productId: 7, qty: 2 }],
  customerName: "Ada Lovelace",
  phone: "2155550100",
  email: "ada@example.com",
  fulfillment: "pickup" as const,
  paymentMethod: "card_in_store" as const,
  idempotencyKey: KEY,
};

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();

  mockedConfigured.mockReturnValue(false);
  mockedStripeMode.mockReturnValue("disabled");
  mockedWebhookConfigured.mockReturnValue(false);

  mockedStore.getProductsByIds.mockResolvedValue([product()]);
  mockedStore.orderByIdempotencyKey.mockResolvedValue(undefined);
  mockedStore.createOrderWithReservation.mockImplementation(async (data) => ({
    order: order({ ...data, id: ORDER_ID, token: TOKEN }),
    duplicate: false,
  }));
  mockedStore.cancelOrder.mockResolvedValue({
    order: order({ status: "cancelled", cancelledReason: "cancelled_by_staff" }),
    changed: true,
    restocked: true,
  });
  mockedStore.markOrderPaid.mockResolvedValue({
    order: order({ paymentStatus: "paid", paidAt: "2026-03-02" }),
    changed: true,
  });
  mockedStore.markOrderRefunded.mockResolvedValue({
    order: order({ paymentStatus: "refunded", status: "cancelled" }),
    changed: true,
    restocked: true,
  });
  mockedStore.deleteOrderSafely.mockResolvedValue({ deleted: true, restocked: true });
  mockedStore.staleCardOrders.mockResolvedValue([]);
  mockedStore.cleanupIdempotency.mockResolvedValue(0);
  mockedReconcile.mockResolvedValue({
    scanned: 0,
    expired: 0,
    restocked: 0,
    recovered: 0,
    skipped: 0,
    idempotencyDeleted: 0,
  });
  mockedStore.orderByToken.mockResolvedValue(order());
  mockedStore.orderById.mockResolvedValue(order());
  mockedStore.orders.mockResolvedValue([order()]);
  mockedStore.updateOrder.mockResolvedValue(undefined);

  mockedCreateCheckout.mockResolvedValue(session());
  mockedRetrieveSession.mockResolvedValue(session());
  mockedRefund.mockResolvedValue({
    id: "re_test_123",
    status: "succeeded",
    amount: 90_000,
    currency: "usd",
    paymentIntentId: "pi_test_123",
  });
});

describe("shop.createOrder — pricing and validation", () => {
  it("re-prices the cart from Firestore and ignores client-supplied values", async () => {
    const result = await caller().shop.createOrder(checkoutInput);

    expect(result.totalCents).toBe(90_000);
    expect(result.redirectUrl).toBeNull();
    expect(result.duplicate).toBe(false);

    const [data, stockItems] = mockedStore.createOrderWithReservation.mock.calls[0];
    expect(stockItems).toEqual([{ productId: 7, qty: 2 }]);
    expect(data.items[0]).toMatchObject({
      productId: 7,
      unitCents: 45_000,
      lineCents: 90_000,
      qty: 2,
    });
    expect(data.subtotalCents).toBe(90_000);
    expect(data.taxCents).toBe(0);
    expect(data.totalCents).toBe(90_000);
    expect(data.paymentStatus).toBe("unpaid");
    expect(data.idempotencyKey).toBe(KEY);
    expect(mockedSendEmails).toHaveBeenCalledTimes(1);
  });

  it("applies the configured tax to the subtotal and stores whole cents", async () => {
    const original = env.orderTaxPercent;
    env.orderTaxPercent = 8;
    try {
      const result = await caller().shop.createOrder({
        ...checkoutInput,
        expectedTotalCents: 97_200, // 900.00 + 8% = 972.00
      });
      const [data] = mockedStore.createOrderWithReservation.mock.calls[0];
      expect(data).toMatchObject({
        subtotalCents: 90_000,
        taxCents: 7_200,
        totalCents: 97_200,
      });
      expect(result.totalCents).toBe(97_200);
    } finally {
      env.orderTaxPercent = original;
    }
  });

  it("accepts a total that matches what the customer was shown", async () => {
    const result = await caller().shop.createOrder({
      ...checkoutInput,
      expectedTotalCents: 90_000,
    });
    expect(result.totalCents).toBe(90_000);
  });

  it("refuses a stale displayed total instead of charging a different price", async () => {
    await expect(
      caller().shop.createOrder({ ...checkoutInput, expectedTotalCents: 89_000 }),
    ).rejects.toThrow(/price or tax changed/i);
    expect(mockedStore.createOrderWithReservation).not.toHaveBeenCalled();
  });

  it("merges duplicate lines and enforces the per-item cap", async () => {
    await expect(
      caller().shop.createOrder({
        ...checkoutInput,
        items: [
          { productId: 7, qty: 6 },
          { productId: 7, qty: 6 },
        ],
      }),
    ).rejects.toThrow(/up to 10/i);

    expect(mockedStore.getProductsByIds).not.toHaveBeenCalled();
    expect(mockedStore.createOrderWithReservation).not.toHaveBeenCalled();
  });

  it("refuses a sold-out item before touching the reservation transaction", async () => {
    mockedStore.getProductsByIds.mockResolvedValue([product({ stock: 0 })]);

    await expect(caller().shop.createOrder(checkoutInput)).rejects.toThrow(/sold out/i);
    expect(mockedStore.createOrderWithReservation).not.toHaveBeenCalled();
  });

  it("requires a full delivery address", async () => {
    await expect(
      caller().shop.createOrder({
        ...checkoutInput,
        fulfillment: "delivery",
        address: "abc",
      }),
    ).rejects.toThrow(/full delivery address/i);
    expect(mockedStore.createOrderWithReservation).not.toHaveBeenCalled();
  });

  it("rejects malformed contact details and idempotency keys before any I/O", async () => {
    await expect(
      caller().shop.createOrder({ ...checkoutInput, phone: "123" }),
    ).rejects.toThrow();
    await expect(
      caller().shop.createOrder({ ...checkoutInput, idempotencyKey: "short" }),
    ).rejects.toThrow();
    expect(mockedStore.createOrderWithReservation).not.toHaveBeenCalled();
  });

  it("maps an atomic stock conflict to a 409-style error", async () => {
    mockedStore.createOrderWithReservation.mockRejectedValue(
      new StockError("Only 1 of iPhone 15 (Refurbished) left."),
    );

    await expect(caller().shop.createOrder(checkoutInput)).rejects.toThrow(/Only 1/);
    expect(mockedStore.cancelOrder).not.toHaveBeenCalled();
  });

  it("does not cancel anything when the order transaction fails generically", async () => {
    mockedStore.createOrderWithReservation.mockRejectedValue(
      new Error("firestore unavailable"),
    );

    await expect(caller().shop.createOrder(checkoutInput)).rejects.toThrow(
      /couldn't save/i,
    );
    expect(mockedStore.cancelOrder).not.toHaveBeenCalled();
  });
});

describe("shop.createOrder — idempotency", () => {
  it("returns the existing order for a replayed key without reserving again", async () => {
    mockedStore.orderByIdempotencyKey.mockResolvedValue(order());

    const result = await caller().shop.createOrder(checkoutInput);

    expect(result).toMatchObject({
      token: TOKEN,
      duplicate: true,
      redirectUrl: null,
      totalCents: 90_000,
    });
    expect(mockedStore.createOrderWithReservation).not.toHaveBeenCalled();
    expect(mockedSendEmails).not.toHaveBeenCalled();
  });

  it("returns the transaction's duplicate result when two requests race", async () => {
    mockedStore.createOrderWithReservation.mockResolvedValue({
      order: order(),
      duplicate: true,
    });

    const result = await caller().shop.createOrder(checkoutInput);

    expect(result.duplicate).toBe(true);
    expect(result.redirectUrl).toBeNull();
    expect(mockedSendEmails).not.toHaveBeenCalled();
    expect(mockedCreateCheckout).not.toHaveBeenCalled();
  });

  it("rate-limits repeated checkout attempts", async () => {
    mockedStore.orderByIdempotencyKey.mockResolvedValue(order());

    for (let i = 0; i < 20; i += 1) {
      await expect(caller().shop.createOrder(checkoutInput)).resolves.toBeTruthy();
    }
    await expect(caller().shop.createOrder(checkoutInput)).rejects.toThrow(
      /Too many attempts/i,
    );
  });
});

describe("shop.createOrder — card online", () => {
  it("refuses card-online when Stripe is not configured", async () => {
    await expect(
      caller().shop.createOrder({ ...checkoutInput, paymentMethod: "card_online" }),
    ).rejects.toThrow(/isn't switched on/i);
    expect(mockedStore.createOrderWithReservation).not.toHaveBeenCalled();
  });

  it("creates the Stripe session from server totals and records it", async () => {
    mockedConfigured.mockReturnValue(true);

    const result = await caller().shop.createOrder({
      ...checkoutInput,
      paymentMethod: "card_online",
    });

    expect(result.redirectUrl).toBe("https://checkout.stripe.com/c/pay/cs_test_123");
    expect(mockedCreateCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        token: TOKEN,
        taxCents: 0,
        customerEmail: "ada@example.com",
        expiresInMinutes: env.orderReservationMinutes,
        lines: [{ name: "iPhone 15 (Refurbished)", unitCents: 45_000, qty: 2 }],
      }),
    );
    expect(mockedStore.updateOrder).toHaveBeenCalledWith(
      ORDER_ID,
      expect.objectContaining({ stripeSessionId: "cs_test_123" }),
    );
    expect(mockedSendEmails).toHaveBeenCalledWith(expect.anything(), {
      customer: true,
      staff: true,
    });
  });

  it("cancels the order atomically when Stripe cannot start", async () => {
    mockedConfigured.mockReturnValue(true);
    mockedCreateCheckout.mockRejectedValue(new Error("stripe down"));

    await expect(
      caller().shop.createOrder({ ...checkoutInput, paymentMethod: "card_online" }),
    ).rejects.toThrow(/couldn't open the card payment page/i);

    expect(mockedStore.cancelOrder).toHaveBeenCalledWith(
      ORDER_ID,
      "payment_setup_failed",
    );
  });
});

describe("shop.confirmOrderPayment", () => {
  it("marks paid from an authoritative session and emails once", async () => {
    mockedConfigured.mockReturnValue(true);
    mockedStore.orderByToken
      .mockResolvedValueOnce(order())
      .mockResolvedValueOnce(order({ paymentStatus: "paid", paidAt: "2026-03-02" }));
    mockedRetrieveSession.mockResolvedValue(
      session({ status: "complete", paymentStatus: "paid", paymentIntentId: "pi_test_123" }),
    );

    const result = await caller().shop.confirmOrderPayment({
      token: TOKEN,
      sessionId: "cs_test_123",
    });

    expect(result.order.paymentStatus).toBe("paid");
    expect(mockedStore.markOrderPaid).toHaveBeenCalledWith(ORDER_ID, {
      paidAt: expect.any(String),
      stripeSessionId: "cs_test_123",
      paymentIntentId: "pi_test_123",
    });
    expect(mockedSendEmails).toHaveBeenCalledTimes(1);
  });

  it("is idempotent when the order is already paid", async () => {
    mockedConfigured.mockReturnValue(true);
    mockedStore.orderByToken.mockResolvedValue(order({ paymentStatus: "paid" }));

    const result = await caller().shop.confirmOrderPayment({ token: TOKEN });

    expect(result.alreadyPaid).toBe(true);
    expect(mockedRetrieveSession).not.toHaveBeenCalled();
    expect(mockedStore.markOrderPaid).not.toHaveBeenCalled();
  });

  it("sends no second email when a webhook already marked the order paid", async () => {
    mockedConfigured.mockReturnValue(true);
    mockedStore.orderByToken.mockResolvedValue(order());
    mockedRetrieveSession.mockResolvedValue(
      session({ status: "complete", paymentStatus: "paid" }),
    );
    mockedStore.markOrderPaid.mockResolvedValue({
      order: order({ paymentStatus: "paid" }),
      changed: false,
    });

    await caller().shop.confirmOrderPayment({ token: TOKEN, sessionId: "cs_test_123" });
    expect(mockedSendEmails).not.toHaveBeenCalled();
  });

  it("rejects a session belonging to another order", async () => {
    mockedConfigured.mockReturnValue(true);
    mockedRetrieveSession.mockResolvedValue(
      session({ metadata: { orderToken: "another-order-token" } }),
    );

    await expect(
      caller().shop.confirmOrderPayment({ token: TOKEN, sessionId: "cs_test_123" }),
    ).rejects.toThrow(/doesn't belong/i);
    expect(mockedStore.markOrderPaid).not.toHaveBeenCalled();
  });

  it("rejects an amount that does not match the order", async () => {
    mockedConfigured.mockReturnValue(true);
    mockedRetrieveSession.mockResolvedValue(
      session({ status: "complete", paymentStatus: "paid", amountTotal: 100 }),
    );

    await expect(
      caller().shop.confirmOrderPayment({ token: TOKEN, sessionId: "cs_test_123" }),
    ).rejects.toThrow(/doesn't match/i);
    expect(mockedStore.markOrderPaid).not.toHaveBeenCalled();
  });

  it("rejects a currency other than USD", async () => {
    mockedConfigured.mockReturnValue(true);
    mockedRetrieveSession.mockResolvedValue(
      session({ status: "complete", paymentStatus: "paid", currency: "eur" }),
    );

    await expect(
      caller().shop.confirmOrderPayment({ token: TOKEN, sessionId: "cs_test_123" }),
    ).rejects.toThrow(/different currency/i);
  });

  it("does not mark an unpaid or still-processing session paid", async () => {
    mockedConfigured.mockReturnValue(true);
    mockedRetrieveSession.mockResolvedValue(
      session({ status: "complete", paymentStatus: "unpaid" }),
    );

    await expect(
      caller().shop.confirmOrderPayment({ token: TOKEN, sessionId: "cs_test_123" }),
    ).rejects.toThrow(/hasn't completed/i);
    expect(mockedStore.markOrderPaid).not.toHaveBeenCalled();
  });

  it("releases stock when the session expired without payment", async () => {
    mockedConfigured.mockReturnValue(true);
    mockedRetrieveSession.mockResolvedValue(
      session({ status: "expired", paymentStatus: "unpaid" }),
    );

    await expect(
      caller().shop.confirmOrderPayment({ token: TOKEN, sessionId: "cs_test_123" }),
    ).rejects.toThrow(/session expired/i);
    expect(mockedStore.cancelOrder).toHaveBeenCalledWith(ORDER_ID, "payment_expired");
    expect(mockedStore.markOrderPaid).not.toHaveBeenCalled();
  });

  it("cannot cancel an order with an unrelated expired session id", async () => {
    mockedConfigured.mockReturnValue(true);
    mockedRetrieveSession.mockResolvedValue(
      session({
        status: "expired",
        paymentStatus: "unpaid",
        metadata: { orderToken: "some-other-orders-token" },
      }),
    );

    await expect(
      caller().shop.confirmOrderPayment({ token: TOKEN, sessionId: "cs_other" }),
    ).rejects.toThrow(/doesn't belong/i);
    expect(mockedStore.cancelOrder).not.toHaveBeenCalled();
  });
});

describe("shop.payOrder", () => {
  it("reuses an existing open session instead of creating a second chargeable one", async () => {
    const openUrl = "https://checkout.stripe.com/c/pay/existing";
    mockedStore.orderByToken.mockResolvedValue(
      order({
        paymentMethod: "card_online",
        stripeSessionId: "cs_test_123",
        reservationExpiresAt: "2099-01-01T00:00:00.000Z",
      }),
    );
    mockedRetrieveSession.mockResolvedValue(
      session({
        url: openUrl,
        expiresAt: Math.floor(Date.now() / 1000) + 3_600,
      }),
    );

    const result = await caller().shop.payOrder({ token: TOKEN });

    expect(result.redirectUrl).toBe(openUrl);
    expect(mockedCreateCheckout).not.toHaveBeenCalled();
  });

  it("marks paid when the stored session is already paid", async () => {
    mockedStore.orderByToken.mockResolvedValue(
      order({ paymentMethod: "card_online", stripeSessionId: "cs_test_123" }),
    );
    mockedRetrieveSession.mockResolvedValue(
      session({ status: "complete", paymentStatus: "paid" }),
    );

    const result = await caller().shop.payOrder({ token: TOKEN });

    expect(result.alreadyPaid).toBe(true);
    expect(mockedStore.markOrderPaid).toHaveBeenCalled();
    expect(mockedCreateCheckout).not.toHaveBeenCalled();
  });

  it("creates a fresh session only when none was stored", async () => {
    mockedConfigured.mockReturnValue(true);
    mockedStore.orderByToken.mockResolvedValue(
      order({ paymentMethod: "card_online", stripeSessionId: null }),
    );

    const result = await caller().shop.payOrder({ token: TOKEN });

    expect(result.redirectUrl).toBe("https://checkout.stripe.com/c/pay/cs_test_123");
    expect(mockedCreateCheckout).toHaveBeenCalledTimes(1);
  });

  it("refuses to take card payment for a pay-in-store order", async () => {
    mockedStore.orderByToken.mockResolvedValue(order({ paymentMethod: "cash" }));

    await expect(caller().shop.payOrder({ token: TOKEN })).rejects.toThrow(
      /pay in store/i,
    );
  });

  it("releases an expired reservation and refuses the retry", async () => {
    mockedStore.orderByToken.mockResolvedValue(
      order({
        paymentMethod: "card_online",
        reservationExpiresAt: "2000-01-01T00:00:00.000Z",
      }),
    );

    await expect(caller().shop.payOrder({ token: TOKEN })).rejects.toThrow(
      /checkout expired/i,
    );
    expect(mockedStore.cancelOrder).toHaveBeenCalledWith(ORDER_ID, "payment_expired");
  });

  it("reports a Stripe read failure without creating another session", async () => {
    mockedStore.orderByToken.mockResolvedValue(
      order({ paymentMethod: "card_online", stripeSessionId: "cs_test_123" }),
    );
    mockedRetrieveSession.mockRejectedValue(new Error("network down"));

    await expect(caller().shop.payOrder({ token: TOKEN })).rejects.toThrow(
      /couldn't reopen/i,
    );
    expect(mockedCreateCheckout).not.toHaveBeenCalled();
  });
});

describe("public order lookup", () => {
  it("never exposes staff notes, Stripe ids or the idempotency key", async () => {
    const result = await caller().shop.orderByToken({ token: TOKEN });

    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("staffNotes");
    expect(result).not.toHaveProperty("stripeSessionId");
    expect(result).not.toHaveProperty("paymentIntentId");
    expect(result).not.toHaveProperty("idempotencyKey");
    expect(result).not.toHaveProperty("refundId");
    expect(result?.orderNumber).toBe("PPR-O42");
  });

  it("refuses to start a new payment for a refunded order", async () => {
    mockedStore.orderByToken.mockResolvedValue(
      order({ paymentStatus: "refunded", paymentMethod: "card_online" }),
    );

    await expect(caller().shop.payOrder({ token: TOKEN })).rejects.toThrow(
      /was refunded/i,
    );
    await expect(
      caller().shop.confirmOrderPayment({ token: TOKEN, sessionId: "cs_test_123" }),
    ).rejects.toThrow(/was refunded/i);
    expect(mockedCreateCheckout).not.toHaveBeenCalled();
    expect(mockedStore.markOrderPaid).not.toHaveBeenCalled();
  });

  it("rejects a too-short token before querying Firestore", async () => {
    await expect(caller().shop.orderByToken({ token: "short" })).rejects.toThrow();
    expect(mockedStore.orderByToken).not.toHaveBeenCalled();
  });
});

describe("admin order authorization and transitions", () => {
  it("requires admin authentication for every order operation", async () => {
    await expect(caller().admin.orders()).rejects.toThrow(/Authentication required/);
    await expect(
      caller().admin.updateOrder({ id: ORDER_ID, status: "ready" }),
    ).rejects.toThrow(/Authentication required/);
    await expect(caller().admin.refundOrder({ id: ORDER_ID })).rejects.toThrow(
      /Authentication required/,
    );
    await expect(caller().admin.deleteOrder({ id: ORDER_ID })).rejects.toThrow(
      /Authentication required/,
    );
  });

  it("cancels an unpaid order through the atomic cancel path", async () => {
    await caller(adminUser).admin.updateOrder({ id: ORDER_ID, status: "cancelled" });

    expect(mockedStore.cancelOrder).toHaveBeenCalledWith(
      ORDER_ID,
      "cancelled_by_staff",
    );
  });

  it("refuses to cancel a paid order", async () => {
    mockedStore.orderById.mockResolvedValue(order({ paymentStatus: "paid" }));

    await expect(
      caller(adminUser).admin.updateOrder({ id: ORDER_ID, status: "cancelled" }),
    ).rejects.toThrow(/Refund this payment/i);
    expect(mockedStore.cancelOrder).not.toHaveBeenCalled();
  });

  it("refuses to change payment status as part of a cancellation", async () => {
    await expect(
      caller(adminUser).admin.updateOrder({
        id: ORDER_ID,
        status: "cancelled",
        paymentStatus: "paid",
      }),
    ).rejects.toThrow(/Record the payment separately/i);
    expect(mockedStore.cancelOrder).not.toHaveBeenCalled();
  });

  it("refuses to cancel a completed order", async () => {
    mockedStore.orderById.mockResolvedValue(order({ status: "completed" }));

    await expect(
      caller(adminUser).admin.updateOrder({ id: ORDER_ID, status: "cancelled" }),
    ).rejects.toThrow(/Cannot change/i);
  });

  it("does not allow un-paying or directly marking an order refunded", async () => {
    mockedStore.orderById.mockResolvedValue(order({ paymentStatus: "paid" }));

    await expect(
      caller(adminUser).admin.updateOrder({ id: ORDER_ID, paymentStatus: "unpaid" }),
    ).rejects.toThrow(/Cannot change payment/i);
    await expect(
      caller(adminUser).admin.updateOrder({ id: ORDER_ID, paymentStatus: "refunded" }),
    ).rejects.toThrow(/refund action/i);
    expect(mockedStore.updateOrder).not.toHaveBeenCalled();
  });

  it("refuses to mark a cancelled order paid from the admin UI", async () => {
    mockedStore.orderById.mockResolvedValue(order({ status: "cancelled" }));

    await expect(
      caller(adminUser).admin.updateOrder({ id: ORDER_ID, paymentStatus: "paid" }),
    ).rejects.toThrow(/cancelled order cannot be marked paid/i);
    expect(mockedStore.markOrderPaid).not.toHaveBeenCalled();
  });

  it("records an offline collection through the atomic paid transition", async () => {
    await caller(adminUser).admin.updateOrder({ id: ORDER_ID, paymentStatus: "paid" });

    expect(mockedStore.markOrderPaid).toHaveBeenCalledWith(
      ORDER_ID,
      expect.objectContaining({ paidAt: expect.any(String) }),
    );
    expect(mockedSendEmails).toHaveBeenCalledTimes(1);
  });

  it("maps a concurrent lifecycle conflict to a 409-style error", async () => {
    mockedStore.cancelOrder.mockRejectedValue(
      new OrderStateError("A paid order must be refunded before it can be cancelled."),
    );

    await expect(
      caller(adminUser).admin.updateOrder({ id: ORDER_ID, status: "cancelled" }),
    ).rejects.toThrow(/must be refunded/i);
  });
});

describe("admin refunds", () => {
  const paidCard = () =>
    order({
      paymentStatus: "paid",
      paymentMethod: "card_online",
      paymentIntentId: "pi_test_123",
    });

  it("asks Stripe first for card-online refunds and records the refund id", async () => {
    mockedConfigured.mockReturnValue(true);
    mockedStore.orderById.mockResolvedValue(paidCard());

    const result = await caller(adminUser).admin.refundOrder({ id: ORDER_ID });

    expect(mockedRefund).toHaveBeenCalledWith({
      paymentIntentId: "pi_test_123",
      amountCents: 90_000,
      idempotencyKey: `refund-order-${ORDER_ID}`,
      orderNumber: "PPR-O42",
    });
    expect(mockedStore.markOrderRefunded).toHaveBeenCalledWith(ORDER_ID, {
      refundId: "re_test_123",
      reason: "refunded",
    });
    expect(result.changed).toBe(true);
  });

  it("does not record a refund Stripe has not completed", async () => {
    mockedConfigured.mockReturnValue(true);
    mockedStore.orderById.mockResolvedValue(paidCard());
    mockedRefund.mockResolvedValue({
      id: "re_pending",
      status: "pending",
      amount: 90_000,
      currency: "usd",
      paymentIntentId: "pi_test_123",
    });

    await expect(
      caller(adminUser).admin.refundOrder({ id: ORDER_ID }),
    ).rejects.toThrow(/has not been recorded/i);
    expect(mockedStore.markOrderRefunded).not.toHaveBeenCalled();
  });

  it("refuses a card refund when the payment reference is missing", async () => {
    mockedConfigured.mockReturnValue(true);
    mockedStore.orderById.mockResolvedValue(
      order({ paymentStatus: "paid", paymentMethod: "card_online" }),
    );

    await expect(
      caller(adminUser).admin.refundOrder({ id: ORDER_ID }),
    ).rejects.toThrow(/no Stripe payment reference/i);
    expect(mockedRefund).not.toHaveBeenCalled();
  });

  it("records an offline refund without calling Stripe", async () => {
    mockedStore.orderById.mockResolvedValue(
      order({ paymentStatus: "paid", paymentMethod: "cash" }),
    );

    await caller(adminUser).admin.refundOrder({ id: ORDER_ID });

    expect(mockedRefund).not.toHaveBeenCalled();
    expect(mockedStore.markOrderRefunded).toHaveBeenCalledWith(ORDER_ID, {
      refundId: null,
      reason: "refunded",
    });
  });

  it("is idempotent for an already-refunded order", async () => {
    mockedStore.orderById.mockResolvedValue(
      order({ paymentStatus: "refunded", paymentMethod: "card_online" }),
    );

    const result = await caller(adminUser).admin.refundOrder({ id: ORDER_ID });

    expect(result.alreadyRefunded).toBe(true);
    expect(mockedRefund).not.toHaveBeenCalled();
  });

  it("refuses to refund an unpaid order", async () => {
    mockedStore.orderById.mockResolvedValue(order({ paymentStatus: "unpaid" }));

    await expect(
      caller(adminUser).admin.refundOrder({ id: ORDER_ID }),
    ).rejects.toThrow(/Only a paid order/i);
  });
});

describe("admin deletion and reconciliation", () => {
  it("deletes through the safe path and reports restocking", async () => {
    const result = await caller(adminUser).admin.deleteOrder({ id: ORDER_ID });

    expect(mockedStore.deleteOrderSafely).toHaveBeenCalledWith(ORDER_ID);
    expect(result).toMatchObject({ ok: true, deleted: true, restocked: true });
  });

  it("refuses to delete a paid order", async () => {
    mockedStore.deleteOrderSafely.mockRejectedValue(
      new OrderStateError("Refund paid orders before deleting them."),
    );

    await expect(
      caller(adminUser).admin.deleteOrder({ id: ORDER_ID }),
    ).rejects.toThrow(/Refund paid orders/i);
  });

  it("runs Stripe-checked reconciliation from the manual action", async () => {
    mockedReconcile.mockResolvedValue({
      scanned: 5,
      expired: 2,
      restocked: 2,
      recovered: 1,
      skipped: 2,
      idempotencyDeleted: 3,
    });

    const result = await caller(adminUser).admin.reconcileOrders();

    expect(mockedReconcile).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      scanned: 5,
      expired: 2,
      restocked: 2,
      recovered: 1,
      idempotencyDeleted: 3,
    });
  });

  it("reports payment configuration without exposing secrets", async () => {
    mockedConfigured.mockReturnValue(true);
    mockedStripeMode.mockReturnValue("test");
    mockedWebhookConfigured.mockReturnValue(true);

    const config = await caller(adminUser).admin.paymentConfig();

    expect(config).toMatchObject({
      onlineCard: true,
      stripeMode: "test",
      webhookConfigured: true,
      publicSiteUrl: expect.any(String),
      taxPercent: expect.any(Number),
      reservationMinutes: expect.any(Number),
      cronConfigured: expect.any(Boolean),
    });
    expect(config).not.toHaveProperty("stripeSecretKey");
    expect(config).not.toHaveProperty("stripeWebhookSecret");
    expect(config).not.toHaveProperty("cronSecret");
  });
});

describe("shop.paymentOptions", () => {
  it("reports card availability and the tax rate only", async () => {
    mockedConfigured.mockReturnValue(true);
    const options = await caller().shop.paymentOptions();
    expect(options).toEqual({
      onlineCard: true,
      taxPercent: env.orderTaxPercent,
    });
  });
});
