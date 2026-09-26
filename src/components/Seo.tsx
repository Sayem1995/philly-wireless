import { useEffect } from "react";
import { BRAND } from "@contracts/constants";

/**
 * Per-page `<head>` metadata.
 *
 * Every title is suffixed with the configured store name, so a page can pass a
 * bare title (`"Pricing"`) and still end up as `"Pricing — Philly Phone
 * Repair"`. Pages therefore never need to hardcode a store name, which is what
 * previously made the metadata the hardest part of standing up a second store.
 *
 * A title that already contains the store name is left alone, so passing a full
 * title remains valid.
 */
export default function Seo({ title, description }: { title: string; description?: string }) {
  const fullTitle = title.includes(BRAND.name) ? title : `${title} — ${BRAND.name}`;

  useEffect(() => {
    document.title = fullTitle;
    if (description) {
      let m = document.querySelector('meta[name="description"]');
      if (!m) {
        m = document.createElement("meta");
        m.setAttribute("name", "description");
        document.head.appendChild(m);
      }
      m.setAttribute("content", description);
    }
  }, [fullTitle, description]);

  return null;
}
