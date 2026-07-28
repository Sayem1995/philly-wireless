import Seo from "@/components/Seo";
import Reveal from "@/components/Reveal";
import { Link } from "react-router";
import { STATS } from "@/data/static";
import { ShieldCheck, HeartHandshake, Wrench } from "lucide-react";

export default function About() {
  return (
    <>
      <Seo title="About Us — Philly Phone Repair" description="Family-owned device repair shop in Center City Philadelphia since 2011. 20,000+ repairs, certified technicians, lifetime warranty." />
      <section className="pt-36 pb-16 bg-gradient-to-b from-blush-light to-ivory text-center">
        <Reveal className="max-w-2xl mx-auto px-5">
          <p className="text-xs tracking-[0.35em] uppercase text-burgundy font-semibold mb-4">About Us</p>
          <h1 className="font-serif text-5xl text-ink">A neighborhood shop with board-level skills.</h1>
        </Reveal>
      </section>
      <section className="pb-24 max-w-4xl mx-auto px-5">
        <Reveal className="prose-like space-y-6 text-ink/65 leading-relaxed text-[17px]">
          <p>Philly Phone Repair opened on Chestnut Street in 2011 with one bench, one soldering iron, and a simple promise: fix it fast, fix it right, and tell people the truth about what it costs.</p>
          <p>Fifteen years and 20,000+ repairs later, we're still family-owned — but the bench got bigger. Our technicians are certified in micro-soldering and board-level diagnostics, which means we fix the devices other shops call "unfixable": water-damaged boards, dead HDMI ports, phones that won't boot.</p>
          <p>We believe repair is better than replace — for your wallet and for the planet. Every device we save from a landfill is a small win, and every customer who walks out with a lifetime warranty card is a bigger one.</p>
        </Reveal>
        <div className="grid md:grid-cols-3 gap-5 mt-16">
          {[
            { icon: Wrench, t: "Certified Technicians", d: "Micro-soldering and board-level repair — not just part swapping." },
            { icon: ShieldCheck, t: "Lifetime Warranty", d: "Screen repairs covered for as long as you own the device." },
            { icon: HeartHandshake, t: "Honest Pricing", d: "Free diagnostics, published prices, no surprise fees. Ever." },
          ].map((v, i) => (
            <Reveal key={v.t} delay={i * 0.08}>
              <div className="bg-white rounded-3xl border border-blush p-8 text-center hover:-translate-y-2 hover:shadow-xl hover:shadow-burgundy/10 transition-all duration-500">
                <div className="w-12 h-12 rounded-2xl bg-blush grid place-items-center mx-auto mb-5"><v.icon size={22} className="text-burgundy" /></div>
                <h3 className="font-serif text-xl mb-2">{v.t}</h3>
                <p className="text-sm text-ink/55 leading-relaxed">{v.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-16 bg-burgundy text-ivory rounded-3xl p-10 text-center">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {STATS.map((s) => (
              <div key={s.label}>
                <p className="font-serif text-3xl">{s.value}{s.suffix}</p>
                <p className="text-blush/70 text-[11px] tracking-[0.2em] uppercase mt-1">{s.label}</p>
              </div>
            ))}
          </div>
          <Link to="/book" className="inline-block mt-9 bg-ivory text-burgundy font-semibold px-8 py-3.5 rounded-full hover:-translate-y-1 transition-transform duration-300">Book a Repair</Link>
        </Reveal>
      </section>
    </>
  );
}
