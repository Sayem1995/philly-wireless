import nodemailer from "nodemailer";
import { STORE, BRAND } from "../contracts/constants.js";
import { longHours } from "../contracts/brand.js";
import { maskEmail } from "./lib/mask.js";
import {
  formatCents,
  orderNumber,
  PAYMENT_METHOD_LABELS,
  FULFILLMENT_LABELS,
  type FulfillmentMethod,
  type PaymentMethod,
} from "../contracts/orders.js";

/**
 * Brand palette for inline email styles.
 *
 * Email clients do not support CSS custom properties, so the theme colours have
 * to be interpolated as literal hex values here. They come from the same
 * `BRAND_*` environment variables that drive the website, which keeps a
 * store's emails and its site in step.
 */
const C = {
  primary: BRAND.colors.primary.DEFAULT,
  primaryDark: BRAND.colors.primary.dark,
  secondary: BRAND.colors.secondary.DEFAULT,
  surface: BRAND.colors.surface,
  ink: BRAND.colors.ink,
  muted: "#8a7168",
} as const;

/** `"Philly Phone Repair"` → `Philly <span style="color:…">Phone Repair</span>`.
 *  When a store name is a single word the whole name is coloured instead. */
function wordmark(): string {
  const { wordmarkPrimary, wordmarkAccent } = BRAND;
  if (!wordmarkAccent) {
    return `<span style="color:${C.primary};">${wordmarkPrimary}</span>`;
  }
  return `${wordmarkPrimary} <span style="color:${C.primary};">${wordmarkAccent}</span>`;
}

/**
 * Email sender.
 *
 * Activate real delivery by setting these environment variables:
 *   SMTP_HOST      e.g. smtp.gmail.com
 *   SMTP_PORT      e.g. 465 (ssl) or 587 (starttls)
 *   SMTP_USER      your address / username
 *   SMTP_PASS      your password or app password
 *   SMTP_FROM      optional sender, defaults to SMTP_USER
 *
 * When not configured, sendEmail() returns { delivered: false } and the
 * caller logs the message into the CRM communication history instead.
 */
