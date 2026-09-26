/**
 * Bridge between the CSS custom properties emitted by the `brand()` plugin in
 * `vite.config.ts` and the few places that need a *literal* colour in an inline
 * style — currently only the hero's radial-gradient glow, since Tailwind has no
 * utility for a multi-stop gradient like that.
 *
 * Values are declared as space-separated RGB channels (`127 29 29`), so they
 * are converted back into `rgb(...)` here.
 */

/** Read a brand custom property, e.g. `cssVarRgb("--brand-secondary")`.
 *  The fallback is used during SSR / before styles load. */
export function cssVarRgb(name: string, fallback = "0 0 0"): string {
  if (typeof window === "undefined") return `rgb(${fallback})`;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return `rgb(${raw || fallback})`;
}
