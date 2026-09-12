import { store } from "./queries/store.js";
import { sendEmail } from "./email.js";
import { sendSms } from "./sms.js";
import { STORE } from "../contracts/constants.js";

/**
 * Customer-facing repair notifications.
 *
 * Each notification goes out on every channel we have for the customer — email
 * if they gave one, SMS if they gave a phone number — and the outcome of each
 * attempt is recorded in the CRM `notifications` history so the shop can see
 * what the customer was actually told, and whether it was really delivered.
 *
 * Delivery is best-effort: a missing provider, bad number or provider outage is
 * logged, never allowed to fail the booking or the status change.
 */

export type CustomerNotificationKind =
  | "received"
  | "accepted"
  | "in_progress"
  | "completed"
  | "rescheduled"
  | "cancelled";

export type NotifiableBooking = {
  id: number;
  customerId?: number | null;
  customerName: string;
  phone: string;
  email: string | null;
  device: string;
  repairType: string;
  date: string;
  timeSlot: string;
  warrantyUntil?: string | null;
};

export type NotifyResult = { email: boolean; sms: boolean; attempted: boolean };

const REF = (id: number) => `#PPR-${id}`;

function prettyDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function shell(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#FFFDF7;font-family:Georgia,serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="text-align:center;padding-bottom:20px;border-bottom:2px solid #F3D5D8;">
      <p style="font-size:22px;color:#2B1A18;margin:0;">Philly <span style="color:#7F1D1D;">Phone Repair</span></p>
    </div>
    <h1 style="font-size:22px;color:#2B1A18;text-align:center;margin:26px 0 10px;">${title}</h1>
    ${body}
    <div style="margin-top:28px;padding-top:18px;border-top:2px solid #F3D5D8;text-align:center;font-size:12px;color:#8a7168;">
      <p style="margin:4px 0;">${STORE.address}, ${STORE.city}</p>
      <p style="margin:4px 0;">${STORE.phone} · ${STORE.email}</p>
    </div>
  </div></body></html>`;
}

function copyFor(
  kind: CustomerNotificationKind,
  b: NotifiableBooking,
): { subject: string; sms: string; html: string } {
  const first = (b.customerName || "there").split(" ")[0];
  const when = `${prettyDate(b.date)} at ${b.timeSlot}`;
  const shop = STORE.name;

  switch (kind) {
    case "received":
      return {
        subject: `Booking received ${REF(b.id)} — ${shop}`,
        sms: `${shop}: Booking received for your ${b.device} (${b.repairType}) on ${prettyDate(b.date)} at ${b.timeSlot}. Ref ${REF(b.id)}. Questions? ${STORE.phone}`,
        html: shell(
          "We've got your booking",
          `<p style="color:#8a7168;font-size:14px;line-height:1.7;margin:0 0 16px;">Hi ${first}, thanks — your repair visit is booked. Here's what we have:</p>
           <ul style="color:#2B1A18;font-size:14px;line-height:1.9;margin:0 0 16px;padding-left:18px;">
             <li>Reference: <strong>${REF(b.id)}</strong></li>
             <li>Device: ${b.device}</li>
             <li>Repair: ${b.repairType}</li>
             <li>When: ${when}</li>
           </ul>
           <p style="color:#8a7168;font-size:13px;line-height:1.7;margin:0;">Diagnostics are always free and we'll confirm the final quote before any work begins. Need to change it? Call ${STORE.phone}.</p>`,
        ),
      };

    case "accepted":
      return {
        subject: `Repair accepted ${REF(b.id)} — ${shop}`,
        sms: `${shop}: We've accepted your ${b.repairType} for ${b.device}. Ref ${REF(b.id)}. We'll text when it's ready. ${STORE.phone}`,
        html: shell(
          "Your repair has been accepted",
          `<p style="color:#8a7168;font-size:14px;line-height:1.7;margin:0;">Hi ${first}, we've accepted your <strong>${b.repairType}</strong> for the <strong>${b.device}</strong> (${REF(b.id)}). We'll be in touch as soon as it's through the bench.</p>`,
        ),
      };

    case "in_progress":
      return {
        subject: `Repair in progress ${REF(b.id)} — ${shop}`,
        sms: `${shop}: Your ${b.device} repair (${b.repairType}) is underway. We'll message you when it's ready to collect. Ref ${REF(b.id)}.`,
        html: shell(
          "Your repair is underway",
          `<p style="color:#8a7168;font-size:14px;line-height:1.7;margin:0;">Hi ${first}, work on your <strong>${b.device}</strong> has started. We'll let you know the moment it's ready to collect.</p>`,
        ),
      };

    case "completed":
      return {
        subject: `Your device is ready ${REF(b.id)} — ${shop}`,
        sms: `${shop}: Good news — your ${b.device} is repaired and ready to collect at ${STORE.address}.${b.warrantyUntil ? ` Warranty to ${b.warrantyUntil}.` : ""} Ref ${REF(b.id)}.`,
        html: shell(
          "Your device is ready to collect",
          `<p style="color:#8a7168;font-size:14px;line-height:1.7;margin:0 0 16px;">Hi ${first}, your <strong>${b.device}</strong> is repaired and ready for pickup.</p>
           <ul style="color:#2B1A18;font-size:14px;line-height:1.9;margin:0 0 16px;padding-left:18px;">
             <li>Reference: <strong>${REF(b.id)}</strong></li>
             <li>Repair: ${b.repairType}</li>
             <li>Where: ${STORE.address}, ${STORE.city}</li>
             ${b.warrantyUntil ? `<li>Warranty valid until: <strong>${b.warrantyUntil}</strong></li>` : ""}
           </ul>
           <p style="color:#8a7168;font-size:13px;line-height:1.7;margin:0;">${STORE.hours.map((h) => `${h.d}: ${h.h}`).join(" · ")}</p>`,
        ),
      };

    case "rescheduled":
      return {
        subject: `Appointment moved ${REF(b.id)} — ${shop}`,
        sms: `${shop}: Your appointment (${REF(b.id)}) is now ${prettyDate(b.date)} at ${b.timeSlot}. Any problem, call ${STORE.phone}.`,
        html: shell(
          "Your appointment has moved",
          `<p style="color:#8a7168;font-size:14px;line-height:1.7;margin:0;">Hi ${first}, your repair visit (${REF(b.id)}) is now scheduled for <strong>${when}</strong>. If that doesn't work, call us on ${STORE.phone}.</p>`,
        ),
      };

    case "cancelled":
      return {
        subject: `Appointment cancelled ${REF(b.id)} — ${shop}`,
        sms: `${shop}: Your appointment (${REF(b.id)}) has been cancelled. If this is unexpected, call ${STORE.phone}.`,
        html: shell(
          "Your appointment was cancelled",
          `<p style="color:#8a7168;font-size:14px;line-height:1.7;margin:0;">Hi ${first}, your repair visit (${REF(b.id)}) has been cancelled. If you'd like to rebook, just call ${STORE.phone} or book online any time.</p>`,
        ),
      };
  }
}

