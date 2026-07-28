import nodemailer from "nodemailer";
import { STORE } from "@contracts/constants";

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
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT ?? 465);
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
  // Preferred: SendGrid Web API (HTTPS — works where SMTP ports are blocked)
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
    console.log(`[email:not-configured] To: ${opts.to} | Subject: ${opts.subject}`);
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
  return `<!doctype html><html><body style="margin:0;padding:0;background:#FFFDF7;font-family:Georgia,serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="text-align:center;padding-bottom:24px;border-bottom:2px solid #F3D5D8;">
      <p style="font-size:22px;color:#2B1A18;margin:0;">Philly <span style="color:#7F1D1D;">Phone Repair</span></p>
      <p style="font-size:10px;letter-spacing:3px;color:#7F1D1D;margin:6px 0 0;">CENTER CITY · PHILADELPHIA</p>
    </div>
    <h1 style="font-size:24px;color:#2B1A18;text-align:center;margin:28px 0 8px;">${title}</h1>
    ${body}
    <div style="margin-top:32px;padding-top:20px;border-top:2px solid #F3D5D8;text-align:center;font-size:12px;color:#8a7168;">
      <p style="margin:4px 0;">${STORE.address}, ${STORE.city}</p>
      <p style="margin:4px 0;">${STORE.phone} · ${STORE.email}</p>
      <p style="margin:4px 0;">Mon–Fri 9–7 · Sat 10–6 · Sun 12–5</p>
    </div>
  </div></body></html>`;
}

function row(k: string, v: string) {
  return `<tr><td style="padding:8px 0;color:#8a7168;font-size:14px;">${k}</td><td style="padding:8px 0;text-align:right;font-size:14px;color:#2B1A18;font-weight:bold;">${v}</td></tr>`;
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
    `<p style="text-align:center;color:#8a7168;font-size:14px;margin:0 0 24px;">Hi ${b.customerName.split(" ")[0]}, we're expecting you. Here's your visit summary:</p>
    <div style="background:#fff;border:1px solid #F3D5D8;border-radius:16px;padding:24px;">
      <table style="width:100%;border-collapse:collapse;">
        ${row("Confirmation", `#PPR-${b.id}`)}
        ${row("Device", b.device)}
        ${row("Repair", b.repairType)}
        ${row("Date", pretty)}
        ${row("Check-in time", b.timeSlot)}
      </table>
    </div>
    <p style="color:#8a7168;font-size:13px;line-height:1.7;margin:24px 0 0;">
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
    `<div style="background:#fff;border:1px solid #F3D5D8;border-radius:16px;padding:24px;">
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
