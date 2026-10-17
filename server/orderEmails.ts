import { STORE } from "../contracts/constants.js";
import { orderNumber } from "../contracts/orders.js";
import { orderConfirmationHtml, orderStaffNotificationHtml, sendEmail } from "./email.js";
import { env } from "./lib/env.js";
import type { OrderRow } from "./queries/store.js";

/**
 * Order confirmation and staff-alert mail.
 *
 * Shared by the checkout path and the Stripe webhook so both produce the same
 * message. Never throws: a mail failure must not undo an order that has
 * already been paid for or had its stock reserved.
 */
export async function sendOrderEmails(
  order: OrderRow,
  options: { customer: boolean; staff: boolean },
): Promise<void> {
  const base = env.publicSiteUrl.replace(/\/$/, "");
  const payload = {
    id: order.id,
    customerName: order.customerName,
    phone: order.phone,
    email: order.email,
    fulfillment: order.fulfillment,
    address: order.address,
    notes: order.notes,
    lines: order.items.map((l) => ({ name: l.name, qty: l.qty, lineCents: l.lineCents })),
    subtotalCents: order.subtotalCents,
    taxCents: order.taxCents,
    totalCents: order.totalCents,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    url: base ? `${base}/order/${order.token}` : null,
  };
  const paid = order.paymentStatus === "paid";

  if (options.customer && order.email) {
    try {
      await sendEmail({
        to: order.email,
        subject: paid
          ? `Payment received — order #${orderNumber(order.id)}`
          : `Your order #${orderNumber(order.id)} — ${STORE.name}`,
        html: orderConfirmationHtml(payload),
      });
    } catch (err) {
      console.error("[orders] customer email failed:", err);
    }
  }

  if (options.staff) {
    try {
      await sendEmail({
        to: process.env.STAFF_EMAIL ?? STORE.email,
        subject: `New online order #${orderNumber(order.id)} (${paid ? "paid" : "payment due"})`,
        html: orderStaffNotificationHtml(payload),
      });
    } catch (err) {
      console.error("[orders] staff email failed:", err);
    }
  }
}
