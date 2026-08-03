// Vercel serverless entry (plain CommonJS — no transpilation).
//
// The whole Hono + tRPC app is pre-bundled by `npm run build` into
// api/_app.cjs (CommonJS, firebase-admin marked external). Requiring this
// pre-built artifact avoids Vercel re-bundling TypeScript plus
// firebase-admin — which previously produced ERR_AMBIGUOUS_MODULE_SYNTAX
// (google-gax uses __dirname in ESM output).
const bundle = require("./_app.cjs");
const app = bundle.default || bundle;

function handler(req, res) {
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