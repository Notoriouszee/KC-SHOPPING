/**
 * Upload validation tests: image sniffing, size limits, path traversal and
 * cleanup. Uses a throwaway upload root so the real data directory is untouched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rmSync, mkdtempSync, existsSync } from "node:fs";

const root = mkdtempSync(join(tmpdir(), "orderpilot-uploads-"));
process.env.ORDERPILOT_UPLOAD_ROOT = root;

const {
  detectImageType,
  saveImage,
  resolveMediaPath,
  readStoredFile,
  deleteStoredImage,
  contentTypeForPath,
  MAX_IMAGE_BYTES,
} = await import("../lib/storage.ts");

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function pngFile(name = "logo.png") {
  return new File([PNG_BYTES], name, { type: "image/png" });
}

test("image type detection uses magic bytes, not file names or mime headers", () => {
  assert.equal(detectImageType(PNG_BYTES)?.mime, "image/png");

  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
  assert.equal(detectImageType(jpeg)?.mime, "image/jpeg");

  const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")]);
  assert.equal(detectImageType(webp)?.mime, "image/webp");

  assert.equal(detectImageType(Buffer.from("just some text here")), null);
  assert.equal(detectImageType(Buffer.alloc(4)), null);

  // A file that claims to be an image but is not.
  assert.equal(detectImageType(Buffer.from("<?php echo 'pwned'; ?>")), null);
});

test("a valid image is stored under the upload root with a generated name", async () => {
  const saved = await saveImage(pngFile("../../evil name.png"), {
    folder: "shop-logos",
    ownerId: "seller-123",
  });

  assert.ok(!("error" in saved), "expected a saved image");
  assert.equal(saved.mime, "image/png");
  assert.match(saved.url, /^\/media\/shop-logos\/seller-123-[a-z0-9]+-[a-f0-9]{8}\.png$/);
  // The client-supplied file name must not reach the filesystem.
  assert.equal(saved.url.includes("evil"), false);

  const file = await readStoredFile(saved.url.replace("/media/", "").split("/"));
  assert.ok(file);
  assert.equal(file.contentType, "image/png");
  assert.equal(file.bytes.byteLength, PNG_BYTES.byteLength);
});

test("non-images, empty files and oversized files are rejected", async () => {
  const text = await saveImage(new File(["hello"], "notes.png", { type: "image/png" }), {
    folder: "shop-logos",
    ownerId: "seller-123",
  });
  assert.equal("error" in text, true);

  const empty = await saveImage(new File([], "empty.png", { type: "image/png" }), {
    folder: "shop-logos",
    ownerId: "seller-123",
  });
  assert.equal("error" in empty, true);

  const big = new Uint8Array(MAX_IMAGE_BYTES + 10);
  big.set(PNG_BYTES);
  const oversized = await saveImage(new File([big], "big.png", { type: "image/png" }), {
    folder: "shop-logos",
    ownerId: "seller-123",
  });
  assert.equal("error" in oversized, true);
  assert.match(oversized.error, /smaller than/i);
});

test("media paths cannot escape the upload root", () => {
  assert.equal(resolveMediaPath(["..", "package.json"]), null);
  assert.equal(resolveMediaPath(["shop-logos", "..", "..", "package.json"]), null);
  assert.equal(resolveMediaPath([""]), null);
  assert.equal(resolveMediaPath(["shop-logos", "a.png"]).startsWith(root), true);

  // Windows-style separators smuggled inside a segment are rejected too.
  assert.equal(resolveMediaPath(["shop-logos\\..\\..\\x.png"]), null);
});

test("content types are limited to known image extensions", () => {
  assert.equal(contentTypeForPath("a.png"), "image/png");
  assert.equal(contentTypeForPath("a.JPG"), "image/jpeg");
  assert.equal(contentTypeForPath("a.webp"), "image/webp");
  assert.equal(contentTypeForPath("a.html"), "application/octet-stream");
  assert.equal(contentTypeForPath("a.svg"), "application/octet-stream");
});

test("deleting an image removes it, and ignores paths outside media", async () => {
  const saved = await saveImage(pngFile(), { folder: "shop-logos", ownerId: "delete-me" });
  assert.ok(!("error" in saved));

  const path = resolveMediaPath(saved.url.replace("/media/", "").split("/"));
  assert.equal(existsSync(path), true);

  await deleteStoredImage(saved.url);
  assert.equal(existsSync(path), false);

  // No throw, no filesystem access for foreign paths.
  await deleteStoredImage("/etc/passwd");
  await deleteStoredImage(null);
  assert.ok(true);
});

test("cleanup", () => {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    // best effort on Windows file locks
  }
  assert.ok(true);
});
