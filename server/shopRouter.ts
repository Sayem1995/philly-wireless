import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "./middleware.js";
import {
  OrderStateError,
  StockError,
  store,
  type OrderItemRow,
  type OrderRow,
} from "./queries/store.js";
import { TIME_SLOTS, STORE } from "../contracts/constants.js";
import { sendEmail, staffNotificationHtml } from "./email.js";
import { notifyCustomer } from "./notifications.js";
import { sendOrderEmails } from "./orderEmails.js";
import { env } from "./lib/env.js";
import {
  createStripeCheckout,
  paymentsConfigured,
  retrieveStripeSession,
} from "./payments.js";
import {
  FULFILLMENT_METHODS,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_KEY_MIN_LENGTH,
  MAX_ITEM_QTY,
  MAX_ORDER_LINES,
  ORDER_CURRENCY,
  PAYMENT_METHODS,
  isIdempotencyKey,
  orderNumber,
  taxFor,
} from "../contracts/orders.js";
import { checkRateLimit, clientAddress } from "./lib/rateLimit.js";

/* ---------- online orders ---------- */

/** Stock stays held this long after Stripe's own session expiry, so a payment
 *  that lands exactly as the session closes can never race a restock. */
const RESERVATION_GRACE_SECONDS = 15 * 60;
const RATE_WINDOW_MS = 10 * 60 * 1000;

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Best-effort per-instance abuse guard. Deliberately not the only defence:
 * validation, idempotency and Stripe verification all remain authoritative.
 */
function enforceRateLimit(
  ctx: { req: Request },
  bucket: string,
  max: number,
): void {
  const result = checkRateLimit(
    `${bucket}:${clientAddress(ctx.req)}`,
    max,
    RATE_WINDOW_MS,
  );
  if (!result.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Too many attempts — please wait ${Math.ceil(
        result.retryAfterMs / 1000,
      )} seconds and try again.`,
    });
  }
}

/** What the customer is allowed to see. Stripe ids, staff notes and the
 *  idempotency key stay internal. */
function publicOrder(order: OrderRow) {
  return {
    id: order.id,
    token: order.token,
    orderNumber: orderNumber(order.id),
    customerName: order.customerName,
    phone: order.phone,
    email: order.email,
    fulfillment: order.fulfillment,
    address: order.address,
    notes: order.notes,
    lines: order.items,
    subtotalCents: order.subtotalCents,
    taxCents: order.taxCents,
    totalCents: order.totalCents,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    status: order.status,
    cancelledReason: order.cancelledReason,
    paidAt: order.paidAt,
    createdAt: order.createdAt.toISOString(),
  };
}

function reservationWindow(): {
  expiresInMinutes: number;
  reservationExpiresAt: string;
} {
  const minutes = env.orderReservationMinutes;
  return {
    expiresInMinutes: minutes,
    reservationExpiresAt: new Date(
      Date.now() + (minutes * 60 + RESERVATION_GRACE_SECONDS) * 1000,
    ).toISOString(),
  };
}

function reservationExpired(order: OrderRow): boolean {
  if (!order.reservationExpiresAt) return false;
  const at = Date.parse(order.reservationExpiresAt);
  return Number.isFinite(at) && at <= Date.now();
}

/**
 * Prove the Stripe session belongs to this order before touching its state.
 * Used on its own before an expiry cancellation, so an unrelated (or forged)
 * session id can never release someone's stock.
 */
function verifySessionOwnership(
  session: { metadata: Record<string, string> },
  order: OrderRow,
): void {
  if (session.metadata.orderToken !== order.token) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That payment doesn't belong to this order.",
    });
  }
  const reference = session.metadata.orderId;
  if (reference && reference !== String(order.id)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That payment doesn't belong to this order.",
    });
  }
}

/**
 * Check the session carries the server-computed amount in the shop's currency.
 * A success-page redirect alone is never trusted: the session is re-read from
 * Stripe and this runs before any status change.
 */
function verifySessionAmount(
  session: { amountTotal: number | null; currency: string | null },
  order: OrderRow,
): void {
  if (session.amountTotal !== order.totalCents) {
    console.error(
      `[orders] amount mismatch for #${orderNumber(order.id)}: stripe=${session.amountTotal} order=${order.totalCents}`,
    );
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "The paid amount doesn't match this order — please call the shop so we can sort it out.",
    });
  }
  if (session.currency && session.currency !== ORDER_CURRENCY) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "That payment was made in a different currency — please call the shop.",
    });
  }
}

