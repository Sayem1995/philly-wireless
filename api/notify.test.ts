import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Customer notification behaviour: every channel we hold for the customer is
 * attempted independently, and the delivery outcome is recorded in the CRM.
 */

vi.mock("../server/email.js", () => ({ sendEmail: vi.fn() }));
vi.mock("../server/sms.js", () => ({ sendSms: vi.fn() }));
vi.mock("../server/queries/store.js", () => ({ store: { addNotification: vi.fn() } }));

import { notifyCustomer, type NotifiableBooking } from "../server/notifications.js";
import { sendEmail } from "../server/email.js";
import { sendSms } from "../server/sms.js";
import { store } from "../server/queries/store.js";

const mockedEmail = vi.mocked(sendEmail);
const mockedSms = vi.mocked(sendSms);
const mockedStore = vi.mocked(store);

const booking: NotifiableBooking = {
  id: 1003,
  customerId: 1003,
  customerName: "Md Sayem Ul Haque",
  phone: "8143841507",
  email: "customer@example.com",
  device: "iPhone 17 Pro Max",
  repairType: "Screen Replacement",
  date: "2026-09-14",
  timeSlot: "10:00",
  warrantyUntil: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedStore.addNotification.mockResolvedValue(undefined);
});

describe("notifyCustomer", () => {
  it("sends on both channels and records them as sent", async () => {
    mockedEmail.mockResolvedValue({ delivered: true });
    mockedSms.mockResolvedValue({ delivered: true });

    const res = await notifyCustomer(booking, "completed");

    expect(res).toEqual({ email: true, sms: true, attempted: true });
    expect(mockedEmail).toHaveBeenCalledOnce();
    expect(mockedSms).toHaveBeenCalledOnce();
    expect(mockedStore.addNotification).toHaveBeenCalledTimes(2);

    const messages = mockedStore.addNotification.mock.calls.map(
      (c) => (c[0] as { message: string; channel: string }).message,
    );
    expect(messages.some((m) => m.includes("(sent)"))).toBe(true);
  });

  it("records queued when no provider is configured", async () => {
    mockedEmail.mockResolvedValue({ delivered: false });
    mockedSms.mockResolvedValue({ delivered: false });

    await notifyCustomer(booking, "received");

    const messages = mockedStore.addNotification.mock.calls.map(
      (c) => (c[0] as { message: string }).message,
    );
    expect(messages.some((m) => m.includes("queued"))).toBe(true);
  });

  it("still sends the SMS when email fails", async () => {
    mockedEmail.mockRejectedValue(new Error("smtp down"));
    mockedSms.mockResolvedValue({ delivered: true });

    const res = await notifyCustomer(booking, "in_progress");

    expect(res.email).toBe(false);
    expect(res.sms).toBe(true);
    expect(mockedSms).toHaveBeenCalledOnce();
    // the failure is recorded rather than swallowed
    const messages = mockedStore.addNotification.mock.calls.map(
      (c) => (c[0] as { message: string }).message,
    );
    expect(messages.some((m) => m.includes("failed"))).toBe(true);
  });

  it("skips email when the customer gave none, but still texts", async () => {
    mockedSms.mockResolvedValue({ delivered: true });

    const res = await notifyCustomer({ ...booking, email: null }, "accepted");

    expect(mockedEmail).not.toHaveBeenCalled();
    expect(res.sms).toBe(true);
    expect(mockedStore.addNotification).toHaveBeenCalledTimes(1);
  });

  it("does nothing when there is no way to reach the customer", async () => {
    const res = await notifyCustomer({ ...booking, email: null, phone: "" }, "completed");
    expect(res).toEqual({ email: false, sms: false, attempted: false });
    expect(mockedEmail).not.toHaveBeenCalled();
    expect(mockedSms).not.toHaveBeenCalled();
  });

  it("names the reference and device in the message", async () => {
    mockedSms.mockResolvedValue({ delivered: true });
    await notifyCustomer(booking, "completed");
    const sms = mockedSms.mock.calls[0][0];
    expect(sms.body).toContain("#PPR-1003");
    expect(sms.body).toContain("iPhone 17 Pro Max");
  });

  it("includes the warranty date on completion", async () => {
    mockedSms.mockResolvedValue({ delivered: true });
    await notifyCustomer({ ...booking, warrantyUntil: "2027-09-14" }, "completed");
    expect(mockedSms.mock.calls[0][0].body).toContain("2027-09-14");
  });

  it("tailors the message to the status", async () => {
    mockedSms.mockResolvedValue({ delivered: true });
    await notifyCustomer(booking, "rescheduled");
    expect(mockedSms.mock.calls[0][0].body.toLowerCase()).toContain("now");
  });
});
