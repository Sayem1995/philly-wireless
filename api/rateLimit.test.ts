import { beforeEach, describe, expect, it } from "vitest";
import {
  checkRateLimit,
  clientAddress,
  resetRateLimits,
} from "../server/lib/rateLimit.js";

/** In-memory abuse guard for public checkout/payment endpoints. */

beforeEach(() => resetRateLimits());

describe("checkRateLimit", () => {
  const start = 1_800_000_000_000;

  it("allows requests up to the limit and blocks the next one", () => {
    for (let i = 0; i < 3; i += 1) {
      expect(checkRateLimit("ip:a", 3, 60_000, start + i).allowed).toBe(true);
    }
    const blocked = checkRateLimit("ip:a", 3, 60_000, start + 3);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it("allows again once the window has passed", () => {
    for (let i = 0; i < 3; i += 1) {
      checkRateLimit("ip:b", 3, 60_000, start + i);
    }
    expect(checkRateLimit("ip:b", 3, 60_000, start + 3).allowed).toBe(false);
    expect(checkRateLimit("ip:b", 3, 60_000, start + 60_001).allowed).toBe(true);
  });

  it("keys buckets independently", () => {
    for (let i = 0; i < 2; i += 1) checkRateLimit("ip:c", 2, 60_000, start + i);
    expect(checkRateLimit("ip:c", 2, 60_000, start + 2).allowed).toBe(false);
    expect(checkRateLimit("ip:d", 2, 60_000, start + 2).allowed).toBe(true);
  });

  it("treats non-positive limits/windows as disabled", () => {
    expect(checkRateLimit("ip:e", 0, 60_000, start).allowed).toBe(true);
    expect(checkRateLimit("", 3, 60_000, start).allowed).toBe(true);
    expect(checkRateLimit("ip:e", 3, 0, start).allowed).toBe(true);
  });

  it("resets cleanly between tests", () => {
    checkRateLimit("ip:f", 1, 60_000, start);
    expect(checkRateLimit("ip:f", 1, 60_000, start).allowed).toBe(false);
    resetRateLimits();
    expect(checkRateLimit("ip:f", 1, 60_000, start).allowed).toBe(true);
  });
});

describe("clientAddress", () => {
  it("uses the first forwarded address", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
    });
    expect(clientAddress(req)).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip and then a stable placeholder", () => {
    expect(
      clientAddress(
        new Request("http://localhost", { headers: { "x-real-ip": "198.51.100.4" } }),
      ),
    ).toBe("198.51.100.4");
    expect(clientAddress(new Request("http://localhost"))).toBe("unknown");
  });
});
