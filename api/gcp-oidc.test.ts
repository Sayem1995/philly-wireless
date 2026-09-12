import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Keyless auth tests for the Vercel OIDC → Workload Identity Federation path.
 *
 * Environment variables are set in `vi.hoisted` so they exist before
 * `server/lib/env.ts` is evaluated at import time.
 *
 * Rather than only asserting the credential's fields, these tests stand up a
 * local stub of Google's STS endpoint and run the real exchange: the credential
 * must read the request-scoped Vercel token, POST it to the STS token URL with
 * the right grant, and return the access token. That exercises the actual code
 * path without needing real Google infrastructure.
 */

const FAKE_SA = "firebase-adminsdk-fbsvc@philly-repair.iam.gserviceaccount.com";
const PROJECT_NUMBER = "165606467389";
const POOL = "vercel-pool";
const PROVIDER = "vercel";

vi.hoisted(() => {
  process.env.GCP_WORKLOAD_IDENTITY_PROJECT_NUMBER = "165606467389";
  process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = "vercel-pool";
  process.env.GCP_WORKLOAD_IDENTITY_PROVIDER_ID = "vercel";
  process.env.GCP_SERVICE_ACCOUNT_EMAIL =
    "firebase-adminsdk-fbsvc@philly-repair.iam.gserviceaccount.com";
  delete process.env.VERCEL_OIDC_TOKEN;
});

import {
  createWifAuthClient,
  getRequestOidcToken,
  getWifConfig,
  runWithVercelOidcToken,
  VERCEL_OIDC_HEADER,
  type WifConfig,
} from "../server/lib/gcp-oidc.js";

const EXPECTED_AUDIENCE =
  `//iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/` +
  `workloadIdentityPools/${POOL}/providers/${PROVIDER}`;

/** Protected members are inspected via a narrow cast for assertions. */
function internals(client: unknown) {
  return client as {
    audience: string;
    serviceAccountImpersonationUrl?: string;
    scopes?: string | string[];
    retrieveSubjectToken(): Promise<string>;
  };
}

/**
 * `createWifAuthClient` returns a GoogleAuth wrapping the external-account
 * client (google-gax requires a GoogleAuth, not a bare credential), so unwrap
 * it to assert the underlying configuration. GoogleAuth stores an injected
 * client as `cachedCredential`.
 */
function underlying(auth: unknown) {
  return internals((auth as { cachedCredential: unknown }).cachedCredential);
}