/** Mark paid from an authoritative Stripe session, emailing only on the first
 *  successful transition. Replays are no-ops. */
async function markPaidFromSession(
  order: OrderRow,
  session: { id: string; paymentStatus: string; paymentIntentId: string | null },
): Promise<boolean> {
  if (session.paymentStatus !== "paid") return false;
  const result = await store.markOrderPaid(order.id, {
    paidAt: today(),
    stripeSessionId: session.id,
    paymentIntentId: session.paymentIntentId,
  });
  if (result.changed) {
    await sendOrderEmails(result.order, { customer: true, staff: false });
  }
  return result.changed;
}

/** Create the hosted card payment page and record its session/expiry. */
async function startCardPayment(
  order: OrderRow,
  expiresInMinutes: number,
): Promise<string> {
  if (!paymentsConfigured()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Online card payment isn't switched on yet — choose pay in store, or call the shop.",
    });
  }

  let session;
  try {
    session = await createStripeCheckout({
      token: order.token,
      orderId: order.id,
      orderNumber: orderNumber(order.id),
      lines: order.items.map((l) => ({
        name: l.name,
        unitCents: l.unitCents,
        qty: l.qty,
      })),
      taxCents: order.taxCents,
      customerEmail: order.email,
      // Stripe substitutes the session id; the confirmation page verifies it.
      successUrl: `${env.publicSiteUrl}/order/${order.token}?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${env.publicSiteUrl}/order/${order.token}`,
      expiresInMinutes,
      // Minute buckets make simultaneous/retried "start payment" requests for
      // one order resolve to the same Stripe session, so two tabs cannot open
      // two separately chargeable pages.
      idempotencyKey: `checkout-${order.id}-${Math.floor(Date.now() / 60_000)}`,
    });
  } catch (err) {
    console.error("[orders] could not start Stripe checkout:", err);
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message:
        "We couldn't open the card payment page. Nothing was charged — please try again or pay in store.",
    });
  }

  if (!session.id || !session.url) {
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message:
        "Stripe didn't return a usable payment page. Nothing was charged — please try again or pay in store.",
    });
  }

  // The reservation outlives Stripe's session so a late webhook can never
  // arrive after the stock was returned. Align it with the session's real
  // expiry (Stripe adds a small round-trip when it accepts `expires_at`).
  const sessionExpiry =
    session.expiresAt ?? Math.floor(Date.now() / 1000) + expiresInMinutes * 60;
  try {
    await store.updateOrder(order.id, {
      stripeSessionId: session.id,
      reservationExpiresAt: new Date(
        (sessionExpiry + RESERVATION_GRACE_SECONDS) * 1000,
      ).toISOString(),
    });
  } catch (err) {
    // The session exists at Stripe but we could not record it, so we must not
    // hand the URL to the browser (its payment could not be matched later).
    console.error("[orders] could not record Stripe session:", err);
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message:
        "We couldn't start the card payment safely. Nothing was charged — please try again or pay in store.",
    });
  }
  return session.url;
}

const orderInput = z.object({
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        qty: z.number().int().min(1).max(MAX_ITEM_QTY),
      }),
    )
    .min(1)
    .max(MAX_ORDER_LINES),
  customerName: z.string().trim().min(2).max(120),
  phone: z
    .string()
    .trim()
    .min(10)
    .max(30)
    .refine((value) => {
      const digits = value.replace(/\D/g, "");
      return digits.length >= 10 && digits.length <= 15;
    }, "Enter a phone number with 10–15 digits."),
  email: z.string().trim().email().optional().or(z.literal("")),
  fulfillment: z.enum(FULFILLMENT_METHODS),
  address: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(600).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  // Generated once per checkout attempt; a retried request returns the same
  // order instead of reserving stock (or charging) twice.
  idempotencyKey: z
    .string()
    .min(IDEMPOTENCY_KEY_MIN_LENGTH)
    .max(IDEMPOTENCY_KEY_MAX_LENGTH)
    .refine(isIdempotencyKey, "Invalid checkout key."),
  // The total the customer was shown. Compared with the server total so a
  // price/tax change mid-checkout produces a "review your cart" error instead
  // of a surprise charge. This is a consistency check, never the authority.
  expectedTotalCents: z.number().int().nonnegative().optional(),
});

