/**
 * Product image helpers — validation, naming and public URLs.
 *
 * Images are stored in **Firestore** as base64 on their own documents (see
 * `server/queries/productImages.ts`), and a product row holds only the image
 * document id in `imagePath`. That keeps the catalogue query small: inlining
 * the image bytes on every product would make `shop.products` enormous.
 *
 * The public URL is derived from the id at render time, so nothing expiring is
 * ever persisted.
 *
 * Pure functions only — no Firebase, no DOM — so this module is unit-testable
 * and safe to import from the server program too.
 */

import {
  ALLOWED_IMAGE_MIME_TYPES,
  IMAGE_MAX_DATA_CHARS,
  IMAGE_MAX_STORED_BYTES,
  normalizeImageMime,
} from "../../contracts/productImages.js";

/** Hard cap on what the admin may pick from disk, before we re-encode it. */
export const MAX_PRODUCT_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB

/** MIME types the picker offers. The API re-checks whatever arrives. */
export const ACCEPTED_PRODUCT_IMAGE_TYPES = ALLOWED_IMAGE_MIME_TYPES;

/** What the browser should aim to produce, so the encoded result always fits. */
export const PRODUCT_IMAGE_MAX_EDGE = 900;
export const PRODUCT_IMAGE_QUALITY = 0.72;
/**
 * Above this, always re-encode even if the source happens to be small — a
 * PNG screenshot can be tiny on disk yet still be far too large once base64
 * encoded alongside the 1 MiB document ceiling.
 */
export const PRODUCT_IMAGE_TARGET_BYTES = 260_000;

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

/** True when the browser can render this value as an image reference. */
export function isImagePath(path: string | null | undefined): boolean {
  return typeof path === "string" && path.trim().length > 0;
}

/** Public URL for an image document id, or `null` when the product has none. */
export function productImageUrl(
  product: { imagePath?: string | null } | null | undefined,
): string | null {
  const id = product?.imagePath;
  if (!isImagePath(id)) return null;
  return `/api/images/${encodeURIComponent(String(id).trim())}`;
}

/** Exact encoded length of `bytes` once base64-encoded, without encoding it. */
export function base64Length(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

/** Would this many encoded characters fit in one Firestore document? */
export function fitsImageDocument(dataChars: number): boolean {
  return dataChars > 0 && dataChars <= IMAGE_MAX_DATA_CHARS;
}

/** Human-readable size, e.g. `212 KB`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export type FileRejection = { ok: false; reason: string };
export type FileAccepted = { ok: true };
export type FileCheck = FileAccepted | FileRejection;

/**
 * Validate a picked file before any work is done with it.
 *
 * Only the source is checked here — the *encoded* result is what has to fit,
 * and that is verified after re-encoding (a 15 MB photo is fine to pick because
 * it gets shrunk; an already-tiny file may still need re-encoding).
 */
export function validateProductImageFile(file: { size: number; type: string }): FileCheck {
  if (!file.type) {
    return {
      ok: false,
      reason: "That file has no detectable type — please pick a JPEG, PNG, WebP or GIF.",
    };
  }
  if (!normalizeImageMime(file.type)) {
    return {
      ok: false,
      reason: `“${file.type}” is not a supported image. Use JPEG, PNG, WebP, AVIF, GIF or SVG.`,
    };
  }
  if (file.size === 0) {
    return { ok: false, reason: "That file is empty." };
  }
  if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
    return {
      ok: false,
      reason: `That image is ${formatBytes(file.size)} — pick one under ${formatBytes(MAX_PRODUCT_IMAGE_BYTES)}.`,
    };
  }
  return { ok: true };
}

/** Largest decoded image that can still be stored, in bytes. */
export const MAX_STORED_IMAGE_BYTES = IMAGE_MAX_STORED_BYTES;