describe("getWifConfig", () => {
  it("builds the STS audience from the provider resource name", () => {
    expect(getWifConfig()!.audience).toBe(EXPECTED_AUDIENCE);
  });

  it("targets the service-account impersonation endpoint", () => {
    expect(getWifConfig()!.impersonationUrl).toBe(
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/` +
        `${encodeURIComponent(FAKE_SA)}:generateAccessToken`,
    );
  });

  it("exposes the request header name Vercel populates", () => {
    expect(VERCEL_OIDC_HEADER).toBe("x-vercel-oidc-token");
  });
});

describe("request-scoped OIDC token", () => {
  it("is undefined outside a request", () => {
    expect(getRequestOidcToken()).toBeUndefined();
  });

  it("is visible inside runWithVercelOidcToken", () => {
    runWithVercelOidcToken("token-abc", () => {
      expect(getRequestOidcToken()).toBe("token-abc");
    });
  });

  it("does not leak between concurrent requests", async () => {
    const results: string[] = [];

    await Promise.all([
      runWithVercelOidcToken("request-one", async () => {
        await new Promise((r) => setTimeout(r, 15));
        results.push(`one:${getRequestOidcToken()}`);
      }),
      runWithVercelOidcToken("request-two", async () => {
        await new Promise((r) => setTimeout(r, 1));
        results.push(`two:${getRequestOidcToken()}`);
      }),
    ]);

    expect(results).toContain("one:request-one");
    expect(results).toContain("two:request-two");
  });

  it("restores the outer scope after the callback", () => {
    runWithVercelOidcToken("outer", () => {
      runWithVercelOidcToken("inner", () => {
        expect(getRequestOidcToken()).toBe("inner");
      });
      expect(getRequestOidcToken()).toBe("outer");
    });
    expect(getRequestOidcToken()).toBeUndefined();
  });

  it("tolerates a missing token without breaking the request", () => {
    expect(runWithVercelOidcToken(undefined, () => getRequestOidcToken())).toBeUndefined();
  });
});

describe("createWifAuthClient", () => {
  it("returns a GoogleAuth, which google-gax requires", () => {
    const auth = createWifAuthClient(getWifConfig()!);
    // google-gax calls `this.auth.getUniverseDomain()`; only GoogleAuth has it.
    expect(typeof (auth as unknown as { getUniverseDomain?: unknown }).getUniverseDomain).toBe(
      "function",
    );
  });

  it("configures the credential as Google expects", () => {
    const config = getWifConfig()!;
    const client = underlying(createWifAuthClient(config));

    expect(client.audience).toBe(EXPECTED_AUDIENCE);
    expect(client.serviceAccountImpersonationUrl).toBe(config.impersonationUrl);
    expect(client.scopes).toEqual(["https://www.googleapis.com/auth/cloud-platform"]);
  });

  it("uses the request-scoped token as the STS subject token", async () => {
    const client = underlying(createWifAuthClient(getWifConfig()!));
    const token = await runWithVercelOidcToken("vercel-oidc-jwt", () =>
      client.retrieveSubjectToken(),
    );
    expect(token).toBe("vercel-oidc-jwt");
  });

  it("falls back to VERCEL_OIDC_TOKEN when there is no request scope", async () => {
    const client = underlying(createWifAuthClient(getWifConfig()!));
    process.env.VERCEL_OIDC_TOKEN = "build-time-token";
    try {
      expect(await client.retrieveSubjectToken()).toBe("build-time-token");
    } finally {
      delete process.env.VERCEL_OIDC_TOKEN;
    }
  });

  it("fails with an actionable message when no token is present", async () => {
    const client = underlying(createWifAuthClient(getWifConfig()!));
    await expect(client.retrieveSubjectToken()).rejects.toThrow(
      /No Vercel OIDC token available/i,
    );
  });
});

describe("token exchange against a stub STS", () => {
  let server: Server;
  let baseUrl = "";
  let received: { body: string; contentType: string } | null = null;
  let impersonationReceived: unknown = null;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        res.setHeader("content-type", "application/json");

        // Step 2: service-account impersonation returns the final access token.
        if ((req.url ?? "").includes("impersonate")) {
          impersonationReceived = JSON.parse(body || "{}");
          res.writeHead(200);
          res.end(JSON.stringify({ accessToken: "exchanged-access-token", expireTime: "2030-01-01T00:00:00Z" }));
          return;
        }

        // Step 1: STS token exchange returns the federated access token.
        received = { body, contentType: String(req.headers["content-type"] ?? "") };
        res.writeHead(200);
        res.end(JSON.stringify({ access_token: "federated-access-token", expires_in: 3600 }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("exchanges the Vercel JWT for an impersonated access token", async () => {
    const config: WifConfig = {
      ...getWifConfig()!,
      impersonationUrl: `${baseUrl}/impersonate`,
    };
    // Point the STS exchange at the local stub (production uses Google's URL).
    const auth = createWifAuthClient(config, { tokenUrl: `${baseUrl}/token` });

    // GoogleAuth.getAccessToken() returns the token string itself.
    const token = await runWithVercelOidcToken("vercel-oidc-jwt", () =>
      auth.getAccessToken(),
    );

    // The auth surfaces the impersonated token.
    expect(token).toBe("exchanged-access-token");

    // Step 1 was a well-formed RFC 8693 token exchange with the Vercel JWT.
    expect(received).not.toBeNull();
    const params = new URLSearchParams(received!.body);
    expect(params.get("grant_type")).toBe(
      "urn:ietf:params:oauth:grant-type:token-exchange",
    );
    expect(params.get("audience")).toBe(EXPECTED_AUDIENCE);
    expect(params.get("subject_token")).toBe("vercel-oidc-jwt");
    expect(params.get("subject_token_type")).toBe(
      "urn:ietf:params:oauth:token-type:jwt",
    );
    expect(params.get("requested_token_type")).toBe(
      "urn:ietf:params:oauth:token-type:access_token",
    );

    // Step 2 asked to impersonate the Firebase Admin service account.
    expect(impersonationReceived).toMatchObject({
      scope: ["https://www.googleapis.com/auth/cloud-platform"],
    });
  });

  it("surfaces STS failures instead of silently continuing", async () => {
    const failing = createServer((_req, res) => {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_grant" }));
    });
    await new Promise<void>((resolve) => failing.listen(0, "127.0.0.1", resolve));
    const addr = failing.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;

    try {
      const client = createWifAuthClient(getWifConfig()!, {
        tokenUrl: `http://127.0.0.1:${port}/token`,
      });

      await expect(
        runWithVercelOidcToken("vercel-oidc-jwt", () => client.getAccessToken()),
      ).rejects.toThrow();
    } finally {
      await new Promise<void>((resolve) => failing.close(() => resolve()));
    }
  });
});
