import { BRAND } from "@contracts/constants";

/**
 * Store wordmark.
 *
 * The logo mark is either an uploaded image (`BRAND_LOGO_TYPE=image`, the
 * default, used by Philly Phone Repair) or the inline SVG placeholder
 * (`BRAND_LOGO_TYPE=svg`) for a store that has no artwork yet. The wordmark
 * itself is always rendered from `BRAND_NAME`, so it can never drift from the
 * configured store name.
 */
function Mark() {
  if (BRAND.logo.type === "svg") {
    return (
      <svg viewBox="0 0 32 32" className="w-9 h-9" role="img" aria-hidden="true">
        <circle cx="16" cy="16" r="16" fill="currentColor" className="text-ink" />
        <path
          d="M18.4 4.5 9.6 17.2h5.2l-1.2 10.3 8.8-12.7h-5.2z"
          fill="currentColor"
          className="text-accent-brand"
        />
      </svg>
    );
  }
  return (
    <img src={BRAND.logo.icon} alt={`${BRAND.name} logo`} className="w-9 h-9 object-contain" />
  );
}

export default function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className={`w-10 h-10 rounded-xl grid place-items-center overflow-hidden ${light ? "bg-blush" : ""}`}>
        <Mark />
      </span>
      <span className="leading-none">
        <span className={`block font-serif text-lg font-bold ${light ? "text-ivory" : "text-ink"}`}>
          {BRAND.wordmarkPrimary}
          {BRAND.wordmarkAccent ? (
            <>
              {" "}
              <span className="text-burgundy">{BRAND.wordmarkAccent}</span>
            </>
          ) : null}
        </span>
        {BRAND.tagline ? (
          <span className={`block text-[10px] tracking-[0.25em] uppercase mt-1 ${light ? "text-blush" : "text-burgundy/70"}`}>
            {BRAND.tagline}
          </span>
        ) : null}
      </span>
    </span>
  );
}
