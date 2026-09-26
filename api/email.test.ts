import { describe, expect, it } from "vitest";
import {
  bookingConfirmationHtml,
  staffNotificationHtml,
  sendEmail,
} from "../server/email.js";
import { BRAND, STORE } from "../contracts/constants.js";

const booking = {
  id: 128,
  customerName: "Ada Lovelace",
  phone: "2155550100",
  email: "ada@example.com",
  device: "iPhone 15",
  repairType: "Screen Replacement",
  date: "2026-02-01",
  timeSlot: "10:00",
  notes: null,
};

describe("bookingConfirmationHtml", () => {
  it("addresses the customer by first name and includes the reference", () => {
    const html = bookingConfirmationHtml(booking);
    expect(html).toContain("Ada");
    expect(html).toContain("#PPR-128");
    expect(html).toContain("iPhone 15");
    expect(html).toContain("Screen Replacement");
    expect(html).toContain("10:00");
  });

  it("renders a full standalone HTML document", () => {
    const html = bookingConfirmationHtml(booking);
    expect(html).toMatch(/^<!doctype html>/i);
    // The wordmark and address come from the brand config, so this asserts
    // against the configured store rather than a hardcoded "Philly Phone
    // Repair" — which is what makes the suite meaningful for a second store.
    // The wordmark is split by a <span> around the accent words, so the two
    // halves are asserted separately rather than as one contiguous string.
    expect(html).toContain(BRAND.wordmarkPrimary);
    expect(html).toContain(BRAND.wordmarkAccent);
    expect(html).toContain(STORE.address);
  });

  it("formats the booking date in a readable form", () => {
    // 2026-02-01 is a Sunday.
    expect(bookingConfirmationHtml(booking)).toContain("Sunday");
  });
});

describe("staffNotificationHtml", () => {
  it("includes the customer's contact details", () => {
    const html = staffNotificationHtml(booking);
    expect(html).toContain("#PPR-128");
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("2155550100");
    expect(html).toContain("ada@example.com");
  });

  it("omits the notes row when there are no notes", () => {
    const html = staffNotificationHtml({ ...booking, notes: null });
    expect(html).not.toContain("Notes");
  });

  it("includes the notes row when notes are present", () => {
    const html = staffNotificationHtml({
      ...booking,
      notes: "Cracked corner, customer needs it by Friday",
    });
    expect(html).toContain("Notes");
    expect(html).toContain("Cracked corner");
  });

  it("falls back to an em dash when the customer has no email", () => {
    const html = staffNotificationHtml({ ...booking, email: null });
    expect(html).toContain("—");
  });
});

describe("sendEmail without any provider configured", () => {
  it("reports not-delivered instead of throwing", async () => {
    // No SENDGRID_API_KEY / SMTP_* set in the test environment.
    const result = await sendEmail({
      to: "nobody@example.com",
      subject: "test",
      html: "<p>hi</p>",
    });
    expect(result).toEqual({ delivered: false });
  });
});
