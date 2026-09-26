/**
 * Brand colours.
 *
 * The site's pages use the class names `burgundy` / `blush` / `ivory` / `ink`
 * everywhere. Those names are kept so no component has to change, but the
 * VALUES now come from CSS custom properties that `vite.config.ts` writes into
 * `src/index.css` from the `BRAND_*` environment variables. A second store
 * therefore gets its own palette from configuration alone.
 *
 * `rgb(var(--x) / <alpha-value>)` (rather than a bare `var()`) is what keeps
 * Tailwind's opacity modifiers working, e.g. `bg-burgundy/40`, `text-ink/55`,
 * `border-blush/40`.
 */
const DEFAULT_COLORS = require('./contracts/brand-colors.json')

/** `#7F1D1D` -> `127 29 29`, the form CSS custom properties store channels in. */
const triplet = (hex) => {
  const clean = hex.replace(/^#/, '')
  const full =
    clean.length === 3
      ? clean.split('').map((c) => c + c).join('')
      : clean
  const int = Number.parseInt(full, 16)
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`
}

/**
 * The custom properties are declared in `src/index.css`, which only exists in
 * the browser bundle — but these same utilities are compiled into the server
 * build too. Supplying the default as the `var()` fallback means the colour is
 * always resolvable, and deployments restyle everything by overriding the
 * variables.
 */
const brand = (name, hex) => `rgb(var(--brand-${name}, ${triplet(hex)}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ["'Playfair Display'", "Georgia", "serif"],
        sans: ["'Inter'", "system-ui", "sans-serif"],
      },
      colors: {
        burgundy: {
          DEFAULT: brand('primary', DEFAULT_COLORS.primary.DEFAULT),
          dark: brand('primary-dark', DEFAULT_COLORS.primary.dark),
          light: brand('primary-light', DEFAULT_COLORS.primary.light),
        },
        blush: {
          DEFAULT: brand('secondary', DEFAULT_COLORS.secondary.DEFAULT),
          dark: brand('secondary-dark', DEFAULT_COLORS.secondary.dark),
          light: brand('secondary-light', DEFAULT_COLORS.secondary.light),
        },
        ivory: brand('surface', DEFAULT_COLORS.surface),
        ink: brand('ink', DEFAULT_COLORS.ink),
        // Named `accent-brand` rather than `accent` because `accent` is already
        // a shadcn/ui semantic colour below.
        'accent-brand': brand('accent', DEFAULT_COLORS.accent),
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      },
      transitionTimingFunction: {
        // Named so it can be used as `ease-smooth`; an arbitrary
        // `ease-[cubic-bezier(...)]` value is ambiguous to Tailwind's parser.
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}