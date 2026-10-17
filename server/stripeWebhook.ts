import { ORDER_CURRENCY, orderNumber } from "../contracts/orders.js";
import { sendOrderEmails } from "./orderEmails.js";
import { retrieveStripeSession } from "./payments.js";
import { OrderStateError, store } from "./queries/store.js";

/**
 * Stripe webhook event handling.
 *
 * Signature verification happens in `boot.ts` against the exact raw body. This
 * module only interprets an authenticated event, which keeps the state machine
 * unit-testable without HTTP. Every transition is idempotent:
 *   - a replayed `checkout.session.completed` finds the order already paid and
 *     does not send a second confirmation email;
 *   - `checkout.session.expired` cancels an unpaid order at most once and
 *     returns its stock exactly once.
 */
export type StripeEventResult = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Extract the session object from a checkout.* event, or null for other events. */
function sessionFrom(event: unknown): Record<string, unknown> | null {
  const record = asRecord(event);
  const data = asRecord(record?.data);
  return asRecord(data?.object);
}

export async function handleStripeEvent(event: unknown): Promise<StripeEventResult> {
  const record = asRecord(event);
  const type = stringValue(record?.type);
  const session = sessionFrom(event);
  if (!session) return { received: true, ignored: true };

  const metadata = asRecord(session.metadata) ?? {};
  const token = stringValue(metadata.orderToken);
  if (!token) return { received: true, ignored: true };

  const order = await store.orderByToken(token);
  if (!order) return { received: true, ignored: true };

  // Defence in depth: the token alone maps to the order, and the order id we
  // put on the session must agree if it is present.
  const metadataOrderId = stringValue(metadata.orderId);
  if (metadataOrderId && metadataOrderId !== String(order.id)) {
    console.error(`[stripe] metadata order mismatch for #${orderNumber(order.id)}`);
    return { received: true, mismatch: true };
  }

  const sessionId = stringValue(session.id) || order.stripeSessionId;
  const paymentIntentId = stringValue(session.payment_intent) || order.paymentIntentId;

  /* ---------- paid ---------- */
  if (
    type === "checkout.session.completed" ||
    type === "checkout.session.async_payment_succeeded"
  ) {
    // Delayed methods can emit `completed` before funds settle. Only Stripe's
    // authoritative `payment_status` may mark an order paid.
    if (stringValue(session.payment_status) !== "paid") {
      return { received: true, pending: true };
    }

    const amountTotal =
      typeof session.amount_total === "number" ? session.amount_total : null;
    const currency = stringValue(session.currency);
    if (amountTotal !== null && amountTotal !== order.totalCents) {
      console.error(
        `[stripe] amount mismatch for #${orderNumber(order.id)}: stripe=${amountTotal} order=${order.totalCents}`,
      );
      return { received: true, mismatch: true };
    }
    if (currency && currency !== ORDER_CURRENCY) {
      console.error(
        `[stripe] currency mismatch for #${orderNumber(order.id)}: stripe=${currency}`,
      );
      return { received: true, mismatch: true };
    }
    const reference = stringValue(session.client_reference_id);
    if (reference && reference !== String(order.id)) {
      console.error(
        `[stripe] order reference mismatch for #${orderNumber(order.id)}`,
      );
      return { received: true, mismatch: true };
    }

    let result: Awaited<ReturnType<typeof store.markOrderPaid>>;
    try {
      result = await store.markOrderPaid(order.id, {
        paidAt: new Date().toISOString().slice(0, 10),
        stripeSessionId: sessionId,
        paymentIntentId,
      });
    } catch (err) {
      if (err instanceof OrderStateError) {
        // Permanent state conflict (e.g. already refunded). Acknowledge so
        // Stripe stops retrying; the amount was still checked above.
        console.error(
          `[stripe] cannot mark #${orderNumber(order.id)} paid:`,
          err.message,
        );
        return { received: true, conflict: true };
      }
      // Transient Firestore failure: let Stripe retry.
      throw err;
    }

    // A changed order is a first successful delivery. A replay (or a webhook
    // that raced the success-page verification) is a no-op, so the customer
    // never receives two "payment received" emails.
    if (result.changed) {
      if (result.order.status === "cancelled") {
        console.warn(
          `[stripe] payment captured for cancelled order #${orderNumber(order.id)}; refund required`,
        );
      }
      await sendOrderEmails(result.order, { customer: true, staff: false });
    }
    return { received: true, changed: result.changed };
  }

  /* ---------- expired / abandoned ---------- */
  if (type === "checkout.session.expired") {
    if (order.paymentStatus === "paid") {
      return { received: true, ignored: true };
    }
    // A delayed expiry for a session the order has since replaced must not
    // release stock that the current session is still holding.
    if (order.stripeSessionId && sessionId !== order.stripeSessionId) {
      return { received: true, ignored: true };
    }

    // Never trust the event alone: a completed payment may be queued behind
    // this delivery. Re-read the session and only release stock when Stripe
    // still says the session expired unpaid. An unverifiable session is left
    // for the reconciliation sweep.
    if (sessionId) {
      let latest;
      try {
        latest = await retrieveStripeSession(sessionId);
      } catch (err) {
        console.warn(
          `[stripe] could not verify expiry for #${orderNumber(order.id)}:`,
          err instanceof Error ? err.message : "unknown error",
        );
        return { received: true, ignored: true };
      }
      if (latest.paymentStatus === "paid") {
        const paid = await store.markOrderPaid(order.id, {
          paidAt: new Date().toISOString().slice(0, 10),
          stripeSessionId: latest.id,
          paymentIntentId: latest.paymentIntentId,
        });
        if (paid.changed) {
          await sendOrderEmails(paid.order, { customer: true, staff: false });
        }
        return { received: true, expired: false, recovered: paid.changed };
      }
      if (latest.status !== "expired") {
        return { received: true, ignored: true };
      }
    }

    try {
      const result = await store.cancelOrder(order.id, "payment_expired");
      return { received: true, expired: result.changed };
    } catch (err) {
      // A payment may have landed between the read and the transaction. The
      // signed completed event will mark it paid; never release that stock.
      console.warn(
        `[stripe] expiry ignored for #${orderNumber(order.id)}:`,
        err instanceof Error ? err.message : "unknown error",
      );
      return { received: true, ignored: true };
    }
  }

  /* ---------- delayed payment failed ---------- */
  if (type === "checkout.session.async_payment_failed") {
    // Card-only checkout rarely emits this. Leave the order unpaid; its
    // reservation expiry (or staff) resolves it. Never mark it paid.
    return { received: true, failed: true };
  }

  return { received: true, ignored: true };
}
