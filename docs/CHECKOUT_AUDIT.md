# Checkout audit, hardening, and deployment readiness

Date: 2026-10-17
Scope: the complete Devices/Accessories → cart → checkout → Stripe → order
confirmation → admin Orders path in this repository.

No production deployment, live payment setting, migration, or real charge /
refund was performed during this audit.

## 1. System inspected

| Area | Finding |
| --- | --- |
| Frontend | React 19 + Vite 7 + TypeScript + Tailwind/shadcn, `react-router` v7 |
| API | Hono + tRPC v11 (superjson), served by Vercel (`api/index.js` → `api/_app.cjs`) or Firebase Functions (`functions/index.ts`) |
| Data | Firestore via `firebase-admin`; numeric ids from `__counters` |
| Auth | Firebase ID token verified server-side; `admin` role read from the Firestore `users` row |
| Payments | Stripe Checkout REST integration (no SDK), webhook signature verification |
| Email | Brevo / SendGrid / SMTP via `server/email.ts`; Twilio SMS |
| Checks | Vitest (`api/**/*.test.ts`), `tsc -b`, ESLint, esbuild/Vite build |
| Deployment target | Vercel (primary; `vercel.json` + rewrites + cron) and Firebase Hosting/Functions (alternative) |

Baseline before changes: `npm run check` ✅, `npm run lint` ✅, **230 tests** ✅,
`npm run build` ✅ (with the pre-existing 500 kB chunk and `import.meta` CJS
warnings). The reported baseline was therefore valid.

Final verification after changes (2026-10-17): `npm run check` ✅,
`npm run lint` ✅, **354 tests passed** across 25 files ✅, `npm run build` ✅.
The only build warnings are the pre-existing Vite >500 kB chunk warning and the
`import.meta` warning from `server/lib/vite.ts` under the CJS server bundle.
No external Stripe/Firestore/email calls were made during the audit itself.

**Live deployment (2026-10-17):** commit `68d4263` is deployed to
https://philly-wireless.vercel.app and `/api/health` returns the new config
shape. `onlineCard` is currently `false` because no Stripe key is configured in
Vercel; pay-in-store checkout is live. The cron endpoint is deployed but returns
503 until `CRON_SECRET` is set. Firestore rules still need `npm run
deploy:rules` (or the Firebase console).

## 2. Confirmed defects fixed

| # | Severity | Defect | Fix |
| --- | --- | --- | --- |
| 1 | High | No idempotency: a retried `createOrder` created a second order and reserved stock twice. | Client sends a per-checkout key; `orderIdempotency/{key}` is written in the same Firestore transaction as the order. Replays return the original order. |
| 2 | High | Stock reservation and order creation were two transactions; a crash between them could hold stock for a non-existent order. | `createOrderWithReservation` validates products, writes the order, writes the idempotency pointer and decrements stock in **one** transaction. |
| 3 | High | Admin cancel/deletion read the order, released stock, then updated it — two admins could restock twice, and completed orders were restocked. | `cancelOrder` and `deleteOrderSafely` are transactional; stock is returned at most once, only for `new`/`ready` orders, guarded by `stockRestoredAt`. |
| 4 | High | A paid order could be cancelled or deleted with no refund, silently leaving a captured payment. | Cancellation of a paid order is refused; deletion of a paid order is refused. Refund is a separate Stripe-first flow. |
| 5 | High | Admin could set `paid → unpaid` and set `refunded` directly. | Payment transitions are validated (`unpaid → paid`, `paid → refunded` only); `refunded` requires the refund endpoint. |
| 6 | High | `payOrder` created a new Stripe Checkout session on every click; two open sessions could be paid twice. | An existing open session is re-read and reused. No new session is created while one is chargeable. |
| 7 | High | Webhook processed `checkout.session.completed` with a read-then-write, so concurrent deliveries could send duplicate confirmation emails. | `markOrderPaid` claims the transition in a transaction and returns `changed`; email only on the first change. |
| 8 | High | Abandoned card checkouts held stock indefinitely (`checkout.session.expired` was ignored). | Stripe session expiry is aligned to the reservation, expired events cancel/restock transactionally, and a daily Stripe-checked reconciliation sweeps leftovers. |
| 9 | High | The expiry sweep could release stock for a payment Stripe had already captured but whose webhook was delayed. | `reconcileAbandonedOrders` re-reads every candidate session: paid → mark paid; open/complete-unsettled or Stripe error → leave; only expired/unpaid → cancel. |
| 10 | Medium | A `null` Stripe `amount_total` bypassed the amount check. | Amount must equal the server total exactly; currency is also checked. |
| 11 | Medium | No rate limiting on public order/payment mutations. | Fixed-window per-IP limiter on create/pay/confirm (best-effort per instance; edge rate limiting still recommended). |
| 12 | Medium | Any non-empty `STRIPE_SECRET_KEY` enabled card checkout (publishable keys included). | Keys must match `sk_test_`/`sk_live_`/`rk_test_`/`rk_live_`; invalid keys disable checkout and surface an admin warning. |
| 13 | Medium | Customer email addresses and phone numbers were logged in full when providers were unconfigured. | Recipients are masked; SMS body is omitted from production logs. |
| 14 | Medium | Delivery address and phone were barely validated server-side. | Phone requires 10–15 digits; delivery requires a real address (≥ 6 chars); name ≥ 2 chars. |
| 15 | Medium | Refunds were not implemented, so paid-order cancellation was unsafe. | `admin.refundOrder` refunds through Stripe with an idempotency key and only records `refunded` on `succeeded`; offline refunds require an explicit staff confirmation. |
| 16 | Low | Idempotency keys would accumulate forever. | The reconciliation sweep deletes keys older than 7 days. |
| 17 | Low | `PUBLIC_SITE_URL` was not validated for HTTPS. | Admin payment config flags a non-HTTPS public URL before live payments. |
| 18 | Low | Order tokens had no direct test of entropy/format. | `newCapabilityToken` (192-bit base64url) is shared by orders/receipts and tested. |

