import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

export const env = {
  appId: process.env.APP_ID ?? "",
  appSecret: process.env.APP_SECRET ?? "",
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: process.env.DATABASE_URL ?? "",
  kimiAuthUrl: process.env.KIMI_AUTH_URL ?? "",
  kimiOpenUrl: process.env.KIMI_OPEN_URL ?? "",
  ownerUnionId: process.env.OWNER_UNION_ID ?? "",

  // ── Firebase (Firestore + Auth) ──────────────────────────────
  // On Cloud Functions GCLOUD_PROJECT is set automatically by the runtime.
  firebaseProjectId: required("FIREBASE_PROJECT_ID") || process.env.GCLOUD_PROJECT || "",
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? "",
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY ?? "",
  firebaseAdminUid: process.env.FIREBASE_ADMIN_UID ?? "",
};