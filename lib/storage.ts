import { mkdir, writeFile, unlink, readFile, stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join, resolve, sep } from "node:path";
import { imageDimensions } from "./domain/image-dimensions";

/**
 * Local image storage.
 *
 * Production would use Supabase Storage (bucket `shop-assets`, owner-scoped
 * write policies). Locally we write to `data/uploads` and serve through the
 * `/media/...` route handler, which keeps uploads out of the build output and
 * lets us control content-type headers.
 */

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
  /** Sub-folder under data/uploads, e.g. "shop-logos". */
  folder: string;
  /** Used to build a collision-free, non-guessable file name. */
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

/**
 * Validates and stores an uploaded image. Returns a root-relative URL for the
 * `/media` route. Throws `ValidationError`-shaped errors via the caller.
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
  const directory = join(UPLOAD_ROOT(), options.folder);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, fileName), buffer);

  const size = imageDimensions(buffer);

  return {
    url: `/media/${options.folder}/${fileName}`,
    bytes: buffer.byteLength,
    mime: detected.mime,
    width: size?.width ?? null,
    height: size?.height ?? null,
  };
}

/** Deletes a previously stored image, ignoring anything outside our media root. */
export async function deleteStoredImage(url: string | null | undefined): Promise<void> {
  if (!url || !url.startsWith("/media/")) return;
  const target = resolveMediaPath(url.replace(/^\/media\//, "").split("/"));
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

export async function readStoredFile(segments: string[]): Promise<StoredFile | null> {
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
