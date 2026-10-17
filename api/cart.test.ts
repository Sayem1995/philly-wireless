import { describe, expect, it } from "vitest";
import {
  addToCart,
  cartCount,
  cartIssue,
  cartSubtotalCents,
  maxQtyFor,
  parseStoredCart,
  removeItem,
  sanitiseProduct,
  serializeCart,
  setItemQty,
  syncCart,
  type CartItem,
} from "../src/lib/cart.js";
import { MAX_ITEM_QTY } from "../contracts/orders.js";

/**
 * Cart rules.
 *
 * The cart is untrusted input: it lives in localStorage and can be edited or
 * left over from an older build. These tests pin the client-side limits that
 * make the UI honest; the server re-validates everything at checkout.
 */

const item = (overrides: Partial<CartItem> = {}): CartItem => ({
  id: 7,
  name: "iPhone 15",
  price: 45_000,
  stock: 3,
  imagePath: null,
  kind: "device_refurb",
  qty: 1,
  ...overrides,
});

describe("addToCart", () => {
  it("caps a line at live stock", () => {
    const cart = addToCart([], item({ stock: 2 }), 5);
    expect(cart).toHaveLength(1);
    expect(cart[0].qty).toBe(2);
  });

  it("caps a line at the stepper maximum even with huge stock", () => {
    const cart = addToCart([], item({ stock: 10_000 }), 50);
    expect(cart[0].qty).toBe(MAX_ITEM_QTY);
    expect(maxQtyFor(10_000)).toBe(MAX_ITEM_QTY);
  });

  it("merges repeated adds instead of creating duplicate lines", () => {
    const once = addToCart([], item({ stock: 3 }));
    const twice = addToCart(once, item({ stock: 3 }));
    expect(twice).toHaveLength(1);
    expect(twice[0].qty).toBe(2);
  });

  it("does not add a sold-out product", () => {
    expect(addToCart([], item({ stock: 0 }))).toEqual([]);
  });

  it("returns the same array when already at the cap", () => {
    const full = [item({ qty: 2, stock: 2 })];
    expect(addToCart(full, item({ stock: 2 }))).toBe(full);
  });

  it("rejects a product row with nonsensical values", () => {
    expect(
      addToCart([], item({ id: -1, name: "", price: Number.NaN })),
    ).toEqual([]);
  });

  it("normalises legacy decimal prices and stock to whole units", () => {
    const product = sanitiseProduct({
      id: 11,
      name: "Legacy row",
      price: 1999.6,
      stock: 2.9,
      kind: "accessory",
      imagePath: null,
    });
    expect(product).toMatchObject({ price: 2000, stock: 2 });
  });
});

describe("setItemQty / removeItem", () => {
  it("clamps a requested quantity to stock", () => {
    const cart = setItemQty([item({ qty: 1, stock: 2 })], 7, 99);
    expect(cart[0].qty).toBe(2);
  });

  it("removes a line when its quantity reaches zero", () => {
    expect(setItemQty([item()], 7, 0)).toEqual([]);
  });

  it("removes a sold-out line rather than leaving an unbuyable quantity", () => {
    expect(setItemQty([item({ qty: 1, stock: 0 })], 7, 1)).toEqual([]);
  });

  it("is a no-op for an unknown product", () => {
    const cart = [item()];
    expect(removeItem(cart, 999)).toBe(cart);
    expect(setItemQty(cart, 999, 3)).toBe(cart);
  });
});

describe("stored cart parsing", () => {
  it("round-trips a valid cart", () => {
    const cart = [item({ qty: 2 }), item({ id: 8, name: "Case", qty: 1 })];
    expect(parseStoredCart(serializeCart(cart))).toEqual(cart);
  });

  it("rejects non-JSON, wrong versions and non-array payloads", () => {
    expect(parseStoredCart("not json")).toEqual([]);
    expect(parseStoredCart(null)).toEqual([]);
    expect(parseStoredCart(JSON.stringify({ version: 99, items: [] }))).toEqual([]);
    expect(parseStoredCart(JSON.stringify({ version: 1, items: "nope" }))).toEqual([]);
  });

  it("drops invalid rows and duplicates instead of trusting them", () => {
    const parsed = parseStoredCart(
      JSON.stringify({
        version: 1,
        items: [
          { id: 7, name: "iPhone", price: 100, stock: 2, kind: "device_new", qty: 1 },
          { id: 7, name: "iPhone duplicate", price: 100, stock: 2, kind: "device_new", qty: 1 },
          { id: -3, name: "bad", price: 100, stock: 2, kind: "device_new", qty: 1 },
          { id: 9, name: "no qty", price: 100, stock: 2, kind: "device_new" },
          { id: 10, name: "huge qty", price: 100, stock: 2, kind: "device_new", qty: 999 },
        ],
      }),
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe(7);
  });
});

describe("syncCart", () => {
  it("refreshes price/stock and drops deleted products", () => {
    const synced = syncCart(
      [item({ qty: 3 }), item({ id: 8, name: "Gone", qty: 1 })],
      [
        {
          id: 7,
          name: "iPhone 15",
          price: 42_000,
          stock: 2,
          imagePath: null,
          kind: "device_refurb",
        },
      ],
    );
    expect(synced).toHaveLength(1);
    expect(synced[0]).toMatchObject({ id: 7, price: 42_000, qty: 2 });
  });

  it("keeps a sold-out product visible so the customer can remove it", () => {
    const synced = syncCart(
      [item({ qty: 1 })],
      [
        {
          id: 7,
          name: "iPhone 15",
          price: 45_000,
          stock: 0,
          imagePath: null,
          kind: "device_refurb",
        },
      ],
    );
    expect(synced[0].stock).toBe(0);
    expect(cartIssue(synced)).toMatch(/sold out/i);
  });

  it("returns the same array when nothing changed", () => {
    const cart = [item()];
    const products = [
      {
        id: 7,
        name: "iPhone 15",
        price: 45_000,
        stock: 3,
        imagePath: null,
        kind: "device_refurb",
      },
    ];
    expect(syncCart(cart, products)).toBe(cart);
  });
});

describe("cart totals and issues", () => {
  it("sums quantities and integer cents", () => {
    const cart = [item({ qty: 2, price: 45_000 }), item({ id: 8, qty: 1, price: 2_999 })];
    expect(cartCount(cart)).toBe(3);
    expect(cartSubtotalCents(cart)).toBe(92_999);
    expect(cartIssue(cart)).toBeNull();
  });

  it("explains an empty cart", () => {
    expect(cartIssue([])).toMatch(/empty/i);
  });

  it("blocks checkout when a quantity exceeds live stock", () => {
    expect(cartIssue([item({ qty: 3, stock: 2 })])).toMatch(/only 2/i);
  });
});
