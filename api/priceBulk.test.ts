import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `store.createPrices` — the bulk price import.
 *
 * The price list is public, so the properties that matter are that importing
 * never overwrites or deletes anything, never duplicates a row, and always
 * stamps a sortOrder (rows without one are written but never appear on the
 * site, because Firestore omits them from an orderBy query).
 */

const set = vi.fn<(row: Record<string, unknown>) => Promise<undefined>>(async () => undefined);
const counterGet = vi.fn();
const counterSet = vi.fn();

const doc = vi.fn((id: string) => ({ id, set }));
// `listRows` reads the whole collection; `queryWhere` is unused here.
const get = vi.fn();
const collection = vi.fn((name: string) => ({ doc, get, name }));

const runTransaction = vi.fn(async (fn: (tx: unknown) => unknown) =>
  fn({ get: counterGet, set: counterSet }),
);

vi.mock("../server/queries/firestore.js", () => ({
  getDb: vi.fn(async () => ({ collection, runTransaction })),
  toDate: (v: unknown) => (v instanceof Date ? v : undefined),
}));

import { store } from "../server/queries/store.js";

/** Shape Firestore returns from a collection read. */
function existingDocs(rows: Array<Record<string, unknown>>) {
  return { docs: rows.map((r) => ({ id: String(r.id), data: () => r })) };
}

beforeEach(() => {
  vi.clearAllMocks();
  counterGet.mockResolvedValue({ exists: false, data: () => ({}) });
  get.mockResolvedValue(existingDocs([]));
});

describe("store.createPrices", () => {
  const ipadRows = [
    { category: "ipad", brand: "iPad", service: "Screen Replacement", priceLabel: "From $220" },
    { category: "ipad", brand: "iPad Mini", service: "Screen Replacement", priceLabel: "From $220" },
    { category: "ipad", brand: "iPad Air", service: "Screen Replacement", priceLabel: "From $250" },
  ];

  it("writes every row when nothing exists yet", async () => {
    const result = await store.createPrices(ipadRows);

    expect(result.created).toHaveLength(3);
    expect(result.skipped).toHaveLength(0);
    expect(set).toHaveBeenCalledTimes(3);
  });

  it("stamps a sortOrder on every row so it appears on the site", async () => {
    await store.createPrices(ipadRows);

    const written = set.mock.calls.map((c) => c[0]);
    for (const row of written) {
      expect(typeof row.sortOrder).toBe("number");
    }
    // Numbered sequentially from one past the existing maximum; the collection
    // is empty in this test, so numbering starts at 1.
    expect(written.map((r) => r.sortOrder)).toEqual([1, 2, 3]);
  });

  it("skips rows that already exist instead of duplicating them", async () => {
    get.mockResolvedValue(
      existingDocs([
        { id: 1041, category: "ipad", brand: "iPad", service: "Screen Replacement", sortOrder: 40 },
      ]),
    );

    const result = await store.createPrices(ipadRows);

    expect(result.created.map((r) => r.brand)).toEqual(["iPad Mini", "iPad Air"]);
    expect(result.skipped.map((r) => r.brand)).toEqual(["iPad"]);
    expect(set).toHaveBeenCalledTimes(2);
  });

  it("writes nothing at all when every row already exists", async () => {
    get.mockResolvedValue(
      existingDocs(
        ipadRows.map((r, i) => ({ ...r, id: 1000 + i, sortOrder: i })),
      ),
    );

    const result = await store.createPrices(ipadRows);

    expect(result.created).toHaveLength(0);
    expect(result.skipped).toHaveLength(3);
    expect(set).not.toHaveBeenCalled();
  });

  it("matches existing rows regardless of case, so a re-import is harmless", async () => {
    get.mockResolvedValue(
      existingDocs([
        { id: 1, category: "iPad", brand: "IPAD mini", service: "screen replacement", sortOrder: 1 },
      ]),
    );

    const result = await store.createPrices(ipadRows);
    expect(result.created.map((r) => r.brand)).toEqual(["iPad", "iPad Air"]);
  });

  it("continues sortOrder after the highest existing value, not the count", async () => {
    // Gaps are normal: rows get deleted. Using a count would collide.
    get.mockResolvedValue(
      existingDocs([{ id: 1, category: "smartphone", brand: "iPhone", service: "X", sortOrder: 900 }]),
    );

    await store.createPrices([ipadRows[0]]);
    expect(set.mock.calls[0][0].sortOrder).toBe(901);
  });

  it("never deletes or updates anything", async () => {
    const update = vi.fn();
    const remove = vi.fn();
    doc.mockReturnValue({ id: "x", set, update, delete: remove } as never);

    await store.createPrices(ipadRows);

    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
