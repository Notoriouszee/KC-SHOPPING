import { getDb, nowIso, plainRow, plainRows } from "../db";
import { normaliseSlug, slugProblem, slugSuggestions } from "../domain/slug";
import type { MarketplaceShop, PublicShop, ShopProfile } from "../domain/types";
import { ValidationError } from "../domain/validation";

/** How long a seller must wait between shop-link changes. */
export const SLUG_CHANGE_COOLDOWN_HOURS = 24;

const SHOP_COLUMNS = `id, shop_slug, shop_name, shop_description, shop_logo_url,
  shop_contact_phone, shop_slug_changed_at, business_name,
  shop_bank_name, shop_account_name, shop_account_number,
  shop_delivery_fee_kobo, shop_delivery_note`;

const PUBLIC_SHOP_COLUMNS = `id, shop_slug, COALESCE(shop_name, business_name) AS shop_name,
  shop_description, shop_logo_url, shop_contact_phone,
  shop_bank_name, shop_account_name, shop_account_number,
  shop_delivery_fee_kobo, shop_delivery_note`;

export async function getShopProfile(sellerId: string): Promise<ShopProfile | null> {
  const row = await (await getDb())
    .prepare(`SELECT ${SHOP_COLUMNS} FROM users WHERE id = ?`)
    .get(sellerId);
  return plainRow<ShopProfile>(row);
}

/** Case-insensitive slug lookup for the public storefront. */
export async function getPublicShop(slug: string): Promise<PublicShop | null> {
  const row = await (await getDb())
    .prepare(
      `SELECT ${PUBLIC_SHOP_COLUMNS}
       FROM users
       WHERE shop_slug IS NOT NULL AND lower(shop_slug) = lower(?)`,
    )
    .get(slug);
  return plainRow<PublicShop>(row);
}

/**
 * Shops listed on the public marketplace. Only sellers with a live slug and at
 * least one published product are worth showing, so the page never advertises an
 * empty shop.
 */
export async function listPublicShops(
  options: { query?: string; limit?: number } = {},
): Promise<MarketplaceShop[]> {
  const limit = Math.min(Math.max(options.limit ?? 60, 1), 100);
  const query = options.query?.trim() || null;

  // The search clause is built conditionally: `? IS NULL` cannot be typed by
  // Postgres, and building the predicate keeps one query for both backends.
  const searchClause = query
    ? `AND (LOWER(shop_name) LIKE LOWER(?)
            OR LOWER(business_name) LIKE LOWER(?)
            OR LOWER(shop_description) LIKE LOWER(?))`
    : "";

  const params: (string | number)[] = query
    ? [`%${query}%`, `%${query}%`, `%${query}%`, limit]
    : [limit];

  return plainRows<MarketplaceShop>(
    await (await getDb())
      .prepare(
        `SELECT ${PUBLIC_SHOP_COLUMNS},
                (SELECT COUNT(*) FROM products p
                  WHERE p.seller_id = users.id AND p.publication_status = 'published') AS product_count
         FROM users
         WHERE shop_slug IS NOT NULL
           AND account_type = 'seller'
           ${searchClause}
         ORDER BY product_count DESC, shop_name ASC
         LIMIT ?`,
      )
      .all(...params),
  ).filter((shop) => shop.product_count > 0);
}

export type SlugRedirect = { seller_id: string; current_slug: string };

/** Resolves a retired slug to the seller's current one so old links keep working. */
export async function resolveRetiredSlug(slug: string): Promise<SlugRedirect | null> {
  const row = await (await getDb())
    .prepare(
      `SELECT h.seller_id AS seller_id, u.shop_slug AS current_slug
       FROM shop_slug_history h
       JOIN users u ON u.id = h.seller_id
       WHERE lower(h.old_slug) = lower(?) AND u.shop_slug IS NOT NULL`,
    )
    .get(slug);
  return plainRow<SlugRedirect>(row);
}

