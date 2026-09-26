/**
 * Browser-only product image preparation (resize + re-encode).
 *
 * Split out from `productImages.ts` on purpose: this module touches `document`,
 * `Image` and `canvas`, while `productImages.ts` is pure and is imported by
 * tests running in the `server` tsconfig program, which has no DOM lib. Keeping
 * the DOM surface here means the admin UI can depend on it without dragging DOM
 * globals into the Node type-check.
 */

/** Uploads already at or under this are sent untouched (preserves GIF motion). */
export const PRODUCT_IMAGE_PASSTHROUGH_BYTES = 512 * 1024; // 512 KB
/** Longest edge after resizing. */
export const PRODUCT_IMAGE_MAX_EDGE = 1600;
export const PRODUCT_IMAGE_QUALITY = 0.85;

export type PreparedImage = {
  blob: Blob;
  mime: string;
  width: number | null;
  height: number | null;
};

/** Load an `HTMLImageElement` from an object URL, always revoking the URL. */
function loadImage(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The browser could not decode that image."));
    img.src = objectUrl;
  });
}

/**
 * Shrink an image so the upload stays small and fast without visibly losing
 * quality. Returns the original bytes when the file is already light, or when
 * resizing is not useful (GIF animation, SVG vectors).
 *
 * Never throws: any decode or canvas failure falls back to the original file,
 * because a slightly-too-large upload beats a broken one.
 */
export async function prepareProductImage(file: File): Promise<PreparedImage> {
  const passthrough = (): PreparedImage => ({
    blob: file,
    mime: file.type,
    width: null,
    height: null,
  });

  // Animated GIFs and SVGs must not go through a canvas: drawing them would
  // flatten the animation / rasterise the vector.
  if (file.type === "image/gif" || file.type === "image/svg+xml") return passthrough();
  if (file.size <= PRODUCT_IMAGE_PASSTHROUGH_BYTES) return passthrough();
  if (typeof document === "undefined") return passthrough();

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const { naturalWidth: width, naturalHeight: height } = img;
    if (!width || !height) return passthrough();

    const scale = Math.min(1, PRODUCT_IMAGE_MAX_EDGE / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return passthrough();
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", PRODUCT_IMAGE_QUALITY),
    );
    if (!blob || blob.size === 0) return passthrough();
    // A resized WebP that came out bigger than the original is not an upgrade.
    if (blob.size >= file.size) return passthrough();

    return { blob, mime: "image/webp", width: targetWidth, height: targetHeight };
  } catch {
    return passthrough();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
