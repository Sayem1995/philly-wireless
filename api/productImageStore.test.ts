import { beforeEach, describe, expect, it, vi } from "vitest";
import { getProductImage } from "../server/queries/productImages.js";

/**
 * Image id validation.
 *
 * Ids arrive straight from the URL, and the image documents are deliberately
 * not client-readable — so a crafted id must never reach Firestore at all.
 * These tests mock the database and assert nothing is read for a bad id, which
 * is the property that matters (a path traversal or an expensive lookup would
 * both be a problem).
 */

const docGet = vi.fn();
const doc = vi.fn(() => ({ get: docGet }));
const collection = vi.fn(() => ({ doc }));

vi.mock("../server/queries/firestore.js", () => ({
  getDb: vi.fn(async () => ({ collection })),
  toDate: (v: unknown) => (v instanceof Date ? v : undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
  docGet.mockResolvedValue({ exists: false, data: () => ({}) });
});

describe("getProductImage id validation", () => {
  it("rejects ids containing path separators or traversal", async () => {
    for (const bad of ["../secrets", "a/b", "..%2F", "img/../other"]) {
      await expect(getProductImage(bad)).resolves.toBeUndefined();
    }
    expect(collection).not.toHaveBeenCalled();
  });

  it("rejects empty and over-long ids", async () => {
    await expect(getProductImage("")).resolves.toBeUndefined();
    await expect(getProductImage("a".repeat(65))).resolves.toBeUndefined();
    expect(collection).not.toHaveBeenCalled();
  });

  it("rejects ids with unexpected characters", async () => {
    for (const bad of ["img_abc$", "img abc", "img;drop", "img#frag"]) {
      await expect(getProductImage(bad)).resolves.toBeUndefined();
    }
    expect(collection).not.toHaveBeenCalled();
  });

  it("accepts a well-formed id and reads exactly that document", async () => {
    docGet.mockResolvedValue({
      exists: true,
      data: () => ({
        data: "AAAA",
        contentType: "image/webp",
        bytes: 3,
        createdAt: new Date("2026-01-05T12:00:00Z"),
      }),
    });

    const image = await getProductImage("img_abc123-XYZ");

    expect(collection).toHaveBeenCalledWith("productImages");
    expect(doc).toHaveBeenCalledWith("img_abc123-XYZ");
    expect(image).toMatchObject({ id: "img_abc123-XYZ", contentType: "image/webp", data: "AAAA" });
  });

  it("returns undefined for a missing document", async () => {
    await expect(getProductImage("img_missing")).resolves.toBeUndefined();
  });
});
