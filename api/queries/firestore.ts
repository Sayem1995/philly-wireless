import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { env } from "../lib/env";

let db: Firestore;

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

export function getDb(): Firestore {
  if (!db) {
    if (getApps().length === 0) {
      initializeApp({
        credential:
          env.firebaseClientEmail && getPrivateKey()
            ? cert({
                projectId: env.firebaseProjectId,
                clientEmail: env.firebaseClientEmail,
                privateKey: getPrivateKey(),
              })
            : undefined, // falls back to GOOGLE_APPLICATION_CREDENTIALS / emulator
        projectId: env.firebaseProjectId,
      });
    }
    db = getFirestore();
    // Allow local dev against the emulator via FIRESTORE_EMULATOR_HOST (no-op in prod).
  }
  return db;
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