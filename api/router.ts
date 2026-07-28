import { authRouter } from "./auth-router";
import { shopRouter } from "./shopRouter";
import { adminRouter } from "./adminRouter";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  shop: shopRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
