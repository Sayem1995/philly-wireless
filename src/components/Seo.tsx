import { useEffect } from "react";
import { useLocation } from "react-router";
import { BRAND } from "@contracts/constants";

const DEFAULT_DESCRIPTION = `${BRAND.name} — same-day phone, tablet, laptop and console repair in ${BRAND.region}. Lifetime warranty, walk-ins welcome.`;

type SeoProps = {
  title: string;
  description?: string;
  /** Transactional/private pages must never be indexed or canonicalised. */
  noindex?: boolean;
  image?: string;
};

function setMeta(attribute: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attribute, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href: string | null) {
  const existing = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!href) {
    existing?.remove();
    return;
  }
  const link = existing ?? document.createElement("link");
  link.rel = "canonical";
  link.href = href;
  if (!existing) document.head.appendChild(link);
}

/**
 * Per-page `<head>` metadata.
 *
 * Titles are suffixed with the configured store name, the canonical URL follows
 * the current route, and Open Graph/Twitter tags are kept in sync so shared
 * links describe the page that was actually shared. Private routes pass
 * `noindex`; their canonical link is removed rather than exposing a receipt or
 * order token.
 *
 * This is a client-rendered SPA, so these updates happen after hydration. The
 * static shell still carries sensible home-page metadata for crawlers and
 * social bots that do not execute JavaScript.
 */
export default function Seo({ title, description = DEFAULT_DESCRIPTION, noindex = false, image }: SeoProps) {
  const { pathname } = useLocation();
  const fullTitle = title.includes(BRAND.name) ? title : `${title} — ${BRAND.name}`;
  const site = BRAND.siteUrl.replace(/\/+$/, "");
  const path = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
  const canonical = `${site}${path}`;
  const ogImage = image ?? `${site}${BRAND.logo.full}`;

  useEffect(() => {
    document.title = fullTitle;
    setMeta("name", "description", description);
    setMeta("name", "robots", noindex ? "noindex, nofollow" : "index, follow");
    setMeta("property", "og:type", "website");
    setMeta("property", "og:site_name", BRAND.name);
    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", canonical);
    setMeta("property", "og:image", ogImage);
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", fullTitle);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", ogImage);
    setCanonical(noindex ? null : canonical);
  }, [canonical, description, fullTitle, noindex, ogImage]);

  return null;
}