## 3. Security properties now enforced

- **Server-side pricing only.** The browser sends product ids and quantities; the
  server reloads products and computes subtotal, tax and total. No client field
  for price, tax, discount or payment status is accepted.
- **Atomic inventory.** Reservation, order creation, cancellation, refund
  restock and deletion run in Firestore transactions with in-transaction stock
  validation; concurrent buyers cannot oversell.
- **Idempotent money and stock.** Checkout keys, atomic paid/refunded claims,
  Stripe refund idempotency keys, and `stockRestoredAt` prevent duplicate
  charges, emails and restocks.
- **Stripe is authoritative.** A success redirect never marks an order paid by
  itself: the session is fetched from Stripe and checked for order token, order
  id, amount, currency and payment status. Webhooks are verified against the
  exact raw body with a timestamp tolerance.
- **Capability-token customer access.** Public order/receipt pages use 192-bit
  random tokens. Customers cannot list or modify orders; staff operations
  require a verified Firebase ID token with the `admin` role.
- **Staff-only data stays private.** `staffNotes`, Stripe ids and the
  idempotency key are excluded from the public order projection (tested).
- **Safe cancellation/deletion.** Paid orders must be refunded first; completed
  orders are never silently restocked; cancellation is terminal.
- **Abuse controls.** Public checkout/payment endpoints are rate limited;
  cron is bearer-secret protected with constant-time comparison.

## 4. Payment / order behaviour

### Card online

1. `shop.createOrder` (requires `idempotencyKey`) re-prices the cart, then
   `createOrderWithReservation` atomically writes an unpaid order and decrements
   stock. A `reservationExpiresAt` is set to the Stripe session expiry + 15 min.
2. Stripe Checkout is created with server amounts, `metadata.orderToken`,
   `metadata.orderId`, `client_reference_id`, and an expiry of
   `ORDER_RESERVATION_MINUTES`.
3. On return, `shop.confirmOrderPayment` re-reads the session, checks ownership
   and amount, and calls the transactional `markOrderPaid`.
4. The signed webhook handles the same transition if the customer closes the
   tab. Replays are no-ops (no second email, no second status change).
5. `checkout.session.expired` cancels an unpaid order and returns stock once.
   `reconcileAbandonedOrders` re-checks Stripe before any release, and never
   releases stock for a paid order.

### Pay in store / delivery / cash / Zelle

The order is recorded unpaid, stock is reserved, and confirmation mail is sent.
Staff mark the order paid when money is collected. Zelle has no automatic
verification — staff must confirm the transfer.

