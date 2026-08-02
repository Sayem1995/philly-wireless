import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

/**
 * Firebase web SDK configuration.
 *
 * Populate these in `.env.local` / Vercel env vars:
 *   VITE_FIREBASE_API_KEY
 *   VITE_FIREBASE_AUTH_DOMAIN
 *   VITE_FIREBASE_PROJECT_ID
 *   VITE_FIREBASE_STORAGE_BUCKET
 *   VITE_FIREBASE_MESSAGING_SENDER_ID
 *   VITE_FIREBASE_APP_ID
 *
 * If VITE_FIREBASE_API_KEY is missing the app still builds/runs in
 * "static-only" mode — auth pages simply show a config notice.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
};

export const ID_TOKEN_STORAGE_KEY = "ccw_id_token";

export const app: FirebaseApp | null = firebaseConfig.apiKey
  ? getApps()[0] ?? initializeApp(firebaseConfig)
  : null;

export const auth: Auth | null = app ? getAuth(app) : null;

export function isFirebaseConfigured(): boolean {
  return !!app && !!auth;
}

/** Get the current user's ID token (caching in localStorage for the tRPC link). */
export async function getFirebaseIdToken(force = false): Promise<string | null> {
  if (!auth || !auth.currentUser) return null;
  try {
    const token = await auth.currentUser.getIdToken(force);
    if (token) localStorage.setItem(ID_TOKEN_STORAGE_KEY, token);
    return token;
  } catch (err) {
    console.warn("[firebase] Failed to obtain ID token:", err);
    return localStorage.getItem(ID_TOKEN_STORAGE_KEY);
  }
}

export function clearStoredIdToken(): void {
  localStorage.removeItem(ID_TOKEN_STORAGE_KEY);
}