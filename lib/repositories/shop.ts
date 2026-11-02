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

export function getShopProfile(sellerId: string): ShopProfile | null {
  const row = getDb()
    .prepare(`SELECT ${SHOP_COLUMNS} FROM users WHERE id = ?`)
    .get(sellerId);
  return plainRow<ShopProfile>(row);
}

/** Case-insensitive slug lookup for the public storefront. */
export function getPublicShop(slug: string): PublicShop | null {
  const row = getDb()
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
export function listPublicShops(options: { query?: string; limit?: number } = {}): MarketplaceShop[] {
  const limit = Math.min(Math.max(options.limit ?? 60, 1), 100);
  const query = options.query?.trim() || null;

  return plainRows<MarketplaceShop>(
    getDb()
      .prepare(
        `SELECT ${PUBLIC_SHOP_COLUMNS},
                (SELECT COUNT(*) FROM products p
                  WHERE p.seller_id = users.id AND p.publication_status = 'published') AS product_count
         FROM users
         WHERE shop_slug IS NOT NULL
           AND account_type = 'seller'
           AND (? IS NULL OR shop_name LIKE ? OR business_name LIKE ? OR shop_description LIKE ?)
         ORDER BY product_count DESC, shop_name ASC
         LIMIT ?`,
      )
      .all(
        query,
        `%${query ?? ""}%`,
        `%${query ?? ""}%`,
        `%${query ?? ""}%`,
        limit,
      ),
  ).filter((shop) => shop.product_count > 0);
}

export type SlugRedirect = { seller_id: string; current_slug: string };

/** Resolves a retired slug to the seller's current one so old links keep working. */
export function resolveRetiredSlug(slug: string): SlugRedirect | null {
  const row = getDb()
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
export function isSlugTaken(slug: string, exceptSellerId?: string): boolean {
  const normalised = normaliseSlug(slug);
  const db = getDb();

  const live = db
    .prepare(`SELECT id FROM users WHERE shop_slug IS NOT NULL AND lower(shop_slug) = lower(?)`)
    .get(normalised) as { id: string } | undefined;
  if (live && live.id !== exceptSellerId) return true;

  const historical = db
    .prepare(`SELECT seller_id FROM shop_slug_history WHERE lower(old_slug) = lower(?)`)
    .get(normalised) as { seller_id: string } | undefined;
  if (historical && historical.seller_id !== exceptSellerId) return true;

  // A seller may not reclaim a slug they retired themselves either — it would
  // make old links ambiguous.
  return Boolean(historical);
}

/**
 * Returns a free slug derived from `base`, appending -2, -3 ... when needed.
 * Used for automatic assignment at sign-up and for backfilling older accounts.
 */
export function allocateSlug(base: string, exceptSellerId?: string): string {
  const root = normaliseSlug(base) || "shop";
  const candidateRoot = root.length < 3 ? `${root}-shop` : root;

  if (!slugProblem(candidateRoot) && !isSlugTaken(candidateRoot, exceptSellerId)) {
    return candidateRoot;
  }

  for (let index = 2; index < 500; index += 1) {
    const candidate = `${candidateRoot.slice(0, 36)}-${index}`.replace(/-+$/g, "");
    if (!slugProblem(candidate) && !isSlugTaken(candidate, exceptSellerId)) {
      return candidate;
    }
  }

  // Extremely unlikely: fall back to a random suffix.
  const random = Math.random().toString(36).slice(2, 8);
  return `${candidateRoot.slice(0, 30)}-${random}`;
}

/** Assigns a slug to every seller that does not have one yet (idempotent). */
export function ensureShopSlugs(): number {
  const db = getDb();
  const missing = db
    .prepare(
      `SELECT id, business_name FROM users
       WHERE account_type = 'seller' AND (shop_slug IS NULL OR shop_slug = '')`,
    )
    .all() as unknown as { id: string; business_name: string }[];

  let assigned = 0;
  for (const seller of missing) {
    const slug = allocateSlug(seller.business_name || "shop");
    // Guard against a race with another request: only fill when still empty.
    const result = db
      .prepare("UPDATE users SET shop_slug = ?, updated_at = ? WHERE id = ? AND (shop_slug IS NULL OR shop_slug = '')")
      .run(slug, nowIso(), seller.id);
    if (result.changes > 0) assigned += 1;
  }
  return assigned;
}

/** Called at sign-up so a new seller has a working shop link immediately. */
export function assignInitialSlug(sellerId: string, businessName: string): string {
  const slug = allocateSlug(businessName || "shop", sellerId);
  getDb()
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

export function updateShopProfile(sellerId: string, input: ShopProfileInput): ShopProfile {
  getDb()
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

  const updated = getShopProfile(sellerId);
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
export function changeShopSlug(sellerId: string, rawSlug: string): SlugChangeResult {
  const profile = getShopProfile(sellerId);
  if (!profile) throw new ValidationError([{ field: "shop", message: "Shop not found." }]);

  const slug = normaliseSlug(rawSlug);

  const problem = slugProblem(slug);
  if (problem) {
    throw new ValidationError([{ field: "slug", message: problem.message }]);
  }

  if (profile.shop_slug && slug === profile.shop_slug) {
    return { slug, previousSlug: profile.shop_slug };
  }

  if (isSlugTaken(slug, sellerId)) {
    const suggestions = slugSuggestions(slug)
      .filter((candidate) => !isSlugTaken(candidate))
      .join(", ");
    throw new ValidationError([
      {
        field: "slug",
        message: suggestions
          ? `“${slug}” is already taken. Try ${suggestions}.`
          : `“${slug}” is already taken. Try another link.`,
      },
    ]);
  }

  const cooldown = slugChangeCooldown(sellerId);
  if (!cooldown.canChange) {
    throw new ValidationError([
      {
        field: "slug",
        message: `Your link was changed recently. You can change it again after ${cooldown.nextAllowedAt}.`,
      },
    ]);
  }

  const db = getDb();
  const timestamp = nowIso();

  db.exec("BEGIN");
  try {
    if (profile.shop_slug) {
      db.prepare("INSERT INTO shop_slug_history (old_slug, seller_id, created_at) VALUES (?, ?, ?)").run(
        profile.shop_slug,
        sellerId,
        timestamp,
      );
    }
    db.prepare(
      "UPDATE users SET shop_slug = ?, shop_slug_changed_at = ?, updated_at = ? WHERE id = ?",
    ).run(slug, timestamp, timestamp, sellerId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    const message = (error as Error).message ?? "";
    if (/unique/i.test(message)) {
      throw new ValidationError([{ field: "slug", message: `“${slug}” is already taken.` }]);
    }
    throw error;
  }

  return { slug, previousSlug: profile.shop_slug };
}

export type SlugCooldown = { canChange: boolean; nextAllowedAt: string | null };

export function slugChangeCooldown(sellerId: string): SlugCooldown {
  const row = getDb()
    .prepare("SELECT shop_slug_changed_at FROM users WHERE id = ?")
    .get(sellerId) as { shop_slug_changed_at: string | null } | undefined;

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
export function clearSlugCooldown(sellerId: string): void {
  getDb().prepare("UPDATE users SET shop_slug_changed_at = NULL WHERE id = ?").run(sellerId);
}

export type SlugHistoryEntry = { old_slug: string; created_at: string };

/** Retired slugs, newest first — shown on My Shop so redirects are visible. */
export function listSlugHistory(sellerId: string): SlugHistoryEntry[] {
  const rows = getDb()
    .prepare(
      "SELECT old_slug, created_at FROM shop_slug_history WHERE seller_id = ? ORDER BY created_at DESC",
    )
    .all(sellerId);
  return plainRows<SlugHistoryEntry>(rows);
}
