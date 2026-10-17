import { describe, expect, it } from "vitest";
import { planReservation } from "../server/lib/stock.js";

/**
 * Oversell rules.
 *
 * `planReservation` is the decision inside the Firestore transaction: it sees
 * the current stock for every requested product and either returns the exact
 * new counts or a customer-readable refusal. Testing it with simulated
 * concurrent snapshots pins the "last unit" behaviour without needing a
 * database; the transaction supplies the atomicity.
 */

describe("planReservation", () => {
  it("plans the new stock for a valid order", () => {
    const plan = planReservation(
      [{ productId: 7, qty: 2 }],
      [{ exists: true, name: "iPhone", stock: 5, active: true }],
    );
    expect(plan).toEqual({
      ok: true,
      nextStock: [{ productId: 7, stock: 3 }],
    });
  });

  it("lets exactly one of two buyers take the last unit", () => {
    const lastUnit = [{ productId: 7, qty: 1 }];
    const first = planReservation(lastUnit, [
      { exists: true, name: "iPhone", stock: 1, active: true },
    ]);
    expect(first).toEqual({ ok: true, nextStock: [{ productId: 7, stock: 0 }] });

    // The second transaction reads the post-first-purchase stock.
    const second = planReservation(lastUnit, [
      { exists: true, name: "iPhone", stock: 0, active: true },
    ]);
    expect(second).toEqual({ ok: false, reason: "iPhone is sold out." });
  });

  it("refuses a quantity above current stock", () => {
    const plan = planReservation(
      [{ productId: 7, qty: 3 }],
      [{ exists: true, name: "iPhone", stock: 2, active: true }],
    );
    expect(plan).toEqual({ ok: false, reason: "Only 2 of iPhone left." });
  });

  it("refuses deleted, inactive and missing products", () => {
    expect(
      planReservation([{ productId: 7, qty: 1 }], [{ exists: false }]),
    ).toEqual({ ok: false, reason: "That item is no longer available." });

    expect(
      planReservation(
        [{ productId: 7, qty: 1 }],
        [{ exists: true, name: "Old phone", stock: 5, active: false }],
      ),
    ).toEqual({ ok: false, reason: "Old phone is no longer for sale." });
  });

  it("treats negative stored stock as zero rather than selling it", () => {
    const plan = planReservation(
      [{ productId: 7, qty: 1 }],
      [{ exists: true, name: "iPhone", stock: -4, active: true }],
    );
    expect(plan).toEqual({ ok: false, reason: "iPhone is sold out." });
  });

  it("rejects mismatched request/snapshot lengths", () => {
    const plan = planReservation(
      [{ productId: 7, qty: 1 }],
      [],
    );
    expect(plan.ok).toBe(false);
  });

  it("reports the first shortage when several lines fail", () => {
    const plan = planReservation(
      [
        { productId: 7, qty: 5 },
        { productId: 8, qty: 5 },
      ],
      [
        { exists: true, name: "Phone", stock: 1, active: true },
        { exists: false },
      ],
    );
    expect(plan).toEqual({ ok: false, reason: "Only 1 of Phone left." });
  });
});
