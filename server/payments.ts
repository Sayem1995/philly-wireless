import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./lib/env.js";

/**
 * Card payments via Stripe Checkout.
 *
 * Deliberately dependency-free: the three Stripe calls this shop needs are two
 * form-encoded HTTP requests plus a webhook signature check, so integrating
 * against the REST API avoids pulling an SDK (and its version churn) into the
 * server bundle. Everything here is a plain function, which also keeps the
 * payment rules unit-testable without a Stripe account.
 *
 * The payment flow is:
 *   1. `createOrder` writes an unpaid order, then `createStripeCheckout`
 *      returns a hosted payment page URL.
 *   2. Stripe redirects the customer back to `/order/<token>?session_id=…`,
 *      where `shop.confirmOrderPayment` re-reads the session and marks the
 *      order paid.
 *   3. `POST /api/stripe/webhook` handles the same transition when the
 *      customer closes the tab before returning, so a charge is never missed.
 */

export type StripeLine = { name: string; unitCents: number; qty: number };

export type StripeSession = {
  id: string;
  url: string | null;
  /** Stripe session lifecycle: `open` | `complete` | `expired`. */
  status: string;
  paymentStatus: string;
  amountTotal: number | null;
  currency: string | null;
  /** Needed to refund a card payment without asking staff to copy ids. */
  paymentIntentId: string | null;
  expiresAt: number | null;
  metadata: Record<string, string>;
};

export type StripeRefund = {
  id: string;
  status: string;
  amount: number | null;
  currency: string | null;
  paymentIntentId: string | null;
};

export type StripeKeyMode = "disabled" | "test" | "live" | "invalid";

/**
 * Stripe secret keys are `sk_test_…` / `sk_live_…`; restricted keys use the
 * same test/live marker with an `rk_` prefix. Anything else (a publishable
 * `pk_…`, a pasted placeholder, whitespace) must not enable checkout — Stripe
 * would reject every request and the failure would look like an outage.
 */
export function isStripeSecretKey(value: string): boolean {
  return /^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(value.trim());
}

export function stripeModeForKey(value: string): StripeKeyMode {
  const key = value.trim();
  if (!key) return "disabled";
  if (!isStripeSecretKey(key)) return "invalid";
  return key.includes("_test_") ? "test" : "live";
}

/** Server-only: never expose the key itself, only this derived mode. */
export function stripeMode(): StripeKeyMode {
  return stripeModeForKey(env.stripeSecretKey);
}

/** True when a valid secret key is present; checkout hides card-online without it. */
export function paymentsConfigured(): boolean {
  const mode = stripeMode();
  return mode === "test" || mode === "live";
}

/** True when a webhook signing secret is configured (not validated for length). */
export function webhookConfigured(): boolean {
  return env.stripeWebhookSecret.startsWith("whsec_");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stripeError(json: Record<string, unknown> | null, status: number): string {
  const error = asRecord(json?.error);
  const message = error?.message;
  return typeof message === "string" && message.trim()
    ? message
    : `Stripe request failed (${status}).`;
}

function paymentIntentId(value: unknown): string | null {
  if (typeof value === "string" && value.startsWith("pi_")) return value;
  const record = asRecord(value);
  return typeof record?.id === "string" && record.id.startsWith("pi_") ? record.id : null;
}

function toSession(json: Record<string, unknown>): StripeSession {
  const metadata = asRecord(json.metadata) ?? {};
  const cleanMetadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === "string") cleanMetadata[key] = value;
  }
  return {
    id: String(json.id ?? ""),
    url: typeof json.url === "string" ? json.url : null,
    status: String(json.status ?? ""),
    paymentStatus: String(json.payment_status ?? "unpaid"),
    amountTotal: typeof json.amount_total === "number" ? json.amount_total : null,
    currency: typeof json.currency === "string" ? json.currency : null,
    paymentIntentId: paymentIntentId(json.payment_intent),
    expiresAt: typeof json.expires_at === "number" ? json.expires_at : null,
    metadata: cleanMetadata,
  };
}

async function stripeRequest(
  path: string,
  options: { body?: URLSearchParams; idempotencyKey?: string } = {},
): Promise<Record<string, unknown>> {
  if (!paymentsConfigured()) {
    throw new Error("Card payments are not configured.");
  }

  const { body, idempotencyKey } = options;
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${env.stripeSecretKey}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      // Stripe replays the original response for a repeated key, which makes
      // refund retries safe even if the HTTP response is lost.
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: body ? body.toString() : undefined,
    // Never hang a checkout request behind a stalled upstream.
    signal: AbortSignal.timeout(15_000),
  });

  const json = asRecord(await response.json().catch(() => null));
  if (!response.ok) {
    throw new Error(stripeError(json, response.status));
  }
  if (!json) throw new Error("Stripe returned an unreadable response.");
  return json;
}

/**
 * Create a hosted Checkout session for one order.
 *
 * The line items and totals are the server-computed ones — never values from
 * the browser — and the order token rides along in `metadata` so a return trip
 * or webhook can be matched back to the exact order.
 */
