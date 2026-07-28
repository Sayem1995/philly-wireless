import { Link } from "react-router";
import { motion } from "framer-motion";
import { ShieldCheck, Zap, Award, Star, ArrowRight, Phone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Seo from "@/components/Seo";
import Reveal from "@/components/Reveal";
import { SERVICES, TESTIMONIALS, STATS, PROCESS } from "@/data/static";
import { STORE } from "@contracts/constants";

function Counter({ value, suffix, decimals = 0 }: { value: number; suffix: string; decimals?: number }) {
  const [n, setN] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / 1800);
        setN(value * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [value]);
  return <span ref={ref}>{n.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}{suffix}</span>;
}

export default function Home() {
  return (
    <>
      <Seo title="Philly Phone Repair — Same-Day Phone, Tablet & Laptop Repair in Center City" description="Same-day iPhone, Samsung, iPad, MacBook & console repair at 1033 Chestnut Street, Philadelphia. Lifetime warranty. Walk-ins welcome." />
      {/* HERO */}
      <section className="relative min-h-[92vh] flex items-center overflow-hidden pt-24">
        <div className="absolute inset-0 bg-gradient-to-br from-ivory via-blush-light to-blush" />
        <motion.div className="absolute -top-32 -right-32 w-[34rem] h-[34rem] rounded-full bg-burgundy/5"
          animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div className="absolute bottom-10 left-[8%] w-72 h-72 rounded-full bg-burgundy/10 blur-3xl"
          animate={{ y: [0, -30, 0] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }} />
        <div className="relative max-w-7xl mx-auto px-5 grid lg:grid-cols-2 gap-14 items-center py-16">
          <div>
            <motion.p initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}
              className="text-xs tracking-[0.35em] uppercase text-burgundy font-semibold mb-6 flex items-center gap-3">
              <span className="w-8 h-px bg-burgundy" /> Center City · Philadelphia
            </motion.p>
            <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.1 }}
              className="font-serif text-5xl md:text-7xl leading-[1.05] text-ink">
              Fast. Reliable.<br /><em className="text-burgundy">Professional</em> Repair.
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2 }}
              className="mt-6 text-lg text-ink/60 max-w-md leading-relaxed">
              Same-day repairs for iPhone, Samsung, Pixel, iPad, MacBook and game consoles — backed by a lifetime warranty.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.3 }}
              className="mt-9 flex flex-wrap gap-4">
              <Link to="/book" className="bg-burgundy text-ivory font-semibold px-8 py-4 rounded-full hover:bg-burgundy-dark hover:-translate-y-1 hover:shadow-xl hover:shadow-burgundy/25 transition-all duration-300 inline-flex items-center gap-2">
                Book a Repair <ArrowRight size={17} />
              </Link>
              <a href={STORE.phoneHref} className="border border-burgundy/25 text-burgundy font-semibold px-8 py-4 rounded-full hover:bg-blush hover:-translate-y-1 transition-all duration-300 inline-flex items-center gap-2">
                <Phone size={17} /> {STORE.phone}
              </a>
            </motion.div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.5 }}
              className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-[13px] text-ink/55">
              {[[Zap, "Same-Day Repairs"], [ShieldCheck, "Lifetime Warranty"], [Award, "Certified Technicians"]].map(([Icon, label]: any, i) => (
                <span key={i} className="flex items-center gap-2"><Icon size={15} className="text-burgundy" />{label}</span>
              ))}
            </motion.div>
          </div>
          {/* Animated device illustration (2D) */}
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, delay: 0.25 }}
            className="relative hidden lg:block">
            <motion.div animate={{ y: [0, -14, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="relative mx-auto w-[300px]">
              <div className="rounded-[3rem] border-[10px] border-ink bg-gradient-to-br from-burgundy via-burgundy-light to-blush-dark aspect-[9/19] shadow-2xl shadow-burgundy/30 overflow-hidden relative">
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-24 h-6 bg-ink rounded-full" />
                <div className="absolute inset-0 flex flex-col items-center justify-center text-ivory">
                  <ShieldCheck size={52} className="mb-4 opacity-90" />
                  <p className="font-serif text-2xl">Lifetime</p>
                  <p className="font-serif text-2xl">Warranty</p>
                </div>
              </div>
              <motion.div animate={{ y: [0, 10, 0], rotate: [0, 6, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                className="absolute -left-16 top-16 bg-ivory rounded-2xl shadow-xl px-5 py-4 border border-blush">
                <p className="text-2xl font-serif text-burgundy">4.9★</p>
                <p className="text-[11px] text-ink/50">2,300+ reviews</p>
              </motion.div>
              <motion.div animate={{ y: [0, -8, 0], rotate: [0, -5, 0] }} transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                className="absolute -right-14 bottom-20 bg-ivory rounded-2xl shadow-xl px-5 py-4 border border-blush">
                <p className="text-2xl font-serif text-burgundy">30 min</p>
                <p className="text-[11px] text-ink/50">average repair</p>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* SERVICES PREVIEW */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-5">
          <Reveal className="text-center max-w-xl mx-auto mb-16">
            <p className="text-xs tracking-[0.35em] uppercase text-burgundy font-semibold mb-4">What We Fix</p>
            <h2 className="font-serif text-4xl md:text-5xl text-ink">Every repair. One roof.</h2>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {SERVICES.slice(0, 8).map((s, i) => (
              <Reveal key={s.title} delay={i * 0.06}>
                <Link to="/services" className="group block bg-white rounded-3xl border border-blush p-7 h-full hover:-translate-y-2 hover:shadow-xl hover:shadow-burgundy/10 hover:border-burgundy/30 transition-all duration-500">
                  <div className="w-12 h-12 rounded-2xl bg-blush grid place-items-center mb-5 group-hover:bg-burgundy transition-colors duration-500">
                    <s.icon size={22} className="text-burgundy group-hover:text-ivory transition-colors duration-500" />
                  </div>
                  <h3 className="font-serif text-xl text-ink mb-2">{s.title}</h3>
                  <p className="text-sm text-ink/55 leading-relaxed mb-4">{s.desc}</p>
                </Link>
              </Reveal>
            ))}
          </div>
          <Reveal className="text-center mt-12">
            <Link to="/services" className="inline-flex items-center gap-2 text-burgundy font-semibold hover:gap-3 transition-all">
              View all services <ArrowRight size={17} />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* STATS */}
      <section className="py-16 bg-burgundy text-ivory">
        <div className="max-w-7xl mx-auto px-5 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.08}>
              <p className="font-serif text-4xl md:text-5xl"><Counter value={s.value} suffix={s.suffix} decimals={s.decimals ?? 0} /></p>
              <p className="text-blush/70 text-xs tracking-[0.2em] uppercase mt-2">{s.label}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* PROCESS */}
      <section className="py-24 bg-blush-light">
        <div className="max-w-7xl mx-auto px-5">
          <Reveal className="text-center max-w-xl mx-auto mb-16">
            <p className="text-xs tracking-[0.35em] uppercase text-burgundy font-semibold mb-4">How It Works</p>
            <h2 className="font-serif text-4xl md:text-5xl text-ink">From check-in to comeback.</h2>
          </Reveal>
          <div className="grid md:grid-cols-5 gap-5">
            {PROCESS.map((p, i) => (
              <Reveal key={p.n} delay={i * 0.08}>
                <div className="bg-ivory rounded-3xl p-7 h-full border border-blush hover:-translate-y-2 hover:shadow-lg hover:shadow-burgundy/10 transition-all duration-500">
                  <p className="font-serif text-3xl text-burgundy/30 mb-4">{p.n}</p>
                  <h3 className="font-serif text-lg text-ink mb-2">{p.title}</h3>
                  <p className="text-[13px] text-ink/55 leading-relaxed">{p.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* REVIEWS */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-5">
          <Reveal className="text-center max-w-xl mx-auto mb-6">
            <p className="text-xs tracking-[0.35em] uppercase text-burgundy font-semibold mb-4">Reviews</p>
            <h2 className="font-serif text-4xl md:text-5xl text-ink">Philly trusts us with their phones.</h2>
          </Reveal>
          <Reveal className="flex items-center justify-center gap-3 mb-14">
            <span className="w-10 h-10 rounded-xl bg-white border border-blush grid place-items-center font-bold text-lg text-[#4285F4] shadow-sm">G</span>
            <span className="font-serif text-2xl">4.9</span>
            <span className="flex text-[#FBBC05]">{[...Array(5)].map((_, i) => <Star key={i} size={17} fill="currentColor" />)}</span>
            <span className="text-sm text-ink/50">· 2,300+ Google Reviews</span>
          </Reveal>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={t.name} delay={i * 0.08}>
                <figure className="bg-white rounded-3xl border border-blush p-7 h-full flex flex-col hover:-translate-y-2 hover:shadow-xl hover:shadow-burgundy/10 transition-all duration-500">
                  <div className="flex text-[#FBBC05] mb-4">{[...Array(5)].map((_, j) => <Star key={j} size={14} fill="currentColor" />)}</div>
                  <blockquote className="text-[15px] text-ink/70 leading-relaxed flex-1">“{t.text}”</blockquote>
                  <figcaption className="mt-5 pt-4 border-t border-blush">
                    <p className="font-semibold text-sm">{t.name}</p>
                    <p className="text-xs text-ink/45">{t.area} · Google Review</p>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-gradient-to-br from-burgundy to-burgundy-dark text-ivory text-center relative overflow-hidden">
        <motion.div className="absolute inset-0 opacity-10" animate={{ backgroundPosition: ["0% 0%", "100% 100%"] }} transition={{ duration: 20, repeat: Infinity, repeatType: "reverse" }}
          style={{ backgroundImage: "radial-gradient(circle at 30% 50%, #F3D5D8 0%, transparent 40%)" }} />
        <Reveal className="relative max-w-2xl mx-auto px-5">
          <h2 className="font-serif text-4xl md:text-5xl mb-5">Broken device?<br />We'll fix it today.</h2>
          <p className="text-blush/80 mb-9">Free diagnostics · No appointment needed · Most repairs in under an hour</p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/book" className="bg-ivory text-burgundy font-semibold px-8 py-4 rounded-full hover:-translate-y-1 hover:shadow-xl transition-all duration-300">Book a Repair</Link>
            <a href={STORE.phoneHref} className="border border-blush/40 text-ivory font-semibold px-8 py-4 rounded-full hover:bg-white/10 hover:-translate-y-1 transition-all duration-300">Call {STORE.phone}</a>
          </div>
        </Reveal>
      </section>
    </>
  );
}
