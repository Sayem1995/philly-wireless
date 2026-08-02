import { createRouter, authedQuery } from "./middleware";

export const authRouter = createRouter({
  me: authedQuery.query((opts) => opts.ctx.user),
  // Firebase Auth tokens are self-verifying and managed client-side.
  // Logout simply discards the token on the client — nothing to clear server-side.
  logout: authedQuery.mutation(async () => {
    return { success: true };
  }),
});