/** A slug is taken if it is live for someone else or was ever used before. */
export async function isSlugTaken(slug: string, exceptSellerId?: string): Promise<boolean> {
  const normalised = normaliseSlug(slug);
  const db = await getDb();

  const live = await db
    .prepare(`SELECT id FROM users WHERE shop_slug IS NOT NULL AND lower(shop_slug) = lower(?)`)
    .get<{ id: string }>(normalised);
  if (live && live.id !== exceptSellerId) return true;

  const historical = await db
    .prepare(`SELECT seller_id FROM shop_slug_history WHERE lower(old_slug) = lower(?)`)
    .get<{ seller_id: string }>(normalised);
  if (historical && historical.seller_id !== exceptSellerId) return true;

  // A seller may not reclaim a slug they retired themselves either — it would
  // make old links ambiguous.
  return Boolean(historical);
}

/**
 * Returns a free slug derived from `base`, appending -2, -3 ... when needed.
 * Used for automatic assignment at sign-up and for backfilling older accounts.
 */
export async function allocateSlug(base: string, exceptSellerId?: string): Promise<string> {
  const root = normaliseSlug(base) || "shop";
  const candidateRoot = root.length < 3 ? `${root}-shop` : root;

  if (!slugProblem(candidateRoot) && !(await isSlugTaken(candidateRoot, exceptSellerId))) {
    return candidateRoot;
  }

  for (let index = 2; index < 500; index += 1) {
    const candidate = `${candidateRoot.slice(0, 36)}-${index}`.replace(/-+$/g, "");
    if (!slugProblem(candidate) && !(await isSlugTaken(candidate, exceptSellerId))) {
      return candidate;
    }
  }

  // Extremely unlikely: fall back to a random suffix.
  const random = Math.random().toString(36).slice(2, 8);
  return `${candidateRoot.slice(0, 30)}-${random}`;
}

/** Assigns a slug to every seller that does not have one yet (idempotent). */
export async function ensureShopSlugs(): Promise<number> {
  const db = await getDb();
  const missing = await db
    .prepare(
      `SELECT id, business_name FROM users
       WHERE account_type = 'seller' AND (shop_slug IS NULL OR shop_slug = '')`,
    )
    .all<{ id: string; business_name: string }>();

  let assigned = 0;
  for (const seller of missing) {
    const slug = await allocateSlug(seller.business_name || "shop");
    // Guard against a race with another request: only fill when still empty.
    const result = await db
      .prepare("UPDATE users SET shop_slug = ?, updated_at = ? WHERE id = ? AND (shop_slug IS NULL OR shop_slug = '')")
      .run(slug, nowIso(), seller.id);
    if (result.changes > 0) assigned += 1;
  }
  return assigned;
}

/** Called at sign-up so a new seller has a working shop link immediately. */
export async function assignInitialSlug(sellerId: string, businessName: string): Promise<string> {
  const slug = await allocateSlug(businessName || "shop", sellerId);
  await (await getDb())
    .prepare("UPDATE users SET shop_slug = ?, updated_at = ? WHERE id = ?")
    .run(slug, nowIso(), sellerId);
  return slug;
}

export type ShopProfileInput = {
  shopName: string;
  description?: string | null;
  logoUrl?: string | null;
  contactPhone?: string | null;
  bankName?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  deliveryFeeKobo?: number;
  deliveryNote?: string | null;
};

