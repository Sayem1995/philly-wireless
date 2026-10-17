import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time comparison for short shared secrets (the cron bearer token).
 * Length is not secret, but the value is: compare bytes without early exit.
 */
export function constantTimeEqual(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
