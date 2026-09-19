import devServer from "@hono/vite-dev-server"
import path from "path"
const __dirname = import.meta.dirname
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'
import { readBrand, brandCssVariables, schemaOpeningHours } from "./contracts/brand.js"

/**
 * Brand theming + `<head>` generation.
 *
 * This repo builds more than one storefront. Everything that differs between
 * stores is read from the environment here (`BRAND_*` / `VITE_BRAND_*`), with
 * Philly Phone Repair as the built-in default, and pushed into the two places
 * that cannot read JavaScript at runtime:
 *
 *   1. `src/index.css` — `@brand-primary`-style tokens become real RGB channel
 *      values, which `tailwind.config.js` consumes via `rgb(var(--brand-x))`.
 *   2. `index.html` — title, meta description, canonical link, favicon and the
 *      schema.org LocalBusiness JSON-LD block.
 *
 * Page copy reads the same module at runtime, so one source of truth feeds the
 * client, the server and the static shell.
 */
function brand(): Plugin {
  const store = readBrand()
  const vars = brandCssVariables(store.colors)

  const replaceCssTokens = (css: string): string =>
    css.replace(
      /@(brand-[a-z-]+)/g,
      (match, token: string) => vars[`--${token}`] ?? match,
    )

  return {
    name: "brand-theme",
    enforce: "pre",

    // Stylesheet tokens -> RGB channels.
    transform(code, id) {
      if (id.replace(/\\/g, "/").endsWith("src/index.css")) {
        return replaceCssTokens(code)
      }
      return null
    },

    // Static shell -> branded head.
    transformIndexHtml(html) {
      const { street, locality, region, postalCode } = store.addressParts
      const jsonLd = {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        name: store.name,
        description: store.description,
        address: {
          "@type": "PostalAddress",
          streetAddress: street,
          addressLocality: locality,
          addressRegion: region,
          postalCode,
          addressCountry: "US",
        },
        telephone: store.phone,
        email: store.email,
        openingHours: schemaOpeningHours(store.hours),
        priceRange: "$$",
      }

      return html
        .replace(/__BRAND_NAME__/g, store.name)
        .replace(/__BRAND_DESCRIPTION__/g, store.description)
        .replace(/__BRAND_STREET__/g, street)
        .replace(/__BRAND_CITY__/g, `${locality}, ${region} ${postalCode}`)
        .replace(/__BRAND_PHONE__/g, store.phone)
        .replace(/__BRAND_EMAIL__/g, store.email)
        .replace(/__BRAND_SITE_URL__/g, store.siteUrl)
        .replace(/__BRAND_ICON__/g, store.logo.icon)
        .replace(/__BRAND_JSONLD__/g, JSON.stringify(jsonLd, null, 2))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    devServer({ entry: "server/boot.ts", exclude: [/^\/(?!api\/).*$/] }),
    inspectAttr(), react(), brand()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@contracts": path.resolve(__dirname, "./contracts"),
      "@db": path.resolve(__dirname, "./db"),
      "db": path.resolve(__dirname, "./db"),
    },
  },
  envDir: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
});
