import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import {
  CheckCircle2,
  ChevronLeft,
  CreditCard,
  Loader2,
  MapPin,
  PackageCheck,
  ShoppingBag,
  Store,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import Seo from "@/components/Seo";
import { trpc } from "@/providers/trpc";
import { BRAND, STORE } from "@contracts/constants";
import {
  FULFILLMENT_LABELS,
  PAYMENT_METHOD_LABELS,
  formatCents,
  type OrderStatus,
} from "@contracts/orders";

const STATUS_LABEL: Record<OrderStatus, string> = {
  new: "Being prepared",
  ready: "Ready for pickup",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_STYLE: Record<OrderStatus, string> = {
  new: "bg-amber-100 text-amber-800",
  ready: "bg-blue-100 text-blue-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-700",
};

/**
 * Customer order page, reached from the confirmation redirect or the emailed
 * link. The unguessable token in the URL is the authorisation, exactly like a
 * receipt; no account is needed.
 */
export default function OrderConfirmation() {
  const { token = "" } = useParams();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const utils = trpc.useUtils();
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const { data: order, isLoading } = trpc.shop.orderByToken.useQuery(
    { token },
    { enabled: token.length >= 10, retry: false },
  );

  const confirm = trpc.shop.confirmOrderPayment.useMutation({
    onSuccess: (result) => {
      utils.shop.orderByToken.invalidate({ token });
      if (!result.alreadyPaid) toast.success("Payment received — thank you!");
    },
    onError: (error) => setPaymentError(error.message),
  });

  const pay = trpc.shop.payOrder.useMutation({
    onSuccess: (result) => {
      if (result.redirectUrl) {
        window.location.assign(result.redirectUrl);
        return;
      }
      utils.shop.orderByToken.invalidate({ token });
    },
    onError: (error) => toast.error(error.message),
  });

  // Verify the Stripe return exactly once. A refresh, or a webhook that has
  // already marked the order paid, is handled idempotently by the server.
  const confirmedSession = useRef<string | null>(null);
  useEffect(() => {
    if (!sessionId || !order || order.paymentStatus !== "unpaid") return;
    if (confirmedSession.current === sessionId) return;
    confirmedSession.current = sessionId;
    confirm.mutate({ token, sessionId });
  }, [sessionId, order, token, confirm]);

  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-ivory text-ink/40">
        Loading your order…
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen grid place-items-center bg-ivory px-5 text-center">
        <div>
          <h1 className="font-serif text-2xl text-ink mb-3">Order not found</h1>
          <p className="text-ink/55 text-sm mb-6 max-w-sm">
            This link may have expired or been mistyped. Call us on {STORE.phone} and we'll look it up.
          </p>
          <Link to="/" className="text-burgundy font-semibold hover:underline">
            ← Back to the website
          </Link>
        </div>
      </div>
    );
  }

  const paid = order.paymentStatus === "paid";
  const refunded = order.paymentStatus === "refunded";
  const statusLabel =
    order.status === "ready" && order.fulfillment === "delivery"
      ? "Ready for delivery"
      : STATUS_LABEL[order.status];
  const verifying = Boolean(sessionId) && !paid && !refunded && confirm.isPending;

  return (
    <section className="pt-32 pb-24 bg-gradient-to-b from-blush-light to-ivory min-h-screen">
      <Seo
        title={`Order ${order.orderNumber}`}
        description={`Your ${BRAND.name} order details, payment status and pickup information.`}
        noindex
      />
      <div className="max-w-3xl mx-auto px-5">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink/45 hover:text-burgundy transition-colors mb-6"
        >
          <ChevronLeft size={15} /> Back to the shop
        </Link>

        <div className="bg-white border border-blush rounded-3xl overflow-hidden">
          <div className="p-7 sm:p-9 border-b border-blush">
            <div
              className={`w-14 h-14 rounded-2xl grid place-items-center mb-5 ${
                paid
                  ? "bg-emerald-100 text-emerald-700"
                  : refunded
                    ? "bg-ink/10 text-ink/60"
                    : "bg-blush text-burgundy"
              }`}
            >
              {paid ? <CheckCircle2 size={28} /> : <PackageCheck size={28} />}
            </div>
            <h1 className="font-serif text-3xl md:text-4xl text-ink">
              {refunded
                ? "This order was refunded."
                : paid
                  ? "Payment received — you're all set!"
                  : "Your order is in!"}
            </h1>
            <p className="text-ink/55 mt-3 leading-relaxed max-w-xl">
              {refunded
                ? "The payment has been returned to your original method. Depending on your bank this can take a few business days."
                : paid
                  ? "Thank you — we've started getting your order ready."
                  : "We've saved your order and reserved the stock."}{" "}
              {!refunded &&
                (order.fulfillment === "pickup"
                  ? `We'll text ${order.phone} as soon as it's ready for pickup.`
                  : `We'll text ${order.phone} to arrange delivery.`)}
            </p>
            <div className="flex flex-wrap items-center gap-2.5 mt-5">
              <span className="text-[12px] font-semibold bg-ink text-ivory rounded-full px-3 py-1">
                #{order.orderNumber}
              </span>
              <span
                className={`text-[11.5px] font-medium rounded-full px-3 py-1 ${STATUS_STYLE[order.status]}`}
              >
                {statusLabel}
              </span>
              <span
                className={`text-[11.5px] font-medium rounded-full px-3 py-1 ${
                  paid
                    ? "bg-emerald-100 text-emerald-800"
                    : refunded
                      ? "bg-ink/10 text-ink/60"
                      : "bg-amber-100 text-amber-800"
                }`}
              >
                {refunded
                  ? "Refunded"
                  : paid
                    ? `Paid${order.paidAt ? ` · ${order.paidAt}` : ""}`
                    : "Payment due"}
              </span>
            </div>
            {verifying && (
              <p className="mt-5 flex items-center gap-2 text-[13px] text-ink/55">
                <Loader2 size={15} className="animate-spin text-burgundy" />
                Confirming your card payment with Stripe…
              </p>
            )}
            {paymentError && !verifying && (
              <div className="mt-5 text-[12.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 leading-relaxed">
                <p>{paymentError}</p>
                {sessionId && (
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentError(null);
                      confirm.mutate({ token, sessionId });
                    }}
                    className="mt-2 text-[12px] font-semibold text-burgundy underline underline-offset-2"
                  >
                    Check the payment again
                  </button>
                )}
              </div>
            )}
            {order.status === "cancelled" && (
              <p className="mt-5 text-[12.5px] text-ink/60 bg-blush-light border border-blush rounded-xl px-4 py-3 leading-relaxed">
                This order was cancelled
                {order.cancelledReason === "payment_expired"
                  ? " because the payment session expired"
                  : ""}
                .{" "}
                {refunded
                  ? "The payment has been refunded; the reserved stock was released."
                  : paid
                    ? "Your payment was still captured — call us and we'll refund it."
                    : "No payment is due, and the reserved stock has been released."}
              </p>
            )}
          </div>

          <div className="p-7 sm:p-9 border-b border-blush">
            <h2 className="font-serif text-xl text-ink mb-4">What you ordered</h2>
            <ul className="divide-y divide-blush/60">
              {order.lines.map((line) => (
                <li key={line.productId} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium leading-snug">{line.name}</p>
                    <p className="text-[12px] text-ink/45 mt-0.5">
                      {formatCents(line.unitCents)} × {line.qty}
                    </p>
                  </div>
                  <span className="text-[14px] font-semibold tabular-nums">
                    {formatCents(line.lineCents)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 pt-4 border-t border-blush space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink/55">Subtotal</dt>
                <dd className="font-medium tabular-nums">{formatCents(order.subtotalCents)}</dd>
              </div>
              {order.taxCents > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink/55">Sales tax</dt>
                  <dd className="font-medium tabular-nums">{formatCents(order.taxCents)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-ink/55">
                  {order.fulfillment === "pickup" ? "Pickup" : "Local delivery"}
                </dt>
                <dd className="text-emerald-700 font-medium">Free</dd>
              </div>
            </dl>
            <div className="flex items-end justify-between mt-4 pt-4 border-t-2 border-blush">
              <span className="font-serif text-lg text-ink">
                {refunded ? "Total refunded" : paid ? "Total paid" : "Total due"}
              </span>
              <span className="font-serif text-2xl text-burgundy tabular-nums">
                {formatCents(order.totalCents)}
              </span>
            </div>
          </div>

          <div className="p-7 sm:p-9 grid sm:grid-cols-2 gap-6">
            <div>
              <h3 className="text-[11px] tracking-[0.18em] uppercase text-ink/40 mb-3">
                {FULFILLMENT_LABELS[order.fulfillment]}
              </h3>
              <p className="flex items-start gap-2.5 text-sm leading-relaxed text-ink/70">
                {order.fulfillment === "pickup" ? (
                  <>
                    <MapPin size={16} className="text-burgundy mt-0.5 shrink-0" />
                    <span>
                      {STORE.address}
                      <br />
                      {STORE.city}
                    </span>
                  </>
                ) : (
                  <>
                    <Truck size={16} className="text-burgundy mt-0.5 shrink-0" />
                    <span>{order.address ?? "Address confirmed by phone"}</span>
                  </>
                )}
              </p>
              <p className="text-[12.5px] text-ink/45 mt-2.5">
                Questions? Call {STORE.phone}.
              </p>
            </div>

            <div>
              <h3 className="text-[11px] tracking-[0.18em] uppercase text-ink/40 mb-3">
                Payment
              </h3>
              <p className="flex items-center gap-2.5 text-sm text-ink/70">
                <CreditCard size={16} className="text-burgundy" />
                {PAYMENT_METHOD_LABELS[order.paymentMethod]}
              </p>
              <p className="text-[12.5px] text-ink/45 mt-2 leading-relaxed">
                {refunded
                  ? "Your payment has been refunded — nothing to do."
                  : paid
                    ? "Payment is complete — nothing to do."
                    : order.status === "cancelled"
                      ? "This order is cancelled — no payment is due."
                      : order.paymentMethod === "card_online"
                        ? "Your card payment hasn't completed yet."
                        : order.fulfillment === "pickup"
                          ? "Pay when you collect your order."
                          : "Pay when your order is delivered."}
              </p>
              {!paid &&
                !refunded &&
                order.paymentMethod === "card_online" &&
                order.status !== "cancelled" && (
                  <button
                    type="button"
                    onClick={() => pay.mutate({ token })}
                    disabled={pay.isPending}
                    className="mt-3 inline-flex items-center gap-2 bg-burgundy text-ivory text-[13px] font-semibold px-5 py-2.5 rounded-full hover:bg-burgundy-dark disabled:opacity-40 transition-colors"
                  >
                    {pay.isPending && <Loader2 size={14} className="animate-spin" />}
                    Pay now by card
                  </button>
                )}
            </div>
          </div>

          <div className="px-7 sm:px-9 pb-8">
            <div className="bg-blush-light rounded-2xl p-5 sm:p-6">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Store size={15} className="text-burgundy" /> What happens next
              </h3>
              <ol className="text-[12.5px] text-ink/60 space-y-2 leading-relaxed list-decimal list-inside">
                <li>We check and prepare your order in the shop.</li>
                <li>
                  {order.fulfillment === "pickup"
                    ? "We text you when it's ready to collect."
                    : "We text you to confirm a delivery window."}
                </li>
                <li>
                  {paid
                    ? "Bring your order number — that's it."
                    : `Pay by ${PAYMENT_METHOD_LABELS[order.paymentMethod].toLowerCase()} when you ${
                        order.fulfillment === "pickup" ? "collect" : "receive"
                      } it.`}
                </li>
              </ol>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-3 mt-7">
          <Link
            to="/devices"
            className="inline-flex items-center gap-2 bg-burgundy text-ivory text-sm font-semibold px-6 py-3 rounded-full hover:bg-burgundy-dark transition-colors"
          >
            <ShoppingBag size={15} /> Keep shopping
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="border border-burgundy/25 text-burgundy text-sm font-semibold px-6 py-3 rounded-full hover:bg-blush transition-colors"
          >
            Print this page
          </button>
        </div>
      </div>
    </section>
  );
}
