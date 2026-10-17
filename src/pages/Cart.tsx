import { useEffect } from "react";
import { Link } from "react-router";
import { ArrowRight, ShoppingBag, Trash2 } from "lucide-react";
import Seo from "@/components/Seo";
import Reveal from "@/components/Reveal";
import QtyStepper from "@/components/QtyStepper";
import { useCart } from "@/providers/cart";
import { maxQtyFor } from "@/lib/cart";
import { productImageUrl } from "@/lib/productImages";
import { trpc } from "@/providers/trpc";
import { formatCents, taxFor } from "@contracts/orders";

/**
 * Full-page cart. The drawer handles quick edits; this page is where a
 * customer reviews a larger order before checking out.
 */
export default function Cart() {
  const { items, count, subtotalCents, issue, remove, setQty, syncProducts } = useCart();
  const { data: products } = trpc.shop.products.useQuery({});
  const { data: options } = trpc.shop.paymentOptions.useQuery(undefined, {
    retry: false,
  });

  // Prices and stock can change while the cart sits in localStorage; refreshing
  // from the live catalogue keeps the estimate honest and drops deleted items.
  useEffect(() => {
    if (products) syncProducts(products);
  }, [products, syncProducts]);

  const taxPercent = options?.taxPercent ?? 0;
  const taxCents = taxFor(subtotalCents, taxPercent);
  const totalCents = subtotalCents + taxCents;

  return (
    <>
      <Seo
        title="Your Cart"
        description="Review the devices and accessories in your cart, then check out for in-store pickup or local delivery."
      />
      <section className="pt-36 pb-10 bg-gradient-to-b from-blush-light to-ivory">
        <div className="max-w-6xl mx-auto px-5">
          <p className="text-xs tracking-[0.35em] uppercase text-burgundy font-semibold mb-4">
            Your cart
          </p>
          <h1 className="font-serif text-4xl md:text-5xl text-ink">
            {count === 0 ? "Nothing in your cart yet." : `${count} item${count === 1 ? "" : "s"} ready to go.`}
          </h1>
          <p className="mt-4 text-ink/55 max-w-xl">
            Pick up in the shop or have it delivered locally. Pay online by card, or when you collect.
          </p>
        </div>
      </section>

      <section className="pb-24 max-w-6xl mx-auto px-5">
        {items.length === 0 ? (
          <Reveal className="bg-white border border-blush rounded-3xl p-10 md:p-16 text-center">
            <span className="w-20 h-20 rounded-3xl bg-blush grid place-items-center mx-auto mb-6">
              <ShoppingBag size={32} className="text-burgundy/60" />
            </span>
            <h2 className="font-serif text-2xl text-ink mb-3">Start with a device or an accessory</h2>
            <p className="text-ink/55 text-sm max-w-md mx-auto leading-relaxed mb-8">
              Every refurbished phone passes a 40-point inspection and includes a 1-year store warranty.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                to="/devices"
                className="bg-burgundy text-ivory text-sm font-semibold px-7 py-3.5 rounded-full hover:bg-burgundy-dark transition-colors"
              >
                Shop devices
              </Link>
              <Link
                to="/accessories"
                className="border border-burgundy/25 text-burgundy text-sm font-semibold px-7 py-3.5 rounded-full hover:bg-blush transition-colors"
              >
                Browse accessories
              </Link>
            </div>
          </Reveal>
        ) : (
          <div className="grid lg:grid-cols-[1.6fr_1fr] gap-8 items-start">
            <Reveal className="bg-white border border-blush rounded-3xl overflow-hidden">
              <ul className="divide-y divide-blush/60">
                {items.map((item) => {
                  const imageUrl = productImageUrl(item);
                  return (
                    <li key={item.id} className="p-5 sm:p-6 flex gap-4">
                      <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-2xl border border-blush bg-blush-light overflow-hidden grid place-items-center">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={item.name}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ShoppingBag size={24} className="text-burgundy/40" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-[15px] leading-snug">{item.name}</p>
                            <p className="text-[12px] text-ink/45 mt-1">
                              {formatCents(item.price)} each
                              {item.stock > 0 && item.stock <= 3 && (
                                <span className="text-amber-700"> · only {item.stock} left</span>
                              )}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => remove(item.id)}
                            aria-label={`Remove ${item.name} from cart`}
                            className="p-1.5 text-ink/30 hover:text-red-600 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        {item.stock <= 0 ? (
                          <p className="text-[12px] text-red-600 mt-2">
                            Sold out — remove it to continue.
                          </p>
                        ) : (
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <QtyStepper
                              qty={item.qty}
                              max={maxQtyFor(item.stock)}
                              onChange={(qty) => setQty(item.id, qty)}
                            />
                            <span className="font-semibold text-burgundy tabular-nums">
                              {formatCents(item.price * item.qty)}
                            </span>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Reveal>

            <Reveal className="bg-white border border-blush rounded-3xl p-6 sm:p-7 lg:sticky lg:top-28">
              <h2 className="font-serif text-2xl text-ink mb-5">Order summary</h2>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink/55">Subtotal</dt>
                  <dd className="font-medium tabular-nums">{formatCents(subtotalCents)}</dd>
                </div>
                {taxPercent > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-ink/55">Sales tax ({taxPercent}%)</dt>
                    <dd className="font-medium tabular-nums">{formatCents(taxCents)}</dd>
                  </div>
                ) : (
                  <div className="flex justify-between gap-6">
                    <dt className="text-ink/55">Sales tax</dt>
                    <dd className="text-ink/45 text-right text-[12.5px]">
                      Confirmed by the shop
                    </dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-ink/55">Pickup / local delivery</dt>
                  <dd className="text-emerald-700 font-medium">Free</dd>
                </div>
              </dl>

              <div className="border-t border-blush mt-5 pt-5 flex items-end justify-between">
                <span className="font-serif text-lg text-ink">Estimated total</span>
                <span className="font-serif text-2xl text-burgundy tabular-nums">
                  {formatCents(totalCents)}
                </span>
              </div>

              {issue && (
                <p className="mt-4 text-[12.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5 leading-relaxed">
                  {issue}
                </p>
              )}

              <Link
                to="/checkout"
                aria-disabled={issue ? true : undefined}
                className={`mt-5 flex items-center justify-center gap-2 text-sm font-semibold px-6 py-4 rounded-full transition-all duration-300 ${
                  issue
                    ? "bg-ink/10 text-ink/40 pointer-events-none"
                    : "bg-burgundy text-ivory hover:bg-burgundy-dark hover:-translate-y-0.5"
                }`}
              >
                Continue to checkout <ArrowRight size={16} />
              </Link>
              <Link
                to="/devices"
                className="mt-3 block text-center text-[13px] font-medium text-ink/50 hover:text-burgundy transition-colors"
              >
                Keep shopping
              </Link>
              <p className="mt-4 text-[11.5px] text-ink/40 leading-relaxed">
                Final tax (if applicable) and availability are confirmed by the shop before you pay in store.
              </p>
            </Reveal>
          </div>
        )}
      </section>
    </>
  );
}
