# Philly Phone Repair — `philly-wireless`

Storefront and back-office for a Philadelphia phone/tablet/laptop repair shop:
public marketing pages, a multi-step repair booking flow, and an admin CRM
(bookings, customers, inventory, pricing, reports).

## Stack

| Layer    | Technology                                              |
| -------- | ------------------------------------------------------- |
| Frontend | React 19, Vite 7, TypeScript, Tailwind v3, shadcn/ui    |
| Routing  | `react-router` v7                                       |
| API      | Hono + tRPC v11 (superjson), served via `@hono/node-server` |
| Data     | Firebase (Firestore + Auth), `firebase-admin` on the server |
| Email    | SendGrid Web API or SMTP (`nodemailer`), both optional  |
| Tests    | Vitest                                                  |

The app runs in three shapes from the same code:

- **Vite dev server** — `npm run dev` (Hono is mounted in-process via `@hono/vite-dev-server`).
- **Node server / Docker** — `npm run build` then `node dist/boot.js`.
- **Vercel / Firebase** — `api/index.js` requires the prebuilt `api/_app.cjs` bundle; Firebase Hosting rewrites `/api/**` to the `api` function.

## Getting started

```bash
npm install
cp .env.example .env      # then fill in the values below
npm run dev               # http://localhost:3000
```

The app **boots without Firebase credentials** so the marketing pages render;
only Firestore/Auth-backed routes fail until they are configured.

### Environment variables

Frontend values are exposed to the browser by Vite and must be prefixed `VITE_`.
Server values must never use that prefix.

| Variable                                                       | Purpose                                       |
| -------------------------------------------------------------- | --------------------------------------------- |
| `VITE_FIREBASE_API_KEY` … `VITE_FIREBASE_APP_ID`                | Firebase **web** config (client auth)         |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Firebase **admin** service account (server) |
| `FIREBASE_ADMIN_UID`                                            | Marks this Firebase UID as `admin` on sign-in |
| `SENDGRID_API_KEY` / `SENDGRID_FROM`                            | Email via SendGrid Web API (preferred)        |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Email via SMTP fallback                       |
| `STAFF_EMAIL`                                                   | Recipient for new-booking notifications       |

When no email provider is configured, `sendEmail()` returns
`{ delivered: false }` and the message is recorded in the CRM communication
history instead — bookings still succeed.

`FIREBASE_PRIVATE_KEY` may contain literal `\n` escapes; they are converted to
real newlines at load time, and wrapping quotes are stripped.

### Local development against the Firestore emulator

The emulator lets you work without touching production data. It requires a
Java runtime on your `PATH`.

```bash
npx firebase emulators:start --only firestore --project demo-philly
```

Then point the app and seed script at it (use the **same** project id for both,
otherwise they write to different emulator namespaces):

```bash
# PowerShell
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
$env:FIREBASE_PROJECT_ID="demo-philly"
npm run db:seed
npm run dev
```

The Emulator UI is at <http://127.0.0.1:4000/>.

With `FIRESTORE_EMULATOR_HOST` set, the server falls back to Application
Default Credentials instead of a service account.

## Scripts

| Command                | What it does                                                        |
| ---------------------- | ------------------------------------------------------------------- |
| `npm run dev`          | Vite dev server with HMR + Hono API on port 3000                     |
| `npm run build`        | Builds `dist/public` (client), `dist/boot.js` (ESM server) and `api/_app.cjs` (Vercel CJS bundle) |
| `npm run start`        | Runs the production server (`node dist/boot.js`, needs `NODE_ENV=production`) |
| `npm run check`        | `tsc -b` typecheck across the app, node and server projects          |
| `npm run lint`         | ESLint                                                              |
| `npm test`             | Vitest (`api/**/*.test.ts`)                                         |
| `npm run format`       | Prettier                                                            |
| `npm run db:seed`      | Seeds Firestore with the starter catalog                            |
| `npm run deploy:rules` | Deploys `firestore.rules`                                           |
| `npm run deploy:hosting` | Builds and deploys Firebase Hosting                               |
| `npm run deploy:functions` | Builds and deploys the Firebase Functions API                  |

> `npm run lint` requires generated bundles (`api/_app.cjs`, `scripts/seed.js`)
> to be ignored — they are listed in `eslint.config.js` and `.gitignore`.

## Architecture notes

```
contracts/        Shared constants, error shapes and public types
server/
  boot.ts         Hono app: mounts tRPC at /api/trpc, static SPA fallback
  router.ts       Root tRPC router (ping, auth, shop, admin)
  middleware.ts   publicQuery / authedQuery / adminQuery guards
  context.ts      Per-request context; resolves the Firebase user
  lib/            env loading, Firebase token verification, HTTP + cookie utils
  queries/        Firestore data access (store.ts), id allocation, users
src/
  pages/          Route components (public site + admin/*)
  components/ui/  shadcn/ui primitives
  providers/      tRPC and Firebase Auth providers
scripts/seed.ts   Firestore seeding
api/index.js      Vercel serverless entry point
```

### Authentication

Firebase Auth is entirely client-side. The client attaches
`Authorization: Bearer <idToken>` to every tRPC request; the server verifies the
token with `firebase-admin`, then hydrates (or creates) the Firestore `users`
row. A user whose `role` is `"admin"` passes `adminQuery`; everyone else gets
`FORBIDDEN`.

### Firestore security

`firestore.rules` is the source of truth for direct client access. All
privileged reads/writes go through the tRPC layer, which enforces the role
check server-side.
