# Philly Wireless — Full Site Audit

**Audit date:** 2026-10-18  
**Baseline commit:** `f3acf20`  
**Production:** https://philly-wireless.vercel.app  
**Scope:** storefront UX, catalogue, cart/checkout, orders, repair booking, admin authorization, Firestore rules, SEO, accessibility, dependencies, build/reliability.

This report separates **verified evidence** from **recommendations**. Items marked “Fixed” were changed in this pass and rechecked. Items marked “Open” still need a product decision, credentials, content, or a larger change.

---

## 1. Executive summary

The application is materially more complete than a landing-page review suggests. The storefront, catalogue, cart, checkout, order confirmation, repair booking, staff dashboard, email/receipt generation, Stripe integration, and Firestore persistence all exist in the repository.

The core commerce invariants are implemented server-side:

- The browser submits product IDs and quantities only; names, prices, stock, tax and totals are resolved on the server.
- Stock is reserved inside a Firestore transaction and released on failure/cancellation.
- Checkout is idempotent through a client key plus an order-idempotency document.
- Stripe webhooks are signature-verified against the raw body and processing is idempotent.
- Card payment is only marked paid after the server verifies the Stripe session and payment status.
- Admin procedures require both a Firebase identity and the `admin` role.
- Firestore rules are deny-by-default for all customer, order, booking, image and admin collections.

No confirmed **P0 code defect** was found in the reviewed commerce/security paths. The highest-impact confirmed issues were SEO correctness, catalogue discoverability, accessibility, and one high-severity direct dependency (`nodemailer`), all addressed below. Four high-severity advisories remain in the Firebase browser dependency chain; there is no non-breaking upstream fix at this time.

---

## 2. Architecture inspected

| Area | Implementation |
|---|---|
| Frontend | React 19, Vite 7, TypeScript, React Router 7, Tailwind 3, shadcn/Radix, Framer Motion |
| Server | Hono on Vercel serverless, tRPC v11 |
| Data | Firestore via Firebase Admin SDK; base64 product images served by `/api/images/:id` |
| Auth | Firebase Authentication; server verifies ID tokens and checks the `admin` role |
| Payments | Stripe Checkout Sessions, webhook signature verification, refunds via REST |
| Email/SMS | Nodemailer SMTP and Twilio REST, both optional at runtime |
| Routes | `/`, `/services`, `/pricing`, `/devices`, `/accessories`, `/book`, `/cart`, `/checkout`, `/order/:token`, `/about`, `/contact`, `/faq`, `/blog`, `/blog/:slug`, `/login`, `/receipt/:token`, `/admin/*` |
| Admin | Dashboard, bookings, orders, customers, inventory, products, pricing, reports |
| Tests | Vitest, 26 files / 358 tests at the end of this pass |
| Deployment | Vercel production from `main`; cron route `/api/cron/reconcile-orders` |

The repository also supports multiple storefronts through `BRAND_*` / `VITE_BRAND_*` configuration. New SEO output follows that configuration rather than hardcoding the current domain in application code.

---

## 3. Verified working features

These were inspected in code and/or exercised through the existing automated suite:

### Commerce

- Server re-prices every line and rejects a changed cart total (`expectedTotalCents`).
- Unavailable/sold-out products cannot be ordered; quantity limits are enforced server-side.
- Stock reservation is transactional; concurrent orders cannot oversell.
- Retried checkout requests return the existing order instead of creating a duplicate.
- Card orders hold stock for a reservation window; abandoned orders are reconciled.
- Pay-in-store remains available and is clearly presented.
- Online card is gated by server configuration and is currently disabled (`onlineCard: false`).
- Stripe webhook verifies the raw-body signature and checks `payment_status === "paid"`.
- Replayed webhook events do not send duplicate confirmations.
- Order status/payment transitions are validated (`ORDER_STATUSES`, `PAYMENT_STATUSES`, transition guards).
- Order confirmation and receipt links use capability tokens; public order responses hide internal fields.
- Customer emails and printable receipts are implemented.

### Repair booking

