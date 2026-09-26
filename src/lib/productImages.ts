/**
 * Product image helpers — validation, naming, normalisation and public URLs.
 *
 * Images live in Firebase Storage and are addressed by their **object path**
 * (e.g. `products/iphone-15-1751-…-ab12cd.webp`), never by a full URL. The
 * public URL is derived from the path at render time, so rows keep working if
 * the bucket name changes and no signed/expiring URL is ever persisted.
 *
 * Pure functions only — no Firebase import — so this module is unit-testable
 * and safe to import from anywhere.
 */

/** Hard cap on what the admin may pick from disk. */
export const MAX_PRODUCT_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB

/** MIME types the picker accepts. `image/*` is used as a hint; we still verify. */
export const ACCEPTED_PRODUCT_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",
] as const;

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

/** Map a MIME type to a file extension, falling back to the raw subtype. */
export function extensionForMime(mime: string): string {
  const normalised = mime.toLowerCase().split(";")[0].trim();
  const known = EXTENSION_BY_MIME[normalised];
  if (known) return known;
  const subtype = normalised.replace(/^image\//, "").replace(/[^a-z0-9]/g, "");
  return subtype || "bin";
}

/** `My iPhone 15 Pro!` → `my-iphone-15-pro` (max 48 chars, never empty). */
export function slugifyForStorage(name: string, fallback = "image"): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug || fallback;
}

/**
 * Build a unique, filesystem-safe Storage object path for a product image.
 * A timestamp plus random suffix means re-uploading never overwrites a live
 * image, and the CDN never serves a stale cache for a reused path.
 */
export function buildProductImagePath(
  productName: string,
  mime: string,
  now: number = Date.now(),
  random: string = Math.random().toString(36).slice(2, 8),
): string {
  const base = slugifyForStorage(productName, "product");
  return `products/${base}-${now}-${random}.${extensionForMime(mime)}`;
}

/** True when the browser can render this path as an image. */
export function isImagePath(path: string | null | undefined): boolean {
  return typeof path === "string" && path.trim().length > 0;
}

/**
 * Public download URL for a Storage object path, or `null` when there is no
 * path (or no configured bucket, in which case there is nothing to point at).
 *
 * Uses the canonical `firebasestorage.googleapis.com` endpoint rather than the
 * SDK's `getDownloadURL()` so that anonymous visitors never need the Storage
 * SDK, and so the URL is identical for every viewer.
 */
export function canonicalImageUrl(
  path: string | null | undefined,
  bucket: string | null | undefined,
): string | null {
  if (!isImagePath(path)) return null;
  if (typeof bucket !== "string" || bucket.trim().length === 0) return null;
  const object = encodeURIComponent(String(path).trim());
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.trim()}/o/${object}?alt=media`;
}

/**
 * Resolve the image URL for a stored product.
 *
 * Prefers the bucket recorded on the row at upload time and only falls back to
 * the deployment's configured bucket. That ordering matters: if the upload had
 * to guess between `<project>.appspot.com` and `<project>.firebasestorage.app`
 * because `VITE_FIREBASE_STORAGE_BUCKET` was unset, the winning guess is what
 * gets persisted, so rendering still works on a build that cannot guess.
 */
export function productImageUrl(
  product: { imagePath?: string | null; imageBucket?: string | null },
  fallbackBucket: string | null | undefined,
): string | null {
  return canonicalImageUrl(product.imagePath, product.imageBucket ?? fallbackBucket);
}

export type FileRejection = { ok: false; reason: string };
export type FileAccepted = { ok: true };
export type FileCheck = FileAccepted | FileRejection;

/** Validate a picked file before any work is done with it. */
export function validateProductImageFile(file: {
  size: number;
  type: string;
}): FileCheck {
  if (!file.type) {
    return { ok: false, reason: "That file has no detectable type — please pick a JPEG, PNG, WebP or GIF." };
  }
  if (!file.type.startsWith("image/")) {
    return { ok: false, reason: `“${file.type}” is not an image. Use JPEG, PNG, WebP, AVIF or GIF.` };
  }
  if (file.size === 0) {
    return { ok: false, reason: "That file is empty." };
  }
  if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return { ok: false, reason: `That image is ${mb} MB — the limit is 8 MB.` };
  }
  return { ok: true };
}
