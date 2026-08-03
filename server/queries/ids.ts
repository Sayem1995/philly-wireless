import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";

/**
 * Atomically allocates a sequential numeric id per collection.
 * The frontend contract uses numeric ids (`#PPR-123`, `sel: number`, etc.)
 * so we keep a small counter collection in Firestore.
 */
export async function nextId(db: Firestore, collection: string): Promise<number> {
  const counterRef = db.collection("__counters").doc(collection);
  const allocated = await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const next = (snap.exists ? Number(snap.data()?.value ?? 1000) : 1000) + 1;
    tx.set(counterRef, { value: next }, { merge: true });
    return next;
  });
  return allocated;
}

/** Map a Firestore doc to a plain object with a numeric `id` field. */
export function mapDoc<T extends { id?: number }>(
  doc: QueryDocumentSnapshot,
): T & { id: number } {
  const data = (doc.data() ?? {}) as T & { id?: number };
  return { ...data, id: Number(data.id ?? 0) };
}