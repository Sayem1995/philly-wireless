/**
 * ─────────────────────────────────────────────────────────────────────────────
 * BRAND — the single source of truth for everything store-specific.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This one repo powers more than one storefront. Every value that differs
 * between stores (name, address, phone, hours, theme colours, logo) is read
 * from the environment at build/boot time, with **Philly Phone Repair as the
 * built-in default**. That means:
 *
 *   • The original `philly-wireless` deployment needs NO new variables — it
 *     behaves exactly as before, because the defaults are its real values.
 *   • A second store is a second Vercel project with `BRAND_*` + `VITE_BRAND_*`
 *     variables set. No code changes, no fork, no drift.
 *
 * There are two spellings of every value, because Vite only exposes variables
 * to the browser when they are prefixed `VITE_`:
 *
 *   BRAND_NAME          server side  (emails, SMS, receipts)
 *   VITE_BRAND_NAME     browser side (pages, <head>, JSON-LD)
 *
 * `readBrand()` accepts either, preferring the server-side spelling, so a
 * single value works in whichever context it is read from.
 *
 * Do NOT put secrets in here — everything with a VITE_ prefix is compiled into
 * the public JavaScript bundle.
 */

/**
 * Default palette, mirroring `contracts/brand-colors.json`.
 *
 * It is duplicated as a TypeScript constant because this module is also
 * bundled for the BROWSER, and neither way of reading that JSON works there:
 * `createRequire` is a Node builtin Vite externalizes, and a `.cjs` module is
 * evaluated by Vite's SSR loader with no `module` binding. `api/brand-colors.test.ts`
 * asserts the two copies stay in sync, so the duplication cannot silently drift.
 *
 * Change the values in the JSON (it is the source of truth for
 * `tailwind.config.js` and `vite.config.ts`) and then update this copy.
 */
const DEFAULT_COLORS: BrandColors = {
  primary: { DEFAULT: "#7F1D1D", dark: "#5C1515", light: "#9B2C2C" },
  secondary: { DEFAULT: "#F3D5D8", dark: "#E8B8BE", light: "#FAE9EB" },
  surface: "#FFFDF7",
  ink: "#2B1A18",
  accent: "#7F1D1D",
};

/* ────────────────────────────── helpers ────────────────────────────── */

function readString(names: string[], fallback: string): string {
  for (const name of names) {
    const raw = process.env[name];
    if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  }
  return fallback;
}

/** `+12155550123` → `tel:+12155550123`; `(215) 555-0123` → `tel:+12155550123`.
 *  A bare 10-digit North-American number is assumed to be US/CA and gets `+1`,
 *  matching what the site used before this was configurable. */
export function toTelHref(phone: string): string {
  return `tel:${toE164Digits(phone)}`;
}

/** Digits only, country code first, for wa.me links. */
export function toWhatsAppNumber(phone: string): string {
  return toE164Digits(phone).replace(/^\+/, "");
}

