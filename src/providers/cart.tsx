/* eslint-disable react-refresh/only-export-components -- the hook and provider
   belong together; splitting them would only add an import hop. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  CART_STORAGE_KEY,
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
  type CartProduct,
} from "@/lib/cart";

type AddResult =
  | { ok: true }
  | { ok: false; reason: "sold_out" | "max_in_cart" | "unavailable" };

type CartContextValue = {
  items: CartItem[];
  count: number;
  subtotalCents: number;
  /** Why checkout is blocked, or `null` when the cart is purchasable. */
  issue: string | null;
  add: (product: CartProduct, qty?: number) => AddResult;
  remove: (productId: number) => void;
  setQty: (productId: number, qty: number) => void;
  clear: () => void;
  /** Refresh prices/stock from the live catalogue. */
  syncProducts: (products: CartProduct[]) => void;
  qtyOf: (productId: number) => number;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function readInitialCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    return parseStoredCart(window.localStorage.getItem(CART_STORAGE_KEY));
  } catch {
    // Storage can be disabled (private browsing, permissions). An empty cart is
    // the right fallback — checkout still works, it just will not persist.
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(readInitialCart);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, serializeCart(items));
    } catch {
      // Quota or disabled storage: the in-memory cart keeps working.
    }
  }, [items]);

  // Keep two open tabs in step. The `storage` event only fires in *other*
  // tabs, so this cannot loop with the write above.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== CART_STORAGE_KEY) return;
      setItems(parseStoredCart(event.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback(
    (product: CartProduct, qty = 1): AddResult => {
      const clean = sanitiseProduct(product);
      if (!clean) return { ok: false, reason: "unavailable" };
      if (clean.stock <= 0) return { ok: false, reason: "sold_out" };

      const existing = items.find((i) => i.id === clean.id)?.qty ?? 0;
      if (existing >= maxQtyFor(clean.stock)) {
        return { ok: false, reason: "max_in_cart" };
      }

      setItems((prev) => addToCart(prev, clean, qty));
      return { ok: true };
    },
    [items],
  );

  const remove = useCallback((productId: number) => {
    setItems((prev) => removeItem(prev, productId));
  }, []);

  const setQty = useCallback((productId: number, qty: number) => {
    setItems((prev) => setItemQty(prev, productId, qty));
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    // Write through immediately: checkout clears the cart and then either
    // navigates or redirects to Stripe in the same tick, so the persistence
    // effect below may never get a chance to run before the page unloads.
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, serializeCart([]));
    } catch {
      // Non-fatal — the in-memory cart is still cleared.
    }
  }, []);

  const syncProducts = useCallback((products: CartProduct[]) => {
    setItems((prev) => syncCart(prev, products));
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      count: cartCount(items),
      subtotalCents: cartSubtotalCents(items),
      issue: cartIssue(items),
      add,
      remove,
      setQty,
      clear,
      syncProducts,
      qtyOf: (productId: number) =>
        items.find((i) => i.id === productId)?.qty ?? 0,
      isOpen,
      openCart: () => setIsOpen(true),
      closeCart: () => setIsOpen(false),
    }),
    [items, add, remove, setQty, clear, syncProducts, isOpen],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used inside <CartProvider>.");
  }
  return context;
}
