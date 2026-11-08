import { getDb, nowIso, plainRow, plainRows } from "../db";
import { newId } from "../domain/ids";
import { normaliseProductSlug, productSlugProblem } from "../domain/slug";
import {
  isAvailability,
  isPublicationStatus,
  type Availability,
  type PublicationStatus,
} from "../domain/status";
import type { ProductImage, ProductWithImages, PublicProduct } from "../domain/types";
import { ValidationError, requiredString } from "../domain/validation";
import { getPublicShop } from "./shop";

/** Product photos per product. Enough for a good gallery, small enough to stay simple. */
export const MAX_PRODUCT_IMAGES = 5;

export type ProductInput = {
  name: string;
  priceKobo: number;
  description?: string | null;
  availability?: Availability;
  publicationStatus?: PublicationStatus;
};

type ProductRow = Omit<ProductWithImages, "images">;

async function attachImages(rows: ProductRow[]): Promise<ProductWithImages[]> {
  if (rows.length === 0) return [];

  const db = await getDb();
  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => "?").join(", ");
  const images = plainRows<ProductImage>(
    await db
      .prepare(
        `SELECT * FROM product_images WHERE product_id IN (${placeholders}) ORDER BY position ASC, created_at ASC`,
      )
      .all(...ids),
  );

  const byProduct = new Map<string, ProductImage[]>();
  for (const image of images) {
    const bucket = byProduct.get(image.product_id) ?? [];
    bucket.push(image);
    byProduct.set(image.product_id, bucket);
  }

  return rows.map((row) => ({ ...row, images: byProduct.get(row.id) ?? [] }));
}

export type ProductFilters = {
  status?: PublicationStatus | "all";
  availability?: Availability | "all";
  query?: string;
  limit?: number;
};

export async function listProducts(
  sellerId: string,
  filters: ProductFilters = {},
): Promise<ProductWithImages[]> {
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500);
  const where: string[] = ["seller_id = ?"];
  const params: (string | number)[] = [sellerId];

  if (filters.status && filters.status !== "all") {
    where.push("publication_status = ?");
    params.push(filters.status);
  }
  if (filters.availability && filters.availability !== "all") {
    where.push("availability = ?");
    params.push(filters.availability);
  }
  const query = filters.query?.trim();
  if (query) {
    where.push("(LOWER(name) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?))");
    params.push(`%${query}%`, `%${query}%`);
  }

  const rows = plainRows<ProductRow>(
    await (await getDb())
      .prepare(
        `SELECT * FROM products WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT ?`,
      )
      .all(...params, limit),
  );

  return await attachImages(rows);
}

export async function getProduct(
  sellerId: string,
  productId: string,
): Promise<ProductWithImages | null> {
  const row = plainRow<ProductRow>(
    await (await getDb()).prepare("SELECT * FROM products WHERE id = ? AND seller_id = ?").get(productId, sellerId),
  );
  if (!row) return null;
  return (await attachImages([row]))[0] ?? null;
}

