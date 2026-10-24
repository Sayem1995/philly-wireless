import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import { Banknote, Search, Plus, X, Trash2, Send } from "lucide-react";

type PaymentMethod = "cash" | "card" | "zelle" | "check" | "other";

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function Customers() {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ id?: number; name: string; phone: string; email: string; notes: string } | null>(null);
  const [newNote, setNewNote] = useState("");
  const [msg, setMsg] = useState("");
  const [payingBookingId, setPayingBookingId] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("cash");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const utils = trpc.useUtils();
  const { data } = trpc.admin.customers.useQuery({ q });
  const { data: detail } = trpc.admin.customerDetail.useQuery({ id: sel! }, { enabled: sel !== null });
  const upsert = trpc.admin.upsertCustomer.useMutation({
    onSuccess: () => { utils.admin.customers.invalidate(); setEditing(null); toast.success("Customer saved"); },
  });
  const del = trpc.admin.deleteCustomer.useMutation({
    onSuccess: () => { utils.admin.customers.invalidate(); setSel(null); toast.success("Customer removed"); },
  });
  const addNote = trpc.admin.addNote.useMutation({
    onSuccess: () => { utils.admin.customerDetail.invalidate(); setNewNote(""); toast.success("Note added"); },
  });
  const notify = trpc.admin.notify.useMutation({
    onSuccess: () => { utils.admin.customerDetail.invalidate(); setMsg(""); toast.success("Message logged & sent"); },
  });
  const createPayment = trpc.admin.createReceipt.useMutation({
    onSuccess: () => {
      void utils.admin.customerDetail.invalidate();
      void utils.admin.receipts.invalidate();
      setPayingBookingId(null);
      toast.success("Payment recorded");
    },
    onError: (error) => toast.error(error.message),
  });
  const updatePayment = trpc.admin.updateReceipt.useMutation({
    onSuccess: () => {
      void utils.admin.customerDetail.invalidate();
      void utils.admin.receipts.invalidate();
      setPayingBookingId(null);
      toast.success("Payment updated");
    },
    onError: (error) => toast.error(error.message),
  });
  const input = "border border-ink/15 rounded-xl px-3.5 py-2.5 text-sm bg-ivory focus:outline-none focus:border-burgundy w-full";
  const totalPaidCents = (detail?.history ?? []).reduce(
    (sum, booking) => sum + (booking.receipt?.totalCents ?? 0),
    0,
  );
  const paidRepairs = (detail?.history ?? []).filter((booking) => booking.receipt).length;

  type HistoryRow = NonNullable<typeof detail>["history"][number];

  const openPayment = (booking: HistoryRow) => {
    setPayingBookingId(booking.id);
    setPayAmount(booking.receipt ? (booking.receipt.totalCents / 100).toFixed(2) : "");
    setPayMethod((booking.receipt?.paymentMethod as PaymentMethod) ?? "cash");
    setPayDate(booking.receipt?.paidAt || new Date().toISOString().slice(0, 10));
  };

  const savePayment = (booking: HistoryRow) => {
    const amountCents = Math.round(Number(payAmount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      toast.error("Enter a paid amount greater than zero.");
      return;
    }
    if (booking.receipt) {
      updatePayment.mutate({
        id: booking.receipt.id,
        amountCents,
        paymentMethod: payMethod,
        paidAt: payDate,
      });
    } else {
      createPayment.mutate({
        bookingId: booking.id,
        lines: [{ description: `Repair payment — ${booking.device}`, amountCents }],
        paymentMethod: payMethod,
        paidAt: payDate,
        emailCustomer: false,
      });
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="font-serif text-3xl text-ink">Customers</h1>
        <button onClick={() => setEditing({ name: "", phone: "", email: "", notes: "" })}
          className="bg-burgundy text-ivory text-sm font-semibold px-5 py-2.5 rounded-full inline-flex items-center gap-2 hover:bg-burgundy-dark"><Plus size={15} /> Add Customer</button>
      </div>
      <div className="relative mb-5 max-w-sm">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/35" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or email…" className={`${input} pl-10`} />
      </div>
      <div className="bg-white rounded-2xl border border-blush overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead><tr className="text-left text-[11px] tracking-[0.15em] uppercase text-ink/40 border-b border-blush">
            <th className="px-5 py-4">Name</th><th className="px-5 py-4">Phone</th><th className="px-5 py-4">Email</th><th className="px-5 py-4">Since</th><th className="px-5 py-4"></th>
          </tr></thead>
          <tbody>
            {(data ?? []).map((c) => (
              <tr key={c.id} className="border-b border-blush/50 hover:bg-blush-light/50">
                <td className="px-5 py-3.5 font-medium">{c.name}</td>
                <td className="px-5 py-3.5">{c.phone}</td>
                <td className="px-5 py-3.5 text-ink/55">{c.email ?? "—"}</td>
                <td className="px-5 py-3.5 text-ink/45 text-xs">{new Date(c.createdAt).toLocaleDateString()}</td>
                <td className="px-5 py-3.5"><button onClick={() => setSel(c.id)} className="text-burgundy text-xs font-semibold hover:underline">Open</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {(data ?? []).length === 0 && <p className="p-10 text-center text-ink/40 text-sm">No customers found.</p>}
      </div>

      {/* edit / add modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm grid place-items-center px-4" onClick={() => setEditing(null)}>
          <div className="bg-ivory rounded-3xl p-8 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-serif text-2xl mb-2">{editing.id ? "Edit customer" : "Add customer"}</h2>
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Name *" className={input} />
            <input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} placeholder="Phone *" className={input} />
            <input value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} placeholder="Email" className={input} />
            <textarea value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} placeholder="Notes" rows={3} className={`${input} resize-none`} />
            <button onClick={() => editing.name && editing.phone && upsert.mutate(editing)}
              className="w-full bg-burgundy text-ivory font-semibold py-3 rounded-full hover:bg-burgundy-dark">Save</button>
          </div>
        </div>
      )}

      {/* detail drawer */}
      {sel !== null && detail?.customer && (
        <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex justify-end" onClick={() => setSel(null)}>
          <div className="w-full max-w-lg bg-ivory h-full overflow-y-auto p-7 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-serif text-2xl">{detail.customer.name}</h2>
              <div className="flex gap-2">
                <button onClick={() => setEditing({ id: detail.customer!.id, name: detail.customer!.name, phone: detail.customer!.phone, email: detail.customer!.email ?? "", notes: detail.customer!.notes ?? "" })}
                  className="text-xs font-semibold text-burgundy border border-burgundy/30 px-4 py-2 rounded-full hover:bg-blush">Edit</button>
                <button onClick={() => confirm("Delete this customer?") && del.mutate({ id: detail.customer!.id })}
                  className="text-xs font-semibold text-red-700 border border-red-200 px-4 py-2 rounded-full hover:bg-red-50"><Trash2 size={13} /></button>
                <button onClick={() => setSel(null)} aria-label="Close"><X size={22} className="text-ink/40 hover:text-burgundy" /></button>
              </div>
            </div>
            <p className="text-sm text-ink/55 mb-2">{detail.customer.phone} · {detail.customer.email ?? "no email"}</p>
            <p className="mb-6 flex items-center gap-1.5 text-xs text-ink/50">
              <Banknote size={13} className="text-emerald-700" />
              {totalPaidCents > 0
                ? `${money(totalPaidCents)} paid across ${paidRepairs} repair${paidRepairs === 1 ? "" : "s"}`
                : "No repair payments recorded yet"}
            </p>

            <h3 className="font-serif text-lg mb-3">Repair history</h3>
            <div className="space-y-2.5 mb-7">
              {detail.history.map((b) => (
                <div key={b.id} className="bg-white border border-blush rounded-2xl p-4 text-sm">
                  <div className="flex justify-between"><span className="font-medium">{b.device} — {b.repairType}</span><span className="text-xs text-ink/45">#{b.id}</span></div>
                  <p className="text-xs text-ink/45 mt-1">{b.date} {b.timeSlot} · {b.status.replace("_", " ")} {b.priceEstimate ? `· ${b.priceEstimate}` : ""}</p>
                  {b.warrantyUntil && <p className="text-xs text-emerald-700 mt-1">Warranty until {b.warrantyUntil}</p>}

                  <div className="mt-3 border-t border-blush/60 pt-3">
                    {b.receipt ? (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-[13px] font-semibold text-emerald-800">Paid {money(b.receipt.totalCents)}</p>
                          <p className="mt-0.5 text-[10.5px] capitalize text-ink/40">
                            {b.receipt.paymentMethod} · {b.receipt.paidAt}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openPayment(b)}
                          className="rounded-full border border-burgundy/25 px-3 py-1.5 text-[11px] font-semibold text-burgundy transition-colors hover:bg-blush-light"
                        >
                          Edit payment
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11.5px] text-ink/40">No payment recorded</p>
                        <button
                          type="button"
                          onClick={() => openPayment(b)}
                          className="inline-flex items-center gap-1 rounded-full bg-burgundy px-3 py-1.5 text-[11px] font-semibold text-ivory transition-colors hover:bg-burgundy-dark"
                        >
                          <Banknote size={12} /> Record payment
                        </button>
                      </div>
                    )}

                    {payingBookingId === b.id && (
                      <div className="mt-3 rounded-xl border border-burgundy/15 bg-blush-light/40 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-burgundy">
                          {b.receipt ? "Update paid amount" : "Record paid amount"}
                        </p>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <label className="text-[10px] text-ink/45">
                            Amount
                            <div className="relative mt-1">
                              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-ink/35">$</span>
                              <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                inputMode="decimal"
                                value={payAmount}
                                onChange={(event) => setPayAmount(event.target.value)}
                                placeholder="0.00"
                                className="w-full rounded-lg border border-ink/15 bg-white py-2 pl-6 pr-2.5 text-xs outline-none focus:border-burgundy"
                              />
                            </div>
                          </label>
                          <label className="text-[10px] text-ink/45">
                            Method
                            <select
                              value={payMethod}
                              onChange={(event) => setPayMethod(event.target.value as PaymentMethod)}
                              className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-2 py-2 text-xs capitalize outline-none focus:border-burgundy"
                            >
                              <option value="cash">Cash</option>
                              <option value="card">Card</option>
                              <option value="zelle">Zelle</option>
                              <option value="check">Check</option>
                              <option value="other">Other</option>
                            </select>
                          </label>
                          <label className="col-span-2 text-[10px] text-ink/45">
                            Paid date
                            <input
                              type="date"
                              value={payDate}
                              onChange={(event) => setPayDate(event.target.value)}
                              className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-2 py-2 text-xs outline-none focus:border-burgundy"
                            />
                          </label>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            disabled={createPayment.isPending || updatePayment.isPending}
                            onClick={() => savePayment(b)}
                            className="rounded-full bg-burgundy px-3 py-1.5 text-[11px] font-semibold text-ivory transition-colors hover:bg-burgundy-dark disabled:opacity-50"
                          >
                            {createPayment.isPending || updatePayment.isPending ? "Saving…" : "Save payment"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPayingBookingId(null)}
                            className="rounded-full border border-ink/10 px-3 py-1.5 text-[11px] text-ink/50 hover:border-ink/25 hover:text-ink"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {detail.history.length === 0 && <p className="text-sm text-ink/40">No repairs yet.</p>}
            </div>

            <h3 className="font-serif text-lg mb-3">Notes</h3>
            <div className="space-y-2 mb-3">
              {detail.notes.map((n) => (
                <p key={n.id} className="bg-blush-light rounded-xl px-4 py-3 text-sm">{n.note}<span className="block text-[11px] text-ink/40 mt-1">{new Date(n.createdAt).toLocaleString()}</span></p>
              ))}
            </div>
            <div className="flex gap-2 mb-7">
              <input value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Add a note…" className={input} />
              <button onClick={() => newNote && addNote.mutate({ customerId: sel, note: newNote })} className="bg-burgundy text-ivory px-4 rounded-xl text-sm shrink-0"><Plus size={16} /></button>
            </div>

            <h3 className="font-serif text-lg mb-3">Communication history</h3>
            <div className="space-y-2 mb-3">
              {detail.comms.map((c) => (
                <p key={c.id} className="bg-white border border-blush rounded-xl px-4 py-3 text-sm">
                  <span className="text-[10px] uppercase tracking-wider text-burgundy font-semibold">{c.channel}</span> {c.message}
                  <span className="block text-[11px] text-ink/40 mt-1">{new Date(c.createdAt).toLocaleString()}</span>
                </p>
              ))}
              {detail.comms.length === 0 && <p className="text-sm text-ink/40">No messages yet.</p>}
            </div>
            <div className="flex gap-2">
              <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Log / send a message…" className={input} />
              <button onClick={() => msg && notify.mutate({ customerId: sel, channel: "sms", message: msg })} className="bg-burgundy text-ivory px-4 rounded-xl shrink-0"><Send size={15} /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