- Six-step booking flow: issue, device, date, time slot, contact details, review.
- Availability is checked server-side; unavailable slots are disabled.
- Bookings persist and are visible in the admin dashboard.
- Staff can update status, reschedule, set estimates/warranty and add notes.
- Customer notification hooks exist for accepted/in-progress/completed/rescheduled/cancelled.

This is the existing repair-management system. **Do not add a second booking system.**

### Security and reliability

- `adminRouter` uses `adminQuery`; `adminQuery` requires authentication and `role === "admin"`.
- Firestore rules deny direct client reads/writes for bookings, messages, subscribers, users, customers, notes, parts, orders, idempotency, receipts and counters.
- Public catalogue reads are read-only.
- Sensitive mutations have best-effort per-instance rate limits; the code documents that this is defence-in-depth, not a global edge limit.
- API body size is bounded (50 MiB at the Hono layer) and product-image input is separately bounded.
- Product image writes go through the Admin SDK; the image collection is not client-readable.

---

## 4. Findings and disposition

Severity: **P0** security/payment/data loss/broken production; **P1** major journey/accessibility; **P2** SEO/performance/conversion; **P3** optional.

| ID | Severity | Finding | Evidence | Customer/business impact | Recommended fix | Status |
|---|---|---|---|---|---|---|
| P0-1 | P0 | No confirmed P0 code defect in reviewed checkout, inventory, payment, auth or rules paths. | `server/shopRouter.ts`, `server/queries/store.ts`, `server/stripeWebhook.ts`, `server/middleware.ts`, `firestore.rules`, order/payment tests. | None found in reviewed scope. | Keep regression suite and perform a real Stripe sandbox test once credentials exist. | Verified; live payment test pending credentials |
| P1-1 | P1 | Every client-rendered page kept the home canonical and home Open Graph URL; the static shell only carried a home canonical. | Baseline `/accessories` DOM: `<link rel="canonical" href="https://philly-wireless.vercel.app/">`; `src/components/Seo.tsx` only set title/description; `index.html` static canonical. | Search engines may consolidate category/service pages into the home page; shared links describe the wrong page. | Derive canonical/OG/Twitter URL from the current route; add explicit `noindex` for private/transactional routes. | **Fixed** in `src/components/Seo.tsx` + call sites |
| P1-2 | P1 | `/robots.txt` and `/sitemap.xml` did not exist as files. On an SPA host they fall back to `index.html`. | `public/` contained only logos; no robots/sitemap. | Crawlers receive HTML instead of directives; important pages are harder to discover. | Emit real `robots.txt` and `sitemap.xml` at build time from the configured site URL. | **Fixed** in `vite.config.ts` |
| P1-3 | P1 | Catalogue had no search or price/name sort; Accessories had no category filter; no explicit empty/error state; loading was a single line of text. | `src/pages/Devices.tsx`, `src/pages/Accessories.tsx` baseline. | Customers cannot quickly find a model/accessory; an empty or failed result looks broken. | Add shared search/sort toolbar, derived category filters, skeletons, retry and empty states. | **Fixed** (new `ProductToolbar`, `ProductGridSkeleton`, `lib/productCatalog`) |
| P1-4 | P1 | Add-to-cart buttons all exposed the same accessible name; booking/checkout fields relied on placeholders; no skip link or global focus-visible treatment; hero illustration was exposed as decorative text. | `src/components/AddToCartButton.tsx`, `Booking.tsx`, `Checkout.tsx`, `Layout.tsx`, `index.css`, `HeroDevice.tsx` baseline. | Screen-reader and keyboard users cannot reliably identify the product/action or skip repeated navigation; forms are harder to complete. | Add product-specific `aria-label`s, form labels, skip link, focus-visible outline, reduced-motion handling and `aria-hidden` on the decorative hero. | **Fixed** for storefront/critical forms; admin forms remain a follow-up |
| P1-5 | P1 | `nodemailer` was a direct high-severity production dependency with address-parser DoS advisories. | `npm audit --omit=dev` at baseline. | Crafted recipient input could consume server CPU; affected email delivery. | Upgrade to patched `nodemailer@^10.1.7` and re-run tests. | **Fixed**; audit now shows 4 high advisories, all Firebase gRPC |
| P1-6 | P1 | Four high-severity advisories remain through `firebase` → `@firebase/firestore` → `@grpc/grpc-js`. | `npm audit --omit=dev` after update: `@firebase/firestore`, `@firebase/firestore-compat`, `@grpc/grpc-js`, `firebase`. Audit’s suggested fix downgrades Firebase to 9.14.0 (breaking). | Low likelihood in this browser WebChannel usage; the advisory concerns gRPC server auth/error handling. Cannot be dismissed for all future usage. | Monitor upstream Firebase releases; do not force-downgrade. Re-audit when a patched Firebase 12.x is available. | **Open / accepted risk** |
| P2-1 | P2 | No product detail route. Cards show name/description/price/stock and add-to-cart, but cannot be linked individually or show a gallery/specs. | `src/App.tsx` has `/devices` and `/accessories` only; cards are not links. | Limits comparison, sharing and long-tail SEO. | Add `/product/:id` (or slug) backed by a server `productById` query, with canonical, stock, gallery, related items and add-to-cart. Stage behind the existing catalogue. | **Open — next P2** |
| P2-2 | P2 | Footer social links use `href="#"` and all announce “Social link”. | `src/components/Layout.tsx` footer. | Dead controls and poor screen-reader context. | Supply the shop’s real Facebook/Instagram/X URLs; use specific labels and `rel="noopener noreferrer"`. If no profiles exist, remove the icons. | **Open — needs URLs** |
| P2-3 | P2 | Client-side SEO cannot give non-JavaScript crawlers/social bots per-route metadata; the static shell remains home metadata. | `index.html` static canonical/OG; `Seo` runs after hydration. | Social previews for shared category/blog links may show home copy. | Add prerendering/SSR for public routes (or a build-time prerender step) when the marketing surface justifies it. Keep dynamic tags as the runtime fallback. | **Open — architectural** |
| P2-4 | P2 | No analytics events are wired. | No measurement script in `index.html` (commented placeholder); no event calls. | No funnel visibility for product views, searches, add-to-cart, checkout or repair requests. | Add consent-aware events: `view_item`, `search`, `add_to_cart`, `begin_checkout`, `purchase`, `book_repair`. Do not send PII (email/phone/address) to analytics. | **Open — recommendation** |
| P2-5 | P2 | Sitemap covers static routes only; blog post URLs and future product-detail URLs are omitted. | Generated `dist/public/sitemap.xml`; blog data is runtime. | Incomplete discovery for editorial/product content. | Generate blog/product URLs at build time from the same data source, or add a server sitemap route. | **Open — next P2** |
| P2-6 | P2 | No route-level code splitting; the public shell ships the admin/blog/chart code in one bundle. | `src/App.tsx` statically imports every page; build output. | Slower first load on mobile. | Lazy-load admin/reports/blog routes with `React.lazy` + Suspense; measure bundle before/after. | **Open — performance** |
| P3-1 | P3 | Checkout still says card details are entered on Stripe’s page even when online card is disabled; the note below explains it, but the hierarchy is contradictory. | `Checkout.tsx` payment section. | Minor confusion. | When `onlineCard` is false, replace the lead sentence with “Pay in store or call the shop”; hide card option entirely. | **Open — polish** |
| P3-2 | P3 | Social/newsletter/back-to-top controls have small hit targets and placeholder affordances. | `Layout.tsx` footer and floating actions. | Minor mobile usability. | Increase touch targets to ≥44px; label newsletter success/error inline. | **Open — polish** |

