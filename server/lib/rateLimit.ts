/**
 * Small fixed-window rate limiter for sensitive public mutations.
 *
 * Deliberately in-memory: it adds a cheap guard against accidental double
 * submits and scripted abuse without a new datastore dependency. On a
 * serverless platform each instance has its own memory, so this is
 * best-effort per instance — document/configure edge rate limiting (Vercel
 * Firewall, Cloudflare, etc.) for a hard global limit. It never replaces the
 * server-side validation or the idempotency checks.
 */

type Timestamps = number[];

const buckets = new Map<string, Timestamps>();

/** Only used by tests; clears accumulated windows. */
export function resetRateLimits(): void {
  buckets.clear();
}

export type RateLimitResult = { allowed: boolean; retryAfterMs: number };

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  nowMs = Date.now(),
): RateLimitResult {
  if (!key || limit <= 0 || windowMs <= 0) {
    return { allowed: true, retryAfterMs: 0 };
  }

  const cutoff = nowMs - windowMs;
  const recent = (buckets.get(key) ?? []).filter((t) => t > cutoff);

  if (recent.length >= limit) {
    buckets.set(key, recent);
    return {
      allowed: false,
      retryAfterMs: Math.max(0, (recent[0] ?? nowMs) + windowMs - nowMs),
    };
  }

  recent.push(nowMs);
  buckets.set(key, recent);

  // Bounded memory: drop empty buckets when the map grows unexpectedly large.
  if (buckets.size > 5_000) {
    for (const [bucketKey, timestamps] of buckets) {
      if (!timestamps.some((t) => t > cutoff)) buckets.delete(bucketKey);
    }
  }

  return { allowed: true, retryAfterMs: 0 };
}

/**
 * Best-effort client address for rate-limit keys.
 *
 * On Vercel the first `x-forwarded-for` entry is the caller. These headers can
 * be spoofed when the app is reached without a trusted proxy, which is another
 * reason this limiter is a defence-in-depth measure rather than the only one.
 */
export function clientAddress(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
