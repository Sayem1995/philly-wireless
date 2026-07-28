import { useState } from "react";
import { trpc } from "@/providers/trpc";
import Seo from "@/components/Seo";
import Reveal from "@/components/Reveal";
import { STORE } from "@contracts/constants";
import { Phone, Mail, MapPin, Clock } from "lucide-react";
import { toast } from "sonner";

export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const send = trpc.shop.contact.useMutation({
    onSuccess: () => { toast.success("Message sent — we'll reply within a few hours."); setForm({ name: "", email: "", phone: "", message: "" }); },
    onError: () => toast.error("Something went wrong — please call us instead."),
  });
  const field = "w-full border border-ink/15 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-burgundy bg-white";
  return (
    <>
      <Seo title="Contact Us — Philly Phone Repair" description="Visit Philly Phone Repair at 1033 Chestnut Street, Philadelphia PA 19107. Call (215) 555-0123 or send us a message." />
      <section className="pt-36 pb-14 bg-gradient-to-b from-blush-light to-ivory text-center">
        <Reveal className="max-w-2xl mx-auto px-5">
          <p className="text-xs tracking-[0.35em] uppercase text-burgundy font-semibold mb-4">Contact</p>
          <h1 className="font-serif text-5xl text-ink">Find us in Center City.</h1>
        </Reveal>
      </section>
      <section className="pb-24 max-w-6xl mx-auto px-5 grid lg:grid-cols-2 gap-6">
        <Reveal className="space-y-4">
          {[
            { icon: MapPin, label: "Address", value: `${STORE.address}, ${STORE.city}`, href: "https://maps.google.com/?q=1033+Chestnut+Street+Philadelphia+PA+19107" },
            { icon: Phone, label: "Phone", value: STORE.phone, href: STORE.phoneHref },
            { icon: Mail, label: "Email", value: STORE.email, href: `mailto:${STORE.email}` },
            { icon: Clock, label: "Hours", value: "Mon–Fri 9AM–7PM · Sat 10AM–6PM · Sun 12PM–5PM" },
          ].map((r) => (
            <a key={r.label} href={r.href} target={r.href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer"
              className="flex items-center gap-5 bg-white border border-blush rounded-3xl p-6 hover:-translate-y-1 hover:shadow-lg hover:shadow-burgundy/10 transition-all duration-400 group">
              <span className="w-12 h-12 rounded-2xl bg-blush grid place-items-center group-hover:bg-burgundy transition-colors duration-300"><r.icon size={20} className="text-burgundy group-hover:text-ivory transition-colors" /></span>
              <span><span className="block text-[11px] tracking-[0.2em] uppercase text-ink/40">{r.label}</span><span className="block font-medium mt-0.5">{r.value}</span></span>
            </a>
          ))}
          <div className="rounded-3xl overflow-hidden border border-blush h-72">
            <iframe title="Philly Phone Repair location map" src="https://maps.google.com/maps?q=1033%20Chestnut%20Street%2C%20Philadelphia%2C%20PA%2019107&output=embed"
              className="w-full h-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <form className="bg-white border border-blush rounded-3xl p-8 md:p-10 space-y-4"
            onSubmit={(e) => { e.preventDefault(); send.mutate(form); }}>
            <h2 className="font-serif text-2xl mb-2">Send us a message</h2>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" className={field} aria-label="Your name" />
            <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email address" className={field} aria-label="Email address" />
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone (optional)" className={field} aria-label="Phone number" />
            <textarea required rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="How can we help?" className={`${field} resize-none`} aria-label="Message" />
            <button disabled={send.isPending} className="w-full bg-burgundy text-ivory font-semibold py-4 rounded-full hover:bg-burgundy-dark hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50">
              {send.isPending ? "Sending…" : "Send Message"}
            </button>
          </form>
        </Reveal>
      </section>
    </>
  );
}