function getTransport() {
  // Trim and de-quote: values pasted into a hosting dashboard very often pick up
  // a trailing space/newline or wrapping quotes, which makes an otherwise
  // correct SMTP password fail with "535 Username and Password not accepted".
  const clean = (v: string | undefined) => (v ?? "").trim().replace(/^["']|["']$/g, "");
  const host = clean(process.env.SMTP_HOST);
  const user = clean(process.env.SMTP_USER);
  const pass = clean(process.env.SMTP_PASS);
  if (!host || !user || !pass) return null;
  const port = Number(clean(process.env.SMTP_PORT) || 465);

  // Google App Passwords are exactly 16 characters. Logging only the LENGTH
  // (never the value) turns "Invalid login" into a precise diagnosis: a longer
  // value means the account password was used instead of an App Password.
  if (/gmail\.com$/i.test(host) && pass.length !== 16) {
    console.warn(
      `[email] SMTP_PASS is ${pass.length} characters; a Google App Password is 16. ` +
        `If you copied your normal Gmail password, that will always fail.`,
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ delivered: boolean }> {
  // ── Preferred: Brevo transactional email API (HTTPS) ──────────
  // Brevo's free tier (300/day) is generous, and going over HTTPS avoids
  // relying on outbound SMTP ports from a serverless function, which some
  // hosts throttle or block.
  const brevoKey = process.env.BREVO_API_KEY;
  if (brevoKey) {
    const from = process.env.BREVO_FROM ?? process.env.SMTP_FROM ?? process.env.SMTP_USER ?? STORE.email;
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoKey,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: from, name: STORE.name },
        to: [{ email: opts.to }],
        subject: opts.subject,
        htmlContent: opts.html,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[brevo] ${res.status}: ${errText}`);
      throw new Error(`Brevo error ${res.status}`);
    }
    return { delivered: true };
  }

  // Alternative: SendGrid Web API (HTTPS). NOTE: SendGrid no longer has a
  // free tier — it is a 60-day trial then a paid plan, so Brevo is preferred
  // for low-volume shops.
  const sgKey = process.env.SENDGRID_API_KEY;
  if (sgKey) {
    const from = process.env.SENDGRID_FROM ?? process.env.SMTP_USER ?? STORE.email;
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sgKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: opts.to }] }],
        from: { email: from, name: STORE.name },
        subject: opts.subject,
        content: [{ type: "text/html", value: opts.html }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[sendgrid] ${res.status}: ${errText}`);
      throw new Error(`SendGrid error ${res.status}`);
    }
    return { delivered: true };
  }
  // Fallback: SMTP (Gmail etc.)
  const transport = getTransport();
  if (!transport) {
    // Mask the recipient: this log line can end up in a hosting provider's log
    // store, which is not where customer email addresses belong.
    console.log(
      `[email:not-configured] To: ${maskEmail(opts.to)} | Subject: ${opts.subject}`,
    );
    return { delivered: false };
  }
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  return { delivered: true };
}

/* ---------- templates ---------- */
function shell(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:${C.surface};font-family:Georgia,serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="text-align:center;padding-bottom:24px;border-bottom:2px solid ${C.secondary};">
      <p style="font-size:22px;color:${C.ink};margin:0;">${wordmark()}</p>
      <p style="font-size:10px;letter-spacing:3px;color:${C.primary};margin:6px 0 0;">${BRAND.tagline.toUpperCase()}</p>
    </div>
    <h1 style="font-size:24px;color:${C.ink};text-align:center;margin:28px 0 8px;">${title}</h1>
    ${body}
    <div style="margin-top:32px;padding-top:20px;border-top:2px solid ${C.secondary};text-align:center;font-size:12px;color:${C.muted};">
      <p style="margin:4px 0;">${STORE.address}, ${STORE.city}</p>
      <p style="margin:4px 0;">${STORE.phone} · ${STORE.email}</p>
      <p style="margin:4px 0;">${longHours(BRAND.hours)}</p>
    </div>
  </div></body></html>`;
}

function row(k: string, v: string) {
  return `<tr><td style="padding:8px 0;color:${C.muted};font-size:14px;">${k}</td><td style="padding:8px 0;text-align:right;font-size:14px;color:${C.ink};font-weight:bold;">${v}</td></tr>`;
}

export function bookingConfirmationHtml(b: {
  id: number; customerName: string; device: string; repairType: string;
  date: string; timeSlot: string;
}) {
  const pretty = new Date(b.date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
  return shell(
    "Your repair is booked!",
    `<p style="text-align:center;color:${C.muted};font-size:14px;margin:0 0 24px;">Hi ${b.customerName.split(" ")[0]}, we're expecting you. Here's your visit summary:</p>
    <div style="background:#fff;border:1px solid ${C.secondary};border-radius:16px;padding:24px;">
      <table style="width:100%;border-collapse:collapse;">
        ${row("Confirmation", `#PPR-${b.id}`)}
        ${row("Device", b.device)}
        ${row("Repair", b.repairType)}
        ${row("Date", pretty)}
        ${row("Check-in time", b.timeSlot)}
      </table>
    </div>
    <p style="color:${C.muted};font-size:13px;line-height:1.7;margin:24px 0 0;">
      Diagnostics are always free, and we'll confirm the final quote with you before any work begins.
      Need to reschedule? Just call ${STORE.phone} or reply to this email.
    </p>`,
  );
}

export function staffNotificationHtml(b: {
  id: number; customerName: string; phone: string; email?: string | null;
  device: string; repairType: string; date: string; timeSlot: string; notes?: string | null;
}) {
  return shell(
    `New booking — #PPR-${b.id}`,
    `<div style="background:#fff;border:1px solid ${C.secondary};border-radius:16px;padding:24px;">
      <table style="width:100%;border-collapse:collapse;">
        ${row("Customer", b.customerName)}
        ${row("Phone", b.phone)}
        ${row("Email", b.email || "—")}
        ${row("Device", b.device)}
        ${row("Repair", b.repairType)}
        ${row("Date", b.date)}
        ${row("Time", b.timeSlot)}
        ${b.notes ? row("Notes", b.notes) : ""}
      </table>
    </div>`,
  );
}