/** Products a visitor may see on a shop page. */
export async function listPublishedProducts(
  sellerId: string,
  limit = 200,
): Promise<ProductWithImages[]> {
  const rows = plainRows<ProductRow>(
    await (await getDb())
      .prepare(
        `SELECT * FROM products
         WHERE seller_id = ? AND publication_status = 'published'
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(sellerId, Math.min(Math.max(limit, 1), 500)),
  );
  return await attachImages(rows);
}

export type PublicProductHit = {
  id: string;
  name: string;
  slug: string;
  price_kobo: number;
  availability: string;
  shop_slug: string;
  shop_name: string;
  cover_url: string | null;
};

/**
 * Public catalogue search used by the marketplace search box. Only published
 * products belonging to a live shop are findable.
 */
export async function searchPublicProducts(
  query: string,
  limit = 40,
): Promise<PublicProductHit[]> {
  const term = query.trim();
  if (term === "") return [];

  return await runCatalogueQuery(
    `AND (LOWER(p.name) LIKE LOWER(?) OR LOWER(p.description) LIKE LOWER(?))`,
    [`%${term}%`, `%${term}%`],
    limit,
  );
}

/** Everything on show, newest first — used by the collections page. */
export async function listPublicCatalogue(limit = 60): Promise<PublicProductHit[]> {
  return await runCatalogueQuery("", [], limit);
}

async function runCatalogueQuery(
  filter: string,
  params: string[],
  limit: number,
): Promise<PublicProductHit[]> {
  return plainRows<PublicProductHit>(
    await (await getDb())
      .prepare(
        `SELECT p.id, p.name, p.slug, p.price_kobo, p.availability,
                u.shop_slug,
                COALESCE(u.shop_name, u.business_name) AS shop_name,
                (SELECT i.url FROM product_images i
                  WHERE i.product_id = p.id ORDER BY i.position ASC LIMIT 1) AS cover_url
         FROM products p
         JOIN users u ON u.id = p.seller_id
         WHERE p.publication_status = 'published'
           AND u.shop_slug IS NOT NULL
           AND u.account_type = 'seller'
           ${filter}
         ORDER BY p.created_at DESC
         LIMIT ?`,
      )
      .all(...params, Math.min(Math.max(limit, 1), 100)),
  ).map((row) => ({ ...row, price_kobo: Number(row.price_kobo) }));
}

/**
 * Resolves a public product URL. Drafts, deleted products and shops without a
 * live slug all resolve to null — the page must not distinguish between them.
 */
export async function getPublicProduct(
  shopSlug: string,
  productSlug: string,
): Promise<PublicProduct | null> {
  const shop = await getPublicShop(shopSlug);
  if (!shop) return null;

  const row = plainRow<ProductRow>(
    await (await getDb())
      .prepare(
        `SELECT * FROM products
         WHERE seller_id = ? AND lower(slug) = lower(?) AND publication_status = 'published'`,
      )
      .get(shop.id, productSlug),
  );
  if (!row) return null;

  const withImages = (await attachImages([row]))[0];
  if (!withImages) return null;

  return { ...withImages, shop };
}

/** Case-insensitive per-seller uniqueness with -2, -3 suffixes on collision. */
export async function uniqueProductSlug(
  sellerId: string,
  name: string,
  exceptId?: string,
): Promise<string> {
  const base = normaliseProductSlug(name) || "product";
  const db = await getDb();
  const taken = async (candidate: string): Promise<boolean> => {
    const row = (await db
      .prepare("SELECT id FROM products WHERE seller_id = ? AND lower(slug) = lower(?)")
      .get(sellerId, candidate)) as { id: string } | undefined;
    return Boolean(row && row.id !== exceptId);
  };

  if (!productSlugProblem(base) && !(await taken(base))) return base;

  for (let index = 2; index < 500; index += 1) {
    const candidate = `${base.slice(0, 56)}-${index}`;
    if (!productSlugProblem(candidate) && !(await taken(candidate))) return candidate;
  }

  return `${base.slice(0, 50)}-${Math.random().toString(36).slice(2, 8)}`;
}

function validateInput(input: ProductInput): {
  name: string;
  priceKobo: number;
  description: string | null;
  availability: Availability;
  publicationStatus: PublicationStatus;
} {
  const name = requiredString(input.name, "name", "Product name", { max: 120 });

  if (!Number.isInteger(input.priceKobo) || input.priceKobo < 0) {
    throw new ValidationError([{ field: "price", message: "Enter a valid price." }]);
  }
  if (input.priceKobo > 1_000_000_000_00) {
    throw new ValidationError([{ field: "price", message: "That price looks too large." }]);
  }

  const description = input.description?.trim() || null;
  if (description && description.length > 2000) {
    throw new ValidationError([
      { field: "description", message: "Keep the description under 2000 characters." },
    ]);
  }

  const availability = input.availability ?? "available";
  if (!isAvailability(availability)) {
    throw new ValidationError([{ field: "availability", message: "Unknown availability." }]);
  }

  const publicationStatus = input.publicationStatus ?? "draft";
  if (!isPublicationStatus(publicationStatus)) {
    throw new ValidationError([{ field: "publicationStatus", message: "Unknown publication state." }]);
  }

  return { name, priceKobo: input.priceKobo, description, availability, publicationStatus };
}

export async function createProduct(
  sellerId: string,
  input: ProductInput,
): Promise<ProductWithImages> {
  const values = validateInput(input);
  const id = newId();
  const timestamp = nowIso();
  const slug = await uniqueProductSlug(sellerId, values.name);

  await (await getDb())
    .prepare(
      `INSERT INTO products (
         id, seller_id, name, slug, description, price_kobo,
         publication_status, availability, published_at, created_at, updated_at,
         discovery_salt
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      sellerId,
      values.name,
      slug,
      values.description,
      values.priceKobo,
      values.publicationStatus,
      values.availability,
      values.publicationStatus === "published" ? timestamp : null,
      timestamp,
      timestamp,
      // Random per product: product feeds are ordered by (salt + seed) % 1e6.
      Math.floor(Math.random() * 1_000_000),
    );

  const created = await getProduct(sellerId, id);
  if (!created) throw new Error("Product could not be created.");
  return created;
}

export async function updateProduct(
  sellerId: string,
  productId: string,
  input: ProductInput,
): Promise<ProductWithImages> {
  const existing = await getProduct(sellerId, productId);
  if (!existing) throw new ValidationError([{ field: "id", message: "Product not found." }]);

  const values = validateInput(input);
  const timestamp = nowIso();

  // The slug is intentionally stable across renames: product links are shared
  // on social media and must keep working.
  const publishedAt =
    values.publicationStatus === "published"
      ? (existing.published_at ?? timestamp)
      : null;

  await (await getDb())
    .prepare(
      `UPDATE products
       SET name = ?, description = ?, price_kobo = ?, availability = ?,
           publication_status = ?, published_at = ?, updated_at = ?
       WHERE id = ? AND seller_id = ?`,
    )
    .run(
      values.name,
      values.description,
      values.priceKobo,
      values.availability,
      values.publicationStatus,
      publishedAt,
      timestamp,
      productId,
      sellerId,
    );

  const updated = await getProduct(sellerId, productId);
  if (!updated) throw new Error("Product could not be updated.");
  return updated;
}

export async function setPublication(
  sellerId: string,
  productId: string,
  status: PublicationStatus,
): Promise<ProductWithImages> {
  if (!isPublicationStatus(status)) {
    throw new ValidationError([{ field: "status", message: "Unknown publication state." }]);
  }
  const existing = await getProduct(sellerId, productId);
  if (!existing) throw new ValidationError([{ field: "id", message: "Product not found." }]);

  const timestamp = nowIso();
  const publishedAt =
    status === "published" ? (existing.published_at ?? timestamp) : null;

  await (await getDb())
    .prepare(
      "UPDATE products SET publication_status = ?, published_at = ?, updated_at = ? WHERE id = ? AND seller_id = ?",
    )
    .run(status, publishedAt, timestamp, productId, sellerId);

  const updated = await getProduct(sellerId, productId);
  if (!updated) throw new Error("Product could not be updated.");
  return updated;
}

export async function setAvailability(
  sellerId: string,
  productId: string,
  availability: Availability,
): Promise<ProductWithImages> {
  if (!isAvailability(availability)) {
    throw new ValidationError([{ field: "availability", message: "Unknown availability." }]);
  }

  const result = await (await getDb())
    .prepare("UPDATE products SET availability = ?, updated_at = ? WHERE id = ? AND seller_id = ?")
    .run(availability, nowIso(), productId, sellerId);

  if (result.changes === 0) {
    throw new ValidationError([{ field: "id", message: "Product not found." }]);
  }

  const updated = await getProduct(sellerId, productId);
  if (!updated) throw new Error("Product could not be updated.");
  return updated;
}

/**
 * Deletes a product and returns the image URLs that were attached, so the caller
 * can remove the stored files as well.
 */
export async function deleteProduct(sellerId: string, productId: string): Promise<string[]> {
  const existing = await getProduct(sellerId, productId);
  if (!existing) throw new ValidationError([{ field: "id", message: "Product not found." }]);

  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.prepare("DELETE FROM product_images WHERE product_id = ? AND seller_id = ?").run(
      productId,
      sellerId,
    );
    await tx.prepare("DELETE FROM products WHERE id = ? AND seller_id = ?").run(productId, sellerId);
  });

  return existing.images.map((image) => image.url);
}

