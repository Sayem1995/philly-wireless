/**
 * Browser-only product image preparation (resize + re-encode).
 *
 * Split out from `productImages.ts` on purpose: this module touches `document`,
 * `Image` and `canvas`, while `productImages.ts` is pure and is imported by
 * tests running in the `server` tsconfig program, which has no DOM lib.
 *
 * Storage is a Firestore document, which caps out at 1 MiB and then costs
 * another third to base64. So the goal here is not "make it smaller" but
 * "guarantee the encoded result fits" — a resize that quietly produces
 * something too big would fail later at the database with an opaque error.
 */

import {
  IMAGE_MAX_DATA_CHARS,
  IMAGE_MAX_STORED_BYTES,
} from "../../contracts/productImages.js";
import {
  PRODUCT_IMAGE_MAX_EDGE,
  PRODUCT_IMAGE_QUALITY,
  PRODUCT_IMAGE_TARGET_BYTES,
  base64Length,
  formatBytes,
} from "./productImages";

export type PreparedImage = {
  /** Encoded bytes, base64, no `data:` prefix. */
  data: string;
  mime: string;
  bytes: number;
  dataChars: number;
  width: number | null;
  height: number | null;
};

export class ImageTooLargeError extends Error {}

/** Encode a binary string (from a canvas data URL) — safe for arbitrary bytes. */
function binaryStringToBase64(binary: string): string {
  return btoa(binary);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma === -1 ? "" : result.slice(comma + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the image."));
    reader.readAsDataURL(blob);
  });
}

function blobToBinaryString(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the image."));
    reader.readAsBinaryString(blob);
  });
}

/** Load an `HTMLImageElement` from an object URL, always revoking the URL. */
function loadImage(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The browser could not decode that image."));
    img.src = objectUrl;
  });
}

function drawToBlob(
  img: HTMLImageElement,
  maxEdge: number,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return resolve(null);
    // PNG sources can carry transparency; keep it rather than matting to black.
    ctx.drawImage(img, 0, 0, width, height);
    canvas.toBlob(resolve, "image/webp", quality);
  });
}

/**
 * Prepare a picked file for storage.
 *
 * Raster images are always re-encoded to WebP, trying progressively smaller
 * sizes until the result fits. GIF and SVG are passed through untouched when
 * they already fit — re-encoding would flatten animation or rasterise a vector
 * — and rejected with a clear message when they do not.
 */
export async function prepareProductImage(file: File): Promise<PreparedImage> {
  const build = (
    data: string,
    mime: string,
    bytes: number,
    width: number | null,
    height: number | null,
  ): PreparedImage => ({ data, mime, bytes, dataChars: data.length, width, height });

  const passthrough = async (): Promise<PreparedImage> => {
    const bytes = file.size;
    if (base64Length(bytes) > IMAGE_MAX_DATA_CHARS) {
      throw new ImageTooLargeError(
        `That ${file.type === "image/svg+xml" ? "SVG" : "GIF"} is ${formatBytes(bytes)}, over the ${formatBytes(
          IMAGE_MAX_STORED_BYTES,
        )} storage limit. Try exporting a smaller file.`,
      );
    }
    const binary = await blobToBinaryString(file);
    return build(binaryStringToBase64(binary), file.type, bytes, null, null);
  };

  // Animation and vectors must not go through a canvas.
  if (file.type === "image/gif" || file.type === "image/svg+xml") return passthrough();

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    if (!img.naturalWidth || !img.naturalHeight) return passthrough();

    // Step down both quality and dimensions until the encoded result fits.
    const attempts: Array<{ edge: number; quality: number }> = [
      { edge: PRODUCT_IMAGE_MAX_EDGE, quality: PRODUCT_IMAGE_QUALITY },
      { edge: 800, quality: 0.68 },
      { edge: 700, quality: 0.62 },
      { edge: 600, quality: 0.55 },
      { edge: 480, quality: 0.5 },
    ];

    let smallest: PreparedImage | null = null;
    for (const { edge, quality } of attempts) {
      const blob = await drawToBlob(img, edge, quality);
      if (!blob || blob.size === 0) continue;
      const data = await blobToBase64(blob);
      const candidate = build(data, "image/webp", blob.size, null, null);
      if (!smallest || candidate.bytes < smallest.bytes) smallest = candidate;

      if (blob.size <= PRODUCT_IMAGE_TARGET_BYTES && candidate.dataChars <= IMAGE_MAX_DATA_CHARS) {
        return { ...candidate, width: null, height: null };
      }
    }

    if (smallest && smallest.dataChars <= IMAGE_MAX_DATA_CHARS) return smallest;

    throw new ImageTooLargeError(
      "That image could not be compressed enough to store. Try a simpler or smaller image.",
    );
  } catch (err) {
    if (err instanceof ImageTooLargeError) throw err;
    // Any decode/canvas failure falls back to the original bytes if they fit.
    return passthrough();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
