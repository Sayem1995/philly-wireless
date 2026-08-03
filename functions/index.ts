import { onRequest } from "firebase-functions/v2/https";
import app from "../server/boot.js";

// Bridge between the express-style (req, res) of Cloud Functions and the
// Fetch API that Hono speaks. (`hono/firebase-functions` is not exported by
// the installed hono version, so the adapter is inlined here.)
export const api = onRequest(
  { region: "us-central1", maxInstances: 10 },
  async (req, res) => {
    const url = `${req.protocol}://${req.get("host") ?? "localhost"}${req.originalUrl}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") headers.set(key, value);
      else if (Array.isArray(value)) headers.set(key, value.join(", "));
    }
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const request = new Request(url, {
      method: req.method,
      headers,
      body: hasBody ? req.rawBody : undefined,
    });

    const response = await app.fetch(request);

    res.status(response.status);
    const setCookies = response.headers.getSetCookie();
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "set-cookie") res.setHeader(key, value);
    });
    if (setCookies.length > 0) res.setHeader("set-cookie", setCookies);

    res.send(Buffer.from(await response.arrayBuffer()));
  },
);
