import { AsyncLocalStorage } from "node:async_hooks";
import { IdentityPoolClient, type SubjectTokenSupplier } from "google-auth-library";
import { env } from "./env.js";

/**
 * Keyless Google Cloud authentication for the Vercel deployment.
 *
 * Vercel issues a short-lived OIDC token (RS256, ~2h) for each request. Instead
 * of storing a long-lived service-account key, we exchange that token with
 * Google's Security Token Service via Workload Identity Federation, then
 * impersonate the Firebase Admin service account. The result is a short-lived
 * access token. No private key ever exists — this satisfies organizations whose
 * policy forbids service-account key creation.
 *
 * IMPORTANT: in Vercel Functions the OIDC token is ONLY available per-request,
 * on the `x-vercel-oidc-token` header — it is not readable at module scope.
 * Firebase/Google clients, however, are created once and refresh lazily. We
 * bridge the two with AsyncLocalStorage: the middleware in `server/boot.ts`
 * parks the current request's token, and the `subject_token_supplier` below
 * reads it whenever the credential actually needs to refresh.
 */

const tokenStorage = new AsyncLocalStorage<string>();

/** Header Vercel populates on every request when OIDC federation is enabled. */
export const VERCEL_OIDC_HEADER = "x-vercel-oidc-token";

/** Google STS token endpoint (the library default; spelled out for clarity). */
const GOOGLE_STS_TOKEN_URL = "https://sts.googleapis.com/v1/token";

const SUBJECT_TOKEN_TYPE_JWT = "urn:ietf:params:oauth:token-type:jwt";

const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

export type WifConfig = {
  projectNumber: string;
  poolId: string;
  providerId: string;
  serviceAccountEmail: string;
  /** Full STS audience, i.e. the provider resource name. */
  audience: string;
  /** Service-account impersonation endpoint. */
  impersonationUrl: string;
};

/* ------------------------------------------------------------------ *
 * Request-scoped OIDC token
 * ------------------------------------------------------------------ */

/** Run `fn` with `token` available to the credential's token supplier. */
export function runWithVercelOidcToken<T>(token: string | undefined, fn: () => T): T {
  if (!token) return fn();
  return tokenStorage.run(token, fn);
}

/** The OIDC token for the request currently being handled, if any. */
export function getRequestOidcToken(): string | undefined {
  return tokenStorage.getStore();
}

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

function optional(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * Read the non-secret Workload Identity Federation settings.
 *
 * Returns null when WIF is not configured at all (the normal case for local
 * development and for deployments still using the legacy service-account cert).
 * Throws when the configuration is *partially* present, because a half-set
 * config would otherwise fail later with a confusing auth error.
 */
export function getWifConfig(): WifConfig | null {
  const projectNumber = env.gcpWorkloadIdentityProjectNumber;
  const poolId = env.gcpWorkloadIdentityPoolId;
  const providerId = env.gcpWorkloadIdentityProviderId;
  const serviceAccountEmail = env.gcpServiceAccountEmail;

  const anySet = Boolean(projectNumber || poolId || providerId || serviceAccountEmail);
  if (!anySet) return null;

  const missing = (
    [
      ["GCP_WORKLOAD_IDENTITY_PROJECT_NUMBER", projectNumber],
      ["GCP_WORKLOAD_IDENTITY_POOL_ID", poolId],
      ["GCP_WORKLOAD_IDENTITY_PROVIDER_ID", providerId],
      ["GCP_SERVICE_ACCOUNT_EMAIL", serviceAccountEmail],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `[gcp-oidc] Incomplete Workload Identity Federation configuration. ` +
        `Missing: ${missing.join(", ")}. ` +
        `Set all of GCP_WORKLOAD_IDENTITY_PROJECT_NUMBER, GCP_WORKLOAD_IDENTITY_POOL_ID, ` +
        `GCP_WORKLOAD_IDENTITY_PROVIDER_ID and GCP_SERVICE_ACCOUNT_EMAIL, or none of them.`,
    );
  }

  const audience =
    `//iam.googleapis.com/projects/${projectNumber}/locations/global/` +
    `workloadIdentityPools/${poolId}/providers/${providerId}`;

  return {
    projectNumber,
    poolId,
    providerId,
    serviceAccountEmail,
    audience,
    impersonationUrl:
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/` +
      `${encodeURIComponent(serviceAccountEmail)}:generateAccessToken`,
  };
}

/* ------------------------------------------------------------------ *
 * Credential
 * ------------------------------------------------------------------ */

class RequestScopedSubjectTokenSupplier implements SubjectTokenSupplier {
  async getSubjectToken(): Promise<string> {
    const token = getRequestOidcToken() ?? optional("VERCEL_OIDC_TOKEN");
    if (!token) {
      throw new Error(
        "[gcp-oidc] No Vercel OIDC token available for this request. Ensure " +
          `"Enable access to System Environment Variables" (OIDC federation) is enabled for the ` +
          `Vercel project, and that the request carried the ${VERCEL_OIDC_HEADER} header.`,
      );
    }
    return token;
  }
}

/**
 * Build a credential that exchanges the current request's Vercel OIDC token for
 * a short-lived Google access token, impersonating the Firebase Admin service
 * account. Construction performs no network I/O — the exchange happens lazily
 * on the first token fetch, which is also when the request-scoped token exists.
 *
 * `overrides` exists so tests can redirect the STS endpoint to a local stub;
 * production callers never pass it.
 */
export function createWifAuthClient(
  config: WifConfig,
  overrides: { tokenUrl?: string } = {},
): IdentityPoolClient {
  return new IdentityPoolClient({
    type: "external_account",
    audience: config.audience,
    subject_token_type: SUBJECT_TOKEN_TYPE_JWT,
    token_url: overrides.tokenUrl ?? GOOGLE_STS_TOKEN_URL,
    service_account_impersonation_url: config.impersonationUrl,
    scopes: [CLOUD_PLATFORM_SCOPE],
    subject_token_supplier: new RequestScopedSubjectTokenSupplier(),
  });
}
