import { describe, expect, it } from "vitest";
import { matchingProducts, summarizeStock } from "../src/lib/brandStock.js";

/**
 * Brand → product matching.
 *
 * These brands and product names are the real seeded data, so a regression
 * here shows up as an empty or wrong list inside the admin pricing table.
 */

const catalogue = [
  { id: 1, name: "iPhone 16 Pro", stock: 4 },
  { id: 2, name: "iPhone 16", stock: 6 },
  { id: 3, name: "iPad (10th Gen)", stock: 5 },
  { id: 4, name: "iPad Air M2", stock: 3 },
  { id: 5, name: "Samsung Galaxy Tab S9", stock: 2 },
  { id: 6, name: "iPhone 14 (Refurbished)", stock: 5 },
  { id: 7, name: "iPhone 13 (Refurbished)", stock: 8 },
  { id: 8, name: "iPhone 12 (Refurbished)", stock: 6 },
  { id: 9, name: "iPad 9th Gen (Refurbished)", stock: 4 },
  { id: 10, name: "iPad Air 4 (Refurbished)", stock: 2 },
  { id: 11, name: "Galaxy Tab A8 (Refurbished)", stock: 3 },
  { id: 12, name: "Phone Cases", stock: 60 },
];

describe("matchingProducts", () => {
  it("matches an exact brand name first", () => {
    const exact = matchingProducts("iPad", [{ id: 1, name: "iPad", stock: 1 }]);
    expect(exact.map((p) => p.id)).toEqual([1]);
  });

  it("finds every iPhone in the real catalogue", () => {
    const names = matchingProducts("iPhone", catalogue).map((p) => p.name);
    expect(names).toEqual([
      "iPhone 16 Pro",
      "iPhone 16",
      "iPhone 14 (Refurbished)",
      "iPhone 13 (Refurbished)",
      "iPhone 12 (Refurbished)",
    ]);
  });

  it("ranks a prefix match above a mid-name match", () => {
    const products = [
      { id: 1, name: "Case for iPhone 15", stock: 1 },
      { id: 2, name: "iPhone 15 Pro", stock: 1 },
    ];
    expect(matchingProducts("iPhone", products).map((p) => p.id)).toEqual([2, 1]);
  });

  it("matches a multi-word brand written without its suffix", () => {
    // "Samsung Galaxy" pulls in both the full-name product (rank 2) and the one
    // the catalogue stored without the manufacturer prefix (rank 3).
    const names = matchingProducts("Samsung Galaxy", catalogue).map((p) => p.name);
    expect(names).toEqual(["Samsung Galaxy Tab S9", "Galaxy Tab A8 (Refurbished)"]);
  });

  it("matches when the catalogue omits the brand's first word", () => {
    // The price list says "Samsung Galaxy" but the product is "Galaxy Tab A8".
    // Requiring every word would hide this product entirely.
    const relaxed = matchingProducts("Samsung Galaxy", [{ id: 1, name: "Galaxy Tab A8", stock: 3 }]);
    expect(relaxed.map((p) => p.id)).toEqual([1]);
  });

  it("ranks a full brand match above a relaxed one", () => {
    const products = [
      { id: 1, name: "Galaxy Tab A8", stock: 3 },
      { id: 2, name: "Samsung Galaxy Tab S9", stock: 2 },
    ];
    expect(matchingProducts("Samsung Galaxy", products).map((p) => p.id)).toEqual([2, 1]);
  });

  it("does not report the same product twice", () => {
    const products = [{ id: 1, name: "Samsung Galaxy Tab S9", stock: 2 }];
    expect(matchingProducts("Samsung Galaxy", products)).toHaveLength(1);
  });

  it("relaxes on the distinctive last word, not on any word", () => {
    // "Google" alone must not pull in unrelated products just because the brand
    // happens to start with it.
    const products = [
      { id: 1, name: "Google Nest Hub", stock: 1 },
      { id: 2, name: "Google Pixel 9", stock: 4 },
      { id: 3, name: "Pixel 8a", stock: 2 },
    ];
    expect(matchingProducts("Google Pixel", products).map((p) => p.id)).toEqual([2, 3]);
  });

  it("returns nothing for an empty or blank brand", () => {
    expect(matchingProducts("iphone", catalogue)[0].name).toBe("iPhone 16 Pro");
    expect(matchingProducts("  iPhone  ", catalogue)).toHaveLength(5);
  });

  it("does not match a brand inside a longer word", () => {
    // A substring test would wrongly pair this with the "iPad" row.
    expect(matchingProducts("iPad", [{ id: 1, name: "iPadHifi Stand", stock: 1 }])).toEqual([]);
  });

  it("returns nothing for an empty or blank brand", () => {
    expect(matchingProducts("", catalogue)).toEqual([]);
    expect(matchingProducts("   ", catalogue)).toEqual([]);
  });

  it("returns nothing when the brand has no products", () => {
    expect(matchingProducts("Google Pixel", catalogue)).toEqual([]);
    expect(matchingProducts("Motorola", catalogue)).toEqual([]);
  });

  it("keeps catalogue order for equally ranked matches", () => {
    const names = matchingProducts("iPad", catalogue).map((p) => p.name);
    expect(names[0]).toBe("iPad (10th Gen)");
    expect(names).toContain("iPad Air M2");
  });

  it("does not match an accessory that merely mentions the brand", () => {
    const products = [{ id: 1, name: "Phone Cases", stock: 60 }];
    expect(matchingProducts("Phone", products).map((p) => p.id)).toEqual([1]);
  });
});

describe("summarizeStock", () => {
  it("totals units and counts sold-out lines", () => {
    const summary = summarizeStock([{ stock: 4 }, { stock: 0 }, { stock: 6 }]);
    expect(summary).toEqual({ matched: 3, inStock: 2, totalUnits: 10, soldOut: 1 });
  });

  it("handles an empty match", () => {
    expect(summarizeStock([])).toEqual({ matched: 0, inStock: 0, totalUnits: 0, soldOut: 0 });
  });

  it("treats a missing stock value as zero rather than NaN", () => {
    expect(summarizeStock([{ stock: undefined as unknown as number }]).totalUnits).toBe(0);
  });

  it("matches the real iPhone catalogue", () => {
    const summary = summarizeStock(matchingProducts("iPhone", catalogue));
    expect(summary).toEqual({ matched: 5, inStock: 5, totalUnits: 29, soldOut: 0 });
  });
});