---

## 5. Changes implemented in this pass

### SEO and metadata

- `src/components/Seo.tsx`
  - Canonical URL now follows the route.
  - `og:title`, `og:description`, `og:url`, `og:image`, `og:site_name` updated per page.
  - Twitter card/title/description/image updated.
  - `robots` switches to `noindex, nofollow` for private pages and the canonical link is removed so capability tokens cannot leak into metadata.
  - A default description is always set instead of leaving the previous page’s description.
- Private/transactional pages now pass `noindex`: cart, checkout (both states), order confirmation, receipt, admin, login, 404.
- `index.html` gains a real Open Graph image and Twitter card metadata via a brand token.
- `vite.config.ts` emits `robots.txt` and `sitemap.xml` per storefront at build time; private paths are disallowed.

### Catalogue and discovery

- `src/lib/productCatalog.ts` — tested, non-mutating search/sort helpers.
- `src/components/ProductToolbar.tsx` — labelled search, clear button, result count, sort selector.
- `src/components/ProductGridSkeleton.tsx` — stable loading placeholders with a status role.
- `src/pages/Devices.tsx` — category tabs now expose `aria-pressed`; search/sort; skeleton; error/retry; empty state with clear filters; result count.
- `src/pages/Accessories.tsx` — same treatment plus derived category chips (previously none).
- `api/productCatalog.test.ts` — 4 regression tests for search/sort/copy semantics.

