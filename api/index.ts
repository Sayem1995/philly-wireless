import { handle } from "hono/vercel";
import app from "../server/boot.js";

// Vercel serverless entry point. The whole Hono + tRPC app is exported as
// a single function. `vercel.json` rewrites `/api/(.*)` here.
export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
export const PUT = handle(app);