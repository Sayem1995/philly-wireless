import { describe, expect, it } from "vitest";
import { newCapabilityToken } from "../server/lib/tokens.js";

/**
 * Customer order/receipt links are authorised solely by the token in the URL,
 * so it must be unguessable, URL-safe and never sequential.
 */
describe("newCapabilityToken", () => {
  it("produces 192 bits of base64url entropy by default", () => {
    const token = newCapabilityToken();
    expect(token).toHaveLength(32); // 24 bytes -> 32 base64 chars, no padding
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("does not repeat across many generations", () => {
    const tokens = new Set(Array.from({ length: 1_000 }, () => newCapabilityToken()));
    expect(tokens.size).toBe(1_000);
  });

  it("never returns a short token even if asked", () => {
    expect(newCapabilityToken(1).length).toBeGreaterThanOrEqual(22);
    expect(newCapabilityToken(Number.NaN).length).toBe(32);
  });

  it("supports longer tokens for higher-assurance links", () => {
    expect(newCapabilityToken(32)).toHaveLength(43); // 32 bytes -> 43 chars
  });
});