export async function updateShopProfile(
  sellerId: string,
  input: ShopProfileInput,
): Promise<ShopProfile> {
  await (await getDb())
    .prepare(
      `UPDATE users
       SET shop_name = ?, shop_description = ?, shop_logo_url = ?, shop_contact_phone = ?,
           shop_bank_name = ?, shop_account_name = ?, shop_account_number = ?,
           shop_delivery_fee_kobo = ?, shop_delivery_note = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      input.shopName,
      input.description?.trim() || null,
      input.logoUrl?.trim() || null,
      input.contactPhone?.trim() || null,
      input.bankName?.trim() || null,
      input.accountName?.trim() || null,
      input.accountNumber?.trim() || null,
      Math.max(0, Math.trunc(input.deliveryFeeKobo ?? 0)),
      input.deliveryNote?.trim() || null,
      nowIso(),
      sellerId,
    );

  const updated = await getShopProfile(sellerId);
  if (!updated) throw new ValidationError([{ field: "shop", message: "Shop not found." }]);
  return updated;
}

export type SlugChangeResult = {
  slug: string;
  previousSlug: string | null;
};

/**
 * Controlled slug change: validated, unique, rate-limited, and recorded so the
 * previous link keeps redirecting instead of breaking.
 */
export async function changeShopSlug(sellerId: string, rawSlug: string): Promise<SlugChangeResult> {
  const profile = await getShopProfile(sellerId);
  if (!profile) throw new ValidationError([{ field: "shop", message: "Shop not found." }]);

  const slug = normaliseSlug(rawSlug);

  const problem = slugProblem(slug);
  if (problem) {
    throw new ValidationError([{ field: "slug", message: problem.message }]);
  }

  if (profile.shop_slug && slug === profile.shop_slug) {
    return { slug, previousSlug: profile.shop_slug };
  }

  if (await isSlugTaken(slug, sellerId)) {
    const free: string[] = [];
    for (const candidate of slugSuggestions(slug)) {
      if (!(await isSlugTaken(candidate))) free.push(candidate);
    }
    const suggestions = free.join(", ");
    throw new ValidationError([
      {
        field: "slug",
        message: suggestions
          ? `“${slug}” is already taken. Try ${suggestions}.`
          : `“${slug}” is already taken. Try another link.`,
      },
    ]);
  }

  const cooldown = await slugChangeCooldown(sellerId);
  if (!cooldown.canChange) {
    throw new ValidationError([
      {
        field: "slug",
        message: `Your link was changed recently. You can change it again after ${cooldown.nextAllowedAt}.`,
      },
    ]);
  }

  const db = await getDb();
  const timestamp = nowIso();

  try {
    await db.transaction(async (tx) => {
      if (profile.shop_slug) {
        await tx
          .prepare("INSERT INTO shop_slug_history (old_slug, seller_id, created_at) VALUES (?, ?, ?)")
          .run(profile.shop_slug, sellerId, timestamp);
      }
      await tx
        .prepare(
          "UPDATE users SET shop_slug = ?, shop_slug_changed_at = ?, updated_at = ? WHERE id = ?",
        )
        .run(slug, timestamp, timestamp, sellerId);
    });
  } catch (error) {
    const message = (error as Error).message ?? "";
    if (/unique/i.test(message)) {
      throw new ValidationError([{ field: "slug", message: `“${slug}” is already taken.` }]);
    }
    throw error;
  }

  return { slug, previousSlug: profile.shop_slug };
}

export type SlugCooldown = { canChange: boolean; nextAllowedAt: string | null };

export async function slugChangeCooldown(sellerId: string): Promise<SlugCooldown> {
  const row = await (await getDb())
    .prepare("SELECT shop_slug_changed_at FROM users WHERE id = ?")
    .get<{ shop_slug_changed_at: string | null }>(sellerId);

  const last = row?.shop_slug_changed_at;
  if (!last) return { canChange: true, nextAllowedAt: null };

  const availableAt = new Date(new Date(last).getTime() + SLUG_CHANGE_COOLDOWN_HOURS * 60 * 60 * 1000);
  if (Date.now() >= availableAt.getTime()) return { canChange: true, nextAllowedAt: null };

  return {
    canChange: false,
    nextAllowedAt: availableAt.toISOString(),
  };
}

/** Admin/demo helper: removes the cooldown for a seller. */
export async function clearSlugCooldown(sellerId: string): Promise<void> {
  await (await getDb()).prepare("UPDATE users SET shop_slug_changed_at = NULL WHERE id = ?").run(sellerId);
}

export type SlugHistoryEntry = { old_slug: string; created_at: string };

/** Retired slugs, newest first — shown on My Shop so redirects are visible. */
export async function listSlugHistory(sellerId: string): Promise<SlugHistoryEntry[]> {
  const rows = await (await getDb())
    .prepare(
      "SELECT old_slug, created_at FROM shop_slug_history WHERE seller_id = ? ORDER BY created_at DESC",
    )
    .all(sellerId);
  return plainRows<SlugHistoryEntry>(rows);
}