### Refunds

`admin.refundOrder`:

- **card online**: calls Stripe Refunds with `refund-order-<id>`; records
  `refunded` only when Stripe reports `succeeded` and the refunded amount equals
  the order total. If Stripe is unreachable or reports `pending`/`failed`, the
  order stays `paid` with a clear error.
- **offline methods**: the UI asks staff to confirm the money was already
  returned; the server records the refund and restocks eligible orders.

Refunds made directly in the Stripe Dashboard are **not** synchronised back.
Record them through the app (or document them manually) so the order page is
not misleading.

## 5. Configuration

All values are server-side unless prefixed `VITE_`. **Never commit real values.**

| Variable | Required | Meaning |
| --- | --- | --- |
| `FIREBASE_PROJECT_ID` | Yes | Firebase project id |
| `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | One auth path | Legacy service account |
| `GCP_WORKLOAD_IDENTITY_*`, `GCP_SERVICE_ACCOUNT_EMAIL` | One auth path | Preferred keyless auth |
| `VITE_FIREBASE_*` | Client | Firebase web config |
| `STRIPE_SECRET_KEY` | For card online | `sk_test_…`, `sk_live_…`, `rk_test_…` or `rk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | For card online | `whsec_…` from the Stripe endpoint |
| `PUBLIC_SITE_URL` | Yes for payments | Canonical **https** origin, e.g. `https://shop.example` |
| `ORDER_TAX_PERCENT` | No (default 0) | 0–25, two-decimal; tax on the merchandise subtotal only |
| `ORDER_RESERVATION_MINUTES` | No (default 60) | 30–1440; Stripe session + stock hold |
| `CRON_SECRET` | Recommended | Bearer token for `/api/cron/reconcile-orders` |
| `STAFF_EMAIL` | Recommended | Staff order alerts |
| `BREVO_API_KEY`/`BREVO_FROM` or `SENDGRID_*` or `SMTP_*` | Recommended | Customer/staff email |
| `TWILIO_*` | Optional | SMS notifications |

### Tax and delivery — business confirmation required

The code does **not** assume that 8% is legally correct. It applies exactly
`ORDER_TAX_PERCENT` to the merchandise subtotal, rounds to whole cents, and
shows the same rate in the browser, the stored order and the Stripe line item.
Local delivery is currently **free** (no delivery fee is added anywhere).
Confirm both rules with an accountant before enabling tax or charging a
delivery fee.

## 6. Stripe test-mode verification (no live money)

1. In the Stripe Dashboard, switch to **Test mode** and copy the secret key and
   webhook signing secret into the deployment's server environment only.
2. Set `PUBLIC_SITE_URL` to the preview/production HTTPS URL and
   `ORDER_TAX_PERCENT=0` for the first run.
