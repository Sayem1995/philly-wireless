import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createStripeCheckout,
  isStripeSecretKey,
  refundStripePayment,
  retrieveStripeSession,
  stripeModeForKey,
  verifyStripeSignature,
} from "../server/payments.js";
import { env } from "../server/lib/env.js";

/**
 * Webhook signature verification.
 *
 * This is the only thing standing between an unauthenticated caller and an
 * order being marked paid, so it is tested directly with the same HMAC Stripe
 * uses rather than through the HTTP route.
 */
const secret = "whsec_test_secret";
const payload = JSON.stringify({ id: "evt_123", type: "checkout.session.completed" });
const nowMs = 1_800_000_000_000;
const nowSeconds = nowMs / 1000;

function sign(timestamp: number, body = payload, key = secret): string {
  return createHmac("sha256", key).update(`${timestamp}.${body}`).digest("hex");
}

function header(...signatures: string[]): string {
  return [`t=${nowSeconds}`, ...signatures.map((s) => `v1=${s}`)].join(",");
}

describe("Stripe key validation", () => {
  it("accepts standard and restricted secret keys in both modes", () => {
    expect(isStripeSecretKey("sk_test_51abcDEF")).toBe(true);
    expect(isStripeSecretKey("sk_live_51abcDEF")).toBe(true);
    expect(isStripeSecretKey("rk_test_51abcDEF")).toBe(true);
    expect(isStripeSecretKey("rk_live_51abcDEF")).toBe(true);
    expect(isStripeSecretKey("  sk_test_51abcDEF  ")).toBe(true);
  });

  it("rejects publishable keys, placeholders and malformed values", () => {
    expect(isStripeSecretKey("pk_test_51abcDEF")).toBe(false);
    expect(isStripeSecretKey("your-key-here")).toBe(false);
    expect(isStripeSecretKey("sk_test_")).toBe(false);
    expect(isStripeSecretKey("")).toBe(false);
  });

  it("derives test/live/invalid/disabled mode without exposing the key", () => {
    expect(stripeModeForKey("sk_test_123")).toBe("test");
    expect(stripeModeForKey("sk_live_123")).toBe("live");
    expect(stripeModeForKey("pk_test_123")).toBe("invalid");
    expect(stripeModeForKey("")).toBe("disabled");
  });
});

describe("verifyStripeSignature", () => {
  it("accepts a correctly signed payload", () => {
    expect(
      verifyStripeSignature(payload, header(sign(nowSeconds)), secret, { nowMs }),
    ).toBe(true);
  });

  it("rejects a signature made with the wrong secret", () => {
    expect(
      verifyStripeSignature(payload, header(sign(nowSeconds, payload, "whsec_other")), secret, {
        nowMs,
      }),
    ).toBe(false);
  });

  it("rejects a body that was changed after signing", () => {
    expect(
      verifyStripeSignature(`${payload} `, header(sign(nowSeconds)), secret, { nowMs }),
    ).toBe(false);
  });

  it("rejects a stale timestamp outside the tolerance", () => {
    const stale = nowSeconds - 301;
    expect(
      verifyStripeSignature(payload, header(sign(stale)), secret, { nowMs }),
    ).toBe(false);
  });

  it("accepts when any of several v1 signatures matches", () => {
    const valid = sign(nowSeconds);
    const headerValue = `t=${nowSeconds},v1=${"0".repeat(64)},v1=${valid}`;
    expect(verifyStripeSignature(payload, headerValue, secret, { nowMs })).toBe(true);
  });

  it("rejects missing, empty or malformed headers", () => {
    expect(verifyStripeSignature(payload, null, secret, { nowMs })).toBe(false);
    expect(verifyStripeSignature(payload, "garbage", secret, { nowMs })).toBe(false);
    expect(verifyStripeSignature(payload, header("not-hex"), secret, { nowMs })).toBe(false);
    expect(verifyStripeSignature(payload, header(sign(nowSeconds)), "", { nowMs })).toBe(false);
  });
});

/**
 * Stripe REST payloads.
 *
 * These use a stubbed `fetch`, so no test credential or network call is
 * involved. They pin the server-computed amounts, metadata, expiry and refund
 * idempotency key that the real integration depends on.
 */
