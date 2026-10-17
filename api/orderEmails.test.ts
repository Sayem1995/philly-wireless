import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderRow } from "../server/queries/store.js";

/**
 * Order email isolation.
 *
 * A mail outage must never undo a paid order or reserve stock twice, and the
 * customer's copy must never contain the staff-only note.
 */

vi.mock("../server/email.js", () => ({
  sendEmail: vi.fn(async () => ({ delivered: true })),
  orderConfirmationHtml: vi.fn((payload: unknown) => JSON.stringify(payload)),
  orderStaffNotificationHtml: vi.fn((payload: unknown) => JSON.stringify(payload)),
}));

import { sendOrderEmails } from "../server/orderEmails.js";
import { sendEmail } from "../server/email.js";

const mockedSend = vi.mocked(sendEmail);

const TOKEN = "order-capability-token-123456";
const STAFF_NOTE = "Customer is a friend of the owner — do not upsell.";

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
    notes: "Need it before Friday",
    staffNotes: STAFF_NOTE,
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
    paymentMethod: "card_in_store",
    paymentStatus: "unpaid",
    status: "new",
    stripeSessionId: null,
    paymentIntentId: null,
    refundId: null,
    paidAt: null,
    idempotencyKey: "checkout-key-1234567890",
    reservationExpiresAt: null,
    stockRestoredAt: null,
    cancelledReason: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedSend.mockResolvedValue({ delivered: true });
});

describe("sendOrderEmails", () => {
  it("sends both the customer confirmation and the staff alert", async () => {
    await sendOrderEmails(order(), { customer: true, staff: true });

    expect(mockedSend).toHaveBeenCalledTimes(2);
    const recipients = mockedSend.mock.calls.map(([opts]) => opts.to);
    expect(recipients).toContain("ada@example.com");

    const customer = mockedSend.mock.calls.find(
      ([opts]) => opts.to === "ada@example.com",
    )?.[0];
    expect(customer?.subject).toContain("PPR-O42");
    expect(customer?.html).toContain("Need it before Friday");
    // The staff note must never ride along in the customer copy.
    expect(customer?.html).not.toContain(STAFF_NOTE);
    expect(customer?.html).not.toContain("staffNotes");
  });

  it("skips the customer copy when no email is held, but still alerts staff", async () => {
    await sendOrderEmails(order({ email: null }), { customer: true, staff: true });

    expect(mockedSend).toHaveBeenCalledTimes(1);
    expect(mockedSend.mock.calls[0][0].to).not.toBe("ada@example.com");
  });

  it("never throws when the customer email fails", async () => {
    mockedSend.mockImplementation(async (opts) => {
      if (opts.to === "ada@example.com") throw new Error("smtp down");
      return { delivered: true };
    });

    await expect(
      sendOrderEmails(order(), { customer: true, staff: true }),
    ).resolves.toBeUndefined();
    expect(mockedSend).toHaveBeenCalledTimes(2);
  });

  it("never throws when the staff alert fails", async () => {
    mockedSend.mockImplementation(async (opts) => {
      if (opts.to !== "ada@example.com") throw new Error("smtp down");
      return { delivered: true };
    });

    await expect(
      sendOrderEmails(order(), { customer: true, staff: true }),
    ).resolves.toBeUndefined();
  });

  it("uses the paid subject only after payment has been captured", async () => {
    await sendOrderEmails(order({ paymentStatus: "paid", paidAt: "2026-03-02" }), {
      customer: true,
      staff: false,
    });

    expect(mockedSend.mock.calls[0][0].subject).toMatch(/Payment received/i);
    expect(mockedSend.mock.calls[0][0].html).toContain('"paymentStatus":"paid"');
  });
});
