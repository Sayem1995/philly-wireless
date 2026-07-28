import { useParams, Link } from "react-router";
import { trpc } from "@/providers/trpc";
import Seo from "@/components/Seo";
import Reveal from "@/components/Reveal";
import { ArrowLeft } from "lucide-react";

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const { data: post, isLoading } = trpc.shop.blogBySlug.useQuery({ slug: slug ?? "" });
  if (isLoading) return <p className="pt-48 text-center text-ink/40">Loading…</p>;
  if (!post) return <p className="pt-48 text-center text-ink/40">Post not found.</p>;
  return (
    <>
      <Seo title={`${post.title} | Philly Phone Repair`} description={post.excerpt} />
      <section className="pt-36 pb-10 bg-gradient-to-b from-blush-light to-ivory">
        <Reveal className="max-w-3xl mx-auto px-5 text-center">
          <Link to="/blog" className="inline-flex items-center gap-2 text-sm text-burgundy font-medium mb-8 hover:gap-3 transition-all"><ArrowLeft size={15} /> All posts</Link>
          <span className="block text-[11px] tracking-[0.25em] uppercase text-burgundy font-semibold mb-4">{post.tag}</span>
          <h1 className="font-serif text-4xl md:text-5xl text-ink leading-tight">{post.title}</h1>
          <p className="text-sm text-ink/40 mt-5">{new Date(post.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} · Philly Phone Repair</p>
        </Reveal>
      </section>
      <article className="pb-24 max-w-3xl mx-auto px-5">
        {post.content.split("\n\n").map((para, i) => (
          <Reveal key={i}><p className="text-[17px] text-ink/70 leading-[1.85] mb-6">{para}</p></Reveal>
        ))}
        <Reveal className="mt-12 bg-blush rounded-3xl p-8 text-center">
          <h3 className="font-serif text-2xl mb-3">Need this repair?</h3>
          <p className="text-sm text-ink/60 mb-6">Free diagnostics, same-day service, lifetime warranty on screens.</p>
          <Link to="/book" className="inline-block bg-burgundy text-ivory font-semibold px-8 py-3.5 rounded-full hover:bg-burgundy-dark transition-colors">Book a Repair</Link>
        </Reveal>
      </article>
    </>
  );
}
