import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The create path of `store.upsertProduct`.
 *
 * Adding a brand-new product goes through `createRow`, which the router tests
 * never reach because the store is mocked there. That left the whole create
 * path — id allocation, the counter, and the shape written to Firestore —
 * untested, which is exactly where "editing works but adding doesn't" would
 * hide. These tests drive the real store against a fake database.
 */

const set = vi.fn<(row: Record<string, unknown>) => Promise<undefined>>(
  async () => undefined,
);
const update = vi.fn<(row: Record<string, unknown>) => Promise<undefined>>(
  async () => undefined,
);
const get = vi.fn();
const counterGet = vi.fn();
const counterSet = vi.fn();

const doc = vi.fn((id: string) => ({ id, set, update, get }));
const collection = vi.fn((name: string) => ({ doc, name }));

const runTransaction = vi.fn(async (fn: (tx: unknown) => unknown) =>
  fn({
    get: counterGet,
    set: counterSet,
  }),
);

vi.mock("../server/queries/firestore.js", () => ({
  getDb: vi.fn(async () => ({ collection, runTransaction })),
  toDate: (v: unknown) => (v instanceof Date ? v : undefined),
}));

import { store } from "../server/queries/store.js";

beforeEach(() => {
  vi.clearAllMocks();
  // No counter document yet, so allocation starts at 1001.
  counterGet.mockResolvedValue({ exists: false, data: () => ({}) });
  get.mockResolvedValue({ exists: false, data: () => ({}) });
});

describe("store.upsertProduct — creating a new product", () => {
  const draft = {
    // Exactly what the admin form sends for a NEW product: every field present,
    // with `id: undefined` — superjson preserves that key across the wire.
    id: undefined,
    name: "Lightning Wired Headphone",
    kind: "accessory" as const,
    subcategory: "Headphone",
    price: 1999,
    stock: 20,
    description: "Best Quality",
    badge: "Best Wired Headphone",
    imagePath: null,
    active: true,
  };

  it("allocates an id and writes the row under that id", async () => {
    await store.upsertProduct(draft);

    expect(collection).toHaveBeenCalledWith("products");
    expect(doc).toHaveBeenCalledWith("1001");
    expect(set).toHaveBeenCalledTimes(1);
  });

  it("does not let the caller's undefined id overwrite the allocated one", async () => {
    await store.upsertProduct(draft);

    const written = set.mock.calls[0][0];
    // The stored field must agree with the document path, or the row will be
    // uneditable and invisible to anything keyed on id.
    expect(written.id).toBe(1001);
    expect(written.name).toBe("Lightning Wired Headphone");
    expect(written.subcategory).toBe("Headphone");
    expect(written.price).toBe(1999);
    expect(written.active).toBe(true);
  });

  it("stamps timestamps on the new row", async () => {
    await store.upsertProduct(draft);

    const written = set.mock.calls[0][0];
    expect(written.createdAt).toBeInstanceOf(Date);
    expect(written.updatedAt).toBeInstanceOf(Date);
  });

  it("advances the per-collection counter", async () => {
    await store.upsertProduct(draft);
    expect(counterSet).toHaveBeenCalledWith(expect.anything(), { value: 1001 }, { merge: true });
  });

  it("updates instead of creating when the form carries an existing id", async () => {
    set.mockClear();
    await store.upsertProduct({ ...draft, id: 1007 });

    expect(set).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
    expect(doc).toHaveBeenCalledWith("1007");
  });
});
