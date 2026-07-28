import { trpc } from "@/providers/trpc";
import Seo from "@/components/Seo";
import Reveal from "@/components/Reveal";
import { ShoppingBag } from "lucide-react";
import { STORE } from "@contracts/constants";

const money = (c: number) => "$" + (c / 100).toFixed(2);

export default function Accessories() {
  const { data, isLoading } = trpc.shop.products.useQuery({ kind: "accessory" });
  return (
    <>
      <Seo title="Accessories — Cases, Chargers, Cables & More | Philly Phone Repair" description="Phone cases, chargers, MagSafe, power banks, iPad cases, laptop & MacBook chargers, gaming controllers and headphones in Center City Philadelphia." />
      <section className="pt-36 pb-14 bg-gradient-to-b from-blush-light to-ivory text-center">
        <Reveal className="max-w-2xl mx-auto px-5">
          <p className="text-xs tracking-[0.35em] uppercase text-burgundy font-semibold mb-4">Accessories</p>
          <h1 className="font-serif text-5xl text-ink">Everything your device deserves.</h1>
          <p className="mt-5 text-ink/55">Quality-tested accessories, fitted while you wait. Case + tempered glass bundles available in-store.</p>
        </Reveal>
      </section>
      <section className="pb-24 max-w-7xl mx-auto px-5">
        {isLoading ? (
          <p className="text-center text-ink/40 py-16">Loading accessories…</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {(data ?? []).map((p, i) => (
              <Reveal key={p.id} delay={(i % 4) * 0.06}>
                <div className="group bg-white rounded-3xl border border-blush p-7 h-full flex flex-col hover:-translate-y-2 hover:shadow-xl hover:shadow-burgundy/10 transition-all duration-500">
                  <div className="w-12 h-12 rounded-2xl bg-blush grid place-items-center mb-5 group-hover:bg-burgundy transition-colors duration-500">
                    <ShoppingBag size={20} className="text-burgundy group-hover:text-ivory transition-colors duration-500" />
                  </div>
                  <h2 className="font-serif text-lg text-ink">{p.name}</h2>
                  <p className="text-[13px] text-ink/50 mt-2 leading-relaxed flex-1">{p.description}</p>
                  <div className="mt-5 flex items-center justify-between">
                    <span className="font-serif text-xl text-burgundy">{money(p.price)}</span>
                    <span className={`text-[12px] ${p.stock > 0 ? "text-emerald-700" : "text-burgundy"}`}>{p.stock > 0 ? "In stock" : "Sold out"}</span>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        )}
        <Reveal className="text-center mt-14">
          <p className="text-ink/55 text-sm">Looking for something specific? <a href={STORE.phoneHref} className="text-burgundy font-semibold hover:underline">Call {STORE.phone}</a> — if we don't stock it, we can usually order it next-day.</p>
        </Reveal>
      </section>
    </>
  );
}
