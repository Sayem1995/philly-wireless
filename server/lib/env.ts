import "dotenv/config";

// NOTE: Never throw at module load. Vercel/Cloud Functions imports env.ts
// immediately when the API function boots — throwing here would take down
// even endpoints that don't touch Firestore (e.g. /api/trpc/ping).
// Missing credentials are handled lazily when a Firestore/Auth call runs.
function optional(name: string): string {
  return process.env[name] ?? "";
}

export const env = {
  appId: optional("APP_ID"),
  appSecret: optional("APP_SECRET"),
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: optional("DATABASE_URL"),
  kimiAuthUrl: optional("KIMI_AUTH_URL"),
  kimiOpenUrl: optional("KIMI_OPEN_URL"),
  ownerUnionId: optional("OWNER_UNION_ID"),

  // ── Firebase (Firestore + Auth) ──────────────────────────────
  // On Cloud Functions / Vercel, GCLOUD_PROJECT (or VERCEL env) provides
  // the project id automatically — but we tolerate it being empty so the
  // API function boots, even if Firestore-backed routes later error out.
  firebaseProjectId:
    optional("FIREBASE_PROJECT_ID") || process.env.GCLOUD_PROJECT || "",
  firebaseClientEmail: optional("FIREBASE_CLIENT_EMAIL"),
  firebasePrivateKey: optional("FIREBASE_PRIVATE_KEY"),
  firebaseAdminUid: optional("FIREBASE_ADMIN_UID"),
};
