import { mkdir, writeFile, unlink, readFile, stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join, resolve, sep } from "node:path";
import { imageDimensions } from "./domain/image-dimensions";

/**
 * Image storage.
 *
 * Two backends:
 *  - **supabase** — Supabase Storage. Used in production, where the deployment
 *    filesystem is read-only. Public buckets return a public URL; the private
 *    receipts bucket is served through our own `/media` route.
 *  - **local** — `data/uploads`, served by the `/media` route. Local development
 *    only.
 */

export type StorageBackend = "supabase" | "local";

export const BUCKET_BY_FOLDER: Record<string, string> = {
  "shop-logos": "shop-assets",
  "product-images": "product-images",
  "payment-receipts": "payment-receipts",
};

const PRIVATE_FOLDERS = new Set(["payment-receipts"]);

function supabaseConfigured(): boolean {
  return Boolean(
    (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function storageBackend(): StorageBackend {
  const explicit = (process.env.STORAGE_BACKEND ?? "").trim().toLowerCase();
  if (explicit === "supabase" || explicit === "s3") return "supabase";
  if (explicit === "local" || explicit === "filesystem") return "local";

  // Production must not depend on the deployment filesystem.
  if (process.env.NODE_ENV === "production") {
    if (!supabaseConfigured()) {
      throw new Error(
        "Image storage is not configured for production. Set SUPABASE_URL and " +
          "SUPABASE_SERVICE_ROLE_KEY (or STORAGE_BACKEND=local for development only).",
      );
    }
    return "supabase";
  }

  return supabaseConfigured() && process.env.STORAGE_BACKEND === "supabase" ? "supabase" : "local";
}

let adminClient: import("@supabase/supabase-js").SupabaseClient | null = null;

async function storageClient() {
  if (adminClient) return adminClient;

  const url = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase Storage is not configured.");

  const { createClient } = await import("@supabase/supabase-js");
  adminClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return adminClient;
}

function supabaseUrl(): string {
  return (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
}

export const UPLOAD_ROOT = () =>
  process.env.ORDERPILOT_UPLOAD_ROOT
    ? resolve(process.env.ORDERPILOT_UPLOAD_ROOT)
    : resolve(process.cwd(), "data", "uploads");

export const IMAGE_MIME = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

export type DetectedImage = { mime: keyof typeof IMAGE_MIME; extension: string };

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/**
 * Detects the image type from its magic bytes. File names and browser-supplied
 * MIME types are attacker-controlled, so they are never trusted for validation.
 */
export function detectImageType(bytes: Uint8Array): DetectedImage | null {
  if (bytes.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mime: "image/png", extension: "png" };
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", extension: "jpg" };
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mime: "image/webp", extension: "webp" };
  }

  return null;
}

export type SaveImageOptions = {
  /** Sub-folder, e.g. "shop-logos". Also selects the storage bucket. */
  folder: string;
  /** Used to build a collision-free, non-guessable object name. */
  ownerId: string;
  maxBytes?: number;
};

export type SavedImage = {
  url: string;
  bytes: number;
  mime: string;
  width: number | null;
  height: number | null;
};

function bucketFor(folder: string): string {
  return BUCKET_BY_FOLDER[folder] ?? "shop-assets";
}

function isPrivateFolder(folder: string): boolean {
  return PRIVATE_FOLDERS.has(folder);
}

/**
 * Validates and stores an uploaded image.
 *
 * Returns a public URL for public buckets and a root-relative `/media/...` URL
 * for private ones (served by the media route with the service role).
 */
export async function saveImage(
  file: File,
  options: SaveImageOptions,
): Promise<SavedImage | { error: string }> {
  const maxBytes = options.maxBytes ?? MAX_IMAGE_BYTES;

  if (!file || typeof file === "string") return { error: "Choose an image to upload." };
  if (file.size === 0) return { error: "That file is empty." };
  if (file.size > maxBytes) {
    return { error: `Images must be smaller than ${Math.round(maxBytes / (1024 * 1024))}MB.` };
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const detected = detectImageType(buffer);
  if (!detected) {
    return { error: "Upload a PNG, JPEG or WebP image." };
  }

  const safeOwner = options.ownerId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40) || "owner";
  const fileName = `${safeOwner}-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}.${detected.extension}`;
  const size = imageDimensions(buffer);

  if (storageBackend() === "supabase") {
    const bucket = bucketFor(options.folder);
    const key = `${safeOwner}/${fileName}`;
    const client = await storageClient();

    const { error } = await client.storage.from(bucket).upload(key, buffer, {
      contentType: detected.mime,
      upsert: false,
      cacheControl: "31536000",
    });

    if (error) return { error: `We could not store that image: ${error.message}` };

    return {
      url: isPrivateFolder(options.folder)
        ? `/media/${options.folder}/${key}`
        : `${supabaseUrl()}/storage/v1/object/public/${bucket}/${key}`,
      bytes: buffer.byteLength,
      mime: detected.mime,
      width: size?.width ?? null,
      height: size?.height ?? null,
    };
  }

  const directory = join(UPLOAD_ROOT(), options.folder);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, fileName), buffer);

  return {
    url: `/media/${options.folder}/${fileName}`,
    bytes: buffer.byteLength,
    mime: detected.mime,
    width: size?.width ?? null,
    height: size?.height ?? null,
  };
}

