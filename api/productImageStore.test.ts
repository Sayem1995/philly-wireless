import { beforeEach, describe, expect, it, vi } from "vitest";
import { getProductImage } from "../server/queries/productImages.js";
import { imageIdForDeletedProduct, supersededImageId } from "../server/queries/store.js";

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

/**
 * Reclaiming image bytes.
 *
 * The catalogue shares a 1 GiB Firestore quota on the free plan, so replaced
 * uploads must not accumulate — but deleting an image that is still displayed
 * would be much worse than leaking one, hence the explicit negative cases.
 */
describe("supersededImageId", () => {
  it("reclaims the previous image when a product is given a new one", () => {
    expect(supersededImageId({ previous: "img_old", next: "img_new" })).toBe("img_old");
  });

  it("reclaims the previous image when the image is cleared", () => {
    expect(supersededImageId({ previous: "img_old", next: null })).toBe("img_old");
    expect(supersededImageId({ previous: "img_old", next: undefined })).toBe("img_old");
  });

  it("keeps the image when the save did not change it", () => {
    expect(supersededImageId({ previous: "img_same", next: "img_same" })).toBeNull();
  });

  it("does nothing when there was no previous image", () => {
    expect(supersededImageId({ previous: null, next: "img_new" })).toBeNull();
    expect(supersededImageId({ previous: undefined, next: "img_new" })).toBeNull();
    expect(supersededImageId({ previous: "", next: "img_new" })).toBeNull();
  });

  it("refuses to act on a malformed row", () => {
    expect(supersededImageId({ previous: 42, next: "img_new" })).toBeNull();
    expect(supersededImageId({ previous: { id: "x" }, next: "img_new" })).toBeNull();
  });
});

describe("imageIdForDeletedProduct", () => {
  it("returns the image id of the deleted product", () => {
    expect(imageIdForDeletedProduct({ imagePath: "img_abc" })).toBe("img_abc");
  });

  it("returns null for a product without an image or a missing row", () => {
    expect(imageIdForDeletedProduct({ imagePath: null })).toBeNull();
    expect(imageIdForDeletedProduct({ imagePath: "" })).toBeNull();
    expect(imageIdForDeletedProduct({})).toBeNull();
    expect(imageIdForDeletedProduct(undefined)).toBeNull();
  });

  it("refuses to act on a malformed value", () => {
    expect(imageIdForDeletedProduct({ imagePath: 7 })).toBeNull();
  });
});
