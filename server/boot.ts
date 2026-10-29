import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router.js";
import { createContext } from "./context.js";
import { env } from "./lib/env.js";
import { runWithVercelOidcToken, VERCEL_OIDC_HEADER } from "./lib/gcp-oidc.js";
import { credentialSource, getDb } from "./queries/firestore.js";
import { getProductImage } from "./queries/productImages.js";
import { reconcileAbandonedOrders } from "./orderReconciliation.js";
import { constantTimeEqual } from "./lib/secrets.js";
import {
  paymentsConfigured,
  verifyStripeSignature,
  webhookConfigured,
} from "./payments.js";
import { handleStripeEvent } from "./stripeWebhook.js";
import { executeTool } from "./assistant.js";

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
 * Health check. Forces the Firestore client to be created and performs a real
 * read, so a bad or missing credential surfaces here as a clear error rather
 * than on a user-facing page. Reports only non-secret identifiers.
 */
app.get("/api/health", async (c) => {
  const source = credentialSource();
  const projectId = env.firebaseProjectId || null;
  // Configuration facts only — never the key, the webhook secret or the cron
  // secret. The admin panel exposes the Stripe mode separately.
  const config = {
    onlineCard: paymentsConfigured(),
    webhookConfigured: webhookConfigured(),
    taxPercent: env.orderTaxPercent,
    publicSiteUrl: env.publicSiteUrl,
  };
  try {
    const db = await getDb();
    // Cheap round-trip that requires a real credential (not just client construction).
    await db.collection("repairPrices").limit(1).get();
    return c.json({
      ok: true,
      projectId,
      credentialSource: source,
      firestore: "reachable",
      config,
    });
  } catch (err) {
    return c.json(
      {
        ok: false,
        projectId,
        credentialSource: source,
        firestore: "unreachable",
        error: err instanceof Error ? err.message : String(err),
        config,
      },
      503,
    );
  }
});

/**
 * Serve a product image.
 *
 * Product images live in Firestore as base64 (see `queries/productImages.ts`)
 * and are handed back as real HTTP image responses rather than as part of the
 * catalogue JSON, so the browser caches each one independently and the product
 * query stays small.
 */
app.get("/api/images/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const image = await getProductImage(id);
    if (!image || !image.data) {
      return c.body(null, 404);
    }
    return c.body(Buffer.from(image.data, "base64"), 200, {
      "Content-Type": image.contentType,
      // Ids are unique per upload and never reused, so this is safe to cache hard.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    });
  } catch (err) {
    console.error("[images] failed to serve image", id, err);
    return c.body(null, 500);
  }
});

/**
 * Stripe webhook.
 *
 * The return-page verification in `shop.confirmOrderPayment` only runs if the
 * customer makes it back to the site. This handler is the authoritative path:
 * Stripe signs every delivery, the signature is checked against the raw body,
 * and a paid session marks the matching order paid even if the tab was closed.
 */
app.post("/api/stripe/webhook", async (c) => {
  const secret = env.stripeWebhookSecret;
  if (!secret) {
    return c.json({ error: "Stripe webhook is not configured." }, 503);
  }

  const payload = await c.req.text();
  if (!verifyStripeSignature(payload, c.req.header("stripe-signature") ?? null, secret)) {
    return c.json({ error: "Invalid Stripe signature." }, 400);
  }

  let event: unknown;
  try {
    event = JSON.parse(payload);
  } catch {
    return c.json({ error: "Invalid JSON body." }, 400);
  }
  if (!event || typeof event !== "object") {
    return c.json({ error: "Invalid event." }, 400);
  }

  // The state machine lives in `stripeWebhook.ts` so it can be tested without
  // HTTP. It re-checks the order, amount, currency and reference before any
  // status change, and is idempotent for replayed deliveries.
  const result = await handleStripeEvent(event);
  return c.json(result);
});

/**
 * Scheduled reconciliation.
 *
 * Stripe's `checkout.session.expired` webhook releases abandoned checkouts, but
 * a missed delivery (or a webhook secret outage) must not hold stock forever.
 * This endpoint (wired to Vercel Cron) releases reservations whose window has
 * passed and prunes old idempotency keys. It is disabled unless CRON_SECRET is
 * configured, and Vercel sends that secret as a Bearer token automatically.
 */
app.get("/api/cron/reconcile-orders", async (c) => {
  if (!env.cronSecret) {
    return c.json({ error: "Cron reconciliation is not configured." }, 503);
  }
  const header = c.req.header("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!constantTimeEqual(provided, env.cronSecret)) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const result = await reconcileAbandonedOrders(new Date(), 100);
  return c.json({ ok: true, ...result });
});

/**
 * Read-only tools for the local realtime voice lab.
 *
 * The voice page runs on localhost, but llama-server cannot reach Firestore.
 * The production backend has the database credentials, so the page calls this
 * endpoint for live store data. Every tool is public, read-only information
 * already exposed on the website.
 */
app.use(
  "/api/voice/*",
  cors({
    origin: "*",
    allowMethods: ["POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

app.post("/api/voice/tool", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body." }, 400);
  }
  if (!body || typeof body !== "object") {
    return c.json({ error: "Invalid request." }, 400);
  }
  const input = body as { name?: unknown; arguments?: unknown };
  const name = typeof input.name === "string" ? input.name : "";
  const allowed = [
    "get_store_info",
    "search_repair_prices",
    "estimate_repair_price",
    "check_availability",
  ];
  if (!allowed.includes(name)) {
    return c.json({ error: "Unknown voice tool." }, 400);
  }
  const rawArguments =
    typeof input.arguments === "string"
      ? input.arguments
      : JSON.stringify(input.arguments && typeof input.arguments === "object" ? input.arguments : {});
  try {
    const result = await executeTool(name, rawArguments);
    return c.json(result);
  } catch (error) {
    console.error("[voice-tool] failed", name, error);
    return c.json({ error: "The live data lookup failed." }, 500);
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
