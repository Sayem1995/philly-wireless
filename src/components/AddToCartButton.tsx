import { useEffect, useState } from "react";
import { Check, ShoppingBag, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/providers/cart";
import { cn } from "@/lib/utils";
import type { CartProduct } from "@/lib/cart";

/**
 * Adds a catalogue product to the cart.
 *
 * Stock is enforced here for immediate feedback (and again, authoritatively, on
 * the server at checkout). Opening the drawer after a successful add makes the
 * result obvious and gives the customer a one-click route to checkout.
 */
export default function AddToCartButton({
  product,
  className,
  tone = "solid",
}: {
  product: CartProduct;
  className?: string;
  /** `solid` for a primary call to action, `outline` for secondary cards. */
  tone?: "solid" | "outline";
}) {
  const { add, openCart, qtyOf } = useCart();
  const [flash, setFlash] = useState(false);
  const inCart = qtyOf(product.id);
  const soldOut = product.stock <= 0;

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(false), 1600);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const onClick = () => {
    const result = add(product);
    if (!result.ok) {
      if (result.reason === "max_in_cart") {
        toast.info(
          `You already have all ${product.stock} we have in your cart.`,
        );
      } else if (result.reason === "sold_out") {
        toast.error("That item is sold out — call the shop and we'll check the next delivery.");
      } else {
        toast.error("That item is no longer available.");
      }
      return;
    }
    setFlash(true);
    openCart();
    toast.success(`${product.name} added to cart`);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={soldOut}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold px-6 py-3 transition-all duration-300",
        soldOut
          ? "bg-ink/10 text-ink/40 cursor-not-allowed"
          : tone === "solid"
            ? "bg-burgundy text-ivory hover:bg-burgundy-dark hover:-translate-y-0.5 hover:shadow-lg hover:shadow-burgundy/20"
            : "border border-burgundy/25 text-burgundy hover:bg-burgundy hover:text-ivory",
        className,
      )}
    >
      {soldOut ? (
        "Sold out"
      ) : flash ? (
        <>
          <Check size={16} /> Added
        </>
      ) : (
        <>
          {tone === "solid" ? <ShoppingBag size={16} /> : <ShoppingCart size={15} />}
          {inCart > 0 ? `Add another · ${inCart} in cart` : "Add to cart"}
        </>
      )}
    </button>
  );
}
