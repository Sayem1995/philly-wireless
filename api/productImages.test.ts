import { describe, expect, it } from "vitest";
import {
  IMAGE_MAX_DATA_CHARS,
  imageDataUrl,
  normalizeImageMime,
} from "../contracts/productImages.js";
import {
  base64Length,
  extensionForMime,
  fitsImageDocument,
  formatBytes,
  isImagePath,
  productImageUrl,
  slugifyForStorage,
  validateProductImageFile,
} from "../src/lib/productImages.js";

/**
 * Product image helpers.
 *
 * These cover the decisions that decide whether an image can be stored at all
 * (Firestore caps a document at 1 MiB, then base64 costs another third) and how
 * it is addressed once stored. Getting either wrong shows up as an image that
 * silently never appears.
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

  it("bounds the length", () => {
    expect(slugifyForStorage("a".repeat(200)).length).toBeLessThanOrEqual(48);
  });
});

describe("productImageUrl", () => {
  it("builds a relative API url from the stored image id", () => {
    expect(productImageUrl({ imagePath: "img_abc123" })).toBe("/api/images/img_abc123");
  });

  it("encodes the id so a stray character cannot break the path", () => {
    expect(productImageUrl({ imagePath: "img a/b" })).toBe("/api/images/img%20a%2Fb");
  });

  it("trims surrounding whitespace", () => {
    expect(productImageUrl({ imagePath: "  img_abc123  " })).toBe("/api/images/img_abc123");
  });

  it("returns null when the product has no image", () => {
    expect(productImageUrl({ imagePath: null })).toBeNull();
    expect(productImageUrl({})).toBeNull();
    expect(productImageUrl(null)).toBeNull();
    expect(productImageUrl(undefined)).toBeNull();
  });

  it("treats a blank id as no image rather than a broken url", () => {
    expect(productImageUrl({ imagePath: "" })).toBeNull();
    expect(productImageUrl({ imagePath: "   " })).toBeNull();
  });
});

describe("isImagePath", () => {
  it("treats blank values as 'no image'", () => {
    expect(isImagePath("img_abc")).toBe(true);
    expect(isImagePath("  img_abc  ")).toBe(true);
    expect(isImagePath(null)).toBe(false);
    expect(isImagePath(undefined)).toBe(false);
    expect(isImagePath("")).toBe(false);
    expect(isImagePath("   ")).toBe(false);
  });
});

describe("base64Length", () => {
  it("computes the encoded length without encoding", () => {
    expect(base64Length(0)).toBe(0);
    expect(base64Length(1)).toBe(4);
    expect(base64Length(3)).toBe(4);
    expect(base64Length(4)).toBe(8);
  });

  it("inflates by a third, which is why the ceiling is not 1 MiB of image", () => {
    // 525 KB of bytes encodes to ~700,000 characters.
    expect(base64Length(525_000)).toBeLessThanOrEqual(IMAGE_MAX_DATA_CHARS);
    // A full megabyte would not fit.
    expect(base64Length(1024 * 1024)).toBeGreaterThan(IMAGE_MAX_DATA_CHARS);
  });
});

describe("fitsImageDocument", () => {
  it("accepts payloads within the document limit", () => {
    expect(fitsImageDocument(1000)).toBe(true);
    expect(fitsImageDocument(IMAGE_MAX_DATA_CHARS)).toBe(true);
  });

  it("rejects oversized and empty payloads", () => {
    expect(fitsImageDocument(IMAGE_MAX_DATA_CHARS + 1)).toBe(false);
    expect(fitsImageDocument(0)).toBe(false);
  });
});

describe("formatBytes", () => {
  it("formats across the unit boundaries", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MB");
  });
});

describe("normalizeImageMime", () => {
  it("accepts the allowed image types, ignoring parameters and case", () => {
    expect(normalizeImageMime("image/png")).toBe("image/png");
    expect(normalizeImageMime("IMAGE/JPEG; charset=binary")).toBe("image/jpeg");
  });

  it("rejects anything that is not an allowed image type", () => {
    expect(normalizeImageMime("application/pdf")).toBeNull();
    expect(normalizeImageMime("text/html")).toBeNull();
    expect(normalizeImageMime("image/tiff")).toBeNull();
    expect(normalizeImageMime("")).toBeNull();
  });
});

describe("imageDataUrl", () => {
  it("builds a data url from a stored image", () => {
    expect(imageDataUrl({ data: "AAAA", contentType: "image/webp" })).toBe(
      "data:image/webp;base64,AAAA",
    );
  });

  it("returns null unless both parts are present", () => {
    expect(imageDataUrl({ data: "AAAA" })).toBeNull();
    expect(imageDataUrl({ contentType: "image/webp" })).toBeNull();
    expect(imageDataUrl(null)).toBeNull();
  });
});

describe("validateProductImageFile", () => {
  it("accepts a normal photo", () => {
    expect(validateProductImageFile({ size: 250_000, type: "image/jpeg" })).toEqual({ ok: true });
  });

  it("accepts a large photo because it will be re-encoded down", () => {
    expect(validateProductImageFile({ size: 12 * 1024 * 1024, type: "image/jpeg" }).ok).toBe(true);
  });

  it("rejects a non-image, naming the type in the reason", () => {
    const result = validateProductImageFile({ size: 1000, type: "application/pdf" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("application/pdf");
  });

  it("rejects an unsupported image type", () => {
    expect(validateProductImageFile({ size: 1000, type: "image/tiff" }).ok).toBe(false);
  });

  it("rejects an empty file", () => {
    expect(validateProductImageFile({ size: 0, type: "image/png" }).ok).toBe(false);
  });

  it("rejects an undetectable type", () => {
    expect(validateProductImageFile({ size: 1000, type: "" }).ok).toBe(false);
  });
});
