import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import Seo from "@/components/Seo";
import Reveal from "@/components/Reveal";
import { ArrowRight } from "lucide-react";

export default function Blog() {
  const { data, isLoading } = trpc.shop.blogList.useQuery();
  return (
    <>
      <Seo title="Blog — Repair Tips & Guides | Philly Phone Repair" description="Repair price guides, battery care tips, water damage first aid and more from Philadelphia's repair experts." />
      <section className="pt-36 pb-14 bg-gradient-to-b from-blush-light to-ivory text-center">
        <Reveal className="max-w-2xl mx-auto px-5">
          <p className="text-xs tracking-[0.35em] uppercase text-burgundy font-semibold mb-4">Blog</p>
          <h1 className="font-serif text-5xl text-ink">From the repair bench.</h1>
        </Reveal>
      </section>
      <section className="pb-24 max-w-6xl mx-auto px-5">
        {isLoading ? <p className="text-center text-ink/40 py-16">Loading posts…</p> : (
          <div className="grid md:grid-cols-3 gap-6">
            {(data ?? []).map((p, i) => (
              <Reveal key={p.id} delay={i * 0.08}>
                <Link to={`/blog/${p.slug}`} className="group block bg-white rounded-3xl border border-blush overflow-hidden hover:-translate-y-2 hover:shadow-xl hover:shadow-burgundy/10 transition-all duration-500 h-full">
                  <div className="aspect-[16/9] bg-gradient-to-br from-burgundy to-burgundy-dark grid place-items-center p-8">
                    <p className="font-serif text-ivory text-xl text-center leading-snug line-clamp-3">{p.title}</p>
                  </div>
                  <div className="p-7">
                    <span className="text-[11px] tracking-[0.2em] uppercase text-burgundy font-semibold">{p.tag}</span>
                    <h2 className="font-serif text-xl text-ink mt-2 leading-snug group-hover:text-burgundy transition-colors">{p.title}</h2>
                    <p className="text-sm text-ink/50 mt-3 leading-relaxed line-clamp-3">{p.excerpt}</p>
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-burgundy mt-5 group-hover:gap-3 transition-all">Read <ArrowRight size={15} /></span>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