export const shopRouter = createRouter({
  /* ---------- repair pricing ---------- */
  prices: publicQuery.query(async () => {
    return store.prices();
  }),

  /* ---------- products (devices + accessories) ---------- */
  products: publicQuery
    .input(z.object({ kind: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return store.products(input?.kind);
    }),

  /* ---------- blog ---------- */
  blogList: publicQuery.query(async () => {
    const posts = await store.blogList();
    return posts.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      tag: p.tag,
      publishedAt: p.publishedAt,
    }));
  }),

  blogBySlug: publicQuery
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      return store.blogBySlug(input.slug);
    }),

  /* ---------- contact form ---------- */
  contact: publicQuery
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
        message: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      await store.createMessage({
        name: input.name,
        email: input.email,
        phone: input.phone ?? null,
        message: input.message,
      });
      return { ok: true };
    }),

  /* ---------- newsletter ---------- */
  subscribe: publicQuery
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      await store.subscribe(input.email);
      return { ok: true };
    }),

  /* ---------- booking: available slots for a date ---------- */
  slots: publicQuery
    .input(z.object({ date: z.string() })) // YYYY-MM-DD
    .query(async ({ input }) => {
      const taken = (await store.bookingsByDate(input.date))
        .filter((b) => b.status !== "cancelled")
        .map((b) => b.timeSlot);
      const takenSet = new Set(taken);
      return TIME_SLOTS.map((s) => ({ slot: s, available: !takenSet.has(s) }));
    }),

  /* ---------- payment receipt (public, by capability token) ---------- */
  receiptByToken: publicQuery
    .input(z.object({ token: z.string().min(10).max(200) }))
    .query(async ({ input }) => {
      // A receipt is only readable with its unguessable token — the customer's
      // link is the authorisation.
      const r = await store.receiptByToken(input.token);
      if (!r) return null;
      return {
        id: r.id,
        customerName: r.customerName,
        device: r.device,
        repairType: r.repairType,
        lines: r.lines,
        subtotalCents: r.subtotalCents,
        taxCents: r.taxCents,
        totalCents: r.totalCents,
        paymentMethod: r.paymentMethod,
        paidAt: r.paidAt,
        notes: r.notes,
      };
    }),

  /* ---------- booking: create ---------- */
  book: publicQuery
    .input(
      z
        .object({
          customerName: z.string().min(1),
          phone: z.string().min(7),
          email: z.string().email().optional().or(z.literal("")),
          // Legacy single-repair fields remain accepted for older clients.
          device: z.string().min(1).optional(),
          repairType: z.string().min(1).optional(),
          items: z
            .array(
              z.object({
                deviceType: z.string().max(40).optional().default(""),
                brand: z.string().max(60).optional().default(""),
                model: z.string().min(1).max(120),
                repairType: z.string().min(1).max(120),
              }),
            )
            .min(1)
            .max(6)
            .optional(),
          date: z.string().min(8),
          timeSlot: z.string().min(4),
          notes: z.string().optional(),
          priceEstimate: z.string().optional(),
        })
        .refine(
          (value) =>
            (value.items?.length ?? 0) > 0 ||
            (Boolean(value.device) && Boolean(value.repairType)),
          { message: "Add at least one repair.", path: ["items"] },
        ),
    )
    .mutation(async ({ input }) => {
      // conflict check
      const clash = (await store.bookingsByDate(input.date)).find(
        (b) => b.timeSlot === input.timeSlot && b.status !== "cancelled",
      );
      if (clash) {
        throw new Error("That time slot was just taken — please pick another.");
      }

      const items = input.items?.length
        ? input.items
        : [
            {
              deviceType: "",
              brand: "",
              model: input.device ?? "",
              repairType: input.repairType ?? "",
            },
          ];
      const summaryDevice = items.map((item) => item.model).join(" · ");
      const summaryRepair = items.map((item) => item.repairType).join(" · ");

      // link or create CRM customer
      const existingCustomer = await store.customerByPhone(input.phone);
      const customer = existingCustomer ??
        (await store.createCustomer({
          name: input.customerName,
          phone: input.phone,
          email: input.email || null,
          notes: null,
        }));

      const booking = await store.createBooking({
        customerId: customer.id,
        customerName: input.customerName,
        phone: input.phone,
        email: input.email || null,
        device: summaryDevice,
        repairType: summaryRepair,
        items,
        date: input.date,
        timeSlot: input.timeSlot,
        notes: input.notes || null,
        priceEstimate: input.priceEstimate || null,
        warrantyUntil: null,
      });

      // --- email confirmations (delivered if SMTP/SendGrid configured; otherwise logged to CRM) ---
      const details = {
        id: booking.id,
        customerName: input.customerName,
        phone: input.phone,
        email: input.email || null,
        device: summaryDevice,
        repairType: summaryRepair,
        items,
        date: input.date,
        timeSlot: input.timeSlot,
        notes: input.notes || null,
      };
      // Customer gets this on every channel we hold for them (email and/or SMS);
      // the exact delivery outcome is recorded in the CRM notification history.
      await notifyCustomer(
        {
          id: booking.id,
          customerId: customer.id,
          customerName: input.customerName,
          phone: input.phone,
          email: input.email || null,
          device: summaryDevice,
          repairType: summaryRepair,
          items,
          date: input.date,
          timeSlot: input.timeSlot,
        },
        "received",
      );

      // Staff alert (email only).
      try {
        const staff = await sendEmail({
          to: process.env.STAFF_EMAIL ?? STORE.email,
          subject: `New booking #PPR-${booking.id}: ${summaryDevice} — ${summaryRepair}`,
          html: staffNotificationHtml(details),
        });
        await store.addNotification({
          bookingId: booking.id,
          customerId: customer.id,
          channel: "email",
          message: `Staff notification for #PPR-${booking.id}${staff.delivered ? " (sent)" : " (queued — email not configured)"}`,
        });
      } catch (err) {
        console.error("[email] staff notification failed:", err);
      }

      return { ok: true, bookingId: booking.id };
    }),

  /* ---------- online shop: checkout ---------- */

  /** Which payment options the cart should offer right now. */
  paymentOptions: publicQuery.query(() => {
    return { onlineCard: paymentsConfigured(), taxPercent: env.orderTaxPercent };
  }),

  /**
   * Place an order.
   *
   * The browser sends product ids and quantities only. Names, prices, stock and
   * every total are resolved from Firestore here, so a tampered cart cannot
   * change what is charged. Stock is reserved inside a transaction before the
   * order is written; any later failure releases it again.
   */
  createOrder: publicQuery
    .input(orderInput)
    .mutation(async ({ input, ctx }) => {
      enforceRateLimit(ctx, "order:create", 20);

      // Fast path for a retry whose first response was lost. The transaction
      // below is still authoritative for two requests arriving together.
      const previous = await store.orderByIdempotencyKey(input.idempotencyKey);
      if (previous) {
        return {
          id: previous.id,
          token: previous.token,
          orderNumber: orderNumber(previous.id),
          totalCents: previous.totalCents,
          paymentStatus: previous.paymentStatus,
          redirectUrl: null,
          duplicate: true,
        };
      }

      // Merge repeated lines (a hand-crafted request could list the same
      // product twice) so the per-item cap cannot be bypassed.
      const wanted = new Map<number, number>();
      for (const line of input.items) {
        const qty = (wanted.get(line.productId) ?? 0) + line.qty;
        if (qty > MAX_ITEM_QTY) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `You can order up to ${MAX_ITEM_QTY} of one item.`,
          });
        }
        wanted.set(line.productId, qty);
      }
      if (wanted.size === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Your cart is empty." });
      }
      if (
        input.fulfillment === "delivery" &&
        (input.address?.trim().length ?? 0) < 6
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Please add the full delivery address.",
        });
      }
      if (input.paymentMethod === "card_online" && !paymentsConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Online card payment isn't switched on yet — choose pay in store, or call the shop.",
        });
      }

      // Friendly pre-check with the live catalogue. The transaction re-reads
      // the same documents, so this only improves the error message; it is not
      // the authority on stock.
      const products = await store.getProductsByIds([...wanted.keys()]);
      const byId = new Map(products.map((p) => [p.id, p]));
      const lines: OrderItemRow[] = [];

      for (const [productId, qty] of wanted) {
        const product = byId.get(productId);
        if (!product || !product.active) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "One of those items is no longer available — please refresh your cart.",
          });
        }
        if (product.stock < qty) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              product.stock <= 0
                ? `${product.name} is sold out.`
                : `Only ${product.stock} of ${product.name} left.`,
          });
        }
        // Defensive normalisation for legacy decimal rows: every amount that
        // reaches Firestore or Stripe is a whole, non-negative number of cents.
        const unitCents = Math.round(product.price);
        if (!Number.isFinite(unitCents) || unitCents < 0 || unitCents > 100_000_000) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "One of those items has an invalid price — please call the shop so we can fix it.",
          });
        }
        lines.push({
          productId: product.id,
          name: product.name,
          unitCents,
          qty,
          lineCents: unitCents * qty,
        });
      }

      const subtotalCents = lines.reduce((sum, l) => sum + l.lineCents, 0);
      if (subtotalCents <= 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That order total isn't valid — please refresh your cart.",
        });
      }
      const taxCents = taxFor(subtotalCents, env.orderTaxPercent);
      const totalCents = subtotalCents + taxCents;
      if (
        input.expectedTotalCents !== undefined &&
        input.expectedTotalCents !== totalCents
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "The price or tax changed while you were checking out — please review your cart and try again.",
        });
      }
      const stockItems = lines.map((l) => ({ productId: l.productId, qty: l.qty }));
      const reservation = reservationWindow();

      let created: Awaited<ReturnType<typeof store.createOrderWithReservation>>;
      try {
        created = await store.createOrderWithReservation(
          {
            customerName: input.customerName,
            phone: input.phone,
            email: input.email?.trim() || null,
            fulfillment: input.fulfillment,
            address:
              input.fulfillment === "delivery" ? (input.address?.trim() ?? null) : null,
            notes: input.notes?.trim() || null,
            staffNotes: null,
            items: lines,
            subtotalCents,
            taxCents,
            totalCents,
            paymentMethod: input.paymentMethod,
            paymentStatus: "unpaid",
            status: "new",
            stripeSessionId: null,
            paymentIntentId: null,
            refundId: null,
            paidAt: null,
            idempotencyKey: input.idempotencyKey,
            reservationExpiresAt:
              input.paymentMethod === "card_online"
                ? reservation.reservationExpiresAt
                : null,
            stockRestoredAt: null,
            cancelledReason: null,
          },
          stockItems,
        );
      } catch (err) {
        if (err instanceof StockError) {
          throw new TRPCError({ code: "CONFLICT", message: err.message });
        }
        console.error("[orders] could not create order:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "We couldn't save your order — nothing was charged. Please try again.",
        });
      }

      const order = created.order;
      if (created.duplicate) {
        // Another request (or an earlier retry) already owns this key. Never
        // reserve again or send a second confirmation; the order page shows
        // the existing order and its "pay now" path reuses any live session.
        return {
          id: order.id,
          token: order.token,
          orderNumber: orderNumber(order.id),
          totalCents: order.totalCents,
          paymentStatus: order.paymentStatus,
          redirectUrl: null,
          duplicate: true,
        };
      }

      if (input.paymentMethod === "card_online") {
        let redirectUrl: string;
        try {
          redirectUrl = await startCardPayment(order, reservation.expiresInMinutes);
        } catch (err) {
          // The order+reservation transaction already committed, so undo both
          // atomically. `cancelOrder` refuses paid orders, so this can never
          // release stock behind a completed payment.
          try {
            await store.cancelOrder(order.id, "payment_setup_failed");
          } catch (cancelErr) {
            console.error(
              "[orders] could not cancel unpaid order after Stripe failure:",
              cancelErr,
            );
          }
          throw err;
        }
        // Email the customer too: if they abandon Stripe or close the tab, the
        // "View your order" link is how they get back to finish paying.
        await sendOrderEmails(order, { customer: true, staff: true });
        return {
          id: order.id,
          token: order.token,
          orderNumber: orderNumber(order.id),
          totalCents: order.totalCents,
          paymentStatus: order.paymentStatus,
          redirectUrl,
          duplicate: false,
        };
      }

      await sendOrderEmails(order, { customer: true, staff: true });
      return {
        id: order.id,
        token: order.token,
        orderNumber: orderNumber(order.id),
        totalCents: order.totalCents,
        paymentStatus: order.paymentStatus,
        redirectUrl: null,
        duplicate: false,
      };
    }),

  /** Public order lookup for the confirmation page (capability-token access). */
  orderByToken: publicQuery
    .input(z.object({ token: z.string().min(10).max(200) }))
    .query(async ({ input }) => {
      const order = await store.orderByToken(input.token);
      return order ? publicOrder(order) : null;
    }),

  /**
   * Re-open the card payment page for an order the customer abandoned.
   *
   * An existing open Stripe session is REUSED, never duplicated: two live
   * sessions for one order could both be paid and double-charge the customer.
   */
  payOrder: publicQuery
    .input(z.object({ token: z.string().min(10).max(200) }))
    .mutation(async ({ input, ctx }) => {
      enforceRateLimit(ctx, "order:pay", 40);

      const order = await store.orderByToken(input.token);
      if (!order) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That order wasn't found." });
      }
      if (order.paymentStatus === "paid") {
        return { redirectUrl: null, alreadyPaid: true };
      }
      if (order.paymentStatus === "refunded") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This order was refunded — please place a new order.",
        });
      }
      if (order.paymentMethod !== "card_online") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This order is set to pay in store — no card payment is needed.",
        });
      }
      if (order.status === "cancelled") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This order was cancelled — please place a new order.",
        });
      }
      if (reservationExpired(order)) {
        try {
          await store.cancelOrder(order.id, "payment_expired");
        } catch (err) {
          if (!(err instanceof OrderStateError)) console.error("[orders] expiry failed:", err);
        }
        const latest = await store.orderByToken(order.token);
        if (latest?.paymentStatus === "paid") {
          return { redirectUrl: null, alreadyPaid: true };
        }
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "This checkout expired and the stock was released — please place a new order.",
        });
      }

      if (order.stripeSessionId) {
        let existing;
        try {
          existing = await retrieveStripeSession(order.stripeSessionId);
        } catch (err) {
          console.error("[orders] could not reopen Stripe session:", err);
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message:
              "We couldn't reopen your card payment page — please try again in a moment.",
          });
        }
        verifySessionOwnership(existing, order);
        verifySessionAmount(existing, order);

        if (existing.paymentStatus === "paid") {
          await markPaidFromSession(order, existing);
          return { redirectUrl: null, alreadyPaid: true };
        }
        if (existing.status === "open" && existing.url) {
          return { redirectUrl: existing.url, alreadyPaid: false };
        }
        if (existing.status === "expired") {
          try {
            await store.cancelOrder(order.id, "payment_expired");
          } catch (err) {
            if (!(err instanceof OrderStateError)) console.error("[orders] expiry failed:", err);
          }
          const latest = await store.orderByToken(order.token);
          if (latest?.paymentStatus === "paid") {
            return { redirectUrl: null, alreadyPaid: true };
          }
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "That card payment page expired and the stock was released — please place a new order.",
          });
        }
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Your card payment is still being processed — refresh in a moment to see the result.",
        });
      }

      const redirectUrl = await startCardPayment(order, env.orderReservationMinutes);
      return { redirectUrl, alreadyPaid: false };
    }),

  /**
   * Verify a card payment after the customer returns from Stripe.
   *
   * The session is read back from Stripe and matched against the order token
   * and the server-computed total; only then is the order marked paid. Marking
   * is idempotent, so a refresh (or a webhook that arrived first) is harmless.
   */
  confirmOrderPayment: publicQuery
    .input(
      z.object({
        token: z.string().min(10).max(200),
        sessionId: z.string().min(6).max(200).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      enforceRateLimit(ctx, "order:confirm", 60);

      const order = await store.orderByToken(input.token);
      if (!order) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That order wasn't found." });
      }
      if (order.paymentStatus === "paid") {
        return { order: publicOrder(order), alreadyPaid: true };
      }
      if (order.paymentStatus === "refunded") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This order was refunded — no payment is due.",
        });
      }
      if (!paymentsConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Card payments aren't configured on this site — please pay in store.",
        });
      }
      const sessionId = input.sessionId || order.stripeSessionId;
      if (!sessionId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No card payment has been started for this order.",
        });
      }

      let session;
      try {
        session = await retrieveStripeSession(sessionId);
      } catch (err) {
        console.error("[orders] could not verify Stripe session:", err);
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "We couldn't check that payment with Stripe — please try again in a moment.",
        });
      }

      // Ownership first: an unrelated (even expired) session id must never be
      // able to cancel this order. Amount/currency only matter for a payment.
      verifySessionOwnership(session, order);

      if (session.status === "expired") {
        try {
          await store.cancelOrder(order.id, "payment_expired");
        } catch (err) {
          if (!(err instanceof OrderStateError)) console.error("[orders] expiry failed:", err);
        }
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "That payment session expired and the stock was released — please place a new order.",
        });
      }

      verifySessionAmount(session, order);
      if (session.paymentStatus !== "paid") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Your payment hasn't completed yet. If you were charged, refresh in a moment — otherwise try again.",
        });
      }

      try {
        await markPaidFromSession(order, session);
      } catch (err) {
        if (err instanceof OrderStateError) {
          throw new TRPCError({ code: "CONFLICT", message: err.message });
        }
        throw err;
      }

      const updated = (await store.orderByToken(order.token)) ?? order;
      return { order: publicOrder(updated), alreadyPaid: false };
    }),
});