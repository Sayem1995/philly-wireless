/* eslint-disable react-refresh/only-export-components -- `trpc` is the shared client instance imported by feature modules; keeping it beside TRPCProvider is intentional. */
import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import superjson from "superjson";
import type { AppRouter } from "../../server/router";
import type { ReactNode } from "react";
import { getFirebaseIdToken, ID_TOKEN_STORAGE_KEY } from "@/lib/firebase";

export const trpc = createTRPCReact<AppRouter>();

const queryClient = new QueryClient();

async function authHeaders(): Promise<Record<string, string>> {
  const token =
    (await getFirebaseIdToken()) || localStorage.getItem(ID_TOKEN_STORAGE_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      async fetch(input, init) {
        const headers = await authHeaders();
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
          headers: {
            ...(init?.headers ?? {}),
            ...headers,
          },
        });
      },
    }),
  ],
});

/**
 * The vanilla client, for non-React callers.
 *
 * `firebase.ts` cannot host such callers: it is imported *by* this module for
 * the auth token, so importing the client there would be a cycle. Feature
 * modules that need to call a procedure outside a component use this export.
 */
export const vanillaTrpcClient = trpcClient;

export function TRPCProvider({ children }: { children: ReactNode }) {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}