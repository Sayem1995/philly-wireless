import { describe, expect, it } from "vitest";
import { Timestamp, toDate } from "../server/queries/firestore.js";

/**
 * `toDate` normalises every shape Firestore can hand back for a date field,
 * so these tests pin the contract the store mappers rely on.
 */
describe("toDate", () => {
  it("converts a Firestore Timestamp", () => {
    const ts = Timestamp.fromDate(new Date("2026-02-01T10:00:00Z"));
    expect(toDate(ts)?.toISOString()).toBe("2026-02-01T10:00:00.000Z");
  });

  it("passes a Date through unchanged", () => {
    const d = new Date("2026-02-01T10:00:00Z");
    expect(toDate(d)).toBe(d);
  });

  it("converts a plain {seconds, nanoseconds} object", () => {
    const converted = toDate({ seconds: 1769940000, nanoseconds: 500_000_000 });
    expect(converted?.toISOString()).toBe("2026-02-01T10:00:00.500Z");
  });

  it("returns null for values that are not dates", () => {
    expect(toDate(null)).toBeNull();
    expect(toDate(undefined)).toBeNull();
    expect(toDate("2026-02-01")).toBeNull();
    expect(toDate(1234)).toBeNull();
    expect(toDate({})).toBeNull();
  });
});