/* ---------- payment receipt ---------- */

export function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Escape user/admin-supplied text before putting it in an HTML email. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Wrap a free-text message (from the admin panel) in the branded shell. */
export function messageHtml(body: string): string {
  return shell(
    `A message from ${BRAND.name}`,
    `<div style="background:#fff;border:1px solid ${C.secondary};border-radius:16px;padding:24px;color:${C.ink};font-size:15px;line-height:1.7;white-space:pre-wrap;">${escapeHtml(body)}</div>`,
  );
}

export function receiptHtml(r: {
  id: number;
  customerName: string;
  device: string;
  repairType: string;
  lines: { description: string; amountCents: number }[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paymentMethod: string;
  paidAt: string;
  notes?: string | null;
  url?: string | null;
}) {
  const rows = r.lines
    .map((l) => row(l.description, money(l.amountCents)))
    .join("");
  const taxRow = r.taxCents > 0 ? row("Tax", money(r.taxCents)) : "";

  return shell(
    "Payment receipt",
    `<p style="text-align:center;color:${C.muted};font-size:14px;margin:0 0 20px;">
      Hi ${r.customerName.split(" ")[0]}, thank you — here is your receipt for the repair of your ${r.device}.
    </p>
    <div style="background:#fff;border:1px solid ${C.secondary};border-radius:16px;padding:24px;">
      <table style="width:100%;border-collapse:collapse;">
        ${row("Receipt", `#PPR-R${r.id}`)}
        ${row("Date paid", r.paidAt)}
        ${row("Device", r.device)}
        ${row("Repair", r.repairType)}
        ${row("Payment method", r.paymentMethod)}
      </table>
      <div style="border-top:1px solid ${C.secondary};margin:18px 0;"></div>
      <table style="width:100%;border-collapse:collapse;">
        ${rows}
        ${taxRow}
      </table>
      <div style="border-top:2px solid ${C.secondary};margin:18px 0;"></div>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="font-size:16px;color:${C.ink};font-weight:bold;">Total paid</td>
          <td style="text-align:right;font-size:20px;color:${C.primary};font-weight:bold;">${money(r.totalCents)}</td>
        </tr>
      </table>
    </div>
    ${r.notes ? `<p style="color:${C.muted};font-size:13px;margin:16px 0 0;">${r.notes}</p>` : ""}
    ${r.url ? `<p style="text-align:center;margin:22px 0 0;"><a href="${r.url}" style="background:${C.primary};color:${C.surface};text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;">View or print this receipt</a></p>` : ""}
    <p style="color:${C.muted};font-size:12px;line-height:1.7;margin:22px 0 0;text-align:center;">
      Keep this for your records — it also covers any warranty claim.
    </p>`,
  );
}

/* ---------- online orders ---------- */

type OrderEmailLine = { name: string; qty: number; lineCents: number };

type OrderEmailInput = {
  id: number;
  customerName: string;
  phone: string;
  email: string | null;
  fulfillment: FulfillmentMethod;
  address: string | null;
  notes: string | null;
  lines: OrderEmailLine[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paymentMethod: PaymentMethod;
  paymentStatus: string;
  url?: string | null;
};

function orderLinesRows(lines: OrderEmailLine[]): string {
  return lines
    .map((l) => row(`${escapeHtml(l.name)} × ${l.qty}`, money(l.lineCents)))
    .join("");
}

/** Sent when an order is placed for pay-in-store, or when card payment clears. */
export function orderConfirmationHtml(o: OrderEmailInput) {
  const paid = o.paymentStatus === "paid";
  const taxRow = o.taxCents > 0 ? row("Sales tax", money(o.taxCents)) : "";
  const collection =
    o.fulfillment === "pickup"
      ? `<p style="color:${C.muted};font-size:14px;line-height:1.7;margin:20px 0 0;">
           Pick it up at ${STORE.address}, ${STORE.city}. We'll text ${escapeHtml(o.phone)} as soon as it's ready.
         </p>`
      : `<p style="color:${C.muted};font-size:14px;line-height:1.7;margin:20px 0 0;">
           We'll deliver to ${escapeHtml(o.address ?? "the address you gave us")} and text ${escapeHtml(o.phone)} to arrange a time.
         </p>`;

  return shell(
    paid ? "Payment received — order confirmed" : "Your order is in!",
    `<p style="text-align:center;color:${C.muted};font-size:14px;margin:0 0 20px;">
      Hi ${escapeHtml(o.customerName.split(" ")[0] || "there")}, thanks for shopping with ${BRAND.name}.
    </p>
    <div style="background:#fff;border:1px solid ${C.secondary};border-radius:16px;padding:24px;">
      <table style="width:100%;border-collapse:collapse;">
        ${row("Order", `#${orderNumber(o.id)}`)}
        ${row("Fulfilment", FULFILLMENT_LABELS[o.fulfillment])}
        ${row("Payment", `${PAYMENT_METHOD_LABELS[o.paymentMethod]} · ${paid ? "paid" : "due at collection"}`)}
      </table>
      <div style="border-top:1px solid ${C.secondary};margin:18px 0;"></div>
      <table style="width:100%;border-collapse:collapse;">
        ${orderLinesRows(o.lines)}
        ${taxRow}
      </table>
      <div style="border-top:2px solid ${C.secondary};margin:18px 0;"></div>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="font-size:16px;color:${C.ink};font-weight:bold;">${paid ? "Total paid" : "Total due"}</td>
          <td style="text-align:right;font-size:20px;color:${C.primary};font-weight:bold;">${formatCents(o.totalCents)}</td>
        </tr>
      </table>
    </div>
    ${collection}
    ${o.notes ? `<p style="color:${C.muted};font-size:13px;margin:14px 0 0;">Note: ${escapeHtml(o.notes)}</p>` : ""}
    ${o.url ? `<p style="text-align:center;margin:22px 0 0;"><a href="${o.url}" style="background:${C.primary};color:${C.surface};text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;">View your order</a></p>` : ""}
    <p style="color:${C.muted};font-size:12px;line-height:1.7;margin:22px 0 0;text-align:center;">
      Questions? Call ${STORE.phone} — or just reply to this email.
    </p>`,
  );
}

/** Staff alert for a new order, so the shop can pull the stock and ring it up. */
export function orderStaffNotificationHtml(o: OrderEmailInput) {
  return shell(
    `New online order — #${orderNumber(o.id)}`,
    `<div style="background:#fff;border:1px solid ${C.secondary};border-radius:16px;padding:24px;">
      <table style="width:100%;border-collapse:collapse;">
        ${row("Customer", escapeHtml(o.customerName))}
        ${row("Phone", escapeHtml(o.phone))}
        ${row("Email", o.email ? escapeHtml(o.email) : "—")}
        ${row("Fulfilment", FULFILLMENT_LABELS[o.fulfillment])}
        ${o.address ? row("Address", escapeHtml(o.address)) : ""}
        ${row("Payment", PAYMENT_METHOD_LABELS[o.paymentMethod])}
        ${row("Payment status", o.paymentStatus)}
      </table>
      <div style="border-top:1px solid ${C.secondary};margin:18px 0;"></div>
      <table style="width:100%;border-collapse:collapse;">
        ${orderLinesRows(o.lines)}
        ${o.taxCents > 0 ? row("Sales tax", money(o.taxCents)) : ""}
      </table>
      <div style="border-top:2px solid ${C.secondary};margin:18px 0;"></div>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="font-size:16px;color:${C.ink};font-weight:bold;">Order total</td>
          <td style="text-align:right;font-size:20px;color:${C.primary};font-weight:bold;">${formatCents(o.totalCents)}</td>
        </tr>
      </table>
    </div>
    ${o.notes ? `<p style="color:${C.muted};font-size:13px;margin:14px 0 0;">Note: ${escapeHtml(o.notes)}</p>` : ""}`,
  );
}
