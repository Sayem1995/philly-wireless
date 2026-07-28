import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import Seo from "@/components/Seo";
import Reveal from "@/components/Reveal";
import { SERVICES } from "@/data/static";

export default function Services() {
  return (
    <>
      <Seo title="Repair Services — Philly Phone Repair" description="Screen, battery, charging port, water damage, camera, speaker, iPad, laptop, MacBook and console HDMI repair in Center City Philadelphia." />
      <section className="pt-36 pb-16 bg-gradient-to-b from-blush-light to-ivory text-center">
        <Reveal className="max-w-2xl mx-auto px-5">
          <p className="text-xs tracking-[0.35em] uppercase text-burgundy font-semibold mb-4">Repair Services</p>
          <h1 className="font-serif text-5xl text-ink">If it breaks, we fix it.</h1>
          <p className="mt-5 text-ink/55 leading-relaxed">Free diagnostics on every device. Premium parts, certified technicians, and a written warranty on every repair.</p>
        </Reveal>
      </section>
      <section className="pb-24">
        <div className="max-w-7xl mx-auto px-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {SERVICES.map((s, i) => (
            <Reveal key={s.title} delay={(i % 3) * 0.07}>
              <div className="group bg-white rounded-3xl border border-blush p-8 h-full hover:-translate-y-2 hover:shadow-xl hover:shadow-burgundy/10 hover:border-burgundy/30 transition-all duration-500">
                <div className="w-13 h-13 w-[52px] h-[52px] rounded-2xl bg-blush grid place-items-center mb-6 group-hover:bg-burgundy transition-colors duration-500">
                  <s.icon size={24} className="text-burgundy group-hover:text-ivory transition-colors duration-500" />
                </div>
                <h2 className="font-serif text-2xl text-ink mb-3">{s.title}</h2>
                <p className="text-sm text-ink/55 leading-relaxed mb-5">{s.desc}</p>
                <div className="flex items-center justify-between">
                  <Link to="/book" className="text-sm text-ink/40 group-hover:text-burgundy inline-flex items-center gap-1.5 transition-colors">
                    Book <ArrowRight size={15} />
                  </Link>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal className="text-center mt-16">
          <Link to="/book" className="bg-burgundy text-ivory font-semibold px-9 py-4 rounded-full hover:bg-burgundy-dark hover:-translate-y-1 hover:shadow-xl hover:shadow-burgundy/25 transition-all duration-300 inline-block">
            Book Your Repair
          </Link>
        </Reveal>
      </section>
    </>
  );
}
