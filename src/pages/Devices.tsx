import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import Seo from "@/components/Seo";
import Reveal from "@/components/Reveal";
import { Smartphone, Tablet, BadgeCheck } from "lucide-react";
import { STORE } from "@contracts/constants";
import { productImageUrl } from "@/lib/productImages";

const money = (c: number) => "$" + (c / 100).toFixed(c % 100 ? 2 : 0);

export default function Devices() {
  const [tab, setTab] = useState<"device_new" | "device_refurb">("device_new");
  const { data, isLoading } = trpc.shop.products.useQuery({ kind: tab });
  const [sub, setSub] = useState("All");

  // Categories come from the products themselves, so a new category typed into
  // the admin form (Samsung, Pixel, MacBook…) immediately becomes its own tab.
  // A hardcoded list meant anything else was reachable only via "All".
  const subs = useMemo(
    () => ["All", ...new Set((data ?? []).map((p) => p.subcategory.trim()).filter(Boolean))],
    [data],
  );

  // Switching between New and Refurbished can leave a category with no matches
  // selected. Derived rather than synced, so the filter falls back to "All" in
  // the same render instead of showing an empty grid first.
  const activeSub = subs.includes(sub) ? sub : "All";
  const rows = (data ?? []).filter((p) => activeSub === "All" || p.subcategory === activeSub);

  return (
    <>
      <Seo title="Buy Devices — New & Refurbished iPhones, iPads, Tablets" description="Brand new and certified refurbished iPhones, iPads and tablets for sale in Center City Philadelphia. Every refurbished device includes a 1-year warranty." />
      <section className="pt-36 pb-14 bg-gradient-to-b from-blush-light to-ivory text-center">
        <Reveal className="max-w-2xl mx-auto px-5">
          <p className="text-xs tracking-[0.35em] uppercase text-burgundy font-semibold mb-4">Devices We Sell</p>
          <h1 className="font-serif text-5xl text-ink">New & certified refurbished.</h1>
          <p className="mt-5 text-ink/55">Every refurbished device passes a 40-point inspection, gets a new battery, and ships with a 1-year store warranty.</p>
        </Reveal>
      </section>
      <section className="pb-24 max-w-6xl mx-auto px-5">
        <Reveal className="flex flex-wrap justify-center gap-2.5 mb-6">
          {([["device_new", "Brand New"], ["device_refurb", "Refurbished"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-7 py-3 rounded-full text-sm font-semibold border transition-all duration-300 hover:-translate-y-0.5 ${tab === k ? "bg-burgundy text-ivory border-burgundy" : "border-burgundy/20 text-ink/60 hover:border-burgundy/50"}`}>
              {l}
            </button>
          ))}
        </Reveal>
        <Reveal className="flex flex-wrap justify-center gap-2 mb-12">
          {subs.map((s) => (
            <button key={s} onClick={() => setSub(s)}
              className={`px-4 py-1.5 rounded-full text-[12.5px] border transition-colors ${activeSub === s ? "bg-ink text-ivory border-ink" : "border-ink/15 text-ink/50 hover:border-ink/40"}`}>{s}</button>
          ))}
        </Reveal>
        {isLoading ? (
          <p className="text-center text-ink/40 py-16">Loading devices…</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {rows.map((p, i) => {
              const imageUrl = productImageUrl(p);
              return (
              <Reveal key={p.id} delay={(i % 3) * 0.07}>
                <div className="group bg-white rounded-3xl border border-blush overflow-hidden hover:-translate-y-2 hover:shadow-xl hover:shadow-burgundy/10 transition-all duration-500">
                  <div className="aspect-[4/3] bg-gradient-to-br from-blush-light to-blush grid place-items-center relative overflow-hidden">
                    {/* Product image when the admin uploaded one; icon otherwise. */}
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={p.name}
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : p.subcategory === "iPad" || p.subcategory === "Tablet" ? (
                      <Tablet size={72} strokeWidth={1} className="text-burgundy/40 group-hover:scale-110 transition-transform duration-500" />
                    ) : (
                      <Smartphone size={72} strokeWidth={1} className="text-burgundy/40 group-hover:scale-110 transition-transform duration-500" />
                    )}
                    {p.badge && <span className="absolute top-4 left-4 bg-burgundy text-ivory text-[11px] font-semibold tracking-wide px-3.5 py-1.5 rounded-full">{p.badge}</span>}
                    {p.kind === "device_refurb" && (
                      <span className="absolute top-4 right-4 bg-ivory/90 text-burgundy text-[11px] font-semibold px-3 py-1.5 rounded-full flex items-center gap-1">
                        <BadgeCheck size={12} /> 1-yr warranty
                      </span>
                    )}
                  </div>
                  <div className="p-6">
                    <h2 className="font-serif text-xl text-ink">{p.name}</h2>
                    <p className="text-[13px] text-ink/50 mt-1.5 leading-relaxed">{p.description}</p>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="font-serif text-2xl text-burgundy">{money(p.price)}</span>
                      <span className={`text-[12px] ${p.stock > 0 ? "text-emerald-700" : "text-burgundy"}`}>
                        {p.stock > 0 ? `${p.stock} in stock` : "Sold out"}
                      </span>
                    </div>
                    <a href={STORE.phoneHref} className="mt-5 block text-center border border-burgundy/25 text-burgundy text-sm font-semibold py-3 rounded-full hover:bg-burgundy hover:text-ivory transition-all duration-300">
                      Call to Reserve
                    </a>
                  </div>
                </div>
              </Reveal>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
