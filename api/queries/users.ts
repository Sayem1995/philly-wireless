import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "./firestore";
import { env } from "../lib/env";

export type FirestoreUser = {
  id: number;
  uid: string;
  name: string | null;
  email: string | null;
  avatar: string | null;
  role: "user" | "admin";
  createdAt?: unknown;
  lastSignInAt?: unknown;
};

function mapUser(data: Record<string, unknown>): FirestoreUser {
  return {
    id: Number(data.id ?? 0),
    uid: String(data.uid ?? ""),
    name: (data.name as string) ?? null,
    email: (data.email as string) ?? null,
    avatar: (data.avatar as string) ?? null,
    role: ((data.role as "user" | "admin") ?? "user") as "user" | "admin",
    createdAt: data.createdAt,
    lastSignInAt: data.lastSignInAt,
  };
}

export async function findUserByUnionId(uid: string): Promise<FirestoreUser | undefined> {
  const db = getDb();
  const snap = await db.collection("users").where("uid", "==", uid).limit(1).get();
  if (snap.empty) return undefined;
  return mapUser(snap.docs[0].data() as Record<string, unknown>);
}

export async function findUserByUid(uid: string) {
  return findUserByUnionId(uid);
}

export async function upsertUser(data: {
  uid: string;
  name?: string | null;
  email?: string | null;
  avatar?: string | null;
  role?: "user" | "admin";
}) {
  const db = getDb();
  const existing = await findUserByUnionId(data.uid);

  if (existing) {
    const ref = db.collection("users").doc(String(existing.id));
    await ref.update({
      name: data.name ?? existing.name ?? null,
      email: data.email ?? existing.email ?? null,
      avatar: data.avatar ?? existing.avatar ?? null,
      role: data.role ?? (data.uid === env.ownerUnionId ? "admin" : existing.role ?? "user"),
      lastSignInAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  const id = await nextIdFor(db, "users");
  await db.collection("users").doc(String(id)).set({
    id,
    uid: data.uid,
    name: data.name ?? null,
    email: data.email ?? null,
    avatar: data.avatar ?? null,
    role: data.role ?? (data.uid === env.ownerUnionId ? "admin" : "user"),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastSignInAt: FieldValue.serverTimestamp(),
  });
}

async function nextIdFor(db: ReturnType<typeof getDb>, collection: string): Promise<number> {
  const counterRef = db.collection("__counters").doc(collection);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const next = (snap.exists ? Number(snap.data()?.value ?? 1000) : 1000) + 1;
    tx.set(counterRef, { value: next }, { merge: true });
    return next;
  });
}