import { useMemo, useState } from "react";
import { trpc } from "@/providers/trpc";
import Seo from "@/components/Seo";
import Reveal from "@/components/Reveal";
import AddToCartButton from "@/components/AddToCartButton";
import ProductGridSkeleton from "@/components/ProductGridSkeleton";
import ProductToolbar from "@/components/ProductToolbar";
import { ShoppingBag } from "lucide-react";
import { STORE } from "@contracts/constants";
import { productImageUrl } from "@/lib/productImages";
import { filterProducts, sortProducts, type ProductSort } from "@/lib/productCatalog";

const money = (c: number) => "$" + (c / 100).toFixed(2);

export default function Accessories() {
  const { data, isLoading, isError, refetch } = trpc.shop.products.useQuery({ kind: "accessory" });
  const [sub, setSub] = useState("All");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ProductSort>("featured");

  const subs = useMemo(
    () => ["All", ...new Set((data ?? []).map((p) => p.subcategory.trim()).filter(Boolean))],
    [data],
  );
  const activeSub = subs.includes(sub) ? sub : "All";
  const rows = useMemo(
    () =>
      sortProducts(
        filterProducts(
          (data ?? []).filter((p) => activeSub === "All" || p.subcategory === activeSub),
          query,
        ),
        sort,
      ),
    [activeSub, data, query, sort],
  );

  return (
    <>
      <Seo title="Accessories — Cases, Chargers, Cables & More" description="Phone cases, chargers, MagSafe, power banks, iPad cases, laptop & MacBook chargers, gaming controllers and headphones in Center City Philadelphia." />
      <section className="pt-36 pb-14 bg-gradient-to-b from-blush-light to-ivory text-center">
        <Reveal className="max-w-2xl mx-auto px-5">
          <p className="text-xs tracking-[0.35em] uppercase text-burgundy font-semibold mb-4">Accessories</p>
          <h1 className="font-serif text-5xl text-ink">Everything your device deserves.</h1>
          <p className="mt-5 text-ink/55">Quality-tested accessories, fitted while you wait. Case + tempered glass bundles available in-store.</p>
        </Reveal>
      </section>
      <section className="pb-24 max-w-7xl mx-auto px-5">
        <Reveal className="flex flex-wrap justify-center gap-2 mb-8">
          {subs.map((s) => (
            <button key={s} onClick={() => setSub(s)} aria-pressed={activeSub === s}
              className={`px-4 py-1.5 rounded-full text-[12.5px] border transition-colors ${activeSub === s ? "bg-ink text-ivory border-ink" : "border-ink/15 text-ink/50 hover:border-ink/40"}`}>{s}</button>
          ))}
        </Reveal>
        <ProductToolbar
          query={query}
          onQuery={setQuery}
          sort={sort}
          onSort={setSort}
          resultCount={rows.length}
          label="accessories"
          placeholder="Search accessories…"
        />
        {isLoading ? (
          <ProductGridSkeleton count={8} className="sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" />
        ) : isError ? (
          <div role="alert" className="rounded-3xl border border-burgundy/20 bg-white px-6 py-14 text-center">
            <p className="font-serif text-2xl text-ink">We couldn’t load the accessories.</p>
            <p className="mt-2 text-sm text-ink/55">Check your connection and try again.</p>
            <button onClick={() => void refetch()} className="mt-5 rounded-full bg-burgundy px-6 py-3 text-sm font-semibold text-ivory hover:bg-burgundy-dark">
              Try again
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-3xl border border-blush bg-white px-6 py-16 text-center">
            <p className="font-serif text-2xl text-ink">No accessories match that search.</p>
            <p className="mt-2 text-sm text-ink/55">Try a different term or clear the filters.</p>
            <button
              onClick={() => { setQuery(""); setSub("All"); setSort("featured"); }}
              className="mt-5 rounded-full border border-burgundy/25 px-6 py-3 text-sm font-semibold text-burgundy hover:bg-blush"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {rows.map((p, i) => {
              const imageUrl = productImageUrl(p);
              return (
              <Reveal key={p.id} delay={(i % 4) * 0.06}>
                <div className="group bg-white rounded-3xl border border-blush overflow-hidden h-full flex flex-col hover:-translate-y-2 hover:shadow-xl hover:shadow-burgundy/10 transition-all duration-500">
                  {/* Product image when the admin uploaded one; icon otherwise. */}
                  {imageUrl && (
                    <div className="relative aspect-[4/3] bg-blush-light overflow-hidden">
                      <img src={imageUrl} alt={p.name} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                    </div>
                  )}
                  <div className="p-7 flex-1 flex flex-col">
                    {!imageUrl && (
                      <div className="w-12 h-12 rounded-2xl bg-blush grid place-items-center mb-5 group-hover:bg-burgundy transition-colors duration-500">
                        <ShoppingBag size={20} className="text-burgundy group-hover:text-ivory transition-colors duration-500" />
                      </div>
                    )}
                    <h2 className="font-serif text-lg text-ink">{p.name}</h2>
                    <p className="text-[13px] text-ink/50 mt-2 leading-relaxed flex-1">{p.description}</p>
                    <div className="mt-5 flex items-center justify-between">
                      <span className="font-serif text-xl text-burgundy">{money(p.price)}</span>
                      <span className={`text-[12px] ${p.stock > 0 ? "text-emerald-700" : "text-burgundy"}`}>{p.stock > 0 ? "In stock" : "Sold out"}</span>
                    </div>
                    <AddToCartButton
                      tone="outline"
                      product={{
                        id: p.id,
                        name: p.name,
                        price: p.price,
                        stock: p.stock,
                        imagePath: p.imagePath,
                        kind: p.kind,
                      }}
                      className="mt-4 w-full"
                    />
                  </div>
                </div>
              </Reveal>
              );
            })}
          </div>
        )}
        <Reveal className="text-center mt-14">
          <p className="text-ink/55 text-sm">Looking for something specific? <a href={STORE.phoneHref} className="text-burgundy font-semibold hover:underline">Call {STORE.phone}</a> — if we don't stock it, we can usually order it next-day.</p>
        </Reveal>
      </section>
    </>
  );
}
