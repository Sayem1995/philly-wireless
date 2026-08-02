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
  const [booting, setBooting] = useState(true);
  const [dbUser, setDbUser] = useState<AuthUser | null>(null);

  const isFirebaseReady = isFirebaseConfigured();

  // Track Firebase auth state
  useEffect(() => {
    if (!auth) {
      setBooting(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setBooting(false);
      if (!user) {
        clearStoredIdToken();
        setDbUser(null);
      }
    });
    return () => unsub();
  }, []);

  // When the Firebase user changes, refetch the DB row (uid -> role)
  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: !!firebaseUser && isFirebaseReady,
    staleTime: 1000 * 60,
    retry: false,
  });

  useEffect(() => {
    if (firebaseUser && meQuery.data) {
      const u = meQuery.data;
      setDbUser({
        id: u.id,
        uid: u.uid,
        name: u.name ?? firebaseUser.displayName ?? "",
        email: u.email ?? firebaseUser.email ?? "",
        avatar: u.avatar ?? firebaseUser.photoURL ?? "",
        role: u.role ?? "user",
        createdAt: u.createdAt,
        lastSignInAt: u.lastSignInAt,
      });
    }
    if (!firebaseUser) setDbUser(null);
  }, [firebaseUser, meQuery.data]);

  const logout = useCallback(async () => {
    if (auth) await signOut(auth);
    clearStoredIdToken();
    setDbUser(null);
  }, []);

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