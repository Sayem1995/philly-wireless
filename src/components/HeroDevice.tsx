import { motion, useReducedMotion } from "framer-motion";
import {
  BatteryCharging,
  Check,
  Clock3,
  Cpu,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wrench,
} from "lucide-react";

/**
 * Hero device scene.
 *
 * Not a product photo: a live "repair diagnostic" built from CSS and a few
 * transform/opacity animations, so it stays crisp at every size and adds no
 * image weight. The phone is tilted in perspective with orbiting rings,
 * floating proof cards and a scan line; all motion is disabled when the visitor
 * prefers reduced motion.
 */
export default function HeroDevice() {
  const reduce = useReducedMotion();

  const float = reduce ? { y: 0 } : { y: [0, -12, 0] };
  const floatSlow = reduce ? { y: 0 } : { y: [0, 9, 0] };
  const sway = reduce ? { rotate: 0 } : { rotate: [0, 1.2, 0] };
  const spin = reduce ? {} : { rotate: 360 };
  const spinReverse = reduce ? {} : { rotate: -360 };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: reduce ? 0 : 0.9, delay: reduce ? 0 : 0.2 }}
      className="relative hidden min-h-[620px] items-center justify-center lg:flex"
    >
      {/* Warm glow and orbital rings */}
      <div className="pointer-events-none absolute h-[540px] w-[540px] rounded-full bg-[radial-gradient(circle,rgba(127,29,29,0.18),transparent_66%)] blur-2xl" />
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <motion.div
          animate={spin}
          transition={reduce ? { duration: 0 } : { duration: 42, repeat: Infinity, ease: "linear" }}
          className="absolute h-[500px] w-[500px] rounded-full border border-burgundy/12"
        >
          <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-burgundy/50 shadow-[0_0_12px_rgba(127,29,29,0.55)]" />
          <span className="absolute bottom-[12%] right-[12%] h-1.5 w-1.5 rounded-full bg-burgundy/30" />
        </motion.div>
        <motion.div
          animate={spinReverse}
          transition={reduce ? { duration: 0 } : { duration: 60, repeat: Infinity, ease: "linear" }}
          className="absolute h-[410px] w-[410px] rounded-full border border-dashed border-burgundy/18"
        >
          <span className="absolute left-[8%] top-[22%] h-1 w-1 rounded-full bg-burgundy/45" />
        </motion.div>
      </div>

      {/* The device */}
      <motion.div
        animate={{ ...float, ...sway }}
        transition={
          reduce
            ? { duration: 0 }
            : {
                y: { duration: 6.5, repeat: Infinity, ease: "easeInOut" },
                rotate: { duration: 8, repeat: Infinity, ease: "easeInOut" },
              }
        }
        className="relative z-10 w-[300px]"
        style={{ perspective: "1200px" }}
      >
        <div
          className="relative rounded-[3.4rem] border-[9px] border-[#170b0a] bg-[#170b0a] p-[3px] shadow-[0_50px_90px_-32px_rgba(43,26,24,0.72),0_18px_40px_-24px_rgba(127,29,29,0.55)]"
          style={{ transform: "rotateY(-9deg) rotateX(3deg)" }}
        >
          {/* Side hardware */}
          <span className="absolute -left-[12px] top-28 h-12 w-[3px] rounded-full bg-ink/80" />
          <span className="absolute -left-[12px] top-44 h-16 w-[3px] rounded-full bg-ink/80" />
          <span className="absolute -right-[12px] top-36 h-20 w-[3px] rounded-full bg-ink/80" />

          <div className="relative aspect-[9/19] overflow-hidden rounded-[2.9rem] bg-[#220f0f]">
            <div className="absolute inset-0 bg-[linear-gradient(160deg,#4a1518_0%,#7f1d1d_52%,#26100f_100%)]" />
            <div className="absolute -left-1/3 top-0 h-full w-2/3 rotate-12 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent blur-xl" />
            <div className="absolute left-1/2 top-2.5 z-20 h-5 w-20 -translate-x-1/2 rounded-full bg-[#120707]">
              <span className="absolute right-4 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[#2f1a1a]" />
            </div>

            <div className="relative z-10 flex h-full flex-col px-5 pb-16 pt-10 text-ivory">
              <div className="flex items-center justify-between text-[8px] uppercase tracking-[0.18em] text-blush/55">
                <span>Live diagnostic</span>
                <span className="flex items-center gap-1.5 text-emerald-300">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
                  PPR-214
                </span>
              </div>

              <div className="mt-7 flex flex-col items-center">
                <div className="relative h-28 w-28">
                  <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="6" />
                    <motion.circle
                      cx="60"
                      cy="60"
                      r="52"
                      fill="none"
                      stroke="#f3d5d8"
                      strokeWidth="6"
                      strokeLinecap="round"
                      initial={{ pathLength: reduce ? 0.96 : 0 }}
                      animate={{ pathLength: 0.96 }}
                      transition={{ duration: reduce ? 0 : 1.7, delay: reduce ? 0 : 0.7, ease: "easeOut" }}
                    />
                  </svg>
                  <div className="absolute inset-0 grid place-items-center text-center">
                    <div>
                      <p className="font-serif text-3xl leading-none">
                        96<span className="text-sm">%</span>
                      </p>
                      <p className="mt-1 text-[7px] uppercase tracking-[0.22em] text-blush/55">health</p>
                    </div>
                  </div>
                </div>
                <p className="mt-3 font-serif text-lg leading-tight">Restored to spec.</p>
                <p className="mt-1 text-center text-[8.5px] leading-relaxed text-blush/55">
                  48-point inspection complete
                </p>
              </div>

              <div className="mt-6 space-y-2">
                {[
                  { icon: BatteryCharging, label: "Battery health", value: "96%" },
                  { icon: Smartphone, label: "Display response", value: "Passed" },
                  { icon: Cpu, label: "Charging port", value: "Cleaned" },
                ].map((row, i) => (
                  <motion.div
                    key={row.label}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : 1.1 + i * 0.18 }}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 backdrop-blur-sm"
                  >
                    <span className="flex items-center gap-2 text-[9px] text-blush/80">
                      <row.icon size={11} className="text-blush/60" />
                      {row.label}
                    </span>
                    <span className="flex items-center gap-1 text-[8px] font-semibold text-emerald-300">
                      <Check size={9} />
                      {row.value}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="absolute inset-x-3 bottom-3 z-20 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-2 backdrop-blur-md">
              <span className="flex items-center gap-1.5 text-[8.5px] text-blush/75">
                <Clock3 size={10} /> Ready in 30 min
              </span>
              <span className="rounded-full bg-emerald-400/15 px-2 py-1 text-[7px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
                Ready
              </span>
            </div>

            {!reduce && (
              <motion.div
                animate={{ y: ["-15%", "115%"] }}
                transition={{ duration: 3.4, repeat: Infinity, ease: "linear", repeatDelay: 0.8 }}
                className="pointer-events-none absolute inset-x-0 top-0 z-30 h-24 bg-gradient-to-b from-transparent via-blush/15 to-transparent"
              />
            )}
          </div>
        </div>
      </motion.div>

      {/* Floating proof cards */}
      <motion.div
        initial={{ opacity: 0, y: 18, x: -8 }}
        animate={{ opacity: 1, ...floatSlow }}
        transition={
          reduce
            ? { duration: 0 }
            : {
                opacity: { duration: 0.6, delay: 0.6 },
                y: { duration: 5.4, repeat: Infinity, ease: "easeInOut", delay: 0.8 },
              }
        }
        className="absolute -left-2 top-24 z-20 w-[186px] rounded-2xl border border-blush bg-ivory/95 p-4 shadow-[0_18px_45px_-24px_rgba(43,26,24,0.55)] backdrop-blur"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-burgundy text-ivory">
            <ShieldCheck size={17} />
          </span>
          <div>
            <p className="text-[8px] font-semibold uppercase tracking-[0.18em] text-ink/40">Included</p>
            <p className="mt-0.5 font-serif text-[17px] leading-tight text-ink">Lifetime warranty</p>
          </div>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-blush">
          <motion.div
            initial={{ width: reduce ? "100%" : 0 }}
            animate={{ width: "100%" }}
            transition={{ duration: reduce ? 0 : 1.4, delay: reduce ? 0 : 1 }}
            className="h-full rounded-full bg-burgundy"
          />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, ...floatSlow }}
        transition={
          reduce
            ? { duration: 0 }
            : {
                opacity: { duration: 0.6, delay: 0.8 },
                y: { duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.4 },
              }
        }
        className="absolute right-1 top-8 z-20 hidden w-[138px] rounded-2xl border border-blush bg-ivory/95 px-4 py-3 shadow-[0_18px_45px_-24px_rgba(43,26,24,0.55)] backdrop-blur xl:block"
      >
        <p className="font-serif text-2xl leading-none text-burgundy">
          4.9<span className="ml-0.5 text-sm">★</span>
        </p>
        <p className="mt-1 text-[9px] text-ink/50">2,300+ reviews</p>
        <div className="mt-2 flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} className="h-1 flex-1 rounded-full bg-burgundy/25" />
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, ...floatSlow }}
        transition={
          reduce
            ? { duration: 0 }
            : {
                opacity: { duration: 0.6, delay: 1 },
                y: { duration: 5.8, repeat: Infinity, ease: "easeInOut", delay: 1.2 },
              }
        }
        className="absolute -right-3 bottom-20 z-20 hidden w-[154px] rounded-2xl border border-blush bg-ivory/95 px-4 py-3.5 shadow-[0_18px_45px_-24px_rgba(43,26,24,0.55)] backdrop-blur xl:block"
      >
        <p className="font-serif text-2xl leading-none text-burgundy">
          30<span className="ml-1 text-xs font-sans text-ink/55">min</span>
        </p>
        <p className="mt-1 text-[9px] text-ink/50">average repair</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : 1.2 }}
        className="absolute bottom-8 left-8 z-20 grid h-11 w-11 place-items-center rounded-full border border-burgundy/15 bg-ivory/90 text-burgundy shadow-lg shadow-burgundy/10 backdrop-blur"
      >
        <Wrench size={17} />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : 1.35 }}
        className="absolute right-16 top-32 z-20 hidden h-9 w-9 place-items-center rounded-full border border-burgundy/15 bg-ivory/90 text-burgundy shadow-lg shadow-burgundy/10 backdrop-blur xl:grid"
      >
        <Sparkles size={14} />
      </motion.div>
    </motion.div>
  );
}