async function log(
  b: NotifiableBooking,
  channel: "email" | "sms",
  message: string,
): Promise<void> {
  try {
    await store.addNotification({
      bookingId: b.id,
      customerId: b.customerId ?? null,
      channel,
      message,
    });
  } catch (err) {
    console.error("[notify] failed to record notification:", err);
  }
}

/**
 * Send the customer everything we have for this event. Never throws — each
 * channel is independent so an email failure still lets the SMS through.
 */
export async function notifyCustomer(
  b: NotifiableBooking,
  kind: CustomerNotificationKind,
): Promise<NotifyResult> {
  const copy = copyFor(kind, b);
  const result: NotifyResult = { email: false, sms: false, attempted: false };

  if (b.email) {
    result.attempted = true;
    try {
      const r = await sendEmail({ to: b.email, subject: copy.subject, html: copy.html });
      result.email = r.delivered;
      await log(b, "email", `${copy.subject}${r.delivered ? " (sent)" : " (queued — email not configured)"}`);
    } catch (err) {
      console.error("[notify] email failed:", err);
      await log(b, "email", `${copy.subject} (failed — ${err instanceof Error ? err.message : "unknown error"})`);
    }
  }

  if (b.phone) {
    result.attempted = true;
    try {
      const r = await sendSms({ to: b.phone, body: copy.sms });
      result.sms = r.delivered;
      await log(b, "sms", `${copy.sms}${r.delivered ? " (sent)" : " (queued — SMS not configured)"}`);
    } catch (err) {
      console.error("[notify] sms failed:", err);
      await log(b, "sms", `${copy.sms} (failed — ${err instanceof Error ? err.message : "unknown error"})`);
    }
  }

  return result;
}
