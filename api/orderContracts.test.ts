import { describe, expect, it } from "vitest";
import {
  canTransitionOrderStatus,
  canTransitionPaymentStatus,
  isIdempotencyKey,
  normaliseTaxPercent,
  shouldRestock,
  taxFor,
} from "../contracts/orders.js";

/**
 * Pure order rules.
 *
 * These are the decisions the server and admin UI share, so getting them wrong
 * would either restock goods twice or let an invalid payment state through.
 */

describe("normaliseTaxPercent", () => {
  it("accepts a normal rate and rounds to two decimals", () => {
    expect(normaliseTaxPercent("8")).toBe(8);
    expect(normaliseTaxPercent("8.125")).toBe(8.13);
    expect(normaliseTaxPercent(0)).toBe(0);
  });

  it("disables tax for missing, empty, negative or unparseable values", () => {
    expect(normaliseTaxPercent("")).toBe(0);
    expect(normaliseTaxPercent(undefined)).toBe(0);
    expect(normaliseTaxPercent("not-a-number")).toBe(0);
    expect(normaliseTaxPercent("-5")).toBe(0);
    expect(normaliseTaxPercent(Number.NaN)).toBe(0);
    expect(normaliseTaxPercent(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("clamps a misplaced decimal point instead of charging 800%", () => {
    expect(normaliseTaxPercent("800")).toBe(25);
    expect(normaliseTaxPercent(1000)).toBe(25);
  });
});

describe("taxFor", () => {
  it("rounds to the nearest whole cent", () => {
    expect(taxFor(90_000, 8)).toBe(7_200);
    expect(taxFor(12_345, 8)).toBe(988); // 987.6 -> 988
    expect(taxFor(1, 50)).toBe(1); // 0.5 -> 1 (never fractional cents)
  });

  it("returns zero for zero/negative or invalid inputs", () => {
    expect(taxFor(0, 8)).toBe(0);
    expect(taxFor(-100, 8)).toBe(0);
    expect(taxFor(1000, -1)).toBe(0);
    expect(taxFor(1000, Number.NaN)).toBe(0);
  });
});

describe("idempotency keys", () => {
  it("accepts UUID-like and slug-like keys", () => {
    expect(isIdempotencyKey("2f1c8f8e-7e57-4d9f-9d0a-2f2c9f0a4b11")).toBe(true);
    expect(isIdempotencyKey("checkout_1234567890_abcdef")).toBe(true);
  });

  it("rejects short, long, empty or unsafe keys", () => {
    expect(isIdempotencyKey("short")).toBe(false);
    expect(isIdempotencyKey(`x${"a".repeat(100)}`)).toBe(false);
    expect(isIdempotencyKey("")).toBe(false);
    expect(isIdempotencyKey("has spaces in the key")).toBe(false);
    expect(isIdempotencyKey("semi;colon-and-slash/key")).toBe(false);
    expect(isIdempotencyKey(42)).toBe(false);
  });
});

describe("shouldRestock", () => {
  it("restocks only orders whose goods have not left the shop", () => {
    expect(shouldRestock("new")).toBe(true);
    expect(shouldRestock("ready")).toBe(true);
  });

  it("never restocks completed or already-cancelled orders", () => {
    expect(shouldRestock("completed")).toBe(false);
    expect(shouldRestock("cancelled")).toBe(false);
  });
});

describe("order status transitions", () => {
  it("allows the normal fulfilment path", () => {
    expect(canTransitionOrderStatus("new", "ready")).toBe(true);
    expect(canTransitionOrderStatus("ready", "completed")).toBe(true);
    expect(canTransitionOrderStatus("new", "completed")).toBe(true);
    expect(canTransitionOrderStatus("new", "cancelled")).toBe(true);
    expect(canTransitionOrderStatus("ready", "cancelled")).toBe(true);
  });

  it("treats cancelled and completed as terminal", () => {
    expect(canTransitionOrderStatus("cancelled", "new")).toBe(false);
    expect(canTransitionOrderStatus("cancelled", "completed")).toBe(false);
    expect(canTransitionOrderStatus("completed", "cancelled")).toBe(false);
    expect(canTransitionOrderStatus("completed", "new")).toBe(false);
  });

  it("allows a no-op save", () => {
    expect(canTransitionOrderStatus("new", "new")).toBe(true);
    expect(canTransitionOrderStatus("completed", "completed")).toBe(true);
  });
});

describe("payment status transitions", () => {
  it("allows staff to record a collection and Stripe-confirmed refunds", () => {
    expect(canTransitionPaymentStatus("unpaid", "paid")).toBe(true);
    expect(canTransitionPaymentStatus("paid", "refunded")).toBe(true);
    expect(canTransitionPaymentStatus("paid", "paid")).toBe(true);
    expect(canTransitionPaymentStatus("refunded", "refunded")).toBe(true);
  });

  it("refuses to un-pay, un-refund or refund an unpaid order", () => {
    expect(canTransitionPaymentStatus("paid", "unpaid")).toBe(false);
    expect(canTransitionPaymentStatus("refunded", "paid")).toBe(false);
    expect(canTransitionPaymentStatus("unpaid", "refunded")).toBe(false);
  });
});
