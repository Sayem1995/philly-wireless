import { canTransitionOrderStatus, type OrderStatus } from "../contracts/orders.js";
import { notifyCustomer, type CustomerNotificationKind } from "./notifications.js";
import { store } from "./queries/store.js";

/**
 * Applies an AI proposal only after the signed-in admin clicks Approve.
 *
 * The proposal is persisted server-side with the admin's UID and a 15-minute
 * expiry. Applying re-reads the target and refuses if it changed since the
 * proposal was prepared. The action record itself is the audit trail.
 */

const BOOKING_STATUSES = [
  "pending",
  "accepted",
  "in_progress",
  "completed",
  "rescheduled",
  "cancelled",
] as const;

const NOTIFIABLE: CustomerNotificationKind[] = [
  "accepted",
  "in_progress",
  "completed",
  "rescheduled",
  "cancelled",
];

export async function applyAssistantAction(token: string, adminUid: string) {
  const action = await store.assistantActionByToken(token);
  if (!action) throw new Error("That proposal was not found or has expired.");
  if (action.adminUid !== adminUid) {
    throw new Error("That proposal belongs to a different admin account.");
  }
  if (action.status !== "pending") {
    throw new Error(`That proposal is already ${action.status}.`);
  }
  if (!action.expiresAt || Date.parse(action.expiresAt) < Date.now()) {
    throw new Error("That proposal has expired — ask the analyst to prepare it again.");
  }

  if (action.kind === "part_stock") {
    const part = (await store.parts()).find((row) => row.id === action.targetId);
    if (!part) throw new Error("Part not found.");
    if (part.stock !== Number(action.before.stock)) {
      throw new Error("Stock changed since this proposal was prepared. Ask for a fresh proposal.");
    }
    const nextStock = Number(action.after.stock);
    if (!Number.isInteger(nextStock) || nextStock < 0) {
      throw new Error("The proposed stock count is invalid.");
    }
    await store.upsertPart({ id: part.id, stock: nextStock });
  } else if (action.kind === "booking_status") {
    const booking = await store.getBooking(action.targetId);
    if (!booking) throw new Error("Booking not found.");
    if (booking.status !== String(action.before.status)) {
      throw new Error("Booking status changed since this proposal was prepared.");
    }
    const status = String(action.after.status);
    if (!(BOOKING_STATUSES as readonly string[]).includes(status)) {
      throw new Error("The proposed booking status is invalid.");
    }
    const patch: Record<string, unknown> = { status };
    if (status === "completed") {
      const hasScreen = booking.items.some((item) =>
        item.repairType.toLowerCase().includes("screen"),
      );
      patch.warrantyUntil = new Date(Date.now() + (hasScreen ? 365 : 90) * 864e5)
        .toISOString()
        .slice(0, 10);
    }
    await store.updateBooking(booking.id, patch as never);
    if (NOTIFIABLE.includes(status as CustomerNotificationKind)) {
      await notifyCustomer(
        {
          id: booking.id,
          customerId: booking.customerId,
          customerName: booking.customerName,
          phone: booking.phone,
          email: booking.email,
          device: booking.device,
          repairType: booking.repairType,
          items: booking.items,
          date: booking.date,
          timeSlot: booking.timeSlot,
          warrantyUntil: (patch.warrantyUntil as string) ?? booking.warrantyUntil,
        },
        status as CustomerNotificationKind,
      );
    }
  } else if (action.kind === "order_status") {
    const order = await store.orderById(action.targetId);
    if (!order) throw new Error("Order not found.");
    if (order.status !== String(action.before.status)) {
      throw new Error("Order status changed since this proposal was prepared.");
    }
    const status = String(action.after.status) as OrderStatus;
    if (!canTransitionOrderStatus(order.status, status)) {
      throw new Error(`Cannot change a ${order.status} order to ${status}.`);
    }
    await store.updateOrder(order.id, {
      status,
      ...(status === "completed" ? { reservationExpiresAt: null } : {}),
    } as never);
  } else if (action.kind === "price_update") {
    const price = (await store.prices()).find((row) => row.id === action.targetId);
    if (!price) throw new Error("Price row not found.");
    if (price.priceLabel !== String(action.before.priceLabel)) {
      throw new Error("Price changed since this proposal was prepared.");
    }
    const nextLabel = String(action.after.priceLabel ?? "").trim();
    if (!nextLabel || nextLabel.length > 80) {
      throw new Error("The proposed price label is invalid.");
    }
    await store.updatePrice(price.id, nextLabel);
  } else if (action.kind === "order_note") {
    const order = await store.orderById(action.targetId);
    if (!order) throw new Error("Order not found.");
    if ((order.staffNotes ?? "") !== String(action.before.staffNotes ?? "")) {
      throw new Error("The order notes changed since this proposal was prepared.");
    }
    const nextNote = String(action.after.staffNotes ?? "").trim().slice(0, 600);
    if (!nextNote) throw new Error("The proposed note is empty.");
    await store.updateOrder(order.id, { staffNotes: nextNote } as never);
  } else {
    throw new Error("Unsupported proposal type.");
  }

  await store.updateAssistantAction(action.id, {
    status: "applied",
    appliedAt: new Date(),
  });

  return {
    ok: true,
    kind: action.kind,
    summary: action.summary,
    target: action.targetLabel,
  };
}
