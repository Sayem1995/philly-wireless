import { useState } from "react";
import Seo from "@/components/Seo";
import Reveal from "@/components/Reveal";
import { FAQS } from "@/data/static";
import { Plus } from "lucide-react";
import { Link } from "react-router";

export default function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <>
      <Seo title="FAQ — Philly Phone Repair" description="Answers about repair times, parts quality, warranties, data safety, walk-ins and more at Philly Phone Repair." />
      <section className="pt-36 pb-14 bg-gradient-to-b from-blush-light to-ivory text-center">
        <Reveal className="max-w-2xl mx-auto px-5">
          <p className="text-xs tracking-[0.35em] uppercase text-burgundy font-semibold mb-4">FAQ</p>
          <h1 className="font-serif text-5xl text-ink">Good to know.</h1>
        </Reveal>
      </section>
      <section className="pb-24 max-w-3xl mx-auto px-5">
        <div className="space-y-3">
          {FAQS.map((f, i) => (
            <Reveal key={i} delay={i * 0.04}>
              <div className="bg-white border border-blush rounded-2xl overflow-hidden">
                <button onClick={() => setOpen(open === i ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-7 py-5 text-left font-serif text-lg text-ink hover:text-burgundy transition-colors"
                  aria-expanded={open === i}>
                  {f.q}
                  <Plus size={20} className={`text-burgundy shrink-0 transition-transform duration-400 ${open === i ? "rotate-45" : ""}`} />
                </button>
                <div className={`grid transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${open === i ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                  <div className="overflow-hidden">
                    <p className="px-7 pb-6 text-[15px] text-ink/60 leading-relaxed">{f.a}</p>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal className="text-center mt-12">
          <p className="text-ink/55 text-sm mb-5">Still have a question?</p>
          <Link to="/contact" className="bg-burgundy text-ivory font-semibold px-8 py-3.5 rounded-full hover:bg-burgundy-dark transition-colors">Contact Us</Link>
        </Reveal>
      </section>
    </>
  );
}
