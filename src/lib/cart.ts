/**
 * Cart state, without React or the DOM.
 *
 * The cart lives in `localStorage` so it survives a refresh and a customer can
 * close the tab and come back. Everything in here is pure and defensive: a
 * value from storage is untrusted input (it can be edited by hand or left over
 * from an older build), so it is validated field by field before it is allowed
 * back into the UI.
 *
 * PRICES IN THE CART ARE DISPLAY ONLY. `shop.createOrder` re-reads every
 * product from Firestore and recomputes the subtotal, tax and total, so a
 * tampered storage value can never change what is actually charged.
 */

// Relative (with the NodeNext `.js` spelling) rather than the `@contracts`
// alias: `api/**` tests import this module, and the server TypeScript project
// has no bundler-style path mapping.
import { MAX_ITEM_QTY } from "../../contracts/orders.js";

export const CART_STORAGE_KEY = "ppr-cart-v1";
export const CART_STORAGE_VERSION = 1;

/** The product fields the cart needs. Matches `shop.products` (a subset). */
export type CartProduct = {
  id: number;
  name: string;
  /** Cents. */
  price: number;
  stock: number;
  imagePath: string | null;
  kind: string;
};

export type CartItem = CartProduct & { qty: number };

const MAX_CART_LINES = 100;
const MAX_NAME_LENGTH = 200;

function wholeNumber(value: unknown, { min, max }: { min: number; max: number }): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

/** `null` for no image; a non-empty string id otherwise. */
function imagePath(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 128) : null;
}

/** A trustworthy product, or `null` when a field cannot be believed. */
export function sanitiseProduct(value: unknown): CartProduct | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = wholeNumber(row.id, { min: 1, max: Number.MAX_SAFE_INTEGER });
  const name = text(row.name, MAX_NAME_LENGTH);
  const kind = text(row.kind, 40) ?? "accessory";
  if (id === null || !name) return null;

  // Cents are integers. Legacy catalogue rows may hold a decimal price or a
  // fractional stock count; normalise instead of dropping the product so the
  // cart and the server agree on whole cents and whole units.
  const rawPrice = Number(row.price);
  const rawStock = Number(row.stock);
  if (!Number.isFinite(rawPrice) || rawPrice < 0 || rawPrice > 100_000_000) {
    return null;
  }
  if (!Number.isFinite(rawStock) || rawStock < 0 || rawStock > 1_000_000) {
    return null;
  }
  return {
    id,
    name,
    price: Math.round(rawPrice),
    stock: Math.floor(rawStock),
    imagePath: imagePath(row.imagePath),
    kind,
  };
}

/** The most this line may hold, given the live stock and the stepper cap. */
export function maxQtyFor(stock: number): number {
  return Math.max(0, Math.min(MAX_ITEM_QTY, Math.floor(stock)));
}

/**
 * Add a product (or another unit of one already in the cart).
 *
 * Returns the same array instance when nothing changed so callers can skip a
 * needless re-render / storage write.
 */
export function addToCart(items: CartItem[], product: CartProduct, qty = 1): CartItem[] {
  const clean = sanitiseProduct(product);
  if (!clean) return items;
  const wanted = Math.max(1, Math.floor(qty));
  const existing = items.find((i) => i.id === clean.id);
  const cap = maxQtyFor(clean.stock);
  if (cap <= 0) return items;

  const nextQty = Math.min(cap, (existing?.qty ?? 0) + wanted);
  if (existing && nextQty === existing.qty) return items;

  if (existing) {
    return items.map((i) =>
      i.id === clean.id ? { ...clean, qty: nextQty } : i,
    );
  }
  return [...items, { ...clean, qty: nextQty }];
}

/** Set an exact quantity. `0` (or less) removes the line. */
export function setItemQty(items: CartItem[], productId: number, qty: number): CartItem[] {
  const line = items.find((i) => i.id === productId);
  if (!line) return items;
  if (!Number.isFinite(qty) || qty <= 0) return removeItem(items, productId);

  const cap = maxQtyFor(line.stock);
  if (cap <= 0) return removeItem(items, productId);
  const next = Math.min(cap, Math.floor(qty));
  if (next === line.qty) return items;
  return items.map((i) => (i.id === productId ? { ...i, qty: next } : i));
}

export function removeItem(items: CartItem[], productId: number): CartItem[] {
  if (!items.some((i) => i.id === productId)) return items;
  return items.filter((i) => i.id !== productId);
}

/** Total units, for the navbar badge. */
export function cartCount(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.qty, 0);
}

export function cartSubtotalCents(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.price * i.qty, 0);
}

/**
 * Apply the live catalogue to the stored cart: refresh names/prices/stock, drop
 * products the shop no longer sells. Prices shown here are an estimate — the
 * server is authoritative at checkout.
 */
export function syncCart(items: CartItem[], products: CartProduct[]): CartItem[] {
  const byId = new Map(products.map((p) => [p.id, sanitiseProduct(p)]));
  let changed = false;
  const next: CartItem[] = [];

  for (const item of items) {
    const live = byId.get(item.id);
    if (!live) {
      changed = true;
      continue;
    }
    const qty = live.stock > 0 ? Math.min(item.qty, maxQtyFor(live.stock)) : item.qty;
    if (qty <= 0) {
      changed = true;
      continue;
    }
    const merged: CartItem = { ...live, qty };
    if (
      merged.name !== item.name ||
      merged.price !== item.price ||
      merged.stock !== item.stock ||
      merged.imagePath !== item.imagePath ||
      merged.kind !== item.kind ||
      merged.qty !== item.qty
    ) {
      changed = true;
    }
    next.push(merged);
  }

  return changed ? next : items;
}

/**
 * Why the cart cannot be checked out right now, or `null` when it can.
 * Used to disable the checkout button with a concrete reason.
 */
export function cartIssue(items: CartItem[]): string | null {
  if (items.length === 0) return "Your cart is empty.";
  for (const item of items) {
    if (item.stock <= 0) return `${item.name} is sold out — remove it to continue.`;
    if (item.qty > item.stock) {
      return `Only ${item.stock} of ${item.name} left — reduce the quantity to continue.`;
    }
  }
  return null;
}

/** Parse a raw `localStorage` value. Always returns a usable array. */
export function parseStoredCart(raw: string | null): CartItem[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const state = parsed as Record<string, unknown>;
  if (state.version !== CART_STORAGE_VERSION) return [];
  if (!Array.isArray(state.items)) return [];

  const seen = new Set<number>();
  const out: CartItem[] = [];
  for (const entry of state.items.slice(0, MAX_CART_LINES)) {
    const product = sanitiseProduct(entry);
    if (!product || seen.has(product.id)) continue;
    const qty = wholeNumber((entry as Record<string, unknown>).qty, {
      min: 1,
      max: MAX_ITEM_QTY,
    });
    if (qty === null) continue;
    seen.add(product.id);
    out.push({ ...product, qty });
  }
  return out;
}

export function serializeCart(items: CartItem[]): string {
  return JSON.stringify({ version: CART_STORAGE_VERSION, items });
}
