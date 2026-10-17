import { randomBytes } from "node:crypto";

/**
 * Capability tokens for customer-facing links (orders, receipts).
 *
 * 24 bytes = 192 bits of CSPRNG entropy, base64url-encoded to 32 URL-safe
 * characters. The token is the only authorisation for `/order/:token` and
 * `/receipt/:token`, so it must be unguessable rather than sequential.
 */
export function newCapabilityToken(bytes = 24): string {
  const size = Number.isFinite(bytes) ? Math.max(16, Math.floor(bytes)) : 24;
  return randomBytes(size).toString("base64url");
}
