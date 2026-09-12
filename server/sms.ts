/**
 * SMS sender (Twilio REST API).
 *
 * Uses the plain HTTP API over `fetch` rather than the Twilio SDK, so no extra
 * runtime dependency (and no extra bundle weight in the Vercel function).
 *
 * Activate by setting:
 *   TWILIO_ACCOUNT_SID   e.g. ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *   TWILIO_AUTH_TOKEN    your auth token
 *   TWILIO_FROM_NUMBER   your Twilio number in E.164, e.g. +12155550123
 *
 * When not configured, sendSms() returns { delivered: false } and the caller
 * records the message in the CRM communication history instead — bookings and
 * status changes never fail because SMS is unset.
 */

/** Normalise a North-American number to E.164. Returns null if unusable. */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Already E.164 (allow a leading + and 8-15 digits).
  if (/^\+\d{8,15}$/.test(trimmed)) return trimmed;

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`; // US/CA local
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

function getConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !from) return null;
  return { accountSid, authToken, from };
}

export function isSmsConfigured(): boolean {
  return getConfig() !== null;
}

export async function sendSms(opts: { to: string; body: string }): Promise<{ delivered: boolean }> {
  const config = getConfig();
  const to = toE164(opts.to);

  if (!config || !to) {
    console.log(
      `[sms:not-configured] To: ${opts.to}${to ? ` (${to})` : " (unparseable)"} | ${opts.body}`,
    );
    return { delivered: false };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: config.from, Body: opts.body }).toString(),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[twilio] ${res.status}: ${detail.slice(0, 300)}`);
    throw new Error(`Twilio error ${res.status}`);
  }

  return { delivered: true };
}