/**
 * Splits a stored image URL into a bucket and object key.
 *
 * Handles the three shapes this app produces:
 *   /media/<folder>/<file>                                  (local, private)
 *   /media/<folder>/<owner>/<file>                          (supabase, private)
 *   https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<key>
 */
export function parseStoredUrl(
  url: string,
): { bucket: string; key: string; folder: string } | null {
  if (url.startsWith("/media/")) {
    const segments = url.slice("/media/".length).split("/").filter(Boolean);
    const [folder, ...rest] = segments;
    if (!folder || rest.length === 0) return null;
    return { bucket: bucketFor(folder), key: rest.join("/"), folder };
  }

  const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (match) {
    const [, bucket, key] = match;
    if (!bucket || !key) return null;
    return { bucket, key, folder: Object.keys(BUCKET_BY_FOLDER).find((f) => BUCKET_BY_FOLDER[f] === bucket) ?? "" };
  }

  return null;
}

/** Deletes a previously stored image, ignoring anything we do not manage. */
export async function deleteStoredImage(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const parsed = parseStoredUrl(url);
  if (!parsed) return;

  if (storageBackend() === "supabase") {
    try {
      const client = await storageClient();
      await client.storage.from(parsed.bucket).remove([parsed.key]);
    } catch {
      // Best effort: a missing object must not block the caller.
    }
    return;
  }

  const target = resolveMediaPath([parsed.folder, ...parsed.key.split("/")]);
  if (!target) return;
  try {
    await unlink(target);
  } catch {
    // Already gone (or never existed) — nothing to do.
  }
}

/**
 * Resolves a media path to a file inside the upload root, or null when the path
 * escapes the root (path traversal) or points at a directory.
 */
export function resolveMediaPath(segments: string[]): string | null {
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return null;
  if (segments.some((segment) => /[\\/]/.test(segment))) return null;

  const root = UPLOAD_ROOT();
  const target = resolve(root, ...segments);
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export function contentTypeForPath(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

export type StoredFile = { bytes: Buffer; contentType: string };

/**
 * Reads a stored image for the `/media` route. Works against whichever backend is
 * active, so links keep working after moving to Supabase Storage.
 */
export async function readStoredFile(segments: string[]): Promise<StoredFile | null> {
  if (storageBackend() === "supabase") {
    const [folder, ...rest] = segments;
    if (!folder || rest.length === 0) return null;

    try {
      const client = await storageClient();
      const { data, error } = await client.storage.from(bucketFor(folder)).download(rest.join("/"));
      if (error || !data) return null;

      const bytes = Buffer.from(await data.arrayBuffer());
      if (bytes.byteLength > 10 * 1024 * 1024) return null;
      return { bytes, contentType: contentTypeForPath(rest[rest.length - 1] ?? "") };
    } catch {
      return null;
    }
  }

  const target = resolveMediaPath(segments);
  if (!target) return null;

  try {
    const info = await stat(target);
    if (!info.isFile() || info.size > 10 * 1024 * 1024) return null;
    const bytes = await readFile(target);
    return { bytes, contentType: contentTypeForPath(target) };
  } catch {
    return null;
  }
}