/** `(215) 555-0123` / `2155550123` → `+12155550123`. */
function toE164Digits(phone: string): string {
  const trimmed = phone.trim();
  if (/^\+\d{8,15}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits ? `+${digits}` : "";
}

/* ────────────────────────────── colours ────────────────────────────── */

export interface BrandColorScale {
  DEFAULT: string;
  dark: string;
  light: string;
}

export interface BrandColors {
  primary: BrandColorScale;
  secondary: BrandColorScale;
  surface: string;
  ink: string;
  /** Highlight colour for small graphic accents (e.g. the logo mark). */
  accent: string;
}

/**
 * Palette resolution. Defaults come from `brand-colors.json`; each value can be
 * overridden with `BRAND_<NAME>` (server) or `VITE_BRAND_<NAME>` (browser).
 */
export function readBrandColors(): BrandColors {
  const c = (
    names: string[],
    fallback: string,
  ): string => readString(names, fallback);

  return {
    primary: {
      DEFAULT: c(["BRAND_PRIMARY", "VITE_BRAND_PRIMARY"], DEFAULT_COLORS.primary.DEFAULT),
      dark: c(["BRAND_PRIMARY_DARK", "VITE_BRAND_PRIMARY_DARK"], DEFAULT_COLORS.primary.dark),
      light: c(["BRAND_PRIMARY_LIGHT", "VITE_BRAND_PRIMARY_LIGHT"], DEFAULT_COLORS.primary.light),
    },
    secondary: {
      DEFAULT: c(["BRAND_SECONDARY", "VITE_BRAND_SECONDARY"], DEFAULT_COLORS.secondary.DEFAULT),
      dark: c(["BRAND_SECONDARY_DARK", "VITE_BRAND_SECONDARY_DARK"], DEFAULT_COLORS.secondary.dark),
      light: c(["BRAND_SECONDARY_LIGHT", "VITE_BRAND_SECONDARY_LIGHT"], DEFAULT_COLORS.secondary.light),
    },
    surface: c(["BRAND_SURFACE", "VITE_BRAND_SURFACE"], DEFAULT_COLORS.surface),
    ink: c(["BRAND_INK", "VITE_BRAND_INK"], DEFAULT_COLORS.ink),
    accent: c(["BRAND_ACCENT", "VITE_BRAND_ACCENT"], DEFAULT_COLORS.accent),
  };
}

/** `#7F1D1D` → `127 29 29`, for use inside `rgb(var(--x) / <alpha-value>)`. */
export function hexToRgbTriplet(hex: string): string {
  const clean = hex.trim().replace(/^#/, "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : clean;
  const int = Number.parseInt(full, 16);
  if (full.length !== 6 || Number.isNaN(int)) {
    throw new Error(`[brand] Invalid hex colour: "${hex}"`);
  }
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`;
}

/**
 * Map of CSS custom property → `"R G B"` triplet. The Vite plugin in
 * `vite.config.ts` substitutes these into `src/index.css`, and
 * `tailwind.config.js` consumes them through `rgb(var(--…) / <alpha-value>)`
 * so that opacity modifiers such as `bg-burgundy/40` keep working.
 */
export function brandCssVariables(colors: BrandColors): Record<string, string> {
  return {
    "--brand-primary": hexToRgbTriplet(colors.primary.DEFAULT),
    "--brand-primary-dark": hexToRgbTriplet(colors.primary.dark),
    "--brand-primary-light": hexToRgbTriplet(colors.primary.light),
    "--brand-secondary": hexToRgbTriplet(colors.secondary.DEFAULT),
    "--brand-secondary-dark": hexToRgbTriplet(colors.secondary.dark),
    "--brand-secondary-light": hexToRgbTriplet(colors.secondary.light),
    "--brand-surface": hexToRgbTriplet(colors.surface),
    "--brand-ink": hexToRgbTriplet(colors.ink),
    "--brand-accent": hexToRgbTriplet(colors.accent),
  };
}

/* ─────────────────────────────── hours ─────────────────────────────── */

export interface StoreHours {
  /** Human label, e.g. `"Monday – Friday"`. */
  d: string;
  /** Human label, e.g. `"9:00 AM – 7:00 PM"`. */
  h: string;
  /** Lowercase plural day names this row covers, for schema.org output. */
  days: string[];
}

const DEFAULT_HOURS: StoreHours[] = [
  { d: "Monday – Friday", h: "9:00 AM – 7:00 PM", days: ["monday", "tuesday", "wednesday", "thursday", "friday"] },
  { d: "Saturday", h: "10:00 AM – 6:00 PM", days: ["saturday"] },
  { d: "Sunday", h: "12:00 PM – 5:00 PM", days: ["sunday"] },
];

/**
 * Parse `BRAND_HOURS` into rows.
 *
 * Format: one row per `;`, days and times separated by `|`, day ranges and
 * lists separated by `,`.
 *
 *   "Monday – Saturday 10 AM-10 PM, Sunday 11 AM-9 PM"
 *
 * is *not* the accepted form — it is ambiguous to parse reliably. The accepted
 * form is explicit:
 *
 *   "Monday-Saturday|10 AM-10 PM;Sunday|11 AM-9 PM"
 *
 * Falls back to the built-in Philly hours when unset.
 */
export function parseHours(raw: string | undefined): StoreHours[] {
  if (!raw || raw.trim() === "") return DEFAULT_HOURS;

  const rows: StoreHours[] = [];
  for (const chunk of raw.split(";")) {
    const [dayPart, timePart] = chunk.split("|").map((s) => (s ?? "").trim());
    if (!dayPart || !timePart) {
      throw new Error(
        `[brand] BRAND_HOURS row "${chunk.trim()}" must look like ` +
          `"Monday-Saturday|10 AM-10 PM". Separate rows with ";".`,
      );
    }
    for (const group of dayPart.split(",")) {
      const label = group.trim();
      if (!label) continue;
      rows.push({ d: label, h: timePart, days: expandDays(label) });
    }
  }

  if (rows.length === 0) {
    throw new Error("[brand] BRAND_HOURS produced no rows.");
  }
  return rows;
}

const ALL_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const DAY_ALIASES: Record<string, string> = {
  mon: "monday", monday: "monday",
  tue: "tuesday", tues: "tuesday", tuesday: "tuesday",
  wed: "wednesday", weds: "wednesday", wednesday: "wednesday",
  thu: "thursday", thur: "thursday", thurs: "thursday", thursday: "thursday",
  fri: "friday", friday: "friday",
  sat: "saturday", saturday: "saturday",
  sun: "sunday", sunday: "sunday",
};

/** `"Monday-Saturday"` → the six lowercase day names. Never throws; unknown
 *  tokens are dropped rather than failing a production boot. */
function expandDays(label: string): string[] {
  const normalise = (t: string): string | null =>
    DAY_ALIASES[t.trim().toLowerCase().replace(/\.$/, "")] ?? null;

  const range = label.split(/\s*[-–—]\s*/);
  if (range.length === 2) {
    const from = normalise(range[0]);
    const to = normalise(range[1]);
    if (from && to) {
      const start = ALL_DAYS.indexOf(from);
      const end = ALL_DAYS.indexOf(to);
      if (start !== -1 && end !== -1) {
        const out: string[] = [];
        for (let i = start; ; i = (i + 1) % 7) {
          out.push(ALL_DAYS[i]);
          if (i === end) break;
        }
        return out;
      }
    }
  }

  const single = normalise(label);
  return single ? [single] : [];
}

/** `"9:00 AM – 7:00 PM"` → `{ opens: "09:00", closes: "19:00" }` (24h). */
export function to24HourRange(
  time: string,
): { opens: string; closes: string } | null {
  const parts = time.split(/\s*[–—-]\s*/).map((s) => s.trim());
  const convert = (t: string): string | null => {
    const m = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i.exec(t);
    if (!m) return null;
    let hour = Number.parseInt(m[1], 10);
    const minute = m[2] ?? "00";
    const meridiem = m[3].toUpperCase();
    if (meridiem === "PM" && hour !== 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${minute}`;
  };

  if (parts.length !== 2) {
    // Also accept an already-24h range, e.g. "10:00-22:00".
    const direct = time.split(/\s*[–—-]\s*/);
    if (direct.length === 2 && /^\d{1,2}:\d{2}$/.test(direct[0]) && /^\d{1,2}:\d{2}$/.test(direct[1])) {
      return { opens: direct[0], closes: direct[1] };
    }
    return null;
  }

  const opens = convert(parts[0]);
  const closes = convert(parts[1]);
  if (!opens || !closes) return null;
  return { opens, closes };
}

const SCHEMA_DAY: Record<string, string> = {
  monday: "Mo", tuesday: "Tu", wednesday: "We", thursday: "Th",
  friday: "Fr", saturday: "Sa", sunday: "Su",
};

/** `"9:00 AM"` → `"9"`, `"10:30 AM"` → `"10:30"` — drops `:00` for compactness. */
function compactTime(t: string): string {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i.exec(t.trim());
  if (!m) return t.trim();
  const hour = m[1];
  const minute = m[2] ?? "00";
  return minute === "00" ? hour : `${hour}:${minute}`;
}

/** `"Monday – Friday"` → `"Mon–Fri"`, `"Saturday"` → `"Sat"`. */
function shortDayLabel(label: string): string {
  const parts = label.split(/\s*[–—-]\s*/);
  const shorten = (d: string): string => {
    const match = /^([A-Za-z]{3})[A-Za-z]*$/.exec(d.trim());
    return match ? match[1] : d.trim();
  };
  return parts.map(shorten).join("–");
}

/**
 * One-line summary for the footer, e.g. `"Mon–Fri 9–7 · Sat 10–6 · Sun 12–5"`.
 * Derived from `BRAND_HOURS`, so a store with different hours shows its own.
 */
export function compactHours(hours: StoreHours[]): string {
  return hours
    .map(({ d, h }) => {
      const range = h.split(/\s*[–—-]\s*/);
      if (range.length === 2) {
        return `${shortDayLabel(d)} ${compactTime(range[0])}–${compactTime(range[1])}`;
      }
      return `${shortDayLabel(d)} ${h}`;
    })
    .join(" · ");
}

/** Flatten address fields into a single query string, skipping blanks. */
function addressQuery(parts: {
  street: string;
  locality: string;
  region: string;
  postalCode: string;
}): string {
  const tail = [parts.locality, parts.region, parts.postalCode]
    .filter((v) => v.trim() !== "")
    .join(", ");
  return [parts.street.trim(), tail].filter((v) => v !== "").join(", ");
}

/** Google Maps directions link for the store address. */
export function mapsLink(addressParts: {
  street: string;
  locality: string;
  region: string;
  postalCode: string;
}): string {
  return `https://maps.google.com/?q=${encodeURIComponent(addressQuery(addressParts))}`;
}

/** Google Maps `<iframe>` embed for the store address. */
export function mapsEmbed(addressParts: {
  street: string;
  locality: string;
  region: string;
  postalCode: string;
}): string {
  return `https://maps.google.com/maps?q=${encodeURIComponent(addressQuery(addressParts))}&output=embed`;
}

/** Full hours for display, e.g. `"Mon–Fri 9AM–7PM · Sat 10AM–6PM"`. */
export function longHours(hours: StoreHours[]): string {
  return hours.map(({ d, h }) => `${shortDayLabel(d)} ${shortTime(h)}`).join(" · ");
}

/** `"9:00 AM – 7:00 PM"` → `"9AM–7PM"`, for compact one-line summaries. */
function shortTime(t: string): string {
  const parts = t.split(/\s*[–—-]\s*/);
  if (parts.length !== 2) return t;
  const one = (v: string): string => {
    const m = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i.exec(v.trim());
    if (!m) return v.trim();
    return m[2] && m[2] !== "00" ? `${m[1]}:${m[2]}${m[3].toUpperCase()}` : `${m[1]}${m[3].toUpperCase()}`;
  };
  return `${one(parts[0])}–${one(parts[1])}`;
}

/** schema.org `openingHours` strings, e.g. `["Mo-Sa 10:00-22:00", "Su 11:00-21:00"]`. */
export function schemaOpeningHours(hours: StoreHours[]): string[] {
  const out: string[] = [];
  for (const row of hours) {
    const range = to24HourRange(row.h);
    if (!range || row.days.length === 0) continue;
    const codes = row.days
      .map((d) => SCHEMA_DAY[d])
      .filter((c): c is string => Boolean(c));
    if (codes.length === 0) continue;

    const contiguous =
      codes.length > 1 &&
      codes.every((_, i) => i === 0 || ALL_DAYS.indexOf(row.days[i]) === ALL_DAYS.indexOf(row.days[i - 1]) + 1);

    const dayPart = contiguous ? `${codes[0]}-${codes[codes.length - 1]}` : codes.join(",");
    out.push(`${dayPart} ${range.opens}-${range.closes}`);
  }
  return out;
}

/* ──────────────────────────────── brand ──────────────────────────────── */

export interface Brand {
  name: string;
  /** Leading part of the wordmark, rendered in ink/foreground. */
  wordmarkPrimary: string;
  /** Trailing part of the wordmark, rendered in the primary brand colour. */
  wordmarkAccent: string;
  /** Small uppercase line under the wordmark, e.g. "Center City · Est. 2011". */
  tagline: string;
  description: string;
  /** Neighbourhood/region phrase used in footer copy, e.g. "Center City Philadelphia". */
  region: string;
  /** Short, casual name for the city used in headlines, e.g. "Philly". */
  cityLabel: string;
  /** Opening paragraph of the About page. */
  story: string;
  address: string;
  city: string;
  /** Street / locality / region / postal code, used for the map embed + JSON-LD. */
  addressParts: { street: string; locality: string; region: string; postalCode: string };
  phone: string;
  phoneHref: string;
  email: string;
  /** Digits only, for the wa.me link. Empty string hides the WhatsApp button. */
  whatsapp: string;
  hours: StoreHours[];
  siteUrl: string;
  logo: { type: "image" | "svg"; icon: string; full: string };
  colors: BrandColors;
}

/** Split a `"City, ST 12345"` string into schema.org address fields.
 *  Falls back to treating the whole string as the locality. */
function parseCityStateZip(value: string): {
  locality: string;
  region: string;
  postalCode: string;
} {
  const match = /^(.*),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/.exec(value.trim());
  if (match) {
    return { locality: match[1].trim(), region: match[2].toUpperCase(), postalCode: match[3] };
  }
  return { locality: value.trim(), region: "", postalCode: "" };
}

/** Split a store name into the ink part and the accent-coloured part. */
function splitWordmark(
  name: string,
  primaryOverride: string,
  accentOverride: string,
): { primary: string; accent: string } {
  if (primaryOverride || accentOverride) {
    return { primary: primaryOverride || name, accent: accentOverride };
  }
  const idx = name.indexOf(" ");
  if (idx === -1) return { primary: name, accent: "" };
  return { primary: name.slice(0, idx), accent: name.slice(idx + 1) };
}

/**
 * Build the brand object. Called once at module load; also exported so the
 * Vite config can resolve the same values when generating `index.html`.
 */
export function readBrand(): Brand {
  const name = readString(["BRAND_NAME", "VITE_BRAND_NAME"], "Philly Phone Repair");
  const { primary, accent } = splitWordmark(
    name,
    readString(["BRAND_WORDMARK_PRIMARY", "VITE_BRAND_WORDMARK_PRIMARY"], ""),
    readString(["BRAND_WORDMARK_ACCENT", "VITE_BRAND_WORDMARK_ACCENT"], ""),
  );

  const phone = readString(["BRAND_PHONE", "VITE_BRAND_PHONE"], "(215) 555-0123");
  const siteUrl = readString(
    ["BRAND_SITE_URL", "VITE_BRAND_SITE_URL"],
    readString(["PUBLIC_SITE_URL"], "https://philly-wireless.vercel.app"),
  ).replace(/\/+$/, "");

  const street = readString(["BRAND_STREET", "VITE_BRAND_STREET"], "1033 Chestnut Street");
  const city = readString(["BRAND_CITY", "VITE_BRAND_CITY"], "Philadelphia, PA 19107");
  const parsed = parseCityStateZip(city);

  const logoType = readString(["BRAND_LOGO_TYPE", "VITE_BRAND_LOGO_TYPE"], "image");

  return {
    name,
    wordmarkPrimary: primary,
    wordmarkAccent: accent,
    tagline: readString(["BRAND_TAGLINE", "VITE_BRAND_TAGLINE"], "Center City · Est. 2011"),
    description: readString(
      ["BRAND_DESCRIPTION", "VITE_BRAND_DESCRIPTION"],
      "Same-day phone, tablet, laptop and game console repair in Center City Philadelphia.",
    ),
    region: readString(
      ["BRAND_REGION", "VITE_BRAND_REGION"],
      "Center City Philadelphia",
    ),
    cityLabel: readString(["BRAND_CITY_LABEL", "VITE_BRAND_CITY_LABEL"], "Philly"),
    story: readString(
      ["BRAND_STORY", "VITE_BRAND_STORY"],
      "We opened with one bench, one soldering iron, and a simple promise: " +
        "fix it fast, fix it right, and tell people the truth about what it costs.",
    ),
    address: street,
    city,
    addressParts: {
      street,
      locality: parsed.locality,
      region: parsed.region,
      postalCode: parsed.postalCode,
    },
    phone,
    phoneHref: toTelHref(phone),
    email: readString(["BRAND_EMAIL", "VITE_BRAND_EMAIL"], "hello@phillyphonerepair.com"),
    whatsapp: readString(["BRAND_WHATSAPP", "VITE_BRAND_WHATSAPP"], toWhatsAppNumber(phone)),
    hours: parseHours(readString(["BRAND_HOURS", "VITE_BRAND_HOURS"], "")),
    siteUrl,
    logo: {
      type: logoType === "svg" ? "svg" : "image",
      icon: readString(["BRAND_LOGO_ICON", "VITE_BRAND_LOGO_ICON"], "/logo-icon.png"),
      full: readString(["BRAND_LOGO_FULL", "VITE_BRAND_LOGO_FULL"], "/logo-full.png"),
    },
    colors: readBrandColors(),
  };
}