### Accessibility and motion

- `src/components/Layout.tsx` — skip-to-content link; `main` landmark target; back-to-top removed from tab order while hidden.
- `src/index.css` — global `:focus-visible` ring and `prefers-reduced-motion` suppression.
- `src/App.tsx` — `MotionConfig reducedMotion="user"`.
- `src/components/HeroDevice.tsx` — decorative scene marked `aria-hidden`.
- `src/components/AddToCartButton.tsx` — product-specific accessible names, including sold-out/added/in-cart states.
- `Booking.tsx` and `Checkout.tsx` — labels for name, phone, email, notes and delivery address.

### Dependency security

- `nodemailer` upgraded from `^9` to `^10.1.7`.
- Non-breaking `npm audit fix` updated Hono, React Router, Vite and transitive packages.
- `package.json` + `package-lock.json` changed; no application API changes were required.

---

## 6. Verification performed

### Commands (actual results)

| Command | Result |
|---|---|
| `npm run check` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | 26 files / **358 tests passed** |
| `npm run build` | exit 0; production output generated |
| `npm audit --omit=dev` before | 16 vulnerabilities: 8 high, 8 moderate |
| `npm audit fix` | reduced production advisories |
| `npm install nodemailer@^10.1.7` | success |
| `npm audit --omit=dev` after | **4 high**, all Firebase gRPC chain |
| Browser smoke test at 1440/1280/1024 | Home/header/hero/footer render; no console or page errors |
| Browser smoke test at 390 | Mobile header fits; catalogue page loads (observed loading state) |
| Captured `/accessories` DOM | canonical `https://philly-wireless.vercel.app/accessories`, `robots: index, follow`, `og:url` matches; search input present |
| Generated `dist/public/robots.txt` | present, private paths disallowed, sitemap URL correct |
| Generated `dist/public/sitemap.xml` | present with 10 static public routes |

### Deployment verification (commit `de9ca52`)

- All three Vercel projects reported **success**.
- Live `GET /robots.txt` returned `200 text/plain; charset=utf-8` with the expected disallow rules and sitemap URL.
- Live `GET /sitemap.xml` returned `200 application/xml` with the static public routes.
- Live `/accessories` rendered canonical `https://philly-wireless.vercel.app/accessories`, `robots: index, follow`, matching `og:url`, and product-specific add-to-cart accessible names.
- Typing “USB” into the live catalogue search reduced/retained a matching result set (7 matching items) without a page error.
- Local production build verified `/cart` switches to `robots: noindex, nofollow` and removes the canonical link.

### Not verified / requires credentials or manual work

- A real Stripe card payment, webhook delivery, refund, and payout reconciliation. `onlineCard` and `webhookConfigured` are currently false in production configuration.
- Real SMTP delivery and Twilio SMS delivery.
- Firestore rules deployment against the live project (`npm run deploy:rules`). Rules in the repository are correct; deployment state was not changed in this pass.
- Admin sign-in with a real staff account (no credentials used).
- Google Search Console indexing, social-card previews, and Lighthouse/Core Web Vitals. These require external tools and production traffic.
- `CRON_SECRET` configuration for the reconciliation cron (returns 503 until set).

