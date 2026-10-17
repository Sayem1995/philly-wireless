/**
 * Pure stock-reservation planning.
 *
 * The Firestore transaction supplies the *current* snapshots; this function
 * decides whether every requested unit is available and what the new counts
 * should be. Keeping the decision pure makes the oversell rules directly
 * testable without a database, while the transaction provides the atomicity.
 */

export type StockItem = { productId: number; qty: number };

export type StockSnapshot = {
  exists: boolean;
  name?: string;
  stock?: number;
  active?: boolean;
};

export type ReservationPlan =
  | { ok: true; nextStock: Array<{ productId: number; stock: number }> }
  | { ok: false; reason: string };

export function planReservation(
  items: StockItem[],
  snapshots: StockSnapshot[],
): ReservationPlan {
  if (items.length !== snapshots.length) {
    return { ok: false, reason: "Stock check failed — please refresh your cart." };
  }

  const problems: string[] = [];
  const nextStock: Array<{ productId: number; stock: number }> = [];

  snapshots.forEach((snapshot, index) => {
    const item = items[index];
    const wanted = item.qty;

    if (!snapshot.exists) {
      problems.push("That item is no longer available.");
      return;
    }
    const name = snapshot.name || "That item";
    if (!snapshot.active) {
      problems.push(`${name} is no longer for sale.`);
      return;
    }
    const raw = Number(snapshot.stock ?? 0);
    const current = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
    if (current < wanted) {
      problems.push(
        current <= 0 ? `${name} is sold out.` : `Only ${current} of ${name} left.`,
      );
      return;
    }
    nextStock.push({ productId: item.productId, stock: current - wanted });
  });

  if (problems.length > 0) return { ok: false, reason: problems[0] };
  return { ok: true, nextStock };
}
