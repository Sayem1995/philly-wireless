import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { Firestore as CloudFirestore } from "@google-cloud/firestore";
import { env } from "../lib/env.js";
import { createWifAuthClient, getWifConfig } from "../lib/gcp-oidc.js";

let db: Firestore | undefined;

function getPrivateKey(): string {
  if (env.firebasePrivateKey) {
    const cleaned = env.firebasePrivateKey.trim();
    // When set via env var (not .env), \n is usually already real newlines.
    // When read from .env it may be wrapped with escaped quotes — strip them.
    const withoutQuotes = cleaned.replace(/^"|"$/g, "");
    // Some platforms escape \n literally — replace literal backslash-n
    return withoutQuotes.replace(/\\n/g, "\n");
  }
  // Local emulator development can rely on default application credentials.
  return "";
}

/** True when the Firestore emulator is configured for local development. */
export function isEmulator(): boolean {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST);
}

/**
 * Build a Firestore client authenticated with Vercel OIDC → Workload Identity
 * Federation, i.e. without any long-lived service-account key.
 *
 * `firebase-admin`'s own `getFirestore()` cannot be used here: it accepts only
 * a service-account certificate or its internal Application Default marker, and
 * throws `invalid-credential` for anything else. It delegates to
 * `@google-cloud/firestore` for the real client, so we construct that directly
 * and hand it the WIF auth client — Firestore spreads unknown settings into the
 * GAPIC client options, which adopt `opts.auth`.
 */
function createWifFirestore(): Firestore {
  const config = getWifConfig();
  if (!config) {
    throw new Error("[firestore] createWifFirestore() called without WIF configuration.");
  }

  // `@google-cloud/firestore` spreads unrecognised settings into the GAPIC
  // client options, and the GAPIC client adopts `opts.auth` as its auth client.
  // Its `Settings` index signature allows the extra key.
  return new CloudFirestore({
    projectId: env.firebaseProjectId,
    auth: createWifAuthClient(config),
  } as ConstructorParameters<typeof CloudFirestore>[0]) as unknown as Firestore;
}

export function getDb(): Firestore {
  if (!db) {
    // 1. Emulator (local development) — no credentials involved at all.
    //    Keep this branch first so the emulator always wins locally.
    if (isEmulator()) {
      initializeFirebaseApp({});
      db = getFirestore();
      return db;
    }

    // 2. Keyless: Vercel OIDC → Workload Identity Federation. Throws early if
    //    the configuration is partially set, rather than failing on first query.
    const wif = getWifConfig();
    if (wif) {
      initializeFirebaseApp({});
      db = createWifFirestore();
      return db;
    }

    // 3. Legacy: service-account certificate.
    const hasServiceAccount = !!env.firebaseClientEmail && !!getPrivateKey();
    if (hasServiceAccount) {
      initializeFirebaseApp({
        credential: cert({
          projectId: env.firebaseProjectId,
          clientEmail: env.firebaseClientEmail,
          privateKey: getPrivateKey(),
        }),
      });
      db = getFirestore();
      return db;
    }

    // 4. Fallback: Application Default Credentials (Google infrastructure), or
    //    no usable credential at all — the query then fails with a clear error.
    initializeFirebaseApp({});
    db = getFirestore();
  }
  return db;
}

/**
 * Initialise the Firebase app once. NOTE: `credential` must be *omitted* rather
 * than set to `undefined` — firebase-admin rejects `{ credential: undefined }`
 * with INVALID_APP_OPTIONS, which would make the app unbootable instead of
 * falling back to Application Default Credentials / the emulator.
 */
function initializeFirebaseApp(options: { credential?: ReturnType<typeof cert> }): void {
  if (getApps().length > 0) return;
  initializeApp({ ...options, projectId: env.firebaseProjectId });
}

/** Convert a Firestore Timestamp or Date to a JS Date (or null). */
export function toDate(v: unknown): Date | null {
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  if (v && typeof v === "object" && "seconds" in (v as Record<string, unknown>) && "nanoseconds" in (v as Record<string, unknown>)) {
    const secs = Number((v as Record<string, number>).seconds);
    const nanos = Number((v as Record<string, number>).nanoseconds);
    return new Date(secs * 1000 + nanos / 1e6);
  }
  return null;
}

export { Timestamp };