---

## 7. Manual/configuration checklist

1. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in Vercel, then run a sandbox payment and a replay test.
2. Set `CRON_SECRET`; verify `/api/cron/reconcile-orders` with the bearer secret.
3. Deploy Firestore rules: `npm run deploy:rules`.
4. Add real social profile URLs or remove the placeholder icons.
5. Provide an analytics/consent decision before enabling measurement.
6. Schedule a follow-up dependency audit for Firebase 12.x.

---

## 8. Analytics recommendations

Use a consent-aware analytics layer. Never send email, phone, address, order token or free-text notes.

| Event | When | Useful properties |
|---|---|---|
| `view_item_list` | Devices/Accessories list rendered | `item_category`, `result_count` |
| `search` | Debounced catalogue search | `search_term` (non-PII), `result_count` |
| `view_item` | Product detail opened (after P2-1) | `item_id`, `item_name`, `price`, `stock_status` |
| `add_to_cart` | Successful add | `item_id`, `quantity`, `value` |
| `begin_checkout` | Checkout form mounted | `value`, `currency`, `item_count` |
| `purchase` | Server-confirmed paid order only | `transaction_id`, `value`, `currency`, `items` |
| `book_repair` | Booking mutation succeeds | `device_type`, `repair_type`, `slot_date` (no customer data) |

Server-side `purchase` is strongly preferred so ad blockers and refresh/replay cannot inflate conversions.

---

## 9. Repair-management roadmap (existing system, staged)

The current booking system is the system of record. Proposed increments, in order:

1. **Customer status page** — capability-token link (`/repair/:token`) showing ticket status, estimate, appointment and shop notes marked customer-visible.
2. **Approval flow** — staff sends an estimate; customer approves/declines; approval is persisted with timestamp and shown in admin.
3. **Notifications** — email/SMS on status changes and approval requests, using existing `notifications.ts` hooks.
4. **Staff notes separation** — internal notes vs customer-visible notes; never expose internal fields on the public token response.
5. **Reporting** — turnaround time, status aging and estimate conversion in admin reports.

Do not add a second ticket/booking store; extend the existing `bookings` collection and admin router.

---

## 10. Prioritized next work

**P1 follow-up**

- Real Stripe sandbox verification once credentials are configured.
- Deploy Firestore rules and verify rule coverage in the Firebase console.
- Add admin-form labels and focus management where still missing.
- Add an edge/WAF rate limit for public mutations if abuse becomes material.

**P2**

- Product detail route with server lookup, canonical metadata, gallery and stock state.
- Real social URLs.
- Prerender/SSR for public metadata or accept the SPA limitation explicitly.
- Lazy-load admin/reports/blog routes and measure the bundle.
- Dynamic sitemap entries for blog/product URLs.
- Consent-aware analytics.

**P3**

- Checkout payment-copy cleanup when card online is disabled.
- Newsletter inline validation/success state.
- Larger touch targets for footer/floating controls.

---

## 11. Files changed in this pass

- `src/components/Seo.tsx`
- `src/components/ProductToolbar.tsx` (new)
- `src/components/ProductGridSkeleton.tsx` (new)
- `src/lib/productCatalog.ts` (new)
- `api/productCatalog.test.ts` (new)
- `src/pages/Devices.tsx`
- `src/pages/Accessories.tsx`
- `src/pages/Cart.tsx`
- `src/pages/Checkout.tsx`
- `src/pages/OrderConfirmation.tsx`
- `src/pages/Receipt.tsx`
- `src/pages/Login.tsx`
- `src/pages/NotFound.tsx`
- `src/pages/Booking.tsx`
- `src/pages/admin/AdminLayout.tsx`
- `src/components/Layout.tsx`
- `src/components/AddToCartButton.tsx`
- `src/components/HeroDevice.tsx`
- `src/App.tsx`
- `src/index.css`
- `vite.config.ts`
- `index.html`
- `package.json` / `package-lock.json`
- `docs/FULL_SITE_AUDIT.md` (this report)

No secrets or customer records were printed, logged or committed during the audit.
