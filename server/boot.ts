import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router.js";
import { createContext } from "./context.js";
import { env } from "./lib/env.js";
import { runWithVercelOidcToken, VERCEL_OIDC_HEADER } from "./lib/gcp-oidc.js";
import { credentialSource, getDb } from "./queries/firestore.js";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));

/**
 * Make the current request's Vercel OIDC token available to the keyless Google
 * credential. In Vercel Functions the token only exists on the request, but the
 * Firestore client is created once and refreshes lazily — AsyncLocalStorage
 * bridges the two. A no-op outside Vercel or when OIDC federation is disabled.
 */
app.use("*", (c, next) =>
  runWithVercelOidcToken(c.req.header(VERCEL_OIDC_HEADER), next),
);

/**
 * Health check. Forces the Firestore client to be created so a bad or missing
 * credential surfaces here as a clear error rather than on a user-facing page.
 * Reports only non-secret identifiers.
 */
app.get("/api/health", async (c) => {
  const source = credentialSource();
  const projectId = env.firebaseProjectId || null;
  try {
    const db = await getDb();
    // Cheap round-trip that requires a real credential (not just client construction).
    await db.collection("repairPrices").limit(1).get();
    return c.json({ ok: true, projectId, credentialSource: source, firestore: "reachable" });
  } catch (err) {
    return c.json(
      {
        ok: false,
        projectId,
        credentialSource: source,
        firestore: "unreachable",
        error: err instanceof Error ? err.message : String(err),
      },
      503,
    );
  }
});

// Handle tRPC + any other /api routes
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

// OAuth callback removed — auth is handled entirely by Firebase Auth (client-side).

export default app;

// Local / Docker boot: bind the Hono app. On Vercel the exported app is used
// as a serverless function (api/index), so this block is skipped there.
// K_SERVICE is set on Cloud Run / Cloud Functions (2nd gen).
// Wrapped in an async IIFE so the module stays CJS-compatible if bundled
// with --format=cjs (top-level await is ESM-only).
if (!process.env.VERCEL && env.isProduction && !process.env.K_SERVICE) {
  void (async () => {
    const { serve } = await import("@hono/node-server");
    const { serveStaticFiles } = await import("./lib/vite.js");
    serveStaticFiles(app);

    const port = parseInt(process.env.PORT || "3000");
    serve({ fetch: app.fetch, port }, () => {
      console.log(`Server running on http://localhost:${port}/`);
    });
  })();
}
