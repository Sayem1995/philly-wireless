import "dotenv/config";
import { normaliseTaxPercent } from "../../contracts/orders.js";

// NOTE: Never throw at module load. Vercel/Cloud Functions imports env.ts
// immediately when the API function boots — throwing here would take down
// even endpoints that don't touch Firestore (e.g. /api/trpc/ping).
// Missing credentials are handled lazily when a Firestore/Auth call runs.
function optional(name: string): string {
  return process.env[name] ?? "";
}

/** A finite number from the environment, clamped to a sane range. */
function numeric(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(optional(name).trim());
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

const deepseekApiKey = optional("DEEPSEEK_API_KEY").trim();
const deepseekModel = optional("DEEPSEEK_MODEL").trim() || "deepseek-flash";

// The assistant speaks the OpenAI chat-completions format. Point AI_BASE_URL
// at any compatible server (vLLM, llama.cpp, Ollama, LM Studio, Liquid, …).
// The base URL should include /v1 when the server expects it, but not the
// final /chat/completions path.
const aiBaseUrl = (optional("AI_BASE_URL").trim() || "https://api.deepseek.com").replace(/\/+$/, "");
const aiModel = optional("AI_MODEL").trim() || deepseekModel;
const aiUsesDeepSeek = (() => {
  try {
    return /(^|\.)deepseek\.com$/i.test(new URL(aiBaseUrl).hostname);
  } catch {
    return false;
  }
})();
// Only reuse the DeepSeek credential when the request is actually going to
// DeepSeek. A custom base URL must supply its own key so we never leak the
// DeepSeek secret to a local tunnel or another provider.
const aiApiKey =
  optional("AI_API_KEY").trim() || (aiUsesDeepSeek ? deepseekApiKey : "");

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

  // ── Public site URL (for links in emails, e.g. customer receipts) ──
  // Override in Vercel when the domain changes. Falls back to BRAND_SITE_URL
  // so a second storefront gets its own domain in outgoing links without
  // needing an extra variable.
  // Trailing slashes are stripped once here so callers can concatenate paths
  // without double slashes; the value must still be an absolute https origin.
  publicSiteUrl: (
    optional("PUBLIC_SITE_URL") ||
    optional("BRAND_SITE_URL") ||
    optional("VITE_BRAND_SITE_URL") ||
    "https://philly-wireless.vercel.app"
  )
    .trim()
    .replace(/\/+$/, ""),

  // ── Online card payments (optional — Stripe Checkout) ──────────
  // Without these the checkout still works: customers pick "pay in store" and
  // the order is recorded for staff to collect payment at pickup. With a
  // secret key (sk_test_/sk_live_ or a restricted rk_ key) the cart offers
  // "pay online by card" as well.
  stripeSecretKey: optional("STRIPE_SECRET_KEY").trim(),
  stripeWebhookSecret: optional("STRIPE_WEBHOOK_SECRET").trim(),

  // ── AI assistant (OpenAI-compatible; optional) ─────────────────────
  // Default remains DeepSeek. Set AI_BASE_URL + AI_MODEL to use a local or
  // self-hosted model instead. Without a key the widget still offers call,
  // WhatsApp and manual booking.
  deepseekApiKey,
  deepseekModel,
  aiBaseUrl,
  aiApiKey,
  aiModel,
  aiUsesDeepSeek,
  aiConfigured: Boolean(aiApiKey) || !aiUsesDeepSeek,
  // Local models can be much slower than hosted ones. Vercel's function limit
  // still applies in production; set this to fit the host.
  aiTimeoutMs: numeric("AI_TIMEOUT_MS", 25_000, 5_000, 120_000),
  storeTimezone: optional("STORE_TIMEZONE").trim() || "America/New_York",

  // How long an unpaid card order holds its stock. Stripe Checkout sessions
  // must last at least 30 minutes; the order reservation is released only
  // after Stripe's own session has expired, so a late payment cannot arrive
  // after the stock was returned. Default 60, max 24h.
  orderReservationMinutes: numeric("ORDER_RESERVATION_MINUTES", 60, 30, 1440),

  // ── Scheduled reconciliation (Vercel Cron) ────────────────────
  // Bearer token checked by /api/cron/reconcile-orders. Vercel Cron sends it
  // automatically when this variable exists; without it the endpoint is off.
  cronSecret: optional("CRON_SECRET").trim(),

  // ── Sales tax on online orders ─────────────────────────────────
  // Percent, 0–25. Defaults to 0 so adding the shop does not silently change
  // what customers are charged; the correct rate for the business must be
  // confirmed with an accountant (Philadelphia is commonly 8%).
  orderTaxPercent: normaliseTaxPercent(optional("ORDER_TAX_PERCENT")),
};
