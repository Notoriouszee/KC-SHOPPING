import { getDb, nowIso } from "../db";
import { newId } from "../domain/ids";

/**
 * Customer activity, used by the recommender.
 *
 * Only three signals are stored — a view, a search, a purchase — each tied to a
 * product, a shop and a timestamp. No IP address, device, or free text other than
 * the search term the customer typed. Anonymous visitors are not tracked at all.
 */

export type ActivityKind = "view" | "search" | "purchase";

/** Starting weights from the brief. Purchases dominate; views are weak evidence. */
export const ACTIVITY_WEIGHTS: Record<ActivityKind, number> = {
  purchase: 10,
  view: 2,
  search: 3,
};

/** Activity older than this stops influencing recommendations. */
export const ACTIVITY_WINDOW_DAYS = 90;

/** Half-life of an activity's influence, in days. */
const DECAY_HALF_LIFE_DAYS = 21;

export function activityWeight(kind: ActivityKind): number {
  return ACTIVITY_WEIGHTS[kind];
}

/** Exponential decay: today counts fully, a month ago counts roughly half. */
export function decayFactor(ageDays: number): number {
  if (!Number.isFinite(ageDays) || ageDays <= 0) return 1;
  return Math.pow(0.5, ageDays / DECAY_HALF_LIFE_DAYS);
}

export async function recordActivity(input: {
  userId: string;
  kind: ActivityKind;
  productId?: string | null;
  shopId?: string | null;
  term?: string | null;
}): Promise<void> {
  if (!input.userId) return;

  try {
    const db = await getDb();

    // A refresh of the results page must not count as a new search.
    if (input.kind === "search" && input.term) {
      const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const duplicate = await db.prepare(
        `SELECT 1 AS seen FROM customer_activity
          WHERE user_id = ? AND kind = 'search' AND term = ? AND created_at >= ?
          LIMIT 1`,
      ).get(input.userId, input.term.slice(0, 80), cutoff);
      if (duplicate) return;
    }

    await db.prepare(
      `INSERT INTO customer_activity (id, user_id, product_id, shop_id, kind, weight, term, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newId(),
      input.userId,
      input.productId ?? null,
      input.shopId ?? null,
      input.kind,
      activityWeight(input.kind),
      input.term ? input.term.slice(0, 80) : null,
      nowIso(),
    );
  } catch (error) {
    // Personalisation must never break a page render or an order.
    console.error("[activity] could not record:", error);
  }
}

export type ActivityRow = {
  kind: ActivityKind;
  product_id: string | null;
  shop_id: string | null;
  weight: number;
  term: string | null;
  created_at: string;
};

export async function recentActivity(userId: string, limit = 400): Promise<ActivityRow[]> {
  const db = await getDb();
  const cutoff = new Date(
    Date.now() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  return (await db.prepare(
    `SELECT kind, product_id, shop_id, weight, term, created_at
       FROM customer_activity
      WHERE user_id = ? AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT ?`,
  ).all(userId, cutoff, Math.min(Math.max(limit, 1), 1000))) as ActivityRow[];
}

export type Affinity = {
  /** seller id -> accumulated, decayed weight */
  shops: Map<string, number>;
  /** price band label -> accumulated, decayed weight */
  bands: Map<string, number>;
  /** product ids the customer bought (excluded from recommendations) */
  purchased: Set<string>;
  /** recent search terms, newest first */
  terms: string[];
  /** true when there is enough signal to personalise */
  hasSignal: boolean;
};

export const PRICE_BANDS = ["under-10k", "10k-25k", "25k-50k", "50k-100k", "over-100k"] as const;
export type PriceBand = (typeof PRICE_BANDS)[number];

export function priceBand(priceKobo: number): PriceBand {
  const naira = priceKobo / 100;
  if (naira < 10_000) return "under-10k";
  if (naira < 25_000) return "10k-25k";
  if (naira < 50_000) return "25k-50k";
  if (naira < 100_000) return "50k-100k";
  return "over-100k";
}

/**
 * Aggregates activity into shop and price-band affinities, weighting recent
 * activity more heavily and purchases above views.
 */
export function buildAffinity(rows: ActivityRow[], priceByProduct: Map<string, number>): Affinity {
  const shops = new Map<string, number>();
  const bands = new Map<string, number>();
  const purchased = new Set<string>();
  const terms: string[] = [];
  const now = Date.now();

  for (const row of rows) {
    const ageDays = (now - new Date(row.created_at).getTime()) / 86_400_000;
    const score = Number(row.weight) * decayFactor(ageDays);

    if (row.kind === "purchase" && row.product_id) purchased.add(row.product_id);

    if (row.shop_id) shops.set(row.shop_id, (shops.get(row.shop_id) ?? 0) + score);

    if (row.product_id) {
      const price = priceByProduct.get(row.product_id);
      if (typeof price === "number") {
        const band = priceBand(price);
        bands.set(band, (bands.get(band) ?? 0) + score);
      }
    }

    if (row.kind === "search" && row.term && terms.length < 10 && !terms.includes(row.term)) {
      terms.push(row.term);
    }
  }

  // Searches carry no shop, so signal is measured across every activity rather
  // than shops alone — otherwise a customer who only searches never personalises.
  const total = rows.reduce((sum, row) => {
    const ageDays = (now - new Date(row.created_at).getTime()) / 86_400_000;
    return sum + Number(row.weight) * decayFactor(ageDays);
  }, 0);

  return { shops, bands, purchased, terms, hasSignal: total >= 4 };
}

/** Normalised 0..1 affinity for a shop. */
export function normalised(affinity: Affinity, shopId: string | null): number {
  if (!shopId) return 0;
  const max = Math.max(1, ...affinity.shops.values());
  return (affinity.shops.get(shopId) ?? 0) / max;
}