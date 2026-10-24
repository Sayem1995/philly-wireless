import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import Seo from "@/components/Seo";
import { BRAND, DROP_OFF_SLOT, STORE } from "@contracts/constants";
import { formatBookingDevice } from "@contracts/booking";
import { BOOKING_MODELS } from "@contracts/deviceModels";
import { estimateRepair, REPAIR_ESTIMATE_NOTE } from "@contracts/repairEstimates";
import { motion, AnimatePresence } from "framer-motion";
import {
  Smartphone, Tablet, Laptop, Gamepad2, Battery, Plug, Layers, Camera,
  Droplets, Volume2, HelpCircle, Check, ChevronLeft, ChevronRight,
  MapPin, ShieldCheck, Zap, Search, PartyPopper, Plus, Trash2,
} from "lucide-react";
import { toast } from "sonner";

/* ---------------- data ---------------- */
const PROBLEMS = [
  { id: "Cracked Screen", icon: Smartphone, desc: "Broken or unresponsive display" },
  { id: "Battery Replacement", icon: Battery, desc: "Drains fast or won't hold charge" },
  { id: "Charging Port Repair", icon: Plug, desc: "Loose or won't charge" },
  { id: "Back Glass Replacement", icon: Layers, desc: "Cracked back panel" },
  { id: "Camera Repair", icon: Camera, desc: "Blurry or failed camera" },
  { id: "Water Damage Repair", icon: Droplets, desc: "Liquid spill or submersion" },
  { id: "Speaker / Mic Repair", icon: Volume2, desc: "Audio in or out not working" },
  { id: "Not sure — free diagnostic", icon: HelpCircle, desc: "We'll figure it out together" },
];

const DEVICE_TYPES = [
  { id: "Phone", icon: Smartphone },
  { id: "Tablet", icon: Tablet },
  { id: "Laptop", icon: Laptop },
  { id: "Console", icon: Gamepad2 },
];

const BRANDS: Record<string, string[]> = {
  Phone: ["Apple", "Samsung", "Google", "Motorola", "OnePlus", "Other"],
  Tablet: ["Apple iPad", "Samsung Galaxy Tab", "Other Tablet"],
  Laptop: ["Apple MacBook", "Windows Laptop"],
  Console: ["PlayStation", "Xbox"],
};

type BookingItem = {
  deviceType: string;
  brand: string;
  model: string;
  repairType: string;
};

const MAX_ITEMS = 6;
const STEPS = ["Device", "Brand", "Model", "Problem", "Repairs", "Schedule", "Details", "Review"];

