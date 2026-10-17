import { orderNumber } from "../contracts/orders.js";
import { sendOrderEmails } from "./orderEmails.js";
import { retrieveStripeSession } from "./payments.js";
import { OrderStateError, store } from "./queries/store.js";

/**
 * Reconcile abandoned card checkouts.
 *
 * A reservation expiring does not prove the payment failed: the customer may
 * have paid moments before Stripe's session closed, with the webhook delayed.
 * Every candidate is therefore re-checked against Stripe first:
 *   - paid          → mark the order paid (never release its stock);
 *   - still open    → leave it alone (still chargeable);
 *   - complete but not paid → leave it (delayed payment may settle);
 *   - Stripe error  → leave it for the next run;
 *   - expired/unpaid → cancel through the atomic cancel path and restock.
 *
 * This is the safety net behind the `checkout.session.expired` webhook, run by
 * Vercel Cron (`/api/cron/reconcile-orders`) or the admin button.
 */
export type ReconciliationResult = {
  scanned: number;
  expired: number;
  restocked: number;
  recovered: number;
  skipped: number;
  idempotencyDeleted: number;
};

const today = () => new Date().toISOString().slice(0, 10);
const GRACE_SECONDS = 15 * 60;

export async function reconcileAbandonedOrders(
  now = new Date(),
  limit = 100,
): Promise<ReconciliationResult> {
  const candidates = await store.staleCardOrders(now, limit);
  let expired = 0;
  let restocked = 0;
  let recovered = 0;
  let skipped = 0;

  for (const order of candidates) {
    if (order.stripeSessionId) {
      let session;
      try {
        session = await retrieveStripeSession(order.stripeSessionId);
      } catch (err) {
        console.warn(
          `[orders] reconciliation left #${orderNumber(order.id)} alone: Stripe could not be checked`,
          err instanceof Error ? err.message : "unknown error",
        );
        skipped += 1;
        continue;
      }

      if (session.paymentStatus === "paid") {
        try {
          const result = await store.markOrderPaid(order.id, {
            paidAt: today(),
            stripeSessionId: session.id,
            paymentIntentId: session.paymentIntentId,
          });
          if (result.changed) {
            await sendOrderEmails(result.order, { customer: true, staff: false });
            recovered += 1;
          }
        } catch (err) {
          console.warn(
            `[orders] reconciliation could not mark #${orderNumber(order.id)} paid:`,
            err instanceof Error ? err.message : "unknown error",
          );
          skipped += 1;
        }
        continue;
      }

      // A still-open session can still be paid, and a `complete` session with
      // an unsettled payment may yet succeed. Only an expired/unpaid session
      // (or no session at all) is safe to release.
      if (session.status !== "expired") {
        // Realign the reservation with Stripe's authoritative expiry so an
        // order created before this logic existed cannot stay stuck forever.
        if (session.status === "open" && session.expiresAt) {
          try {
            await store.updateOrder(order.id, {
              reservationExpiresAt: new Date(
                (session.expiresAt + GRACE_SECONDS) * 1000,
              ).toISOString(),
            });
          } catch (err) {
            console.warn(
              `[orders] reconciliation could not extend #${orderNumber(order.id)}:`,
              err instanceof Error ? err.message : "unknown error",
            );
          }
        }
        skipped += 1;
        continue;
      }
    }

    try {
      const result = await store.cancelOrder(order.id, "payment_expired");
      if (result.changed) {
        expired += 1;
        if (result.restocked) restocked += 1;
      }
    } catch (err) {
      if (!(err instanceof OrderStateError)) {
        console.warn(
          `[orders] reconciliation could not expire #${orderNumber(order.id)}:`,
          err instanceof Error ? err.message : "unknown error",
        );
      }
      skipped += 1;
    }
  }

  const idempotencyDeleted = await store.cleanupIdempotency(
    new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    200,
  );

  return {
    scanned: candidates.length,
    expired,
    restocked,
    recovered,
    skipped,
    idempotencyDeleted,
  };
}
