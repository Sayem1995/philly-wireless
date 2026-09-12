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
  // The project id is the same value the browser uses, so accept the Vite
  // (client) spelling as a fallback. They are easy to confuse — VITE_FIREBASE_*
  // configures the BROWSER SDK only and cannot stand in for the server-side
  // credentials, but the project id itself is genuinely the same string.
  // GCLOUD_PROJECT is set automatically on Google-hosted runtimes.
  firebaseProjectId:
    optional("FIREBASE_PROJECT_ID") ||
    optional("VITE_FIREBASE_PROJECT_ID") ||
    process.env.GCLOUD_PROJECT ||
    "",
  firebaseClientEmail: optional("FIREBASE_CLIENT_EMAIL"),
  firebasePrivateKey: optional("FIREBASE_PRIVATE_KEY"),
  firebaseAdminUid: optional("FIREBASE_ADMIN_UID"),

  // ── Keyless Google Cloud auth (Vercel OIDC → Workload Identity) ──
  // Preferred over a service-account key: the Vercel OIDC token is exchanged
  // for a short-lived access token via Workload Identity Federation. These
  // values are identifiers, not secrets.
  gcpWorkloadIdentityProjectNumber: optional("GCP_WORKLOAD_IDENTITY_PROJECT_NUMBER"),
  gcpWorkloadIdentityPoolId: optional("GCP_WORKLOAD_IDENTITY_POOL_ID"),
  gcpWorkloadIdentityProviderId: optional("GCP_WORKLOAD_IDENTITY_PROVIDER_ID"),
  gcpServiceAccountEmail: optional("GCP_SERVICE_ACCOUNT_EMAIL"),
};
