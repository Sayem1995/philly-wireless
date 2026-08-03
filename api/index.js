// Vercel serverless entry (plain CommonJS).
//
// Purpose: the entire Hono + tRPC app is pre-bundled by `npm run build`
// into `api/_app.cjs` (CommonJS, firebase-admin external). Requiring that
// pre-built artifact avoids Vercel re-bundling TypeScript + firebase-admin
// (google-gax uses __dirname → ERR_AMBIGUOUS_MODULE_SYNTAX in ESM output).
//
// The require is wrapped in try/catch so that if anything fails at module
// load (missing bundle, dependency resolution, syntax), the error is
// returned in the HTTP response for diagnosis instead of Vercel's generic
// FUNCTION_INVOCATION_FAILED wrapper.

let app = null;
let loadError = null;

try {
  const bundle = require("./_app.cjs");
  const candidate = bundle && bundle.default ? bundle.default : bundle;
  if (candidate && typeof candidate.fetch === "function") {
    app = candidate;
  } else {
    loadError = new Error(
      "[vercel-api] _app.cjs did not export a Hono app with .fetch()",
    );
  }
} catch (err) {
  loadError = err instanceof Error ? err : new Error(String(err));
  console.error("[vercel-api] Failed to load _app.cjs:", loadError);
}

function handler(req, res) {
  if (loadError) {
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain");
    res.end(
      `[vercel-api] module load error: ${loadError.message}\n${loadError.stack || ""}`,
    );
    return;
  }

  // Bridge node:http request/response to a WHATWG Request for Hono.
  const url = `http://${req.headers.host || "localhost"}${req.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(", "));
  }
  const method = req.method || "GET";
  const hasBody = method !== "GET" && method !== "HEAD";
  const chunks = [];

  const dispatch = () => {
    const body = Buffer.concat(chunks);
    const request = new Request(url, {
      method,
      headers,
      body: hasBody ? body : undefined,
    });
    app
      .fetch(request)
      .then(async (response) => {
        res.statusCode = response.status;
        response.headers.forEach((value, key) => {
          if (key.toLowerCase() !== "set-cookie") res.setHeader(key, value);
        });
        const setCookies =
          typeof response.headers.getSetCookie === "function"
            ? response.headers.getSetCookie()
            : [];
        if (setCookies.length > 0) res.setHeader("set-cookie", setCookies);
        res.end(Buffer.from(await response.arrayBuffer()));
      })
      .catch((err) => {
        console.error("[vercel-api] handler error:", err);
        res.statusCode = 500;
        res.setHeader("content-type", "text/plain");
        res.end(
          `[vercel-api] handler error: ${(err && err.message) || err}\n${(err && err.stack) || ""}`,
        );
      });
  };

  if (hasBody) {
    req.on("data", (c) => chunks.push(c));
    req.on("end", dispatch);
  } else {
    dispatch();
  }
}

// Vercel Node.js serverless functions export named HTTP-method handlers
// (and/or a default handler).
exports.GET = handler;
exports.POST = handler;
exports.PATCH = handler;
exports.PUT = handler;
exports.DELETE = handler;
exports.default = handler;