import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { buildProductImagePath } from "./productImages";

/**
 * Firebase web SDK configuration.
 *
 * Populate these in `.env.local` / Vercel env vars:
 *   VITE_FIREBASE_API_KEY
 *   VITE_FIREBASE_AUTH_DOMAIN
 *   VITE_FIREBASE_PROJECT_ID
 *   VITE_FIREBASE_STORAGE_BUCKET
 *   VITE_FIREBASE_MESSAGING_SENDER_ID
 *   VITE_FIREBASE_APP_ID
 *
 * If VITE_FIREBASE_API_KEY is missing the app still builds/runs in
 * "static-only" mode — auth pages simply show a config notice.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
};

export const ID_TOKEN_STORAGE_KEY = "ccw_id_token";

export const app: FirebaseApp | null = firebaseConfig.apiKey
  ? getApps()[0] ?? initializeApp(firebaseConfig)
  : null;

export const auth: Auth | null = app ? getAuth(app) : null;

export function isFirebaseConfigured(): boolean {
  return !!app && !!auth;
}

/** Get the current user's ID token (caching in localStorage for the tRPC link). */
export async function getFirebaseIdToken(force = false): Promise<string | null> {
  if (!auth || !auth.currentUser) return null;
  try {
    const token = await auth.currentUser.getIdToken(force);
    if (token) localStorage.setItem(ID_TOKEN_STORAGE_KEY, token);
    return token;
  } catch (err) {
    console.warn("[firebase] Failed to obtain ID token:", err);
    return localStorage.getItem(ID_TOKEN_STORAGE_KEY);
  }
}

export function clearStoredIdToken(): void {
  localStorage.removeItem(ID_TOKEN_STORAGE_KEY);
}

/* ==================================================================
 * Cloud Storage — product images
 *
 * Uploads go browser → Firebase Storage directly. They deliberately do NOT
 * pass through `/api/trpc`: Vercel caps a serverless request body at 4.5 MB
 * (see https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions),
 * and a base64 payload makes that worse, so proxying images through the API
 * would fail for exactly the photos an admin is most likely to pick.
 *
 * The Storage SDK is imported dynamically so it stays out of the public
 * bundle — only the admin Products page ever loads it.
 * ================================================================== */

/** Bucket from env, or `null` when the deployment never configured one. */
export const configuredStorageBucket: string | null =
  firebaseConfig.storageBucket || null;

/** Remembered once an upload proves which bucket name actually resolves. */
let resolvedBucket: string | null = null;

/**
 * Bucket candidates in the order we will try them.
 *
 * `storageBucket` is authoritative when set. When it is missing we guess, and
 * both spellings are in the wild: projects created before Sept 2024 default to
 * `<project>.appspot.com`, newer ones to `<project>.firebasestorage.app`
 * (https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024).
 * Buckets are free to try and cheap to fail, so we attempt both rather than
 * hard-fail on a guess.
 */
export function storageBucketCandidates(): string[] {
  if (resolvedBucket) return [resolvedBucket];
  if (configuredStorageBucket) return [configuredStorageBucket];
  const projectId = firebaseConfig.projectId;
  if (!projectId) return [];
  return [`${projectId}.firebasestorage.app`, `${projectId}.appspot.com`];
}

/** Bucket used for building public image URLs (best known answer). */
export function activeStorageBucket(): string | null {
  return resolvedBucket ?? configuredStorageBucket ?? storageBucketCandidates()[0] ?? null;
}

/** A StorageError that means "wrong bucket name", as opposed to a rules denial. */
function isBucketNotFound(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code ?? "";
  const message = (err as { message?: string } | null)?.message ?? "";
  return (
    code === "storage/bucket-not-found" ||
    code === "storage/unknown" ||
    /bucket .*not found|does not exist|404/i.test(message)
  );
}

export class ProductImageUploadError extends Error {}

/** Result of a successful upload: where the object lives. */
export type UploadedProductImage = { path: string; bucket: string };

/**
 * Resize (when worthwhile) and upload a product image.
 *
 * Returns both the Storage object path and the bucket that accepted it, so the
 * caller can persist the pair and the public site never has to re-derive the
 * bucket from its own build-time env.
 *
 * @param productName used to build a human-readable object name
 * @param file        the file the admin picked
 */
export async function uploadProductImage(
  productName: string,
  file: File,
): Promise<UploadedProductImage> {
  if (!app) {
    throw new ProductImageUploadError(
      "Firebase is not configured in this build, so images cannot be uploaded.",
    );
  }

  const [{ validateProductImageFile }, { prepareProductImage }] = await Promise.all([
    import("./productImages"),
    import("./productImageCompression"),
  ]);
  const check = validateProductImageFile(file);
  if (!check.ok) throw new ProductImageUploadError(check.reason);

  const prepared = await prepareProductImage(file);
  const bucketCandidates = storageBucketCandidates();
  if (bucketCandidates.length === 0) {
    throw new ProductImageUploadError(
      "No Storage bucket is configured. Set VITE_FIREBASE_STORAGE_BUCKET (Firebase Console → Project settings → Your apps).",
    );
  }

  const { getStorage, ref, uploadBytes } = await import("firebase/storage");

  // The Storage SDK attaches the current user's ID token itself; we only check
  // here so a signed-out upload fails with a useful message rather than a
  // bare "unauthorized".
  if (!(await getFirebaseIdToken())) {
    throw new ProductImageUploadError(
      "You are not signed in. Sign in as the admin before uploading images.",
    );
  }

  let lastError: unknown = null;
  for (const bucket of bucketCandidates) {
    try {
      const storage = getStorage(app, bucket);
      const path = buildProductImagePath(productName, prepared.mime);
      const objectRef = ref(storage, path);
      await uploadBytes(objectRef, prepared.blob, {
        contentType: prepared.mime,
        cacheControl: "public, max-age=31536000, immutable",
      });
      resolvedBucket = bucket;
      return { path, bucket };
    } catch (err) {
      lastError = err;
      // Only a wrong bucket name is worth retrying with the other spelling.
      if (configuredStorageBucket || !isBucketNotFound(err)) break;
    }
  }

  if (isBucketNotFound(lastError)) {
    throw new ProductImageUploadError(
      "The Storage bucket could not be found. Check that Cloud Storage is enabled for this Firebase project and that VITE_FIREBASE_STORAGE_BUCKET matches the bucket name exactly.",
    );
  }
  const code = (lastError as { code?: string } | null)?.code ?? "";
  if (code === "storage/unauthorized" || code === "storage/unauthenticated") {
    throw new ProductImageUploadError(
      "Storage rejected the upload. Make sure you are signed in as the admin, then sign out and back in — upload permission is carried on a fresh auth token.",
    );
  }
  throw new ProductImageUploadError(
    (lastError as Error | null)?.message ?? "The image upload failed.",
  );
}

/** Download URL for a freshly uploaded object (used for the admin preview). */
export async function productImageDownloadUrl(path: string): Promise<string> {
  if (!app) throw new ProductImageUploadError("Firebase is not configured.");
  const bucket = activeStorageBucket();
  if (!bucket) throw new ProductImageUploadError("No Storage bucket is configured.");
  const { getStorage, ref, getDownloadURL } = await import("firebase/storage");
  return getDownloadURL(ref(getStorage(app, bucket), path));
}