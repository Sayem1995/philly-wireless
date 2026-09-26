/**
 * Shared constraints for product images stored in Firestore.
 *
 * Images are kept as a base64 string on a Firestore document, which puts three
 * hard ceilings on what we may accept. They are enforced independently on the
 * client (before upload, with a friendly message) and in the API (authoritative,
 * because a client can be bypassed):
 *
 *   1. Firestore rejects any document over 1 MiB.
 *   2. Vercel rejects a serverless request body over ~4.5 MB.
 *   3. base64 inflates binary data by 4/3.
 *
 * Declared here rather than in `src/` so the server can import them without
 * pulling client code into the Node program.
 */

/** Largest string we will persist. Base64 of the bytes, so it is the encoded size. */
export const IMAGE_MAX_DATA_CHARS = 700_000;

/** Largest decoded image we will accept: 700,000 chars ≈ 525 KB of bytes. */
export const IMAGE_MAX_STORED_BYTES = 525_000;

/** MIME types we are willing to serve back from `/api/images/:id`. */
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/**
 * Normalise and validate a content type. Returns `null` when the type is not
 * one we will store — notably this rejects `image/svg+xml`-style smuggling via
 * parameters, and anything that is not an image at all.
 */
export function normalizeImageMime(mime: string): AllowedImageMimeType | null {
  const normalised = String(mime ?? "").toLowerCase().split(";")[0].trim();
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(normalised)
    ? (normalised as AllowedImageMimeType)
    : null;
}

/** `data:` URL for an image document, or `null` when the row has no image. */
export function imageDataUrl(
  image: { data?: string | null; contentType?: string | null } | null | undefined,
): string | null {
  if (!image?.data || !image.contentType) return null;
  return `data:${image.contentType};base64,${image.data}`;
}
