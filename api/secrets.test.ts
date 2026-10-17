import { describe, expect, it } from "vitest";
import { constantTimeEqual } from "../server/lib/secrets.js";

/** Cron bearer-token comparison. */
describe("constantTimeEqual", () => {
  it("matches only the exact secret", () => {
    expect(constantTimeEqual("cron-secret-123", "cron-secret-123")).toBe(true);
    expect(constantTimeEqual("cron-secret-124", "cron-secret-123")).toBe(false);
    expect(constantTimeEqual("cron-secret-123 ", "cron-secret-123")).toBe(false);
  });

  it("rejects empty or missing values", () => {
    expect(constantTimeEqual("", "cron-secret-123")).toBe(false);
    expect(constantTimeEqual("cron-secret-123", "")).toBe(false);
  });

  it("rejects a different length without throwing", () => {
    expect(constantTimeEqual("short", "a-much-longer-secret")).toBe(false);
  });
});
