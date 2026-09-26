import { describe, expect, it } from "vitest";
import {
  MAX_PRODUCT_IMAGE_BYTES,
  buildProductImagePath,
  canonicalImageUrl,
  extensionForMime,
  isImagePath,
  productImageUrl,
  slugifyForStorage,
  validateProductImageFile,
} from "../src/lib/productImages.js";

/**
 * Product image helpers.
 *
 * These cover the pieces that decide *what* gets uploaded and *where* it is
 * addressed from — the failure modes that would otherwise only show up as a
 * broken <img> on the live site.
 */

describe("extensionForMime", () => {
  it("maps the image types the admin can pick", () => {
    expect(extensionForMime("image/jpeg")).toBe("jpg");
    expect(extensionForMime("image/png")).toBe("png");
    expect(extensionForMime("image/webp")).toBe("webp");
    expect(extensionForMime("image/gif")).toBe("gif");
    expect(extensionForMime("image/avif")).toBe("avif");
    expect(extensionForMime("image/svg+xml")).toBe("svg");
  });

  it("ignores charset parameters and casing", () => {
    expect(extensionForMime("IMAGE/PNG; charset=binary")).toBe("png");
  });

  it("falls back to the subtype, then to 'bin'", () => {
    expect(extensionForMime("image/heic")).toBe("heic");
    expect(extensionForMime("")).toBe("bin");
  });
});

describe("slugifyForStorage", () => {
  it("produces a storage-safe slug", () => {
    expect(slugifyForStorage("iPhone 15 Pro Max")).toBe("iphone-15-pro-max");
    expect(slugifyForStorage("USB-C → Lightning Cable")).toBe("usb-c-lightning-cable");
    expect(slugifyForStorage("  spaced  out  ")).toBe("spaced-out");
  });

  it("never returns an empty or trailing-dash slug", () => {
    expect(slugifyForStorage("!!!")).toBe("image");
    expect(slugifyForStorage("!!!", "product")).toBe("product");
    expect(slugifyForStorage("Case!")).toBe("case");
  });

  it("bounds the length so object paths stay short", () => {
    const slug = slugifyForStorage("a".repeat(200));
    expect(slug.length).toBeLessThanOrEqual(48);
  });
});

describe("buildProductImagePath", () => {
  it("builds a namespaced, unique path with the right extension", () => {
    const path = buildProductImagePath("iPhone 15 Pro", "image/webp", 1700000000000, "ab12cd");
    expect(path).toBe("products/iphone-15-pro-1700000000000-ab12cd.webp");
  });

  it("never collides when the same product is uploaded twice", () => {
    const a = buildProductImagePath("Case", "image/png", 1, "aaaaaa");
    const b = buildProductImagePath("Case", "image/png", 2, "bbbbbb");
    expect(a).not.toBe(b);
  });

  it("stays inside the products/ prefix", () => {
    expect(buildProductImagePath("../../etc/passwd", "image/png", 1, "x")).toMatch(/^products\//);
  });

  it("falls back to 'product' when the name has no usable characters", () => {
    expect(buildProductImagePath("!!!", "image/png", 1, "x")).toBe("products/product-1-x.png");
  });
});

describe("canonicalImageUrl", () => {
  it("encodes the object path into the download URL", () => {
    expect(canonicalImageUrl("products/a b.png", "proj.firebasestorage.app")).toBe(
      "https://firebasestorage.googleapis.com/v0/b/proj.firebasestorage.app/o/products%2Fa%20b.png?alt=media",
    );
  });

  it("returns null when there is no path or no bucket", () => {
    expect(canonicalImageUrl(null, "proj.appspot.com")).toBeNull();
    expect(canonicalImageUrl("", "proj.appspot.com")).toBeNull();
    expect(canonicalImageUrl("   ", "proj.appspot.com")).toBeNull();
    expect(canonicalImageUrl("products/a.png", null)).toBeNull();
    expect(canonicalImageUrl("products/a.png", "")).toBeNull();
  });
});

describe("productImageUrl", () => {
  const path = "products/iphone-15-pro-1700000000000-ab12cd.webp";

  it("prefers the bucket recorded on the row at upload time", () => {
    expect(productImageUrl({ imagePath: path, imageBucket: "proj.firebasestorage.app" }, "proj.appspot.com")).toBe(
      `https://firebasestorage.googleapis.com/v0/b/proj.firebasestorage.app/o/${encodeURIComponent(path)}?alt=media`,
    );
  });

  it("falls back to the configured bucket for rows saved before the bucket was recorded", () => {
    expect(productImageUrl({ imagePath: path, imageBucket: null }, "proj.appspot.com")).toBe(
      `https://firebasestorage.googleapis.com/v0/b/proj.appspot.com/o/${encodeURIComponent(path)}?alt=media`,
    );
  });

  it("returns null when the product has no image", () => {
    expect(productImageUrl({ imagePath: null, imageBucket: "proj.appspot.com" }, "proj.appspot.com")).toBeNull();
    expect(productImageUrl({}, "proj.appspot.com")).toBeNull();
  });

  it("returns null rather than a broken URL when neither bucket is known", () => {
    expect(productImageUrl({ imagePath: path }, null)).toBeNull();
  });
});

describe("isImagePath", () => {
  it("treats blank values as 'no image'", () => {
    expect(isImagePath("products/a.png")).toBe(true);
    expect(isImagePath("  products/a.png  ")).toBe(true);
    expect(isImagePath(null)).toBe(false);
    expect(isImagePath(undefined)).toBe(false);
    expect(isImagePath("")).toBe(false);
    expect(isImagePath("   ")).toBe(false);
  });
});

describe("validateProductImageFile", () => {
  it("accepts a normal photo", () => {
    expect(validateProductImageFile({ size: 250_000, type: "image/jpeg" })).toEqual({ ok: true });
  });

  it("rejects a non-image, with the type named in the reason", () => {
    const result = validateProductImageFile({ size: 1000, type: "application/pdf" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("application/pdf");
  });

  it("rejects an empty file", () => {
    const result = validateProductImageFile({ size: 0, type: "image/png" });
    expect(result.ok).toBe(false);
  });

  it("rejects an undetectable type", () => {
    const result = validateProductImageFile({ size: 1000, type: "" });
    expect(result.ok).toBe(false);
  });

  it("rejects anything over the 8 MB ceiling", () => {
    expect(validateProductImageFile({ size: MAX_PRODUCT_IMAGE_BYTES, type: "image/png" }).ok).toBe(true);
    const result = validateProductImageFile({ size: MAX_PRODUCT_IMAGE_BYTES + 1, type: "image/png" });
    expect(result.ok).toBe(false);
  });
});
