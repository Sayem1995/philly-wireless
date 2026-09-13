import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { BOOKING_STATUSES, TIME_SLOTS } from "@contracts/constants";
import { toast } from "sonner";
import { X, Send } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  accepted: "bg-blue-100 text-blue-800",
  in_progress: "bg-violet-100 text-violet-800",
  completed: "bg-emerald-100 text-emerald-800",
  rescheduled: "bg-orange-100 text-orange-800",
  cancelled: "bg-red-100 text-red-700",
};

export default function Bookings() {
  const [filter, setFilter] = useState("all");
  const [sel, setSel] = useState<number | null>(null);
  const [note, setNote] = useState({ channel: "sms" as "sms" | "email" | "call", message: "" });
  const utils = trpc.useUtils();
  const { data } = trpc.admin.bookings.useQuery({ status: filter });
  const refresh = () => utils.admin.bookings.invalidate();
  const update = trpc.admin.updateBooking.useMutation({ onSuccess: () => { refresh(); utils.admin.stats.invalidate(); toast.success("Booking updated"); } });
  const notify = trpc.admin.notify.useMutation({
    onSuccess: (r) => {
      if (r.delivered) toast.success("Message sent to the customer");
      else if (r.reason === "manual") toast.success("Logged — you'll make this call yourself");
      else if (r.reason === "no_contact") toast.error("Nothing sent — this customer has no email or phone on file");
      else if (r.reason === "failed") toast.error("Send failed — check the provider settings and the notification log");
      else toast.warning(`${r.channel === "email" ? "Email" : "SMS"} isn't configured yet — the message was logged but not sent`);
      setNote({ channel: "sms", message: "" });
      utils.admin.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const booking = data?.find((b) => b.id === sel);
  const input = "border border-ink/15 rounded-xl px-3.5 py-2.5 text-sm bg-ivory focus:outline-none focus:border-burgundy";

  return (
    <div>
      <h1 className="font-serif text-3xl text-ink mb-6">Bookings</h1>
      <div className="flex flex-wrap gap-2 mb-6">
        {["all", ...BOOKING_STATUSES].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-full text-xs font-medium capitalize border transition-colors ${filter === s ? "bg-burgundy text-ivory border-burgundy" : "border-ink/15 text-ink/55 hover:border-burgundy/40"}`}>
            {s.replace("_", " ")}
          </button>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-blush overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead><tr className="text-left text-[11px] tracking-[0.15em] uppercase text-ink/40 border-b border-blush">
            <th className="px-5 py-4">#</th><th className="px-5 py-4">Customer</th><th className="px-5 py-4">Device / Repair</th><th className="px-5 py-4">When</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Warranty</th><th className="px-5 py-4"></th>
          </tr></thead>
          <tbody>
            {(data ?? []).map((b) => (
              <tr key={b.id} className="border-b border-blush/50 hover:bg-blush-light/50">
                <td className="px-5 py-3.5 text-ink/40">#{b.id}</td>
                <td className="px-5 py-3.5"><p className="font-medium">{b.customerName}</p><p className="text-xs text-ink/45">{b.phone}</p></td>
                <td className="px-5 py-3.5">{b.device}<p className="text-xs text-ink/45">{b.repairType}</p></td>
                <td className="px-5 py-3.5">{b.date}<p className="text-xs text-ink/45">{b.timeSlot}</p></td>
                <td className="px-5 py-3.5"><span className={`text-[11px] px-3 py-1 rounded-full font-medium ${STATUS_COLORS[b.status]}`}>{b.status.replace("_", " ")}</span></td>
                <td className="px-5 py-3.5 text-xs text-ink/50">{b.warrantyUntil ?? "—"}</td>
                <td className="px-5 py-3.5"><button onClick={() => setSel(b.id)} className="text-burgundy text-xs font-semibold hover:underline">Manage</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {(data ?? []).length === 0 && <p className="p-10 text-center text-ink/40 text-sm">No bookings in this view.</p>}
      </div>

      {booking && (
        <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex justify-end" onClick={() => setSel(null)}>
          <div className="w-full max-w-md bg-ivory h-full overflow-y-auto p-7 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-serif text-2xl">Booking #{booking.id}</h2>
              <button onClick={() => setSel(null)} aria-label="Close"><X size={22} className="text-ink/40 hover:text-burgundy" /></button>
            </div>
            <dl className="text-sm space-y-2 mb-6">
              {[["Customer", booking.customerName], ["Phone", booking.phone], ["Email", booking.email ?? "—"], ["Device", booking.device], ["Repair", booking.repairType], ["Notes", booking.notes ?? "—"]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4"><dt className="text-ink/45">{k}</dt><dd className="font-medium text-right">{v}</dd></div>
              ))}
            </dl>
            <label className="block text-xs uppercase tracking-wider text-ink/45 mb-2">Status</label>
            <select value={booking.status} onChange={(e) => update.mutate({ id: booking.id, status: e.target.value as never })} className={`${input} w-full mb-4`}>
              {BOOKING_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-ink/45 mb-2">Reschedule date</label>
                <input type="date" defaultValue={booking.date} onChange={(e) => e.target.value && update.mutate({ id: booking.id, date: e.target.value })} className={`${input} w-full`} />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-ink/45 mb-2">Time</label>
                <select value={booking.timeSlot} onChange={(e) => update.mutate({ id: booking.id, timeSlot: e.target.value })} className={`${input} w-full`}>
                  {TIME_SLOTS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <label className="block text-xs uppercase tracking-wider text-ink/45 mb-2">Price quote</label>
            <input defaultValue={booking.priceEstimate ?? ""} placeholder="$…" onBlur={(e) => e.target.value !== (booking.priceEstimate ?? "") && update.mutate({ id: booking.id, priceEstimate: e.target.value })} className={`${input} w-full mb-4`} />
            <label className="block text-xs uppercase tracking-wider text-ink/45 mb-2">Warranty until</label>
            <input type="date" defaultValue={booking.warrantyUntil ?? ""} onChange={(e) => e.target.value && update.mutate({ id: booking.id, warrantyUntil: e.target.value })} className={`${input} w-full mb-6`} />
            <ReceiptForm booking={booking} />
            <h3 className="font-serif text-lg mb-1">Message the customer</h3>
            <p className="text-xs text-ink/45 mb-3">
              Sent immediately by {note.channel === "call" ? "— a call is yours to make; we just log it" : note.channel === "email" ? "email" : "text message"}.
            </p>
            <div className="flex gap-2 mb-2">
              {(["sms", "email", "call"] as const).map((c) => (
                <button key={c} onClick={() => setNote({ ...note, channel: c })}
                  className={`px-4 py-2 rounded-full text-xs uppercase border ${note.channel === c ? "bg-burgundy text-ivory border-burgundy" : "border-ink/15"}`}>{c}</button>
              ))}
            </div>
            <textarea rows={3} value={note.message} onChange={(e) => setNote({ ...note, message: e.target.value })} placeholder="Message to customer…" className={`${input} w-full resize-none mb-3`} />
            <button onClick={() => note.message && notify.mutate({ bookingId: booking.id, customerId: booking.customerId ?? undefined, channel: note.channel, message: note.message })}
              className="w-full bg-burgundy text-ivory font-semibold py-3 rounded-full hover:bg-burgundy-dark transition-colors inline-flex items-center justify-center gap-2">
              <Send size={15} /> {note.channel === "call" ? "Log this call" : "Send to customer"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Record a payment and issue the customer a receipt. */
function ReceiptForm({
  booking,
}: {
  booking: { id: number; repairType: string; email: string | null; status: string };
}) {
  const utils = trpc.useUtils();
  const [repair, setRepair] = useState("");
  const [extraLabel, setExtraLabel] = useState("Parts");
  const [extra, setExtra] = useState("");
  const [tax, setTax] = useState("");
  const [method, setMethod] = useState<"cash" | "card" | "zelle" | "check" | "other">("cash");
  const [notes, setNotes] = useState("");
  const [emailIt, setEmailIt] = useState(true);
  const [complete, setComplete] = useState(booking.status !== "completed");

  const { data: existing } = trpc.admin.receiptForBooking.useQuery({ bookingId: booking.id });

  const create = trpc.admin.createReceipt.useMutation({
    onSuccess: (r) => {
      void utils.admin.receipts.invalidate();
      void utils.admin.receiptForBooking.invalidate();
      void utils.admin.bookings.invalidate();
      void utils.admin.stats.invalidate();
      toast.success(
        r.emailed
          ? `Receipt #PPR-R${r.id} emailed to the customer`
          : `Receipt #PPR-R${r.id} saved — email queued (not configured)`,
      );
      setRepair(""); setExtra(""); setTax(""); setNotes("");
    },
    onError: (e) => toast.error(e.message),
  });

  const input = "border border-ink/15 rounded-xl px-3.5 py-2.5 text-sm bg-ivory focus:outline-none focus:border-burgundy";
  const toCents = (v: string) => Math.round(Number.parseFloat(v || "0") * 100) || 0;

  const lines = [
    ...(toCents(repair) > 0 ? [{ description: booking.repairType, amountCents: toCents(repair) }] : []),
    ...(toCents(extra) > 0 ? [{ description: extraLabel.trim() || "Additional", amountCents: toCents(extra) }] : []),
  ];
  const totalCents = lines.reduce((s, l) => s + l.amountCents, 0) + toCents(tax);

  return (
    <div className="border-t border-blush pt-5 mb-6">
      <h3 className="font-serif text-lg mb-1">Payment &amp; receipt</h3>
      <p className="text-xs text-ink/45 mb-4">
        Record what the customer paid and email them a receipt they can view or print.
      </p>

      {existing && (
        <p className="text-xs bg-emerald-50 text-emerald-800 rounded-xl px-3.5 py-2.5 mb-4">
          Receipt #PPR-R{existing.id} already issued for this booking ({existing.paidAt}).
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-ink/45 mb-1.5">Repair charge</label>
          <input inputMode="decimal" value={repair} onChange={(e) => setRepair(e.target.value)} placeholder="129.00" className={`${input} w-full`} />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-ink/45 mb-1.5">Tax (optional)</label>
          <input inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} placeholder="0.00" className={`${input} w-full`} />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-ink/45 mb-1.5">Extra label</label>
          <input value={extraLabel} onChange={(e) => setExtraLabel(e.target.value)} className={`${input} w-full`} />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-ink/45 mb-1.5">Extra charge</label>
          <input inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="0.00" className={`${input} w-full`} />
        </div>
      </div>

      <label className="block text-[11px] uppercase tracking-wider text-ink/45 mb-1.5">Payment method</label>
      <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className={`${input} w-full mb-3`}>
        {(["cash", "card", "zelle", "check", "other"] as const).map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>

      <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note on the receipt (optional)" className={`${input} w-full mb-3`} />

      <label className="flex items-center gap-2.5 text-sm text-ink/70 mb-2">
        <input type="checkbox" checked={emailIt} onChange={(e) => setEmailIt(e.target.checked)} disabled={!booking.email} />
        Email the receipt{booking.email ? ` to ${booking.email}` : " (no email on file)"}
      </label>
      <label className="flex items-center gap-2.5 text-sm text-ink/70 mb-4">
        <input type="checkbox" checked={complete} onChange={(e) => setComplete(e.target.checked)} />
        Mark the repair as completed
      </label>

      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-ink/50">Total</span>
        <span className="font-serif text-2xl text-burgundy">${(totalCents / 100).toFixed(2)}</span>
      </div>

      <button
        disabled={lines.length === 0 || create.isPending}
        onClick={() =>
          create.mutate({
            bookingId: booking.id,
            lines,
            taxCents: toCents(tax),
            paymentMethod: method,
            notes: notes.trim() || undefined,
            emailCustomer: emailIt,
            markCompleted: complete,
          })
        }
        className="w-full bg-ink text-ivory font-semibold py-3 rounded-full hover:bg-ink/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {create.isPending ? "Issuing…" : "Record payment & issue receipt"}
      </button>
    </div>
  );
}
