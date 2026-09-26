import { describe, expect, it } from "vitest";
import { parsePriceRows, partitionNewRows, priceKey } from "../src/lib/priceImport.js";

/**
 * Bulk price import.
 *
 * A parsing mistake here writes wrong prices to the live public price list, so
 * these cover the separator and quoting traps rather than just the happy path.
 */

describe("parsePriceRows", () => {
  it("parses pipe-separated rows", () => {
    const { rows, issues } = parsePriceRows(
      "ipad | iPad Pro 12.9 | Screen Replacement | From $300\nipad | iPad Mini | Screen Replacement | From $220",
    );
    expect(issues).toEqual([]);
    expect(rows).toEqual([
      { category: "ipad", brand: "iPad Pro 12.9", service: "Screen Replacement", priceLabel: "From $300", line: 1 },
      { category: "ipad", brand: "iPad Mini", service: "Screen Replacement", priceLabel: "From $220", line: 2 },
    ]);
  });

  it("skips an optional header row", () => {
    const { rows, issues } = parsePriceRows(
      "Category | Brand | Service | Price\nipad | iPad Air | Screen Replacement | From $250",
    );
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].brand).toBe("iPad Air");
  });

  it("lowercases the category to match createPrice", () => {
    const { rows } = parsePriceRows("iPad | iPad Mini | Screen Replacement | From $220");
    expect(rows[0].category).toBe("ipad");
  });

  it("parses tab-separated rows", () => {
    const { rows } = parsePriceRows("ipad\tiPad Mini\tBattery Replacement\tFrom $120");
    expect(rows[0]).toMatchObject({ category: "ipad", brand: "iPad Mini" });
  });

  it("parses CSV rows", () => {
    const { rows } = parsePriceRows(
      "category,brand,service,price\nipad,iPad Mini,Screen Replacement,From $220",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].priceLabel).toBe("From $220");
  });

  it("keeps a comma inside a quoted CSV price label", () => {
    const { rows, issues } = parsePriceRows(
      'category,brand,service,price\nipad,iPad Mini,Screen Replacement,"From $220, fitted"',
    );
    expect(issues).toEqual([]);
    expect(rows[0].priceLabel).toBe("From $220, fitted");
  });

  it("handles escaped quotes inside a quoted field", () => {
    const { rows } = parsePriceRows(
      'category,brand,service,price\nipad,iPad Mini,Screen Replacement,"From $220 ""fitted"""',
    );
    expect(rows[0].priceLabel).toBe('From $220 "fitted"');
  });

  it("ignores blank lines and # comments, keeping real line numbers", () => {
    const { rows } = parsePriceRows("# iPad screens\n\nipad | iPad Mini | Screen Replacement | From $220\n");
    expect(rows).toHaveLength(1);
    expect(rows[0].line).toBe(3);
  });

  it("reports the line number for a row with too few columns", () => {
    const { rows, issues } = parsePriceRows(
      "ipad | iPad Mini | Screen Replacement | From $220\nipad | iPad Air",
    );
    expect(rows).toHaveLength(1);
    expect(issues).toEqual([
      { line: 2, message: "Expected 4 columns (category | brand | service | price) but found 2." },
    ]);
  });

  it("reports an empty cell rather than importing a blank value", () => {
    const { rows, issues } = parsePriceRows("ipad |  | Screen Replacement | From $220");
    expect(rows).toEqual([]);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("brand");
  });

  it("does not silently accept a price label containing the separator", () => {
    const { rows, issues } = parsePriceRows("ipad | iPad Mini | Screen | From $220 | fitted");
    expect(rows).toEqual([]);
    expect(issues[0].message).toContain("5 columns");
  });

  it("returns nothing for empty or whitespace input", () => {
    expect(parsePriceRows("")).toEqual({ rows: [], issues: [] });
    expect(parsePriceRows("   \n  \n")).toEqual({ rows: [], issues: [] });
  });

  it("strips a UTF-8 BOM so the header is still detected", () => {
    const { rows } = parsePriceRows("\uFEFFcategory | brand | service | price\nipad | iPad | Screen | From $1");
    expect(rows).toHaveLength(1);
  });

  it("parses a full iPad price block", () => {
    const block = [
      "category | brand | service | price",
      "ipad | iPad | Screen Replacement | From $220",
      "ipad | iPad Mini | Screen Replacement | From $220",
      "ipad | iPad Air | Screen Replacement | From $250",
      "ipad | iPad Pro 11 | Screen Replacement | From $280",
      "ipad | iPad Pro 12.9 | Screen Replacement | From $300",
    ].join("\n");
    const { rows, issues } = parsePriceRows(block);
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.category === "ipad")).toBe(true);
  });
});

describe("priceKey", () => {
  it("is case and whitespace insensitive", () => {
    expect(priceKey({ category: "iPad", brand: " iPad Mini ", service: "Screen Replacement" })).toBe(
      priceKey({ category: "ipad", brand: "ipad mini", service: "screen replacement" }),
    );
  });
});

describe("partitionNewRows", () => {
  const incoming = [
    { category: "ipad", brand: "iPad Pro 12.9", service: "Screen Replacement", priceLabel: "From $300" },
    { category: "ipad", brand: "iPad Mini", service: "Screen Replacement", priceLabel: "From $220" },
  ];

  it("treats everything as new against an empty list", () => {
    const { fresh, duplicates } = partitionNewRows(incoming, []);
    expect(fresh).toHaveLength(2);
    expect(duplicates).toHaveLength(0);
  });

  it("skips rows that already exist, so a re-import adds nothing", () => {
    const { fresh, duplicates } = partitionNewRows(incoming, [
      { category: "ipad", brand: "iPad Mini", service: "Screen Replacement" },
    ]);
    expect(fresh.map((r) => r.brand)).toEqual(["iPad Pro 12.9"]);
    expect(duplicates.map((r) => r.brand)).toEqual(["iPad Mini"]);
  });

  it("skips a row repeated inside one paste", () => {
    const { fresh, duplicates } = partitionNewRows(
      [incoming[0], { ...incoming[0] }, incoming[1]],
      [],
    );
    expect(fresh).toHaveLength(2);
    expect(duplicates).toHaveLength(1);
  });

  it("matches existing rows regardless of case", () => {
    const { fresh } = partitionNewRows(incoming, [
      { category: "IPAD", brand: "ipad pro 12.9", service: "screen replacement" },
    ]);
    expect(fresh.map((r) => r.brand)).toEqual(["iPad Mini"]);
  });
});
