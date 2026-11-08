import { getDb, plainRows } from "../db";
import {
  buildAffinity,
  normalised,
  priceBand,
  recentActivity,
  type Affinity,
} from "./activity";

/**
 * Product discovery, ranking and recommendations.
 *
 * The feed is deliberately **not** chronological. Every product carries a stable
 * random `discovery_salt`; ordering by `(discovery_salt + seed) % 1000000` gives a
 * different arrangement for every visit while staying stable across pages of the
 * same visit (the caller keeps the seed). That is a cheap integer sort the
 * database can do with an index, unlike `ORDER BY RANDOM()` which re-sorts and
 * cannot paginate consistently.
 *
 * Fairness is applied on top: at most `maxPerSeller` products from one seller per
 * page, filled from a wider candidate window. Personalised ranking blends shop
 * affinity, price-band affinity, popularity and recency, but always reserves room
 * for discovery so a customer is never trapped in one bubble.
 */

export type DiscoveryProduct = {
  id: string;
  name: string;
  slug: string;
  price_kobo: number;
  availability: string;
  shop_slug: string;
  shop_name: string;
  seller_id: string;
  cover_url: string | null;
  created_at: string;
  views: number;
};

const COLUMNS = `
  p.id, p.name, p.slug, p.price_kobo, p.availability, p.created_at,
  u.id AS seller_id, u.shop_slug,
  COALESCE(u.shop_name, u.business_name) AS shop_name,
  (SELECT i.url FROM product_images i
    WHERE i.product_id = p.id ORDER BY i.position ASC LIMIT 1) AS cover_url,
  (SELECT COUNT(*) FROM product_views v
    WHERE v.product_id = p.id AND v.created_at >= ?) AS views
`;

const LIVE_FILTER = `
  p.publication_status = 'published'
  AND p.availability = 'available'
  AND u.shop_slug IS NOT NULL
  AND u.account_type = 'seller'
`;

function normaliseSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 1;
  // Kept below 10,000 so `seed * 104729` stays inside a 32-bit integer: Postgres
  // would overflow `integer * integer` otherwise.
  return Math.abs(Math.trunc(seed)) % 10_000;
}

function toProduct(row: Record<string, unknown>): DiscoveryProduct {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    price_kobo: Number(row.price_kobo),
    availability: String(row.availability),
    shop_slug: String(row.shop_slug),
    shop_name: String(row.shop_name),
    seller_id: String(row.seller_id),
    cover_url: (row.cover_url as string | null) ?? null,
    created_at: String(row.created_at),
    views: Number(row.views ?? 0),
  };
}

/** Caps how many products one seller may occupy in a page. */
export function applySellerCap(
  products: DiscoveryProduct[],
  limit: number,
  maxPerSeller = 2,
): DiscoveryProduct[] {
  const perSeller = new Map<string, number>();
  const chosen: DiscoveryProduct[] = [];
  const overflow: DiscoveryProduct[] = [];

  for (const product of products) {
    const count = perSeller.get(product.seller_id) ?? 0;
    if (count < maxPerSeller) {
      perSeller.set(product.seller_id, count + 1);
      chosen.push(product);
    } else {
      overflow.push(product);
    }
    if (chosen.length >= limit) return chosen;
  }

  // If the cap left the page short (few sellers), fill from the overflow.
  for (const product of overflow) {
    if (chosen.length >= limit) break;
    chosen.push(product);
  }

  return chosen;
}

export type DiscoveryOptions = {
  seed: number;
  limit?: number;
  offset?: number;
  maxPerSeller?: number;
  /** Shops to exclude (e.g. the one being viewed). */
  excludeSellerId?: string | null;
};

/** The general discovery feed: randomised, seller-capped, paginated. */
export async function discoverProducts(options: DiscoveryOptions): Promise<DiscoveryProduct[]> {
  const limit = Math.min(Math.max(options.limit ?? 24, 1), 60);
  const offset = Math.max(options.offset ?? 0, 0);
  const seed = normaliseSeed(options.seed);
  // Fetch the whole prefix up to this page, apply the fairness cap to that prefix
  // and then slice the page. Capping per page instead would let pages overlap.
  const window = Math.min(offset + limit * 3, 240);
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const perSeller = Math.max(options.maxPerSeller ?? 2, 1);
  const sellerFilter = options.excludeSellerId ? "AND u.id <> ?" : "";
  const params: (string | number)[] = [since];
  if (options.excludeSellerId) params.push(options.excludeSellerId);
  params.push(seed, window);

  const rows = await (await getDb()).prepare(
    `SELECT ${COLUMNS}
       FROM products p
       JOIN users u ON u.id = p.seller_id
      WHERE ${LIVE_FILTER}
        ${sellerFilter}
      ORDER BY ((p.discovery_salt + (? * 104729)) % 1000000) ASC, p.id ASC
      LIMIT ?`,
  ).all(...params);

  const capped = applySellerCap(plainRows<Record<string, unknown>>(rows).map(toProduct), window, perSeller);
  return capped.slice(offset, offset + limit);
}

