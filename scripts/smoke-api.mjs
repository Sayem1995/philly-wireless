/**
 * Smoke-tests the built Vercel handler exactly as Vercel invokes it.
 *
 * Loads `api/index.js` (which requires the prebuilt `api/_app.cjs` bundle),
 * calls the exported HTTP handler with a real node:http request/response pair on
 * a loopback server, and prints the status plus body. This is the only way to be
 * sure the CJS server bundle starts and that the brand config survives
 * bundling — a typecheck cannot catch a broken `require` graph.
 *
 * Run: node scripts/smoke-api.mjs
 */
import http from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let handler;
try {
  const mod = require("../api/index.js");
  handler = mod.GET ?? mod.default;
} catch (err) {
  console.error("[smoke] failed to load api/index.js:", err);
  process.exit(1);
}

const server = http.createServer(handler);

server.listen(0, "127.0.0.1", async () => {
  const { port } = server.address();
  const paths = ["/api/health", "/api/trpc/ping?batch=1&input=%7B%7D"];

  for (const path of paths) {
    await new Promise((resolve) => {
      http
        .get({ host: "127.0.0.1", port, path, timeout: 20000 }, (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () => {
            console.log(`\n[smoke] GET ${path}`);
            console.log(`        status ${res.statusCode}`);
            console.log(`        ${body.slice(0, 400)}`);
            resolve();
          });
        })
        .on("error", (err) => {
          console.log(`\n[smoke] GET ${path} -> ERROR ${err.message}`);
          resolve();
        });
    });
  }

  server.close();
});
