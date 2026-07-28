import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import Seo from "@/components/Seo";
import Reveal from "@/components/Reveal";
import { Link } from "react-router";
import { STORE } from "@contracts/constants";

const CATS = [
  { key: "smartphone", label: "Smartphones" },
  { key: "ipad", label: "iPad" },
  { key: "tablet", label: "Tablets" },
  { key: "laptop", label: "Laptops" },
  { key: "macbook", label: "MacBooks" },
  { key: "console", label: "Consoles" },
];
const BRANDS = ["iPhone", "Samsung Galaxy", "Google Pixel", "Motorola", "OnePlus"];

export default function Pricing() {
  const [cat, setCat] = useState("smartphone");
  const [brand, setBrand] = useState("iPhone");
  const { data, isLoading } = trpc.shop.prices.useQuery();

  const rows = useMemo(() => {
    if (!data) return [];
    return data.filter((r) =>
      r.category === cat && (cat !== "smartphone" || r.brand === brand),
    );
  }, [data, cat, brand]);

  return (
    <>
      <Seo title="Repair Pricing — Philly Phone Repair" description="Transparent repair pricing for iPhone, Samsung, Pixel, Motorola, OnePlus, iPad, tablets, laptops, MacBooks and consoles in Philadelphia." />
      <section className="pt-36 pb-14 bg-gradient-to-b from-blush-light to-ivory text-center">
        <Reveal className="max-w-2xl mx-auto px-5">
          <p className="text-xs tracking-[0.35em] uppercase text-burgundy font-semibold mb-4">Transparent Pricing</p>
          <h1 className="font-serif text-5xl text-ink">Know the price before you walk in.</h1>
          <p className="mt-5 text-ink/55">Prices reflect the current Philadelphia market. Free diagnostic always included; final quote confirmed in-store.</p>
        </Reveal>
      </section>
      <section className="pb-24 max-w-5xl mx-auto px-5">
        <Reveal className="flex flex-wrap justify-center gap-2.5 mb-8">
          {CATS.map((c) => (
            <button key={c.key} onClick={() => setCat(c.key)}
              className={`px-6 py-2.5 rounded-full text-sm font-medium border transition-all duration-300 hover:-translate-y-0.5 ${cat === c.key ? "bg-burgundy text-ivory border-burgundy" : "border-burgundy/20 text-ink/60 hover:border-burgundy/50"}`}>
              {c.label}
            </button>
          ))}
        </Reveal>
        {cat === "smartphone" && (
          <Reveal className="flex flex-wrap justify-center gap-2.5 mb-10">
            {BRANDS.map((b) => (
              <button key={b} onClick={() => setBrand(b)}
                className={`px-5 py-2 rounded-full text-[13px] border transition-all duration-300 ${brand === b ? "bg-ink text-ivory border-ink" : "border-ink/15 text-ink/50 hover:border-ink/40"}`}>
                {b}
              </button>
            ))}
          </Reveal>
        )}
        <Reveal className="bg-white rounded-3xl border border-blush overflow-hidden shadow-sm">
          {isLoading ? (
            <p className="p-14 text-center text-ink/40">Loading pricing…</p>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-blush-light text-[12px] tracking-[0.15em] uppercase text-ink/50">
                  <th className="px-7 py-4 font-medium">Repair</th>
                  {cat !== "smartphone" && <th className="px-7 py-4 font-medium">Device</th>}
                  <th className="px-7 py-4 font-medium text-right">Price</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-blush/60 hover:bg-blush-light/60 transition-colors">
                    <td className="px-7 py-4 text-[15px] font-medium">{r.service}</td>
                    {cat !== "smartphone" && <td className="px-7 py-4 text-sm text-ink/55">{r.brand}</td>}
                    <td className={`px-7 py-4 text-right text-[15px] font-semibold ${r.priceLabel.startsWith("Call") ? "text-ink/45 italic font-normal" : "text-burgundy"}`}>
                      {r.priceLabel}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Reveal>
        <Reveal className="mt-10 bg-blush rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="font-serif text-2xl text-ink">Not sure what's wrong?</h3>
            <p className="text-sm text-ink/60 mt-1">Bring it in — diagnostics are always free, with no obligation.</p>
          </div>
          <div className="flex gap-3">
            <Link to="/book" className="bg-burgundy text-ivory font-semibold px-7 py-3.5 rounded-full hover:bg-burgundy-dark transition-colors">Book Now</Link>
            <a href={STORE.phoneHref} className="border border-burgundy/30 text-burgundy font-semibold px-7 py-3.5 rounded-full hover:bg-ivory transition-colors">Call Us</a>
          </div>
        </Reveal>
      </section>
    </>
  );
}