/** Newest products, still rotated within the same day so positions vary. */
export async function newArrivals(limit = 8, seed = 1): Promise<DiscoveryProduct[]> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const rows = await (await getDb()).prepare(
    `SELECT ${COLUMNS}
       FROM products p
       JOIN users u ON u.id = p.seller_id
      WHERE ${LIVE_FILTER}
      ORDER BY p.created_at DESC, ((p.discovery_salt + ?) % 1000) ASC
      LIMIT ?`,
  ).all(since, normaliseSeed(seed), Math.min(Math.max(limit, 1), 40));

  return plainRows<Record<string, unknown>>(rows).map(toProduct);
}

/** Most-viewed products in the last 30 days, with a random tiebreak. */
export async function popularProducts(limit = 8, seed = 1): Promise<DiscoveryProduct[]> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const rows = await (await getDb()).prepare(
    `SELECT ${COLUMNS}
       FROM products p
       JOIN users u ON u.id = p.seller_id
      WHERE ${LIVE_FILTER}
      ORDER BY views DESC, ((p.discovery_salt + ?) % 1000) ASC
      LIMIT ?`,
  ).all(since, normaliseSeed(seed), Math.min(Math.max(limit, 1), 40));

  return plainRows<Record<string, unknown>>(rows).map(toProduct).filter((product) => product.views > 0);
}

async function priceMapFor(productIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (productIds.length === 0) return map;

  const placeholders = productIds.map(() => "?").join(", ");
  const rows = await (await getDb()).prepare(
    `SELECT id, price_kobo FROM products WHERE id IN (${placeholders})`,
  ).all(...productIds);

  for (const row of rows as { id: string; price_kobo: number }[]) {
    map.set(String(row.id), Number(row.price_kobo));
  }
  return map;
}

/** Scores a candidate for one customer. Higher is better. */
export function scoreProduct(
  product: DiscoveryProduct,
  affinity: Affinity,
  stats: { maxViews: number; newestMs: number; oldestMs: number },
  jitter: number,
): number {
  const shopScore = normalised(affinity, product.seller_id);
  const bandScore = (() => {
    const max = Math.max(1, ...affinity.bands.values());
    return (affinity.bands.get(priceBand(product.price_kobo)) ?? 0) / max;
  })();

  const viewsScore = stats.maxViews > 0 ? Math.log1p(product.views) / Math.log1p(stats.maxViews) : 0;
  const created = new Date(product.created_at).getTime();
  const freshness =
    stats.newestMs > stats.oldestMs
      ? (created - stats.oldestMs) / (stats.newestMs - stats.oldestMs)
      : 0;

  // Weights are intentionally shop-heavy: a customer browsing handbags should see
  // bags from other shops, not just more of the same shop.
  return shopScore * 60 + bandScore * 30 + viewsScore * 15 + freshness * 10 + jitter * 12;
}

export type RecommendationResult = {
  products: DiscoveryProduct[];
  personalised: boolean;
  reason: "personalised" | "discovery";
};

/**
 * Personalised feed for a signed-in customer, blended with exploration.
 *
 * Around 70% of the slots come from the customer's strongest shops and price
 * bands, the rest from the general randomised feed so new sellers stay visible.
 */
