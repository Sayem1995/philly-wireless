import { authRouter } from "./auth-router.js";
import { shopRouter } from "./shopRouter.js";
import { adminRouter } from "./adminRouter.js";
import { createRouter, publicQuery } from "./middleware.js";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  shop: shopRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