export async function createStripeCheckout(input: {
  token: string;
  orderId: number;
  orderNumber: string;
  lines: StripeLine[];
  taxCents: number;
  customerEmail: string | null;
  successUrl: string;
  cancelUrl: string;
  /** Minutes until the hosted page stops accepting payment (Stripe min 30). */
  expiresInMinutes: number;
  /**
   * Stripe idempotency key. Two concurrent "start payment" calls for the same
   * order in the same window return the same session instead of opening two
   * chargeable pages.
   */
  idempotencyKey?: string;
}): Promise<StripeSession> {
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", input.successUrl);
  form.set("cancel_url", input.cancelUrl);
  form.set("client_reference_id", String(input.orderId));
  form.set("metadata[orderToken]", input.token);
  form.set("metadata[orderId]", String(input.orderId));
  form.set("metadata[orderNumber]", input.orderNumber);
  form.set("payment_method_types[0]", "card");
  // Stripe requires at least 30 minutes. The extra 60s covers the round trip
  // so a 30-minute reservation is never rejected for being a hair too short.
  const expiresAt =
    Math.floor(Date.now() / 1000) + Math.max(30, input.expiresInMinutes) * 60 + 60;
  form.set("expires_at", String(expiresAt));
  if (input.customerEmail) form.set("customer_email", input.customerEmail);

  let index = 0;
  for (const line of input.lines) {
    form.set(`line_items[${index}][quantity]`, String(line.qty));
    form.set(`line_items[${index}][price_data][currency]`, "usd");
    form.set(`line_items[${index}][price_data][unit_amount]`, String(line.unitCents));
    form.set(`line_items[${index}][price_data][product_data][name]`, line.name.slice(0, 120));
    index += 1;
  }
  // Tax is one synthetic line so the Stripe total equals `order.totalCents`.
  if (input.taxCents > 0) {
    form.set(`line_items[${index}][quantity]`, "1");
    form.set(`line_items[${index}][price_data][currency]`, "usd");
    form.set(`line_items[${index}][price_data][unit_amount]`, String(input.taxCents));
    form.set(`line_items[${index}][price_data][product_data][name]`, "Sales tax");
  }

  return toSession(
    await stripeRequest("checkout/sessions", {
      body: form,
      idempotencyKey: input.idempotencyKey,
    }),
  );
}

/** Read a session back from Stripe, to verify a redirect or webhook claim. */
export async function retrieveStripeSession(sessionId: string): Promise<StripeSession> {
  if (!sessionId) throw new Error("Missing payment session.");
  return toSession(
    await stripeRequest(`checkout/sessions/${encodeURIComponent(sessionId)}`),
  );
}

/**
 * Refund a card payment in full.
 *
 * The idempotency key makes a retried refund return the original refund rather
 * than charging the customer twice. Callers must only record `refunded` after
 * Stripe reports `succeeded`.
 */
export async function refundStripePayment(input: {
  paymentIntentId: string;
  amountCents: number;
  idempotencyKey: string;
  orderNumber: string;
}): Promise<StripeRefund> {
  if (!input.paymentIntentId.startsWith("pi_")) {
    throw new Error("This order has no Stripe payment reference.");
  }
  const form = new URLSearchParams();
  form.set("payment_intent", input.paymentIntentId);
  form.set("amount", String(input.amountCents));
  form.set("metadata[orderNumber]", input.orderNumber);

  const json = await stripeRequest("refunds", {
    body: form,
    idempotencyKey: input.idempotencyKey,
  });
  return {
    id: String(json.id ?? ""),
    status: String(json.status ?? ""),
    amount: typeof json.amount === "number" ? json.amount : null,
    currency: typeof json.currency === "string" ? json.currency : null,
    paymentIntentId: paymentIntentId(json.payment_intent),
  };
}

/**
 * Verify a `Stripe-Signature` header against the raw request body.
 *
 * Stripe signs `"<timestamp>.<payload>"` with the webhook secret; the header
 * can carry several `v1` signatures (during a secret roll) and one of them must
 * match. The timestamp check bounds replay attacks.
 */
export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  options: { toleranceSeconds?: number; nowMs?: number } = {},
): boolean {
  if (!payload || !header || !secret) return false;

  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const split = part.indexOf("=");
    if (split === -1) continue;
    const key = part.slice(0, split).trim();
    const value = part.slice(split + 1).trim();
    if (key === "t") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) timestamp = parsed;
    } else if (key === "v1" && value) {
      signatures.push(value);
    }
  }
  if (timestamp === null || signatures.length === 0) return false;

  const tolerance = options.toleranceSeconds ?? 300;
  const nowSeconds = (options.nowMs ?? Date.now()) / 1000;
  if (Math.abs(nowSeconds - timestamp) > tolerance) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return signatures.some((signature) => {
    const given = Buffer.from(signature, "utf8");
    return given.length === expectedBuffer.length && timingSafeEqual(given, expectedBuffer);
  });
}

/** Headers Stripe expects for a successful webhook delivery. */
export const STRIPE_WEBHOOK_ACK = { received: true } as const;