3. Add a webhook endpoint `https://<domain>/api/stripe/webhook` with events:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.expired`, `checkout.session.async_payment_failed`.
4. Open **Admin → Orders** and confirm the amber **Stripe test mode** banner and
   that the webhook warning is absent.
5. Buy an accessory with card `4242 4242 4242 4242`, any future expiry/CVC.
6. Confirm: redirect to `/order/<token>`, payment status paid, one customer
   email, one staff alert, stock decreased by one, Admin → Orders shows paid.
7. Refresh the confirmation page and replay the webhook from the Stripe
   Dashboard: no second email and no status change.
8. Test a declined card (`4000 0000 0000 0002`), a 3-D Secure challenge card,
   and an abandoned checkout. For abandoned checkout, let the session expire or
   use Stripe test clocks; then run **Release expired holds** and confirm stock
   returns exactly once.
9. Test refunds from Admin → Orders: the order becomes `refunded`, stock
   returns (for `new`/`ready`), and Stripe shows a succeeded refund. Clicking
   refund again is a no-op.
10. Confirm a cash order and a Zelle order can be marked paid and refunded
    (offline confirmation path).

## 7. Production deployment checklist

- [ ] `npm run check`, `npm run lint`, `npm test`, `npm run build` all pass on
      the commit being deployed (record the test count).
- [ ] Vercel (or Firebase Functions) has every server variable from §5; no
      secret is in the repo, `.env`, a `VITE_` variable, or the client bundle.
- [ ] `PUBLIC_SITE_URL` is the exact HTTPS production origin (no trailing
      slash required; it is normalised).
- [ ] `STRIPE_SECRET_KEY` matches the intended mode; `/api/health` and Admin →
      Orders report the expected mode. **Start in test mode.**
- [ ] Stripe webhook endpoint exists for the production domain, is subscribed to
      the four events, and its `whsec_` value is in `STRIPE_WEBHOOK_SECRET`.
- [ ] `CRON_SECRET` is set in the hosting provider; `vercel.json` cron is
      deployed; `/api/cron/reconcile-orders` returns 401 without the bearer and
      200 with it. (Vercel sends the secret automatically when configured.)
- [ ] Firestore rules deployed: `npx firebase deploy --only firestore:rules`.
      `orders`, `orderIdempotency`, `receipts`, product images and CRM data are
      server-only.
- [ ] `.vercelignore` is present so `api/**/*.test.ts` is not deployed as a
      serverless function. (Without it the Hobby function limit is exceeded.)
- [ ] Firebase Auth is configured; the intended staff UID is in
      `FIREBASE_ADMIN_UID`; unauthenticated `admin.*` calls return
      `Authentication required`.
- [ ] Email provider verified (send a test confirmation) and `STAFF_EMAIL`
      receives the staff alert.
- [ ] Domain serves HTTPS; the Stripe redirect and emailed order link open the
      production origin.
- [ ] Tax and delivery rules signed off; `ORDER_TAX_PERCENT` set accordingly.
- [ ] Admin → Orders shows no configuration warnings (test mode / webhook /
      HTTPS / expiry).
- [ ] Logs are monitored for `[stripe]`, `[orders]`, `[email]`; `/api/health`
      is polled. Logs must not contain keys, webhook secrets or full customer
      contact details.
- [ ] Firestore backups/exports are scheduled and a restore has been rehearsed.
      Orders are financial records; do not delete paid orders.
- [ ] Test a real low-value live purchase only after the whole test-mode run,
      then refund it.
- [ ] Rollback is documented (see §8) and the previous deployment is known-good.

### Switching test → live

1. Complete the test-mode checklist and get business sign-off.
2. Create a **new** live webhook endpoint in Stripe (live mode) and copy its
   signing secret.
3. In one deployment, swap `STRIPE_SECRET_KEY` to `sk_live_…` and
   `STRIPE_WEBHOOK_SECRET` to the live endpoint's `whsec_…`; confirm
   `PUBLIC_SITE_URL` is the live HTTPS domain.
4. Deploy, open Admin → Orders, and confirm the test-mode banner disappears and
   the webhook warning is absent.
5. Make one small live purchase and refund it through Admin → Orders.
6. Keep the test-mode webhook endpoint separate; never point it at production.

## 8. Reconciliation, monitoring, rollback

- **Expired holds**: Stripe's expired webhook cancels/restocks; the daily cron
  (or Admin → Orders → *Release expired holds*) re-checks Stripe and releases
  only sessions that are expired and unpaid. It skips paid, open, unsettled or
  unverifiable sessions. It also deletes idempotency keys older than 7 days.
- **Manual paid Stripe order**: if a webhook was missed, the customer's return
  path or the admin *Mark paid* action records it; the refund path requires a
  PaymentIntent id (captured by webhook/return verification).
- **Monitoring**: watch for `[stripe] amount mismatch`, `could not mark paid`,
  `payment captured for cancelled order`, `reconciliation left … alone`,
  `[orders] could not …` and repeated webhook 5xx responses in Stripe.
- **Backups**: enable scheduled Firestore exports and restrict delete access.
  A paid order should be refunded, not deleted.
- **Rollback**: redeploy the previous Vercel build (or `git revert`); removing
  `STRIPE_SECRET_KEY` immediately disables card-online checkout while leaving
  pay-in-store orders working. Existing orders and stock remain valid; run the
  reconciliation action after restoring service. Refunds made while the app was
  down can be processed in the Stripe Dashboard and recorded manually.

## 9. Known limitations / remaining external work

1. **Firestore/Stripe integration is not executed in tests.** Unit tests mock
   the data and payment layers. The transactional code is correct by
   construction but should be exercised against the Firestore emulator (and
   Stripe test mode) before go-live.
2. **Rate limiting is per instance** (in-memory). Use Vercel Firewall/Cloudflare
   for a hard global limit.
3. **No automatic email retry or cancellation/refund emails.** Confirmation
   mail is best-effort and duplicate-safe (only sent on transition). Staff can
   resend via the CRM notification feature; refunds are visible in Admin.
4. **Zelle and offline refunds are trust-based.** Staff must confirm the money
   moved; the app only records it.
5. **External Stripe Dashboard refunds are not synchronised.** Record them
   manually.
6. **Tax rate and free local delivery require business/accounting confirmation**
   (§5). No legal advice is implied.
7. **Refunds are full-order only**; partial refunds are not implemented.
8. **Cron frequency** is daily in `vercel.json` (Hobby-compatible). Increase it
   on a plan that supports more frequent crons if abandoned checkout volume is
   high.
9. **Pending/failed email delivery uses server logs only**, masked for PII.
10. **Reconciliation is sequential** and processes up to 100 candidates (one
    Stripe check and transaction each). On a plan with a short function timeout,
    lower the batch size or run it more often. The admin action uses the same
    sweep.
11. **Manual staff "Mark paid" now sends the same customer payment email** as
    the webhook; cancellations/refunds still do not send email.

## 10. Files changed (significant)

| File | Purpose |
| --- | --- |
| `contracts/orders.ts` | Tax normalisation, idempotency-key validation, restock/transition rules, currency |
| `server/queries/store.ts` | Atomic order+reservation, paid/refunded claims, safe cancel/delete, stale-order query, idempotency store |
| `server/payments.ts` | Key-mode validation, session expiry/PaymentIntent/currency parsing, Stripe refunds |
| `server/stripeWebhook.ts` | Idempotent, amount/currency/reference-checked webhook state machine + expiry |
| `server/orderReconciliation.ts` | Stripe-checked release of abandoned holds; idempotency cleanup |
| `server/shopRouter.ts` | Idempotent checkout, atomic creation, session reuse, verified confirmation, expiry, rate limits |
| `server/adminRouter.ts` | Safe transitions, refunds, safe deletion, reconciliation, payment config |
| `server/boot.ts` | Raw-body webhook route, cron endpoint, health config |
| `server/lib/rateLimit.ts`, `server/lib/tokens.ts`, `server/lib/secrets.ts`, `server/lib/mask.ts`, `server/lib/stock.ts` | Abuse control, capability tokens, constant-time secrets, PII-safe logs, pure oversell rules |
| `server/lib/env.ts` | Reservation/cron config, URL normalisation, validated tax |
| `server/email.ts`, `server/sms.ts`, `server/orderEmails.ts` | Order mail, masked logs, failure isolation |
| `src/pages/Checkout.tsx` | Per-attempt idempotency key |
| `src/pages/admin/Orders.tsx` | Search, test/config banners, safe cancel/refund/delete, reconciliation action |
| `src/pages/OrderConfirmation.tsx` | Cancelled/expired states, no payment CTA on cancelled orders |
| `.env.example`, `README.md`, `vercel.json`, `firestore.rules` | Configuration, cron, rules, docs |
| `.vercelignore` | Keeps `api/**/*.test.ts` out of the Vercel function bundle (tests are not serverless endpoints) |
| `api/*.test.ts` | Regression coverage (cart, contracts, checkout, webhook, reconciliation, refunds, tokens, rate limits, email isolation, auth) |

## 11. What was tested vs inspected

**Tested automatically (mocked Firestore/Stripe/email):** cart stock/quantity
limits, stored-cart validation and cross-tab payload handling, server-side
re-pricing, idempotent checkout, stock-conflict mapping, tax/rounding rules,
order-state and payment-state guards, cancellation/refund/deletion semantics,
Stripe session ownership/amount/currency/expiry checks, webhook replay and
expiry behaviour, Stripe signature verification, rate limiting, capability-token
format/entropy, admin authorization, staff-note privacy, email failure
isolation.

**Inspected but not executed against external services:** Firestore
transaction behaviour under real concurrency, Stripe test/live API calls,
webhook delivery, email/SMS delivery, Vercel Cron, real auth tokens.

**Requires external configuration (not done here):** Stripe keys/webhook,
production domain/HTTPS, Firebase credentials/rules deployment, email provider,
`CRON_SECRET`, business confirmation of tax and delivery rules.
