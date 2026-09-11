/* eslint-disable react-refresh/only-export-components -- the provider and its `useAuthContext` hook deliberately share this module (see `@/hooks/useAuth`). */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { trpc } from "@/providers/trpc";
import { auth, clearStoredIdToken, isFirebaseConfigured } from "@/lib/firebase";

export type AuthUser = {
  id: number;
  uid: string;
  name: string | null;
  email: string | null;
  avatar: string | null;
  role: "user" | "admin";
  createdAt?: unknown;
  lastSignInAt?: unknown;
};

type AuthContextValue = {
  user: AuthUser | null;
  firebaseUser: FirebaseUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isFirebaseReady: boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  // Firebase Auth always emits an initial callback, so when no auth instance
  // exists there is nothing to wait for and we are already "booted".
  const [booting, setBooting] = useState(!auth);

  const isFirebaseReady = isFirebaseConfigured();
  const utils = trpc.useUtils();

  // Track Firebase auth state
  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setBooting(false);
      if (!user) clearStoredIdToken();
    });
    return () => unsub();
  }, []);

  // When the Firebase user changes, refetch the DB row (uid -> role)
  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: !!firebaseUser && isFirebaseReady,
    staleTime: 1000 * 60,
    retry: false,
  });

  // The DB row is derived from the Firebase user + the `me` query, so no
  // state synchronisation effect is needed: signing out clears firebaseUser
  // (and the query cache), which clears the derived user in the same render.
  const dbUser = useMemo<AuthUser | null>(() => {
    if (!firebaseUser) return null;
    const u = meQuery.data;
    if (!u) return null;
    return {
      id: u.id,
      uid: u.uid,
      name: u.name ?? firebaseUser.displayName ?? "",
      email: u.email ?? firebaseUser.email ?? "",
      avatar: u.avatar ?? firebaseUser.photoURL ?? "",
      role: u.role ?? "user",
      createdAt: u.createdAt,
      lastSignInAt: u.lastSignInAt,
    };
  }, [firebaseUser, meQuery.data]);

  const logout = useCallback(async () => {
    if (auth) await signOut(auth);
    clearStoredIdToken();
    setFirebaseUser(null);
    await utils.auth.me.invalidate();
  }, [utils]);

  const refresh = useCallback(async () => {
    await meQuery.refetch();
  }, [meQuery]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: dbUser,
      firebaseUser,
      isLoading: booting || meQuery.isFetching,
      isAuthenticated: !!dbUser && !!firebaseUser,
      isFirebaseReady,
      logout,
      refresh,
    }),
    [dbUser, firebaseUser, booting, meQuery.isFetching, isFirebaseReady, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used within AuthProvider");
  return ctx;
}