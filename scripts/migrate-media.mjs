/**
 * Moves images that were stored on the local filesystem into Supabase Storage,
 * and rewrites the database URLs to point at the bucket.
 *
 * Local development writes to `data/uploads` and stores `/media/<folder>/<file>`.
 * In production those files do not exist (and the filesystem is read-only), so
 * any row that still references one would render a broken image.
 *
 *   # rewrite the database the app is configured to use (DATA_BACKEND)
 *   node --import ./scripts/register.mjs scripts/migrate-media.mjs
 *   node --import ./scripts/register.mjs scripts/migrate-media.mjs --dry-run
 *
 * Safe to re-run: rows that already point at Storage are skipped.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadEnv } from "./load-env.mjs";

loadEnv();

const dryRun = process.argv.includes("--dry-run");

process.env.STORAGE_BACKEND = "supabase";

const { getDb, dbBackend } = await import("../lib/db/index.ts");
const { saveImage, deleteStoredImage, BUCKET_BY_FOLDER } = await import("../lib/storage.ts");

const db = await getDb();

console.log(`database: ${dbBackend()}${dryRun ? " (dry run)" : ""}`);

// { table, id, ownerId, column, url, folder }
const candidates = [];

const logos = await db.all(
  "SELECT id, shop_logo_url FROM users WHERE shop_logo_url LIKE '/media/%'",
);
for (const row of logos) {
  const folder = row.shop_logo_url.split("/")[2] ?? "shop-logos";
  candidates.push({
    table: "users",
    id: row.id,
    ownerId: row.id,
    column: "shop_logo_url",
    url: row.shop_logo_url,
    folder,
  });
}

const images = await db.all(
  "SELECT id, seller_id, url FROM product_images WHERE url LIKE '/media/%'",
);
for (const row of images) {
  const folder = row.url.split("/")[2] ?? "product-images";
  candidates.push({
    table: "product_images",
    id: row.id,
    ownerId: row.seller_id,
    column: "url",
    url: row.url,
    folder,
  });
}

const receipts = await db.all(
  "SELECT id, seller_id, receipt_url FROM orders WHERE receipt_url LIKE '/media/%'",
);
for (const row of receipts) {
  const folder = row.receipt_url.split("/")[2] ?? "payment-receipts";
  candidates.push({
    table: "orders",
    id: row.id,
    ownerId: row.seller_id,
    column: "receipt_url",
    url: row.receipt_url,
    folder,
  });
}

console.log(`found ${candidates.length} local image reference(s)`);

let moved = 0;
let missing = 0;
let failed = 0;

for (const item of candidates) {
  const segments = item.url.replace(/^\/media\//, "").split("/");
  const filePath = join(process.cwd(), "data", "uploads", ...segments);

  let bytes;
  try {
    bytes = await readFile(filePath);
  } catch {
    missing += 1;
    console.log(`  missing file: ${item.url}`);
    continue;
  }

  if (dryRun) {
    console.log(`  would upload ${item.url} -> ${BUCKET_BY_FOLDER[item.folder] ?? "shop-assets"}`);
    moved += 1;
    continue;
  }

  const extension = segments[segments.length - 1]?.split(".").pop() ?? "png";
  const file = new File([new Uint8Array(bytes)], `media.${extension}`, {
    type: extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg",
  });

  const saved = await saveImage(file, { folder: item.folder, ownerId: item.ownerId });
  if ("error" in saved) {
    failed += 1;
    console.log(`  failed ${item.url}: ${saved.error}`);
    continue;
  }

  await db.run(`UPDATE ${item.table} SET ${item.column} = ? WHERE id = ?`, saved.url, item.id);
  moved += 1;
}

console.log(
  `\n${dryRun ? "would move" : "moved"} ${moved}, missing ${missing}, failed ${failed}` +
    (dryRun ? " (dry run — nothing was uploaded or updated)" : ""),
);

await db.close();
process.exit(failed > 0 ? 1 : 0);
