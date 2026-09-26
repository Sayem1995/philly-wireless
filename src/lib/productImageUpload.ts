import { vanillaTrpcClient } from "@/providers/trpc";
import { ImageTooLargeError, prepareProductImage } from "./productImageCompression";
import { formatBytes, validateProductImageFile } from "./productImages";

/**
 * Upload a product image to Firestore via `/api/trpc`.
 *
 * Separate from `firebase.ts` on purpose: `providers/trpc.tsx` imports
 * `firebase.ts` to attach the auth token, so the vanilla tRPC client cannot be
 * imported back into it without creating a cycle.
 *
 * The image never touches the filesystem or an object store — the browser
 * re-encodes it and the API stores the base64 in a Firestore document, which is
 * what keeps this on the free plan.
 */

export class ProductImageUploadError extends Error {}

export type UploadedProductImage = {
  /** Firestore document id, to be saved on the product row as `imagePath`. */
  id: string;
  bytes: number;
  /** Public URL for the admin preview. */
  url: string;
};

export async function uploadProductImage(
  _productName: string,
  file: File,
): Promise<UploadedProductImage> {
  const check = validateProductImageFile(file);
  if (!check.ok) throw new ProductImageUploadError(check.reason);

  let prepared;
  try {
    prepared = await prepareProductImage(file);
  } catch (err) {
    if (err instanceof ImageTooLargeError) throw new ProductImageUploadError(err.message);
    throw new ProductImageUploadError("That image could not be processed.");
  }

  try {
    const result = await vanillaTrpcClient.admin.uploadImage.mutate({
      data: prepared.data,
      contentType: prepared.mime,
    });
    return {
      id: result.id,
      bytes: result.bytes,
      url: `/api/images/${result.id}`,
    };
  } catch (err) {
    const message = (err as { message?: string } | null)?.message ?? "";
    if (/too large|too big|maximum|invalid|unsupported|not valid base64/i.test(message)) {
      throw new ProductImageUploadError(
        `The server rejected that image (${formatBytes(prepared.bytes)}). Try a smaller or simpler image.`,
      );
    }
    if (/unauthor|permission|forbidden/i.test(message)) {
      throw new ProductImageUploadError(
        "You are not signed in as an admin. Sign out and back in, then try again.",
      );
    }
    throw new ProductImageUploadError(message || "The image upload failed. Please try again.");
  }
}
