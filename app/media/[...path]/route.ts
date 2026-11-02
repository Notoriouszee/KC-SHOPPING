import { readStoredFile } from "../../../lib/storage";

/**
 * Serves uploaded images from `data/uploads`.
 *
 * Uploads deliberately live outside `public/`: files added after a production
 * build are not reliably served by Next's static handler, and routing them here
 * lets us set strict headers and reject path traversal in one place.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const file = await readStoredFile(path ?? []);

  if (!file) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(file.bytes), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.bytes.byteLength),
      // Uploaded assets are content-addressed by unique file names.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
