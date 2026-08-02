import { getAuth } from "firebase-admin/auth";
import { getDb } from "../queries/firestore";
import type { FirestoreUser } from "../queries/users";
import { findUserByUid, upsertUser } from "../queries/users";

/**
 * Firebase Auth identity helpers.
 *
 * The client signs in with Firebase Auth (Email/Password, Google, GitHub…)
 * and sends the ID token in the `Authorization: Bearer <token>` header.
 * The server verifies the token with `firebase-admin`, then hydrates (or
 * creates) the Firestore `users` record.
 */

let initialized = false;
function ensureAuth() {
  if (initialized) return;
  // Trigger admin init (credentials come from env / application default)
  getDb();
  getAuth();
  initialized = true;
}

export async function verifyFirebaseIdToken(token: string): Promise<{ uid: string; email: string | null; name: string | null; picture: string | null } | null> {
  try {
    ensureAuth();
    const decoded = await getAuth().verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      name: decoded.name ?? null,
      picture: decoded.picture ?? null,
    };
  } catch (err) {
    console.warn("[firebase-auth] Token verification failed:", err);
    return null;
  }
}

/** Resolve a Firebase UID to the Firestore user row (auto-creating on first sign-in). */
export async function resolveUserFromUid(
  info: { uid: string; email?: string | null; name?: string | null; picture?: string | null },
): Promise<FirestoreUser | undefined> {
  let user = await findUserByUid(info.uid);
  if (!user) {
    await upsertUser({
      uid: info.uid,
      name: info.name ?? null,
      email: info.email ?? null,
      avatar: info.picture ?? null,
    });
    user = await findUserByUid(info.uid);
  }
  return user;
}

/** Used by tRPC context: parse Bearer token and return the user row if valid. */
export async function authenticateFirebaseUser(headers: Headers): Promise<FirestoreUser | undefined> {
  const authHeader = headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return undefined;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return undefined;

  const info = await verifyFirebaseIdToken(token);
  if (!info) return undefined;

  try {
    return await resolveUserFromUid(info);
  } catch (err) {
    console.warn("[firebase-auth] Failed to hydrate user:", err);
    return undefined;
  }
}