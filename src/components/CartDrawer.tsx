import { Link } from "react-router";
import { ShoppingBag, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import QtyStepper from "@/components/QtyStepper";
import { useCart } from "@/providers/cart";
import { maxQtyFor } from "@/lib/cart";
import { productImageUrl } from "@/lib/productImages";
import { formatCents } from "@contracts/orders";

/** Slide-over cart, opened from the navbar or after an "add to cart". */
export default function CartDrawer() {
  const { items, count, subtotalCents, issue, isOpen, closeCart, remove, setQty } = useCart();

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) closeCart();
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-md bg-ivory p-0 gap-0">
        <SheetHeader className="px-6 pt-6 pb-4 pr-12 border-b border-blush">
          <SheetTitle className="font-serif text-2xl text-ink flex items-center gap-2.5">
            <ShoppingBag size={19} className="text-burgundy" />
            Your cart
            {count > 0 && (
              <span className="text-[11px] font-sans font-semibold bg-burgundy text-ivory rounded-full px-2 py-0.5">
                {count}
              </span>
            )}
          </SheetTitle>
          <SheetDescription className="text-ink/50 text-[13px]">
            {items.length === 0
              ? "Nothing here yet — add a device or accessory to get started."
              : "Reserve it online now, then pay online or when you pick it up."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6">
          {items.length === 0 ? (
            <div className="py-14 text-center">
              <span className="w-16 h-16 rounded-2xl bg-blush grid place-items-center mx-auto mb-5">
                <ShoppingBag size={26} className="text-burgundy/60" />
              </span>
              <p className="font-serif text-xl text-ink mb-2">Your cart is empty</p>
              <p className="text-[13px] text-ink/50 mb-6 max-w-[240px] mx-auto leading-relaxed">
                Certified refurbished phones, new devices and accessories — all backed by the shop.
              </p>
              <div className="flex flex-col gap-2.5 max-w-[240px] mx-auto">
                <Link
                  to="/devices"
                  onClick={closeCart}
                  className="bg-burgundy text-ivory text-sm font-semibold px-6 py-3 rounded-full hover:bg-burgundy-dark transition-colors"
                >
                  Shop devices
                </Link>
                <Link
                  to="/accessories"
                  onClick={closeCart}
                  className="border border-burgundy/25 text-burgundy text-sm font-semibold px-6 py-3 rounded-full hover:bg-blush transition-colors"
                >
                  Browse accessories
                </Link>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-blush/60">
              {items.map((item) => {
                const imageUrl = productImageUrl(item);
                return (
                  <li key={item.id} className="py-4 flex gap-3">
                    <div className="w-16 h-16 shrink-0 rounded-xl border border-blush bg-white overflow-hidden grid place-items-center">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={item.name}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ShoppingBag size={20} className="text-burgundy/40" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-semibold leading-snug">{item.name}</p>
                      <p className="text-[11.5px] text-ink/45 mt-0.5">
                        {formatCents(item.price)} each
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <QtyStepper
                          qty={item.qty}
                          max={maxQtyFor(item.stock)}
                          onChange={(qty) => setQty(item.id, qty)}
                          disabled={item.stock <= 0}
                        />
                        <span className="text-sm font-semibold text-burgundy tabular-nums">
                          {formatCents(item.price * item.qty)}
                        </span>
                      </div>
                      {item.stock <= 0 && (
                        <p className="text-[11px] text-red-600 mt-1.5">
                          Sold out — remove it to continue.
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(item.id)}
                      aria-label={`Remove ${item.name} from cart`}
                      className="self-start p-1.5 text-ink/30 hover:text-red-600 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-blush px-6 py-5 space-y-3 bg-ivory">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink/55">Subtotal</span>
              <span className="font-serif text-xl text-ink tabular-nums">
                {formatCents(subtotalCents)}
              </span>
            </div>
            <p className="text-[11.5px] text-ink/45 leading-relaxed">
              Tax, pickup and payment are confirmed at checkout.
            </p>
            {issue && (
              <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5 leading-relaxed">
                {issue}
              </p>
            )}
            <Link
              to="/checkout"
              onClick={closeCart}
              aria-disabled={issue ? true : undefined}
              className={`block text-center text-sm font-semibold px-6 py-3.5 rounded-full transition-colors ${
                issue
                  ? "bg-ink/10 text-ink/40 pointer-events-none"
                  : "bg-burgundy text-ivory hover:bg-burgundy-dark"
              }`}
            >
              Checkout
            </Link>
            <Link
              to="/cart"
              onClick={closeCart}
              className="block text-center text-[13px] font-medium text-ink/50 hover:text-burgundy transition-colors"
            >
              View full cart
            </Link>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
