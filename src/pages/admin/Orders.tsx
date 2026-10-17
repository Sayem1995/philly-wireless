import { useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/providers/trpc";
import type { AppRouter } from "../../../server/router";
import { toast } from "sonner";
import { Check, RefreshCw, Search, Trash2, X } from "lucide-react";
import { Link } from "react-router";
import {
  FULFILLMENT_LABELS,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  canTransitionOrderStatus,
  formatCents,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
} from "@contracts/orders";

type AdminOrder = inferRouterOutputs<AppRouter>["admin"]["orders"][number];

const STATUS_COLORS: Record<OrderStatus, string> = {
  new: "bg-amber-100 text-amber-800",
  ready: "bg-blue-100 text-blue-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-700",
};

const PAYMENT_COLORS: Record<PaymentStatus, string> = {
  unpaid: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  refunded: "bg-ink/10 text-ink/60",
};

const input =
  "border border-ink/15 rounded-xl px-3.5 py-2.5 text-sm bg-ivory focus:outline-none focus:border-burgundy w-full";

type Draft = {
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  staffNotes: string;
};

type SaveInput = { id: number } & Partial<Draft> & { paymentStatus?: PaymentStatus };

/** Slide-over detail panel. Mounted with `key={order.id}` so its draft state
 *  always starts from the order that was opened. */
function OrderDrawer({
  order,
  onClose,
  onSave,
  onDelete,
  onRefund,
  saving,
  deleting,
  refunding,
}: {
  order: AdminOrder;
  onClose: () => void;
  onSave: (input: SaveInput) => void;
  onDelete: (id: number) => void;
  onRefund: (id: number) => void;
  saving: boolean;
  deleting: boolean;
  refunding: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(() => ({
    status: order.status,
    paymentMethod: order.paymentMethod,
    staffNotes: order.staffNotes ?? "",
  }));

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex justify-end"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-ivory h-full overflow-y-auto p-7 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-serif text-2xl">Order #{order.id}</h2>
            <p className="text-[12px] text-ink/45">
              {new Date(order.createdAt).toLocaleString("en-US")}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close">
            <X size={22} className="text-ink/40 hover:text-burgundy" />
          </button>
        </div>

        <div className="bg-white border border-blush rounded-2xl p-4 mb-5">
          <p className="font-medium">{order.customerName}</p>
          <p className="text-sm text-ink/55">{order.phone}</p>
          <p className="text-sm text-ink/55">{order.email ?? "No email"}</p>
          <p className="text-sm text-ink/55 mt-2">
            {FULFILLMENT_LABELS[order.fulfillment]}
            {order.address ? ` · ${order.address}` : ""}
          </p>
          <Link
            to={`/order/${order.token}`}
            target="_blank"
            className="inline-block text-[12px] text-burgundy font-semibold mt-2 hover:underline"
          >
            View customer's order page ↗
          </Link>
        </div>

        <div className="bg-white border border-blush rounded-2xl p-4 mb-5">
          <ul className="divide-y divide-blush/60 text-sm">
            {order.items.map((line) => (
              <li key={line.productId} className="py-2 flex justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate">{line.name}</span>
                  <span className="text-xs text-ink/45">
                    {formatCents(line.unitCents)} × {line.qty}
                  </span>
                </span>
                <span className="font-medium tabular-nums">{formatCents(line.lineCents)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 pt-3 border-t border-blush space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink/50">Subtotal</dt>
              <dd className="tabular-nums">{formatCents(order.subtotalCents)}</dd>
            </div>
            {order.taxCents > 0 && (
              <div className="flex justify-between">
                <dt className="text-ink/50">Tax</dt>
                <dd className="tabular-nums">{formatCents(order.taxCents)}</dd>
              </div>
            )}
            <div className="flex justify-between font-semibold pt-1">
              <dt>Total</dt>
              <dd className="text-burgundy tabular-nums">{formatCents(order.totalCents)}</dd>
            </div>
          </dl>
        </div>

        <div className="space-y-4 mb-6">
          <label className="block">
            <span className="text-[11px] tracking-[0.15em] uppercase text-ink/45">Status</span>
            <select
              className={`${input} mt-1.5 capitalize`}
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value as OrderStatus })}
            >
              {ORDER_STATUSES.filter(
                (s) =>
                  canTransitionOrderStatus(order.status, s) &&
                  (s !== "cancelled" || order.paymentStatus !== "paid"),
              ).map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-xl border border-blush bg-white px-3.5 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] tracking-[0.15em] uppercase text-ink/45">
                Payment
              </span>
              <span
                className={`text-[11px] px-3 py-1 rounded-full font-medium ${PAYMENT_COLORS[order.paymentStatus]}`}
              >
                {order.paymentStatus}
              </span>
            </div>
            <p className="text-[12px] text-ink/45 mt-1.5">
              {PAYMENT_METHOD_LABELS[order.paymentMethod]}
              {order.paidAt ? ` · paid ${order.paidAt}` : ""}
            </p>
          </div>

          <label className="block">
            <span className="text-[11px] tracking-[0.15em] uppercase text-ink/45">
              Payment method
            </span>
            <select
              className={`${input} mt-1.5`}
              value={draft.paymentMethod}
              onChange={(e) =>
                setDraft({ ...draft, paymentMethod: e.target.value as PaymentMethod })
              }
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] tracking-[0.15em] uppercase text-ink/45">
              Staff notes
            </span>
            <textarea
              className={`${input} mt-1.5 resize-none`}
              rows={3}
              placeholder="Internal notes — never shown to the customer"
              value={draft.staffNotes}
              onChange={(e) => setDraft({ ...draft, staffNotes: e.target.value })}
            />
          </label>

          {order.notes && (
            <div className="bg-blush-light border border-blush rounded-xl px-3.5 py-3">
              <p className="text-[11px] uppercase tracking-[0.15em] text-ink/40 mb-1">
                Customer's note
              </p>
              <p className="text-[13px] text-ink/70 leading-relaxed whitespace-pre-wrap">
                {order.notes}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onSave({ id: order.id, ...draft })}
            disabled={saving}
            className="inline-flex items-center gap-2 bg-burgundy text-ivory text-sm font-semibold px-5 py-3 rounded-full hover:bg-burgundy-dark disabled:opacity-50 transition-colors"
          >
            <Check size={15} /> Save changes
          </button>
          {order.paymentStatus === "unpaid" && order.status !== "cancelled" && (
            <button
              onClick={() => onSave({ id: order.id, paymentStatus: "paid" })}
              disabled={saving}
              className="border border-emerald-300 text-emerald-700 text-sm font-semibold px-5 py-3 rounded-full hover:bg-emerald-50 disabled:opacity-50 transition-colors"
            >
              Mark paid
            </button>
          )}
          {order.paymentStatus === "paid" && (
            <button
              onClick={() => {
                const card = order.paymentMethod === "card_online";
                const message = card
                  ? `Refund ${formatCents(order.totalCents)} through Stripe? This cannot be undone.`
                  : `Confirm you have already refunded ${formatCents(order.totalCents)} to the customer. This only records the refund — it does not move money.`;
                if (window.confirm(message)) onRefund(order.id);
              }}
              disabled={refunding}
              className="inline-flex items-center gap-2 border border-amber-300 text-amber-800 text-sm font-semibold px-5 py-3 rounded-full hover:bg-amber-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={15} className={refunding ? "animate-spin" : ""} />
              {order.paymentMethod === "card_online" ? "Refund via Stripe" : "Record refund"}
            </button>
          )}
          <button
            onClick={() => {
              const restocked =
                order.status === "cancelled" || order.paymentStatus === "refunded"
                  ? " Its stock was already returned or consumed; inventory will not change."
                  : order.status === "new" || order.status === "ready"
                    ? " Reserved stock will be returned."
                    : " Its stock is already consumed and will not be returned.";
              if (window.confirm(`Delete order #${order.id}?${restocked}`)) {
                onDelete(order.id);
              }
            }}
            disabled={deleting || order.paymentStatus === "paid"}
            title={
              order.paymentStatus === "paid"
                ? "Refund this order before deleting it."
                : undefined
            }
            className="inline-flex items-center gap-2 border border-red-200 text-red-700 text-sm font-semibold px-5 py-3 rounded-full hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors ml-auto"
          >
            <Trash2 size={15} /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Orders() {
  const [filter, setFilter] = useState<"all" | OrderStatus>("all");
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.admin.orders.useQuery();
  const { data: config } = trpc.admin.paymentConfig.useQuery();

  const refreshCatalogues = () => {
    utils.admin.orders.invalidate();
    // Cancelling/refunding an order returns stock, so the catalogue and product
    // admin view are stale too.
    utils.admin.products.invalidate();
    utils.shop.products.invalidate();
  };

  const updateOrder = trpc.admin.updateOrder.useMutation({
    onSuccess: () => {
      refreshCatalogues();
      toast.success("Order updated");
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteOrder = trpc.admin.deleteOrder.useMutation({
    onSuccess: (result) => {
      refreshCatalogues();
      setSel(null);
      toast.success(
        result.restocked
          ? "Order deleted and stock restored"
          : "Order deleted (stock was already consumed or returned)",
      );
    },
    onError: (error) => toast.error(error.message),
  });

  const refundOrder = trpc.admin.refundOrder.useMutation({
    onSuccess: (result) => {
      refreshCatalogues();
      toast.success(
        result.alreadyRefunded
          ? "This order was already refunded"
          : result.restocked
            ? "Refund confirmed and stock restored"
            : "Refund confirmed",
      );
    },
    onError: (error) => toast.error(error.message),
  });

  const reconcile = trpc.admin.reconcileOrders.useMutation({
    onSuccess: (result) => {
      refreshCatalogues();
      toast.success(
        `Released ${result.expired} expired hold${result.expired === 1 ? "" : "s"} (${result.restocked} restocked)`,
      );
    },
    onError: (error) => toast.error(error.message),
  });

  const orders = data ?? [];
  const needle = query.trim().toLowerCase();
  const matches = (o: AdminOrder) =>
    !needle ||
    String(o.id).includes(needle) ||
    `ppr-o${o.id}`.includes(needle) ||
    o.customerName.toLowerCase().includes(needle) ||
    o.phone.toLowerCase().includes(needle) ||
    (o.email ?? "").toLowerCase().includes(needle);
  const visible = orders.filter(
    (o) => (filter === "all" || o.status === filter) && matches(o),
  );
  const order = orders.find((o) => o.id === sel) ?? null;

  const openOrders = orders.filter((o) => o.status === "new" || o.status === "ready").length;
  const paymentDue = orders.filter(
    (o) => o.paymentStatus === "unpaid" && o.status !== "cancelled",
  ).length;
  const paidRevenue = orders
    .filter((o) => o.paymentStatus === "paid" && o.status !== "cancelled")
    .reduce((sum, o) => sum + o.totalCents, 0);

  return (
    <div>
      <h1 className="font-serif text-3xl text-ink mb-2">Orders</h1>
      <p className="text-sm text-ink/50 mb-4">
        Online shop orders. Stock is reserved when an order is placed and returned when it is cancelled.
      </p>

      {config && (
        <div className="space-y-2 mb-6">
          {config.stripeMode === "test" && (
            <p className="text-[12.5px] text-amber-900 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
              <b>Stripe test mode.</b> Card orders are simulated — no real money moves. Use a{" "}
              <code>sk_live_</code> key only after test-mode sign-off.
            </p>
          )}
          {config.stripeMode === "invalid" && (
            <p className="text-[12.5px] text-red-800 bg-red-50 border border-red-300 rounded-xl px-4 py-3">
              <b>Stripe key is invalid.</b> Online card checkout is disabled. Check{" "}
              <code>STRIPE_SECRET_KEY</code> — it must start with <code>sk_test_</code>,{" "}
              <code>sk_live_</code>, <code>rk_test_</code> or <code>rk_live_</code>.
            </p>
          )}
          {!config.publicSiteUrlIsHttps && (
            <p className="text-[12.5px] text-amber-900 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
              <b>Public site URL is not HTTPS.</b> Stripe redirects and customer links use{" "}
              <code>{config.publicSiteUrl}</code>. Set <code>PUBLIC_SITE_URL</code> to the
              canonical <code>https://</code> domain before taking live payments.
            </p>
          )}
          {config.onlineCard && !config.webhookConfigured && (
            <p className="text-[12.5px] text-red-800 bg-red-50 border border-red-300 rounded-xl px-4 py-3">
              <b>Webhook secret missing.</b> Paid orders will only be confirmed if the customer
              returns to the site. Set <code>STRIPE_WEBHOOK_SECRET</code> and add{" "}
              <code>{config.publicSiteUrl}/api/stripe/webhook</code> in Stripe.
            </p>
          )}
          {!config.cronConfigured && (
            <p className="text-[12.5px] text-ink/60 bg-blush-light border border-blush rounded-xl px-4 py-3">
              Scheduled reconciliation is off (<code>CRON_SECRET</code> unset). Use{" "}
              <b>Release expired holds</b> below to return stock from abandoned card checkouts.
            </p>
          )}
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        {[
          ["Open orders", String(openOrders)],
          ["Payment due", String(paymentDue)],
          ["Paid revenue", formatCents(paidRevenue)],
        ].map(([label, value]) => (
          <div key={label} className="bg-white rounded-2xl border border-blush px-5 py-4">
            <p className="text-[11px] tracking-[0.15em] uppercase text-ink/40">{label}</p>
            <p className="font-serif text-2xl text-ink mt-1">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search order #, name, phone, email"
            aria-label="Search orders"
            className="w-full border border-ink/15 rounded-full pl-9 pr-4 py-2 text-sm bg-white focus:outline-none focus:border-burgundy"
          />
        </div>
        {(["all", ...ORDER_STATUSES] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-full text-xs font-medium capitalize border transition-colors ${
              filter === s
                ? "bg-burgundy text-ivory border-burgundy"
                : "border-ink/15 text-ink/55 hover:border-burgundy/40"
            }`}
          >
            {s === "all" ? "All" : s.replace("_", " ")}
          </button>
        ))}
        <button
          onClick={() => reconcile.mutate()}
          disabled={reconcile.isPending}
          className="ml-auto inline-flex items-center gap-2 border border-ink/15 text-ink/60 text-xs font-semibold px-4 py-2 rounded-full hover:border-burgundy/40 hover:text-burgundy disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={13} className={reconcile.isPending ? "animate-spin" : ""} />
          Release expired holds
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-blush overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="text-left text-[11px] tracking-[0.15em] uppercase text-ink/40 border-b border-blush">
              <th className="px-5 py-4">Order</th>
              <th className="px-5 py-4">Customer</th>
              <th className="px-5 py-4">Items</th>
              <th className="px-5 py-4">Total</th>
              <th className="px-5 py-4">Fulfilment</th>
              <th className="px-5 py-4">Payment</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4">Placed</th>
              <th className="px-5 py-4"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((o) => {
              const units = o.items.reduce((sum, i) => sum + i.qty, 0);
              return (
                <tr key={o.id} className="border-b border-blush/50 hover:bg-blush-light/50">
                  <td className="px-5 py-3.5 font-mono text-[12px] text-ink/55">#{o.id}</td>
                  <td className="px-5 py-3.5">
                    <p className="font-medium">{o.customerName}</p>
                    <p className="text-xs text-ink/45">{o.phone}</p>
                  </td>
                  <td className="px-5 py-3.5 text-ink/60">
                    {units} item{units === 1 ? "" : "s"}
                    <p className="text-xs text-ink/40 truncate max-w-[180px]">
                      {o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}
                    </p>
                  </td>
                  <td className="px-5 py-3.5 font-semibold tabular-nums">
                    {formatCents(o.totalCents)}
                  </td>
                  <td className="px-5 py-3.5 text-ink/60">
                    {FULFILLMENT_LABELS[o.fulfillment]}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-[11px] px-3 py-1 rounded-full font-medium ${PAYMENT_COLORS[o.paymentStatus]}`}>
                      {o.paymentStatus}
                    </span>
                    <p className="text-[11px] text-ink/45 mt-1">
                      {PAYMENT_METHOD_LABELS[o.paymentMethod]}
                    </p>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-[11px] px-3 py-1 rounded-full font-medium ${STATUS_COLORS[o.status]}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-ink/50">
                    {new Date(o.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => setSel(o.id)}
                      className="text-burgundy text-xs font-semibold hover:underline"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!isLoading && visible.length === 0 && (
          <p className="p-10 text-center text-ink/40 text-sm">No orders in this view.</p>
        )}
        {isLoading && <p className="p-10 text-center text-ink/40 text-sm">Loading orders…</p>}
      </div>

      {order && (
        <OrderDrawer
          key={order.id}
          order={order}
          onClose={() => setSel(null)}
          onSave={(payload) => updateOrder.mutate(payload)}
          onDelete={(id) => deleteOrder.mutate({ id })}
          onRefund={(id) => refundOrder.mutate({ id })}
          saving={updateOrder.isPending}
          deleting={deleteOrder.isPending}
          refunding={refundOrder.isPending}
        />
      )}
    </div>
  );
}