describe("Stripe REST requests", () => {
  const originalKey = env.stripeSecretKey;
  let lastUrl = "";
  let lastInit: RequestInit | undefined;

  function stubStripe(response: unknown, status = 200) {
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      lastUrl = String(input);
      lastInit = init;
      return new Response(JSON.stringify(response), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  function sentForm(): URLSearchParams {
    return new URLSearchParams(String(lastInit?.body ?? ""));
  }

  beforeEach(() => {
    env.stripeSecretKey = "sk_test_51fakeForUnitTests";
    lastUrl = "";
    lastInit = undefined;
  });

  afterEach(() => {
    env.stripeSecretKey = originalKey;
    vi.unstubAllGlobals();
  });

  it("creates a Checkout Session with server amounts, metadata and expiry", async () => {
    stubStripe({
      id: "cs_test_1",
      url: "https://checkout.stripe.com/c/pay/cs_test_1",
      status: "open",
      payment_status: "unpaid",
      amount_total: 97_200,
      currency: "usd",
      payment_intent: null,
      expires_at: 1_900_000_000,
      metadata: { orderToken: "tok", orderId: "42" },
    });

    const session = await createStripeCheckout({
      token: "tok",
      orderId: 42,
      orderNumber: "PPR-O42",
      lines: [{ name: "Phone", unitCents: 45_000, qty: 2 }],
      taxCents: 7_200,
      customerEmail: "ada@example.com",
      successUrl: "https://shop.example/order/tok?session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: "https://shop.example/order/tok",
      expiresInMinutes: 60,
      idempotencyKey: "checkout-42-123456",
    });

    expect(lastUrl).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect((lastInit?.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk_test_51fakeForUnitTests",
    );
    expect(
      (lastInit?.headers as Record<string, string>)["Idempotency-Key"],
    ).toBe("checkout-42-123456");
    const form = sentForm();
    expect(form.get("mode")).toBe("payment");
    expect(form.get("metadata[orderToken]")).toBe("tok");
    expect(form.get("metadata[orderId]")).toBe("42");
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("45000");
    expect(form.get("line_items[0][quantity]")).toBe("2");
    expect(form.get("line_items[1][price_data][unit_amount]")).toBe("7200");
    expect(form.get("line_items[1][price_data][product_data][name]")).toBe("Sales tax");
    expect(Number(form.get("expires_at"))).toBeGreaterThan(
      Math.floor(Date.now() / 1000) + 30 * 60,
    );
    expect(session).toMatchObject({
      id: "cs_test_1",
      amountTotal: 97_200,
      paymentIntentId: null,
      expiresAt: 1_900_000_000,
    });
  });

  it("reads a session back and parses its PaymentIntent", async () => {
    stubStripe({
      id: "cs_test_2",
      status: "complete",
      payment_status: "paid",
      amount_total: 90_000,
      currency: "usd",
      payment_intent: "pi_test_2",
      metadata: { orderToken: "tok" },
    });

    const session = await retrieveStripeSession("cs_test_2");

    expect(lastUrl).toBe("https://api.stripe.com/v1/checkout/sessions/cs_test_2");
    expect(lastInit?.method).toBe("GET");
    expect(session).toMatchObject({
      status: "complete",
      paymentStatus: "paid",
      paymentIntentId: "pi_test_2",
    });
  });

  it("refunds in full with an idempotency key and parses the result", async () => {
    stubStripe({
      id: "re_test_1",
      status: "succeeded",
      amount: 90_000,
      currency: "usd",
      payment_intent: "pi_test_1",
    });

    const refund = await refundStripePayment({
      paymentIntentId: "pi_test_1",
      amountCents: 90_000,
      idempotencyKey: "refund-order-42",
      orderNumber: "PPR-O42",
    });

    expect(lastUrl).toBe("https://api.stripe.com/v1/refunds");
    expect((lastInit?.headers as Record<string, string>)["Idempotency-Key"]).toBe(
      "refund-order-42",
    );
    const form = sentForm();
    expect(form.get("payment_intent")).toBe("pi_test_1");
    expect(form.get("amount")).toBe("90000");
    expect(refund).toMatchObject({
      id: "re_test_1",
      status: "succeeded",
      amount: 90_000,
      paymentIntentId: "pi_test_1",
    });
  });

  it("surfaces Stripe's error message without leaking the key", async () => {
    stubStripe({ error: { message: "No such payment_intent" } }, 400);

    await expect(
      refundStripePayment({
        paymentIntentId: "pi_missing",
        amountCents: 100,
        idempotencyKey: "refund-order-1",
        orderNumber: "PPR-O1",
      }),
    ).rejects.toThrow("No such payment_intent");
  });

  it("rejects Stripe calls when no valid key is configured", async () => {
    env.stripeSecretKey = "pk_test_publishableOnly";
    const fetchMock = stubStripe({});

    await expect(
      retrieveStripeSession("cs_test_1"),
    ).rejects.toThrow(/not configured/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
