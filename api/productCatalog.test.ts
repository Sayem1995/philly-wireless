import { describe, expect, it } from "vitest";
import { filterProducts, sortProducts } from "../src/lib/productCatalog";

const products = [
  { name: "Phone Cases", description: "Slim and rugged", subcategory: "Cases", price: 1999 },
  { name: "MagSafe Charger", description: "15W wireless", subcategory: "Chargers", price: 3499 },
  { name: "USB-C Cable", description: "Braided 2m", subcategory: "Cables", price: 1299 },
];

describe("catalogue search", () => {
  it("matches name, description and subcategory case-insensitively", () => {
    expect(filterProducts(products, "magsafe").map((p) => p.name)).toEqual(["MagSafe Charger"]);
    expect(filterProducts(products, "braided").map((p) => p.name)).toEqual(["USB-C Cable"]);
    expect(filterProducts(products, "cases").map((p) => p.name)).toEqual(["Phone Cases"]);
  });

  it("returns an independent copy for a blank query", () => {
    const result = filterProducts(products, "   ");
    expect(result).toEqual(products);
    expect(result).not.toBe(products);
  });
});

describe("catalogue sort", () => {
  it("sorts by price and name without mutating the source", () => {
    expect(sortProducts(products, "price-asc").map((p) => p.price)).toEqual([1299, 1999, 3499]);
    expect(sortProducts(products, "price-desc").map((p) => p.price)).toEqual([3499, 1999, 1299]);
    expect(sortProducts(products, "name").map((p) => p.name)).toEqual([
      "MagSafe Charger",
      "Phone Cases",
      "USB-C Cable",
    ]);
    expect(products.map((p) => p.name)).toEqual(["Phone Cases", "MagSafe Charger", "USB-C Cable"]);
  });

  it("preserves the featured order", () => {
    expect(sortProducts(products, "featured").map((p) => p.name)).toEqual(products.map((p) => p.name));
  });
});