export async function addImage(
  sellerId: string,
  productId: string,
  image: { url: string; alt?: string | null; width?: number | null; height?: number | null },
): Promise<ProductImage> {
  const product = await getProduct(sellerId, productId);
  if (!product) throw new ValidationError([{ field: "id", message: "Product not found." }]);
  if (product.images.length >= MAX_PRODUCT_IMAGES) {
    throw new ValidationError([
      { field: "images", message: `A product can have up to ${MAX_PRODUCT_IMAGES} photos.` },
    ]);
  }
  if (!image.url.startsWith("/media/") && !/^https?:\/\//.test(image.url)) {
    throw new ValidationError([{ field: "images", message: "That image location is not allowed." }]);
  }

  const id = newId();
  const nextPosition =
    product.images.reduce((max, entry) => Math.max(max, entry.position), -1) + 1;

  await (await getDb())
    .prepare(
      `INSERT INTO product_images (id, product_id, seller_id, url, alt, position, width, height, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      productId,
      sellerId,
      image.url,
      image.alt?.trim() || null,
      nextPosition,
      image.width ?? null,
      image.height ?? null,
      nowIso(),
    );

  const created = plainRow<ProductImage>(
    await (await getDb()).prepare("SELECT * FROM product_images WHERE id = ? AND seller_id = ?").get(id, sellerId),
  );
  if (!created) throw new Error("Image could not be saved.");
  return created;
}

/** Removes one image; returns its URL so the caller can delete the file. */
export async function removeImage(
  sellerId: string,
  imageId: string,
): Promise<{ url: string; productId: string }> {
  const row = plainRow<ProductImage & { product_id: string }>(
    await (await getDb())
      .prepare("SELECT * FROM product_images WHERE id = ? AND seller_id = ?")
      .get(imageId, sellerId),
  );
  if (!row) throw new ValidationError([{ field: "image", message: "Image not found." }]);

  await (await getDb())
    .prepare("DELETE FROM product_images WHERE id = ? AND seller_id = ?")
    .run(imageId, sellerId);
  return { url: row.url, productId: row.product_id };
}

/** Promotes an image to cover (position 0) and pushes the rest down. */
export async function setCoverImage(
  sellerId: string,
  productId: string,
  imageId: string,
): Promise<void> {
  const product = await getProduct(sellerId, productId);
  if (!product) throw new ValidationError([{ field: "id", message: "Product not found." }]);

  const image = product.images.find((entry) => entry.id === imageId);
  if (!image) throw new ValidationError([{ field: "image", message: "Image not found." }]);

  const db = await getDb();
  await db.transaction(async (tx) => {
    const reorder = tx.prepare(
      "UPDATE product_images SET position = ? WHERE id = ? AND seller_id = ?",
    );
    let position = 1;
    for (const entry of product.images) {
      if (entry.id === imageId) continue;
      await reorder.run(position, entry.id, sellerId);
      position += 1;
    }
    await reorder.run(0, imageId, sellerId);
    await tx
      .prepare("UPDATE products SET updated_at = ? WHERE id = ? AND seller_id = ?")
      .run(nowIso(), productId, sellerId);
  });
}

export type ProductStats = {
  total: number;
  published: number;
  drafts: number;
  outOfStock: number;
};

export async function productStats(sellerId: string): Promise<ProductStats> {
  const row = (await (await getDb())
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN publication_status = 'published' THEN 1 ELSE 0 END) AS published,
         SUM(CASE WHEN publication_status = 'draft' THEN 1 ELSE 0 END) AS drafts,
         SUM(CASE WHEN availability = 'out_of_stock' THEN 1 ELSE 0 END) AS out_of_stock
       FROM products WHERE seller_id = ?`,
    )
    .get(sellerId)) as unknown as {
    total: number | null;
    published: number | null;
    drafts: number | null;
    out_of_stock: number | null;
  };

  return {
    total: Number(row?.total ?? 0),
    published: Number(row?.published ?? 0),
    drafts: Number(row?.drafts ?? 0),
    outOfStock: Number(row?.out_of_stock ?? 0),
  };
}
