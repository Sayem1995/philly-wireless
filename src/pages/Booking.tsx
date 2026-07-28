import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import Seo from "@/components/Seo";
import { STORE } from "@contracts/constants";
import { motion, AnimatePresence } from "framer-motion";
import {
  Smartphone, Tablet, Laptop, Gamepad2, Battery, Plug, Layers, Camera,
  Droplets, Volume2, HelpCircle, Check, ChevronLeft, ChevronRight,
  MapPin, ShieldCheck, Zap, Search, PartyPopper,
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

const MODELS: Record<string, string[]> = {
  Apple: ["iPhone 17 Pro Max", "iPhone 17 Pro", "iPhone 17", "iPhone 16 Pro Max", "iPhone 16 Pro", "iPhone 16", "iPhone 15 Pro Max", "iPhone 15 Pro", "iPhone 15", "iPhone 14 Pro Max", "iPhone 14", "iPhone 13", "iPhone 12", "iPhone 11", "iPhone XR / X", "iPhone SE"],
  Samsung: ["Galaxy S25 Ultra", "Galaxy S25", "Galaxy S24 Ultra", "Galaxy S24", "Galaxy S23 Ultra", "Galaxy S23", "Galaxy S22", "Galaxy S21", "Galaxy Note 20", "Galaxy A55", "Galaxy A35", "Galaxy Z Fold / Flip"],
  Google: ["Pixel 10 Pro", "Pixel 10", "Pixel 9 Pro", "Pixel 9", "Pixel 8 Pro", "Pixel 8", "Pixel 7 Pro", "Pixel 7", "Pixel 6", "Pixel 5"],
  Motorola: ["Moto G (2025)", "Moto G Power", "Moto G Stylus", "Edge (2024)", "Razr+", "Other Motorola"],
  OnePlus: ["OnePlus 13", "OnePlus 12", "OnePlus 11", "OnePlus Nord", "Other OnePlus"],
  Other: ["Other phone model"],
  "Apple iPad": ["iPad Pro 13\"", "iPad Pro 11\"", "iPad Air", "iPad (10th Gen)", "iPad (9th Gen)", "iPad mini"],
  "Samsung Galaxy Tab": ["Galaxy Tab S10", "Galaxy Tab S9", "Galaxy Tab S8", "Galaxy Tab A9", "Galaxy Tab A8"],
  "Other Tablet": ["Other tablet model"],
  "Apple MacBook": ["MacBook Pro 16\"", "MacBook Pro 14\"", "MacBook Pro 13\"", "MacBook Air 15\"", "MacBook Air 13\""],
  "Windows Laptop": ["Dell", "HP", "Lenovo", "Asus", "Acer", "Microsoft Surface", "Other laptop"],
  PlayStation: ["PlayStation 5 Pro", "PlayStation 5", "PlayStation 4"],
  Xbox: ["Xbox Series X", "Xbox Series S", "Xbox One"],
};

const STEPS = ["Device", "Brand", "Model", "Problem", "Schedule", "Details", "Review"];

function nextDays(n: number) {
  const out: { iso: string; day: string; num: string; month: string }[] = [];
  const d = new Date();
  while (out.length < n) {
    d.setDate(d.getDate() + 1);
    out.push({
      iso: d.toISOString().slice(0, 10),
      day: d.toLocaleDateString("en-US", { weekday: "short" }),
      num: String(d.getDate()),
      month: d.toLocaleDateString("en-US", { month: "short" }),
    });
  }
  return out;
}

const sel = "border-burgundy bg-blush ring-2 ring-burgundy/20";
const card = "border-ink/10 hover:border-burgundy/50 hover:-translate-y-0.5 hover:shadow-md";

export default function Booking() {
  const [step, setStep] = useState(0);
  const [problem, setProblem] = useState("");
  const [devType, setDevType] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const [bookingId, setBookingId] = useState<number | null>(null);

  const days = useMemo(() => nextDays(10), []);
  const { data: slots, isFetching } = trpc.shop.slots.useQuery({ date }, { enabled: !!date });
  const book = trpc.shop.book.useMutation({
    onSuccess: (r) => { setBookingId(r.bookingId); setStep(7); window.scrollTo({ top: 0, behavior: "smooth" }); },
    onError: (e) => toast.error(e.message),
  });

  const canNext =
    (step === 0 && !!devType) || (step === 1 && !!brand) || (step === 2 && !!model) ||
    (step === 3 && !!problem) || (step === 4 && !!date && !!slot) ||
    (step === 5 && !!form.name && form.phone.replace(/\D/g, "").length >= 10);

  const next = () => canNext && setStep(step + 1);
  const back = () => setStep(Math.max(0, step - 1));

  const submit = () =>
    book.mutate({
      customerName: form.name, phone: form.phone, email: form.email,
      device: model, repairType: problem, date, timeSlot: slot, notes: form.notes,
    });

  const stepHead = [
    ["What kind of device is it?", "So we can match parts and the right technician."],
    ["What's the brand?", "This helps us confirm part availability."],
    ["Which model exactly?", "Pick your model, or the closest match."],
    ["What can we fix for you?", "Pick the problem — we'll handle the rest."],
    ["When should we expect you?", "Pick a day, then a check-in time. Takes about a minute."],
    ["Where can we reach you?", "We'll text or call to confirm within 15 minutes."],
    ["Everything look right?", "Review your repair visit, then confirm."],
  ][step];

  return (
    <>
      <Seo title="Book a Repair — Philly Phone Repair" description="Book your repair in under a minute: choose the problem, your device, a time slot, and you're set." />
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
                  {PROBLEMS.map((p) => (
                    <button key={p.id} onClick={() => { setProblem(p.id); setStep(4); }}
                      className={`flex items-center gap-4 p-5 rounded-2xl border bg-white text-left transition-all duration-300 ${problem === p.id ? sel : card}`}>
                      <span className={`w-11 h-11 rounded-xl grid place-items-center shrink-0 ${problem === p.id ? "bg-burgundy text-ivory" : "bg-blush text-burgundy"}`}><p.icon size={20} /></span>
                      <span><span className="block font-semibold text-[15px]">{p.id}</span><span className="block text-[12.5px] text-ink/45 mt-0.5">{p.desc}</span></span>
                    </button>
                  ))}
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
                    <button key={b} onClick={() => { setBrand(b); setModel(""); setStep(2); }}
                      className={`p-5 rounded-2xl border bg-white text-left font-semibold text-[15px] transition-all duration-300 flex items-center justify-between ${brand === b ? sel : card}`}>
                      {b} <ChevronRight size={17} className="text-ink/30" />
                    </button>
                  ))}
                </div>
              )}

              {/* 3 — model */}
              {step === 2 && (
                <div className="bg-white rounded-2xl border border-blush overflow-hidden divide-y divide-blush/60 max-h-[52vh] overflow-y-auto">
                  {(MODELS[brand] ?? []).map((m) => (
                    <button key={m} onClick={() => { setModel(m); setStep(3); }}
                      className={`w-full flex items-center justify-between px-6 py-4 text-left text-[15px] transition-colors ${model === m ? "bg-blush text-burgundy font-semibold" : "hover:bg-blush-light"}`}>
                      {m}
                      {model === m && <Check size={17} />}
                    </button>
                  ))}
                </div>
              )}

              {/* 4 — schedule */}
              {step === 4 && (
                <div>
                  <p className="text-xs tracking-[0.2em] uppercase text-ink/45 mb-3">Choose a day</p>
                  <div className="flex gap-2 overflow-x-auto pb-3 mb-7">
                    {days.map((d) => (
                      <button key={d.iso} onClick={() => { setDate(d.iso); setSlot(""); }}
                        className={`shrink-0 w-[68px] py-3.5 rounded-2xl border text-center transition-all duration-300 ${date === d.iso ? "border-burgundy bg-burgundy text-ivory" : "border-ink/10 bg-white text-ink/60 hover:border-burgundy/40"}`}>
                        <span className="block text-[11px] uppercase opacity-70">{d.day}</span>
                        <span className="block font-serif text-xl mt-0.5">{d.num}</span>
                        <span className="block text-[11px] opacity-70">{d.month}</span>
                      </button>
                    ))}
                  </div>
                  {date && (
                    <>
                      <p className="text-xs tracking-[0.2em] uppercase text-ink/45 mb-3">Check-in time</p>
                      {isFetching ? <p className="text-ink/40 text-sm py-4">Checking availability…</p> : (
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
                          {(slots ?? []).map((s) => (
                            <button key={s.slot} disabled={!s.available} onClick={() => setSlot(s.slot)}
                              className={`py-3.5 rounded-2xl border text-sm transition-all duration-300 ${!s.available ? "opacity-30 line-through cursor-not-allowed border-ink/10 bg-white" : slot === s.slot ? "border-burgundy bg-burgundy text-ivory font-semibold" : "border-ink/10 bg-white text-ink/60 hover:border-burgundy/40"}`}>
                              {s.slot}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* 5 — details */}
              {step === 5 && (
                <div className="grid sm:grid-cols-2 gap-4">
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name *" className="border border-ink/15 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-burgundy bg-white" />
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone number *" type="tel" className="border border-ink/15 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-burgundy bg-white" />
                  <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email (for confirmation)" type="email" className="sm:col-span-2 border border-ink/15 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-burgundy bg-white" />
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything we should know? (e.g. dropped it yesterday, screen flickers)" rows={3} className="sm:col-span-2 border border-ink/15 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-burgundy bg-white resize-none" />
                  <p className="sm:col-span-2 text-[12.5px] text-ink/45 leading-relaxed">By booking, you agree to our repair terms: free diagnostic first, and we'll always confirm the final quote with you before any work begins. We never access your personal data.</p>
                </div>
              )}

              {/* 6 — review */}
              {step === 6 && (
                <div>
                  <div className="bg-white rounded-3xl border border-blush overflow-hidden">
                    <div className="p-7 border-b border-blush flex items-start gap-5">
                      <span className="w-12 h-12 rounded-2xl bg-blush grid place-items-center shrink-0"><Smartphone size={22} className="text-burgundy" /></span>
                      <div className="flex-1">
                        <p className="font-serif text-xl">{model}</p>
                        <p className="text-sm text-burgundy font-medium mt-0.5">{problem}</p>
                      </div>
                      <button onClick={() => setStep(0)} className="text-xs text-ink/40 hover:text-burgundy underline underline-offset-2">Change</button>
                    </div>
                    <dl className="p-7 text-sm space-y-3.5">
                      {[
                        ["Store", `${STORE.address}, ${STORE.city}`],
                        ["Date", new Date(date + "T12:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })],
                        ["Check-in time", slot],
                        ["Name", form.name],
                        ["Phone", form.phone],
                        ["Email", form.email || "—"],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-4"><dt className="text-ink/45">{k}</dt><dd className="font-medium text-right">{v}</dd></div>
                      ))}
                    </dl>
                    <div className="px-7 pb-7 grid grid-cols-3 gap-3 text-center">
                      {[[ShieldCheck, "Lifetime warranty"], [Zap, "Same-day service"], [Search, "Free diagnostic"]].map(([Icon, l]: any, i) => (
                        <div key={i} className="bg-blush-light rounded-2xl py-4 px-2">
                          <Icon size={18} className="text-burgundy mx-auto mb-1.5" />
                          <p className="text-[11.5px] font-medium text-ink/60">{l}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 7 — confirmation */}
              {step === 7 && bookingId !== null && (
                <div className="text-center pt-6">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 14 }}
                    className="w-24 h-24 rounded-full bg-burgundy text-ivory grid place-items-center mx-auto mb-8"><PartyPopper size={40} /></motion.div>
                  <h1 className="font-serif text-4xl text-ink mb-3">You're booked in!</h1>
                  <p className="text-ink/55 max-w-md mx-auto leading-relaxed">
                    Confirmation <b className="text-burgundy">#PPR-{bookingId}</b> · {new Date(date + "T12:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} at {slot}.
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
              {step < 5 ? (
                <button onClick={next} disabled={!canNext}
                  className="inline-flex items-center gap-2 bg-burgundy text-ivory font-semibold px-8 py-4 rounded-full hover:bg-burgundy-dark hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300">
                  Continue <ChevronRight size={16} />
                </button>
              ) : step === 5 ? (
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