function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nextDays(n: number) {
  const out: { iso: string; day: string; num: string; month: string; isToday: boolean }[] = [];
  const d = new Date();
  // Normalise to local noon so DST shifts can't roll the date over.
  d.setHours(12, 0, 0, 0);
  const today = localIso(d);
  while (out.length < n) {
    const iso = localIso(d);
    out.push({
      // Build the ISO date from LOCAL parts. `toISOString()` would convert to
      // UTC, so for users behind UTC the booked date could differ from the
      // date shown on the button (e.g. label "13" but booked 2026-09-14).
      iso,
      day: d.toLocaleDateString("en-US", { weekday: "short" }),
      num: String(d.getDate()),
      month: d.toLocaleDateString("en-US", { month: "short" }),
      isToday: iso === today,
    });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** `"9:00 AM"` → minutes since midnight. */
function parseClock(value: string): number | null {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i.exec(value.trim());
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return hour * 60 + Number(match[2] ?? 0);
}

/** The shop's opening window for a YYYY-MM-DD date, in local minutes. */
function storeWindow(iso: string): { open: number; close: number; label: string } | null {
  const weekday = new Date(`${iso}T12:00:00`)
    .toLocaleDateString("en-US", { weekday: "long" })
    .toLowerCase();
  const row = BRAND.hours.find((entry) => entry.days.includes(weekday));
  if (!row) return null;
  const [openRaw, closeRaw] = row.h.split(/\s*[–—-]\s*/);
  const open = parseClock(openRaw ?? "");
  const close = parseClock(closeRaw ?? "");
  return open == null || close == null ? null : { open, close, label: row.h };
}

type SlotStatus = "available" | "booked" | "passed" | "closed";

/**
 * Distinguishes the three reasons a time cannot be selected. The UI used to
 * render all of them as "booked", which made a closed Sunday look fully booked.
 */
function slotStatus(iso: string, slot: string, taken: boolean, now = new Date()): SlotStatus {
  const window = storeWindow(iso);
  if (!window) return "closed";
  const [hour, minute] = slot.split(":").map(Number);
  const slotMinutes = hour * 60 + minute;
  if (slotMinutes < window.open || slotMinutes >= window.close) return "closed";
  if (iso === localIso(now) && slotMinutes < now.getHours() * 60 + now.getMinutes() + 30) {
    return "passed";
  }
  return taken ? "booked" : "available";
}

const sel = "border-burgundy bg-blush ring-2 ring-burgundy/20";
const card = "border-ink/10 hover:border-burgundy/50 hover:-translate-y-0.5 hover:shadow-md";

export default function Booking() {
  const [step, setStep] = useState(0);
  const [problem, setProblem] = useState("");
  const [devType, setDevType] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [modelQuery, setModelQuery] = useState("");
  const [items, setItems] = useState<BookingItem[]>([]);
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const [bookingId, setBookingId] = useState<number | null>(null);

  const days = useMemo(() => nextDays(10), []);
  const models = useMemo(() => {
    const all = BOOKING_MODELS[brand] ?? [];
    const query = modelQuery.trim().toLowerCase();
    return query ? all.filter((entry) => entry.toLowerCase().includes(query)) : all;
  }, [brand, modelQuery]);
  const { data: slots, isFetching } = trpc.shop.slots.useQuery({ date }, { enabled: !!date });
  const book = trpc.shop.book.useMutation({
    onSuccess: (r) => { setBookingId(r.bookingId); setStep(8); window.scrollTo({ top: 0, behavior: "smooth" }); },
    onError: (e) => toast.error(e.message),
  });

  const canNext =
    (step === 0 && !!devType) || (step === 1 && !!brand) || (step === 2 && !!model) ||
    (step === 3 && !!problem && items.length < MAX_ITEMS) ||
    (step === 4 && items.length > 0) || (step === 5 && !!date && !!slot) ||
    (step === 6 && !!form.name && form.phone.replace(/\D/g, "").length >= 10);

  const addCurrentItem = () => {
    if (!devType || !brand || !model || !problem) return;
    setItems((current) => [...current, { deviceType: devType, brand, model, repairType: problem }]);
    setDevType("");
    setBrand("");
    setModel("");
    setModelQuery("");
    setProblem("");
    setStep(4);
  };

  const next = () => {
    if (!canNext) return;
    if (step === 3) {
      addCurrentItem();
      return;
    }
    setStep(step + 1);
  };

  const back = () => {
    // Step 4 is the repair list; going back starts a fresh item rather than
    // reopening the problem picker for an item that is already saved.
    setStep(step === 4 ? 0 : Math.max(0, step - 1));
  };

  const submit = () =>
    book.mutate({
      customerName: form.name,
      phone: form.phone,
      email: form.email,
      device: items.map((item) => item.model).join(" · "),
      repairType: items.map((item) => item.repairType).join(" · "),
      items,
      date,
      timeSlot: slot,
      notes: form.notes,
    });

  const stepHead = [
    ["What kind of device is it?", "So we can match parts and the right technician."],
    ["What's the brand?", "This helps us confirm part availability."],
    ["Which model exactly?", "Pick your model, or the closest match."],
    ["What can we fix for you?", "Pick one repair. You can add another device or repair next."],
    ["Your repair list", "Bring multiple devices or repairs to one appointment."],
    ["When should we expect you?", "Pick a day, then a check-in time. Takes about a minute."],
    ["Where can we reach you?", "We'll text or call to confirm within 15 minutes."],
    ["Everything look right?", "Review your repair visit, then confirm."],
  ][step];
  const selectedEstimate = problem
    ? estimateRepair(devType, brand, model, problem)
    : null;
  const now = new Date();
  const todayIso = localIso(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const selectedWindow = date ? storeWindow(date) : null;
  const slotRows = (slots ?? []).map((slot) => ({
    ...slot,
    status: slotStatus(date, slot.slot, !slot.available, now),
  }));
  const openWindowRows = slotRows.filter(
    (slot) => slot.status === "available" || slot.status === "booked",
  );
  const noBookable =
    Boolean(date) && !isFetching && slotRows.length > 0 &&
    !slotRows.some((slot) => slot.status === "available");
  const closedForToday =
    date === todayIso && selectedWindow !== null && nowMinutes >= selectedWindow.close;
  const fullyBooked =
    openWindowRows.length > 0 && openWindowRows.every((slot) => slot.status === "booked");
  const nextDay = days.find((day) => day.iso > date);
  const closingLabel = selectedWindow?.label.split(/\s*[–—-]\s*/)[1] ?? "";
  const canDropOff =
    Boolean(date) && date === todayIso && selectedWindow !== null &&
    nowMinutes >= selectedWindow.open && nowMinutes < selectedWindow.close;
  const slotLabel = slot === DROP_OFF_SLOT ? "Drop-off before close" : slot;

  const requestDropOff = () => {
    setSlot(DROP_OFF_SLOT);
    setStep(6);
  };

  return (
    <>
      <Seo title="Book a Repair" description="Book your repair in under a minute: choose the problem, your device, a time slot, and you're set." />
      <section className="pt-32 pb-20 min-h-[85vh] bg-gradient-to-b from-blush-light to-ivory">
        <div className="max-w-3xl mx-auto px-5">
          {bookingId === null && (
            <>
              {/* progress */}
              <div className="flex items-center gap-1.5 mb-10">
                {STEPS.map((s, i) => (
                  <div key={s} className="flex-1">
                    <div className={`h-1.5 rounded-full transition-all duration-500 ${i <= step ? "bg-burgundy" : "bg-blush"}`} />
                    <p className={`hidden sm:block text-[10px] mt-1.5 text-center tracking-wide ${i === step ? "text-burgundy font-semibold" : "text-ink/35"}`}>{s}</p>
                  </div>
                ))}
              </div>
              <motion.div key={`h${step}`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
                <h1 className="font-serif text-3xl md:text-4xl text-ink">{stepHead[0]}</h1>
                <p className="text-ink/50 mt-2 text-[15px]">{stepHead[1]}</p>
              </motion.div>
            </>
          )}

          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>

              {/* 0 — problem */}
              {step === 3 && (
                <div className="grid sm:grid-cols-2 gap-3">
                  {PROBLEMS.map((p) => {
                    const estimate = estimateRepair(devType, brand, model, p.id);
                    return (
                      <button key={p.id} onClick={() => setProblem(p.id)}
                        className={`flex items-center gap-4 p-5 rounded-2xl border bg-white text-left transition-all duration-300 ${problem === p.id ? sel : card}`}>
                        <span className={`w-11 h-11 rounded-xl grid place-items-center shrink-0 ${problem === p.id ? "bg-burgundy text-ivory" : "bg-blush text-burgundy"}`}><p.icon size={20} /></span>
                        <span className="min-w-0">
                          <span className="block font-semibold text-[15px]">{p.id}</span>
                          <span className="block text-[12.5px] text-ink/45 mt-0.5">{p.desc}</span>
                          {estimate && (
                            <span className="mt-1.5 block text-[12px] font-semibold text-burgundy">
                              {estimate.label}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                  {selectedEstimate && (
                    <p className="sm:col-span-2 rounded-2xl bg-blush-light/70 px-4 py-3 text-[12px] text-ink/55">
                      Selected estimate: <span className="font-semibold text-burgundy">{selectedEstimate.label}</span>
                      {" · "}{REPAIR_ESTIMATE_NOTE}
                    </p>
                  )}
                  {items.length >= MAX_ITEMS && (
                    <p className="sm:col-span-2 rounded-2xl bg-amber-50 px-4 py-3 text-[12.5px] text-amber-800">
                      You have reached the {MAX_ITEMS}-repair limit for one booking. Call {STORE.phone} if you need a larger drop-off.
                    </p>
                  )}
                </div>
              )}

              {/* 1 — device type */}
              {step === 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {DEVICE_TYPES.map((d) => (
                    <button key={d.id} onClick={() => { setDevType(d.id); setBrand(""); setModel(""); setStep(1); }}
                      className={`flex flex-col items-center gap-3 p-7 rounded-2xl border bg-white transition-all duration-300 ${devType === d.id ? sel : card}`}>
                      <d.icon size={34} strokeWidth={1.4} className={devType === d.id ? "text-burgundy" : "text-ink/50"} />
                      <span className="font-semibold text-sm">{d.id}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* 2 — brand */}
              {step === 1 && (
                <div className="grid grid-cols-2 gap-3">
                  {(BRANDS[devType] ?? []).map((b) => (
                    <button key={b} onClick={() => { setBrand(b); setModel(""); setModelQuery(""); setStep(2); }}
                      className={`p-5 rounded-2xl border bg-white text-left font-semibold text-[15px] transition-all duration-300 flex items-center justify-between ${brand === b ? sel : card}`}>
                      {b} <ChevronRight size={17} className="text-ink/30" />
                    </button>
                  ))}
                </div>
              )}

              {/* 3 — model */}
              {step === 2 && (
                <div className="overflow-hidden rounded-2xl border border-blush bg-white">
                  <div className="border-b border-blush/60 p-3">
                    <div className="relative">
                      <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/35" />
                      <input
                        type="search"
                        value={modelQuery}
                        onChange={(event) => setModelQuery(event.target.value)}
                        placeholder={`Search ${brand} models…`}
                        aria-label={`Search ${brand} models`}
                        className="w-full rounded-xl border border-ink/10 bg-ivory py-2.5 pl-10 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-ink/30 focus:border-burgundy"
                      />
                    </div>
                    <p className="mt-2 px-1 text-[10.5px] text-ink/35">
                      {models.length} model{models.length === 1 ? "" : "s"} · newer models first
                    </p>
                  </div>
                  <div className="max-h-[46vh] divide-y divide-blush/60 overflow-y-auto">
                    {models.map((m) => (
                      <button key={m} onClick={() => { setModel(m); setModelQuery(""); setStep(3); }}
                        className={`flex w-full items-center justify-between px-6 py-4 text-left text-[15px] transition-colors ${model === m ? "bg-blush font-semibold text-burgundy" : "hover:bg-blush-light"}`}>
                        {m}
                        {model === m && <Check size={17} />}
                      </button>
                    ))}
                    {models.length === 0 && (
                      <div className="px-6 py-8 text-center text-sm text-ink/45">
                        <p>No model matches “{modelQuery}”.</p>
                        <p className="mt-1 text-xs text-ink/35">
                          Try a shorter search, or go back and choose the closest “Other” option.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 4 — repair list */}
              {step === 4 && (
                <div>
                  <div className="space-y-3">
                    {items.map((item, index) => {
                      const estimate = estimateRepair(
                        item.deviceType,
                        item.brand,
                        item.model,
                        item.repairType,
                      );
                      return (
                        <div key={`${item.model}-${item.repairType}-${index}`} className="flex items-start gap-4 rounded-2xl border border-blush bg-white p-5">
                          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blush text-burgundy">
                            {item.deviceType === "Tablet" ? <Tablet size={20} /> : item.deviceType === "Laptop" ? <Laptop size={20} /> : item.deviceType === "Console" ? <Gamepad2 size={20} /> : <Smartphone size={20} />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-[15px] text-ink">{formatBookingDevice(item.brand, item.model)}</p>
                            <p className="mt-0.5 text-[13px] text-burgundy">{item.repairType}</p>
                            {estimate && (
                              <p className="mt-1 text-[12px] font-semibold text-ink/50">{estimate.label}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                            aria-label={`Remove ${item.model} ${item.repairType} from booking`}
                            className="rounded-full p-2 text-ink/30 transition-colors hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {items.length < MAX_ITEMS ? (
                    <button
                      type="button"
                      onClick={() => setStep(0)}
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-burgundy/30 bg-blush-light/50 px-5 py-4 text-sm font-semibold text-burgundy transition-colors hover:border-burgundy hover:bg-blush"
                    >
                      <Plus size={17} /> Add another device or repair
                    </button>
                  ) : (
                    <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-[12.5px] text-amber-800">
                      You can book up to {MAX_ITEMS} repairs at once. Call {STORE.phone} for a larger drop-off.
                    </p>
                  )}

                  <p className="mt-4 text-[12.5px] leading-relaxed text-ink/45">
                    One appointment covers every item above. Diagnostics are free and we will confirm each quote before starting.
                  </p>
                </div>
              )}

              {/* 5 — schedule */}
              {step === 5 && (
                <div>
                  <p className="text-xs tracking-[0.2em] uppercase text-ink/45 mb-3">Choose a day</p>
                  <div className="flex gap-2 overflow-x-auto pb-3 mb-7">
                    {days.map((d) => (
                      <button key={d.iso} onClick={() => { setDate(d.iso); setSlot(""); }}
                        className={`shrink-0 w-[68px] py-3.5 rounded-2xl border text-center transition-all duration-300 ${date === d.iso ? "border-burgundy bg-burgundy text-ivory" : "border-ink/10 bg-white text-ink/60 hover:border-burgundy/40"}`}>
                        <span className="block text-[11px] uppercase opacity-70">{d.isToday ? "Today" : d.day}</span>
                        <span className="block font-serif text-xl mt-0.5">{d.num}</span>
                        <span className="block text-[11px] opacity-70">{d.month}</span>
                      </button>
                    ))}
                  </div>
                  {date && (
                    <>
                      <p className="mb-1 text-xs tracking-[0.2em] uppercase text-ink/45">Check-in time</p>
                      <p className="mb-3 text-[11px] leading-relaxed text-ink/40">
                        Struck-through times are booked. Faded times are outside shop hours or have already passed.
                      </p>
                      {isFetching ? <p className="text-ink/40 text-sm py-4">Checking availability…</p> : (
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
                          {slotRows.map((s) => {
                            const bookable = s.status === "available";
                            const stateClass = bookable
                              ? slot === s.slot
                                ? "border-burgundy bg-burgundy text-ivory font-semibold"
                                : "border-ink/10 bg-white text-ink/60 hover:border-burgundy/40"
                              : s.status === "booked"
                                ? "border-ink/10 bg-white text-ink/35 line-through cursor-not-allowed"
                                : "border-ink/10 bg-white text-ink/30 cursor-not-allowed";
                            return (
                              <button
                                key={s.slot}
                                disabled={!bookable}
                                onClick={() => setSlot(s.slot)}
                                aria-label={`${s.slot} — ${s.status}`}
                                className={`py-3.5 rounded-2xl border text-sm transition-all duration-300 ${stateClass}`}
                              >
                                {s.slot}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {noBookable && (
                        <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-[12.5px] leading-relaxed text-amber-800">
                          {closedForToday
                            ? `We're closed for today. ${new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" })} hours are ${selectedWindow?.label}.`
                            : fullyBooked
                              ? "Every remaining check-in time for this day is booked."
                              : "No timed check-ins are left for this day."}
                          {canDropOff && (
                            <div className="mt-3">
                              <p>
                                We're still open until {closingLabel}. Request a same-day drop-off and we'll take it in before close.
                              </p>
                              <button
                                type="button"
                                onClick={requestDropOff}
                                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-burgundy px-4 py-2 text-[12px] font-semibold text-ivory transition-colors hover:bg-burgundy-dark"
                              >
                                Request same-day drop-off
                              </button>
                            </div>
                          )}
                          {nextDay && (
                            <button
                              type="button"
                              onClick={() => { setDate(nextDay.iso); setSlot(""); }}
                              className="ml-1 font-semibold underline underline-offset-2 hover:text-amber-950"
                            >
                              Choose {nextDay.day} {nextDay.num} {nextDay.month}
                            </button>
                          )}
                          {!nextDay && !canDropOff && ` Call ${STORE.phone} for help.`}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* 6 — details */}
              {step === 6 && (
                <div className="grid sm:grid-cols-2 gap-4">
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name *" aria-label="Full name" className="border border-ink/15 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-burgundy bg-white" />
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone number *" aria-label="Phone number" type="tel" className="border border-ink/15 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-burgundy bg-white" />
                  <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email (for confirmation)" aria-label="Email for confirmation" type="email" className="sm:col-span-2 border border-ink/15 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-burgundy bg-white" />
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything we should know? (e.g. dropped it yesterday, screen flickers)" aria-label="Notes about the repair" rows={3} className="sm:col-span-2 border border-ink/15 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-burgundy bg-white resize-none" />
                  <p className="sm:col-span-2 text-[12.5px] text-ink/45 leading-relaxed">By booking, you agree to our repair terms: free diagnostic first, and we'll always confirm the final quote with you before any work begins. We never access your personal data.</p>
                </div>
              )}

              {/* 7 — review */}
              {step === 7 && (
                <div>
                  <div className="bg-white rounded-3xl border border-blush overflow-hidden">
                    <div className="p-7 border-b border-blush">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-serif text-xl">
                            {items.length} repair{items.length === 1 ? "" : "s"} in one visit
                          </p>
                          <p className="mt-1 text-[12.5px] text-ink/45">
                            We will diagnose each item and confirm every quote before work starts.
                          </p>
                        </div>
                        <button onClick={() => setStep(4)} className="shrink-0 text-xs text-ink/40 hover:text-burgundy underline underline-offset-2">Edit</button>
                      </div>
                      <ul className="mt-5 space-y-3">
                        {items.map((item, index) => {
                          const estimate = estimateRepair(
                            item.deviceType,
                            item.brand,
                            item.model,
                            item.repairType,
                          );
                          return (
                            <li key={`${item.model}-${item.repairType}-${index}`} className="flex items-start gap-3 rounded-2xl bg-blush-light/70 px-4 py-3">
                              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ivory text-burgundy">
                                {item.deviceType === "Tablet" ? <Tablet size={16} /> : item.deviceType === "Laptop" ? <Laptop size={16} /> : item.deviceType === "Console" ? <Gamepad2 size={16} /> : <Smartphone size={16} />}
                              </span>
                              <span className="min-w-0">
                                <span className="block text-[13.5px] font-semibold text-ink">{formatBookingDevice(item.brand, item.model)}</span>
                                <span className="block text-[12.5px] text-burgundy">{item.repairType}</span>
                                {estimate && (
                                  <span className="block text-[11.5px] font-medium text-ink/45">{estimate.label}</span>
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                      <p className="mt-4 text-[11.5px] leading-relaxed text-ink/40">
                        Shown prices are market-based starting estimates. {REPAIR_ESTIMATE_NOTE}
                      </p>
                    </div>
                    <dl className="p-7 text-sm space-y-3.5">
                      {[
                        ["Store", `${STORE.address}, ${STORE.city}`],
                        ["Date", new Date(date + "T12:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })],
                        ["Arrival", slotLabel],
                        ["Name", form.name],
                        ["Phone", form.phone],
                        ["Email", form.email || "—"],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-4"><dt className="text-ink/45">{k}</dt><dd className="font-medium text-right">{v}</dd></div>
                      ))}
                    </dl>
                    <div className="px-7 pb-7 grid grid-cols-3 gap-3 text-center">
                      {([[ShieldCheck, "Lifetime warranty"], [Zap, "Same-day service"], [Search, "Free diagnostic"]] as const).map(([Icon, l], i) => (
                        <div key={i} className="bg-blush-light rounded-2xl py-4 px-2">
                          <Icon size={18} className="text-burgundy mx-auto mb-1.5" />
                          <p className="text-[11.5px] font-medium text-ink/60">{l}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 8 — confirmation */}
              {step === 8 && bookingId !== null && (
                <div className="text-center pt-6">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 14 }}
                    className="w-24 h-24 rounded-full bg-burgundy text-ivory grid place-items-center mx-auto mb-8"><PartyPopper size={40} /></motion.div>
                  <h1 className="font-serif text-4xl text-ink mb-3">You're booked in!</h1>
                  <p className="text-ink/55 max-w-md mx-auto leading-relaxed">
                    Confirmation <b className="text-burgundy">#PPR-{bookingId}</b> · {items.length} repair{items.length === 1 ? "" : "s"} · {new Date(date + "T12:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}{slot === DROP_OFF_SLOT ? " for a same-day drop-off" : ` at ${slot}`}.
                    We'll call <b>{form.phone}</b> within 15 minutes during business hours to confirm.
                  </p>
                  <div className="grid sm:grid-cols-3 gap-3 max-w-2xl mx-auto mt-10 text-left">
                    {[["1", "We diagnose free", "Bring your device in — we'll pinpoint the issue at no cost."],
                      ["2", "You approve the quote", "No work starts until you say yes. No surprises."],
                      ["3", "Fixed same day", "Most repairs done in under an hour, with warranty."]].map(([n, t, d]) => (
                      <div key={n} className="bg-white border border-blush rounded-2xl p-5">
                        <p className="font-serif text-2xl text-burgundy/40 mb-2">{n}</p>
                        <p className="font-semibold text-sm">{t}</p>
                        <p className="text-[12.5px] text-ink/50 mt-1 leading-relaxed">{d}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-9 text-sm text-ink/50 flex items-center justify-center gap-2">
                    <MapPin size={15} className="text-burgundy" /> {STORE.address}, {STORE.city} · {STORE.phone}
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* nav */}
          {bookingId === null && (
            <div className="flex justify-between items-center mt-10">
              <button onClick={back} disabled={step === 0}
                className="inline-flex items-center gap-2 text-sm font-medium text-ink/50 hover:text-burgundy disabled:opacity-0 transition-colors">
                <ChevronLeft size={16} /> Back
              </button>
              {step < 6 ? (
                <button onClick={next} disabled={!canNext}
                  className="inline-flex items-center gap-2 bg-burgundy text-ivory font-semibold px-8 py-4 rounded-full hover:bg-burgundy-dark hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300">
                  {step === 3 ? "Add repair" : step === 4 ? "Choose a time" : "Continue"} <ChevronRight size={16} />
                </button>
              ) : step === 6 ? (
                <button onClick={next} disabled={!canNext}
                  className="inline-flex items-center gap-2 bg-burgundy text-ivory font-semibold px-8 py-4 rounded-full hover:bg-burgundy-dark hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300">
                  Review Booking <ChevronRight size={16} />
                </button>
              ) : (
                <button onClick={submit} disabled={book.isPending}
                  className="bg-burgundy text-ivory font-semibold px-9 py-4 rounded-full hover:bg-burgundy-dark hover:-translate-y-0.5 disabled:opacity-50 transition-all duration-300">
                  {book.isPending ? "Confirming…" : "Confirm Booking"}
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
