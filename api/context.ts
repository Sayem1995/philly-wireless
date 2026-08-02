import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { FirestoreUser } from "./queries/users";
import { authenticateFirebaseUser } from "./lib/firebase-auth";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: FirestoreUser;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const ctx: TrpcContext = { req: opts.req, resHeaders: opts.resHeaders };
  try {
    ctx.user = await authenticateFirebaseUser(opts.req.headers);
  } catch {
    // Authentication is optional here
  }
  return ctx;
}