export async function recommendedProducts(
  userId: string | null,
  options: { seed: number; limit?: number },
): Promise<RecommendationResult> {
  const limit = Math.min(Math.max(options.limit ?? 12, 1), 48);

  const fallback = async (): Promise<RecommendationResult> => ({
    products: await discoverProducts({ seed: options.seed, limit }),
    personalised: false,
    reason: "discovery",
  });

  if (!userId) return fallback();

  const rows = await recentActivity(userId);
  if (rows.length === 0) return fallback();

  const viewedIds = [...new Set(rows.map((row) => row.product_id).filter((id): id is string => Boolean(id)))].slice(0, 100);
  const prices = await priceMapFor(viewedIds);
  const affinity = buildAffinity(rows, prices);

  if (!affinity.hasSignal) return fallback();

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const topShops = [...affinity.shops.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([shopId]) => shopId);

  const shopPlaceholders = topShops.map(() => "?").join(", ");
  const candidateRows = await (await getDb()).prepare(
    `SELECT ${COLUMNS}
       FROM products p
       JOIN users u ON u.id = p.seller_id
      WHERE ${LIVE_FILTER}
        ${topShops.length > 0 ? `AND u.id IN (${shopPlaceholders})` : ""}
      ORDER BY p.created_at DESC
      LIMIT 200`,
  ).all(since, ...topShops);

  const candidates = plainRows<Record<string, unknown>>(candidateRows)
    .map(toProduct)
    .filter((product) => !affinity.purchased.has(product.id));

  if (candidates.length === 0) return fallback();

  const maxViews = Math.max(1, ...candidates.map((product) => product.views));
  const times = candidates.map((product) => new Date(product.created_at).getTime());
  const stats = { maxViews, newestMs: Math.max(...times), oldestMs: Math.min(...times) };
  const seed = normaliseSeed(options.seed);

  const scored = candidates
    .map((product) => {
      // Deterministic jitter from the product id and the seed: stable within one
      // visit (so pagination and refreshes agree) but different between visits.
      const digest = simpleHash(`${product.id}:${seed}`);
      const jitter = (digest % 1000) / 1000;
      return { product, score: scoreProduct(product, affinity, stats, jitter) };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.product);

  const personalisedSlots = Math.max(1, Math.round(limit * 0.7));
  const chosen = applySellerCap(scored, personalisedSlots, 2);

  if (chosen.length < limit) {
    const seen = new Set(chosen.map((product) => product.id));
    const exploration = (await discoverProducts({ seed: seed + 7, limit: limit * 2 }))
      .filter((product) => !seen.has(product.id) && !affinity.purchased.has(product.id))
      .slice(0, limit - chosen.length);
    chosen.push(...exploration);
  }

  return { products: chosen.slice(0, limit), personalised: true, reason: "personalised" };
}

/** Products related to one the customer is looking at: same shop or price band. */
export async function relatedProducts(
  productId: string,
  options: { seed: number; limit?: number },
): Promise<DiscoveryProduct[]> {
  const limit = Math.min(Math.max(options.limit ?? 8, 1), 24);
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const current = await (await getDb()).prepare(
    "SELECT id, seller_id, price_kobo FROM products WHERE id = ?",
  ).get(productId);

  if (!current) return [];

  const row = current as { id: string; seller_id: string; price_kobo: number };
  const band = priceBand(Number(row.price_kobo));

  const rows = await (await getDb()).prepare(
    `SELECT ${COLUMNS}
       FROM products p
       JOIN users u ON u.id = p.seller_id
      WHERE ${LIVE_FILTER}
        AND p.id <> ?
        AND (u.id = ? OR (p.price_kobo >= ? AND p.price_kobo < ?))
      ORDER BY ((p.discovery_salt + ?) % 1000) ASC
      LIMIT ?`,
  ).all(since, productId, row.seller_id, bandFloor(band), bandCeiling(band), normaliseSeed(options.seed), limit * 2);

  return applySellerCap(plainRows<Record<string, unknown>>(rows).map(toProduct), limit, 2);
}

function bandFloor(band: string): number {
  switch (band) {
    case "under-10k": return 0;
    case "10k-25k": return 1_000_000;
    case "25k-50k": return 2_500_000;
    case "50k-100k": return 5_000_000;
    default: return 10_000_000;
  }
}

function bandCeiling(band: string): number {
  switch (band) {
    case "under-10k": return 1_000_000;
    case "10k-25k": return 2_500_000;
    case "25k-50k": return 5_000_000;
    case "50k-100k": return 10_000_000;
    default: return Number.MAX_SAFE_INTEGER;
  }
}

/** Small stable hash (FNV-1a) — used for reproducible jitter. */
export function simpleHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

/** Seed for one visit. Kept in the URL by callers so pagination stays consistent. */
export function newSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}