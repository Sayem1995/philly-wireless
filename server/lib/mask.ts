/**
 * Log-safe representations of customer identifiers.
 *
 * Delivery failures need to be diagnosable, but server logs are often shipped
 * to a third-party aggregator and kept far longer than the shop's own records.
 * Mask the recipient so an operator can tell two messages apart without the
 * log becoming a copy of the customer database.
 */

export function maskEmail(value: string): string {
  const trimmed = value.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  return `${local.slice(0, 1)}***@${domain}`;
}

export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `***${digits.slice(-4)}`;
}
