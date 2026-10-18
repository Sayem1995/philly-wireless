import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  Banknote,
  ChevronLeft,
  CreditCard,
  Loader2,
  Lock,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Store,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import Seo from "@/components/Seo";
import { useCart } from "@/providers/cart";
import { trpc } from "@/providers/trpc";
import { productImageUrl } from "@/lib/productImages";
import { STORE } from "@contracts/constants";
import {
  formatCents,
  taxFor,
  type FulfillmentMethod,
  type PaymentMethod,
} from "@contracts/orders";

const field =
  "w-full border border-ink/15 rounded-2xl px-5 py-4 text-sm bg-white focus:outline-none focus:border-burgundy transition-colors";

const cardChoice = (active: boolean) =>
  `w-full text-left p-4 rounded-2xl border transition-all duration-300 ${
    active
      ? "border-burgundy bg-blush ring-2 ring-burgundy/15"
      : "border-ink/10 bg-white hover:border-burgundy/40"
  }`;

export default function Checkout() {
  const navigate = useNavigate();
  const { items, subtotalCents, issue, clear, syncProducts } = useCart();
  const { data: options } = trpc.shop.paymentOptions.useQuery(undefined, {
    retry: false,
  });
  const { data: products } = trpc.shop.products.useQuery({});

  // A cart can sit in storage for days. Refresh prices/stock here too, so the
  // estimate shown beside the form matches what the server will charge.
  useEffect(() => {
    if (products) syncProducts(products);
  }, [products, syncProducts]);
  const onlineCard = options?.onlineCard ?? false;
  const taxPercent = options?.taxPercent ?? 0;
  const taxCents = taxFor(subtotalCents, taxPercent);
  const totalCents = subtotalCents + taxCents;

  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", notes: "" });
  const [fulfillment, setFulfillment] = useState<FulfillmentMethod>("pickup");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card_in_store");
  const [placed, setPlaced] = useState(false);

  /**
   * One key per checkout attempt. If the request times out after the server
   * created the order, clicking "Place order" again returns that same order
   * instead of reserving stock (or creating a second Stripe session) twice.
   */
  const idempotencyRef = useRef<string | null>(null);
  const checkoutKey = () => {
    if (!idempotencyRef.current) {
      idempotencyRef.current =
        globalThis.crypto?.randomUUID?.() ??
        `ord_${Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")}`;
    }
    return idempotencyRef.current;
  };

  const create = trpc.shop.createOrder.useMutation({
    onSuccess: (result) => {
      setPlaced(true);
      clear();
      if (result.redirectUrl) {
        window.location.assign(result.redirectUrl);
        return;
      }
      navigate(`/order/${result.token}`);
    },
    onError: (error) => toast.error(error.message),
  });

  const paymentChoices = useMemo(() => {
    const choices: Array<{
      value: PaymentMethod;
      icon: typeof CreditCard;
      label: string;
      note: string;
    }> = [];
    if (onlineCard) {
      choices.push({
        value: "card_online",
        icon: CreditCard,
        label: "Pay online by card",
        note: "Secure Stripe checkout. We start getting it ready as soon as payment clears.",
      });
    }
    choices.push({
      value: "card_in_store",
      icon: CreditCard,
      label: fulfillment === "pickup" ? "Pay by card at pickup" : "Pay by card on delivery",
      note: "Nothing is charged today — pay when you collect.",
    });
    choices.push({
      value: "cash",
      icon: Banknote,
      label: fulfillment === "pickup" ? "Cash at pickup" : "Cash on delivery",
      note: "Pay in person when you get your order.",
    });
    choices.push({
      value: "zelle",
      icon: Smartphone,
      label: "Zelle",
      note: "We'll text you the Zelle details — your order is held until it clears.",
    });
    return choices;
  }, [fulfillment, onlineCard]);

  const phoneDigits = form.phone.replace(/\D/g, "");
  const emailOk =
    form.email.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  const addressOk = fulfillment === "pickup" || form.address.trim().length >= 6;
  const canSubmit =
    items.length > 0 &&
    !issue &&
    form.name.trim().length >= 2 &&
    phoneDigits.length >= 10 &&
    emailOk &&
    addressOk &&
    !create.isPending;

  // Keep the chosen method valid when online card is unavailable.
  const effectivePayment: PaymentMethod =
    paymentMethod === "card_online" && !onlineCard ? "card_in_store" : paymentMethod;

  const submit = () => {
    if (!canSubmit) return;
    create.mutate({
      items: items.map((i) => ({ productId: i.id, qty: i.qty })),
      customerName: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      fulfillment,
      address: fulfillment === "delivery" ? form.address.trim() : undefined,
      notes: form.notes.trim() || undefined,
      paymentMethod: effectivePayment,
      idempotencyKey: checkoutKey(),
      // Reject if a price/tax change means the server total differs from the
      // total shown on this page. Omit it if the tax config never loaded, so a
      // transient query failure cannot block an otherwise valid order.
      expectedTotalCents: options ? totalCents : undefined,
    });
  };

  if (items.length === 0 && !placed) {
    return (
      <>
        <Seo title="Checkout" noindex />
        <section className="pt-36 pb-24 max-w-2xl mx-auto px-5 text-center">
          <span className="w-20 h-20 rounded-3xl bg-blush grid place-items-center mx-auto mb-6">
            <ShoppingBag size={32} className="text-burgundy/60" />
          </span>
          <h1 className="font-serif text-3xl text-ink mb-3">Your cart is empty</h1>
          <p className="text-ink/55 text-sm mb-8">
            Add a device or accessory before checking out.
          </p>
          <Link
            to="/devices"
            className="bg-burgundy text-ivory text-sm font-semibold px-7 py-3.5 rounded-full hover:bg-burgundy-dark transition-colors"
          >
            Shop devices
          </Link>
        </section>
      </>
    );
  }

  return (
    <>
      <Seo
        title="Checkout"
        description="Check out securely: choose in-store pickup or local delivery, then pay online by card or in store."
        noindex
      />
      <section className="pt-32 pb-10 bg-gradient-to-b from-blush-light to-ivory">
        <div className="max-w-6xl mx-auto px-5">
          <Link
            to="/cart"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink/45 hover:text-burgundy transition-colors mb-5"
          >
            <ChevronLeft size={15} /> Back to cart
          </Link>
          <h1 className="font-serif text-4xl md:text-5xl text-ink">Checkout</h1>
          <p className="mt-3 text-ink/55">
            Two minutes, no account needed. We'll text you when it's ready.
          </p>
        </div>
      </section>

      <section className="pb-24 max-w-6xl mx-auto px-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="grid lg:grid-cols-[1.5fr_1fr] gap-8 items-start"
        >
          <div className="space-y-6">
            {/* contact */}
            <div className="bg-white border border-blush rounded-3xl p-6 sm:p-8">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-serif text-2xl text-ink">1. Contact</h2>
                <span className="text-[11px] uppercase tracking-[0.15em] text-ink/35">
                  So we can reach you
                </span>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <input
                  className={field}
                  placeholder="Full name *"
                  aria-label="Full name"
                  autoComplete="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
                <input
                  className={field}
                  placeholder="Phone number *"
                  aria-label="Phone number"
                  type="tel"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  required
                />
                <input
                  className={`${field} sm:col-span-2`}
                  placeholder="Email (for your confirmation)"
                  aria-label="Email for order confirmation"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              {phoneDigits.length > 0 && phoneDigits.length < 10 && (
                <p className="text-[12px] text-amber-700 mt-2">
                  Enter a 10-digit phone number so we can text your pickup.
                </p>
              )}
            </div>

            {/* fulfilment */}
            <div className="bg-white border border-blush rounded-3xl p-6 sm:p-8">
              <h2 className="font-serif text-2xl text-ink mb-5">2. Pickup or delivery</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFulfillment("pickup")}
                  aria-pressed={fulfillment === "pickup"}
                  className={cardChoice(fulfillment === "pickup")}
                >
                  <span className="flex items-center gap-2.5 font-semibold text-[15px]">
                    <Store size={18} className="text-burgundy" /> In-store pickup
                  </span>
                  <span className="block text-[12.5px] text-ink/50 mt-1.5 leading-relaxed">
                    {STORE.address}, {STORE.city}
                  </span>
                  <span className="block text-[12px] text-emerald-700 font-medium mt-1">Free</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFulfillment("delivery")}
                  aria-pressed={fulfillment === "delivery"}
                  className={cardChoice(fulfillment === "delivery")}
                >
                  <span className="flex items-center gap-2.5 font-semibold text-[15px]">
                    <Truck size={18} className="text-burgundy" /> Local delivery
                  </span>
                  <span className="block text-[12.5px] text-ink/50 mt-1.5 leading-relaxed">
                    Same-day or next-day in the Philadelphia area
                  </span>
                  <span className="block text-[12px] text-emerald-700 font-medium mt-1">Free</span>
                </button>
              </div>

              {fulfillment === "delivery" && (
                <textarea
                  className={`${field} mt-4 resize-none`}
                  rows={3}
                  placeholder="Delivery address — street, city, ZIP *"
                  aria-label="Delivery address"
                  autoComplete="street-address"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  required
                />
              )}
            </div>

            {/* payment */}
            <div className="bg-white border border-blush rounded-3xl p-6 sm:p-8">
              <div className="flex items-center gap-2.5 mb-1">
                <h2 className="font-serif text-2xl text-ink">3. Payment</h2>
                <Lock size={15} className="text-ink/30" />
              </div>
              <p className="text-[12.5px] text-ink/45 mb-5">
                Card details are only entered on Stripe's secure page — never on this site.
              </p>
              <div className="space-y-2.5">
                {paymentChoices.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    onClick={() => setPaymentMethod(choice.value)}
                    aria-pressed={effectivePayment === choice.value}
                    className={cardChoice(effectivePayment === choice.value)}
                  >
                    <span className="flex items-start gap-3">
                      <choice.icon size={18} className="text-burgundy mt-0.5 shrink-0" />
                      <span>
                        <span className="block font-semibold text-[14.5px]">{choice.label}</span>
                        <span className="block text-[12.5px] text-ink/50 mt-1 leading-relaxed">
                          {choice.note}
                        </span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              {!onlineCard && (
                <p className="mt-4 text-[12px] text-ink/45 bg-blush-light border border-blush rounded-xl px-4 py-3 leading-relaxed">
                  Online card payment isn't enabled on this site yet. Choose pay in store, or
                  call {STORE.phone} and we'll take payment over the phone.
                </p>
              )}
            </div>

            {/* notes */}
            <div className="bg-white border border-blush rounded-3xl p-6 sm:p-8">
              <h2 className="font-serif text-2xl text-ink mb-4">Anything we should know?</h2>
              <textarea
                className={`${field} resize-none`}
                rows={3}
                aria-label="Order notes"
                placeholder="Optional — a preferred pickup time, a colour preference, a gate code…"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>

          {/* summary */}
          <aside className="bg-white border border-blush rounded-3xl p-6 sm:p-7 lg:sticky lg:top-28">
            <h2 className="font-serif text-2xl text-ink mb-5">Your order</h2>
            <ul className="space-y-3.5 max-h-64 overflow-y-auto pr-1">
              {items.map((item) => {
                const imageUrl = productImageUrl(item);
                return (
                  <li key={item.id} className="flex items-center gap-3">
                    <div className="w-11 h-11 shrink-0 rounded-lg border border-blush bg-blush-light overflow-hidden grid place-items-center">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ShoppingBag size={16} className="text-burgundy/40" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium leading-snug truncate">{item.name}</p>
                      <p className="text-[11.5px] text-ink/45">Qty {item.qty}</p>
                    </div>
                    <span className="text-[13px] font-semibold tabular-nums">
                      {formatCents(item.price * item.qty)}
                    </span>
                  </li>
                );
              })}
            </ul>

            <dl className="mt-5 pt-5 border-t border-blush space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink/55">Subtotal</dt>
                <dd className="font-medium tabular-nums">{formatCents(subtotalCents)}</dd>
              </div>
              {taxPercent > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink/55">Sales tax ({taxPercent}%)</dt>
                  <dd className="font-medium tabular-nums">{formatCents(taxCents)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-ink/55">
                  {fulfillment === "pickup" ? "Pickup" : "Local delivery"}
                </dt>
                <dd className="text-emerald-700 font-medium">Free</dd>
              </div>
            </dl>

            <div className="mt-5 pt-5 border-t border-blush flex items-end justify-between">
              <span className="font-serif text-lg text-ink">Total</span>
              <span className="font-serif text-2xl text-burgundy tabular-nums">
                {formatCents(totalCents)}
              </span>
            </div>

            {issue && (
              <p className="mt-4 text-[12.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5 leading-relaxed">
                {issue} <Link to="/cart" className="underline underline-offset-2">Fix in cart</Link>
              </p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-5 w-full flex items-center justify-center gap-2 bg-burgundy text-ivory font-semibold px-6 py-4 rounded-full hover:bg-burgundy-dark hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0 disabled:cursor-not-allowed transition-all duration-300"
            >
              {create.isPending && <Loader2 size={16} className="animate-spin" />}
              {create.isPending
                ? "Placing order…"
                : effectivePayment === "card_online"
                  ? "Continue to card payment"
                  : "Place order"}
            </button>

            <div className="mt-5 space-y-2.5 text-[11.5px] text-ink/45">
              <p className="flex items-start gap-2">
                <ShieldCheck size={14} className="text-burgundy/60 mt-0.5 shrink-0" />
                Every refurbished device includes a 1-year store warranty.
              </p>
              <p className="flex items-start gap-2">
                <Lock size={14} className="text-burgundy/60 mt-0.5 shrink-0" />
                {effectivePayment === "card_online"
                  ? "Payment is processed by Stripe. We never see your card number."
                  : "No card details needed now — pay when you collect."}
              </p>
            </div>
          </aside>
        </form>
      </section>
    </>
  );
}
