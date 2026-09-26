import { randomBytes } from "node:crypto";
import { getDb } from "./firestore.js";
import { IMAGE_MAX_DATA_CHARS } from "../../contracts/productImages.js";

/**
 * Product images, stored in Firestore instead of Cloud Storage.
 *
 * Cloud Storage for Firebase requires the Blaze plan before a bucket can be
 * created, and the Spark (free) plan has no object storage at all. Firestore is
 * already in use here and its free tier covers a catalogue this size several
 * times over, so images live as base64 on their own documents and are served
 * through `GET /api/images/:id`.
 *
 * Why a separate collection rather than a field on the product: the public
 * `shop.products` query returns every product, and inlining hundreds of
 * kilobytes of base64 per row would blow up that response. Keeping images in
 * their own documents lets the catalogue stay small and each image be cached
 * and fetched independently by the browser.
 */

export const COLLECTION_PRODUCT_IMAGES = "productImages";

export type ProductImage = {
  id: string;
  contentType: string;
  /** base64, without a `data:` prefix. */
  data: string;
  bytes: number;
  createdAt: Date;
};

function mapImage(id: string, r: Record<string, unknown>): ProductImage {
  return {
    id,
    contentType: String(r.contentType ?? "application/octet-stream"),
    data: String(r.data ?? ""),
    bytes: Number(r.bytes ?? 0),
    createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(),
  };
}

/**
 * Create a new image document. Always a new id — overwriting would mean a
 * browser that cached `/api/images/<id>` forever could serve a stale image.
 */
export async function createProductImage(input: {
  data: string;
  contentType: string;
  bytes: number;
}): Promise<ProductImage> {
  if (input.data.length > IMAGE_MAX_DATA_CHARS) {
    throw new Error(
      `Image data is ${input.data.length} characters, over the ${IMAGE_MAX_DATA_CHARS} limit.`,
    );
  }

  const db = await getDb();
  const suffix = randomBytes(3).toString("hex");
  const id = `img_${Date.now().toString(36)}${suffix}`;
  const doc = {
    data: input.data,
    contentType: input.contentType,
    bytes: input.bytes,
    createdAt: new Date(),
  };
  await db.collection(COLLECTION_PRODUCT_IMAGES).doc(id).set(doc);
  return mapImage(id, doc);
}

/** Fetch an image by id, or `undefined` when it does not exist. */
export async function getProductImage(id: string): Promise<ProductImage | undefined> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return undefined;
  const snap = await (await getDb()).collection(COLLECTION_PRODUCT_IMAGES).doc(id).get();
  if (!snap.exists) return undefined;
  return mapImage(id, snap.data() as Record<string, unknown>);
}

/** Delete an image. Missing ids are not an error. */
export async function deleteProductImage(id: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return;
  await (await getDb()).collection(COLLECTION_PRODUCT_IMAGES).doc(id).delete();
}
