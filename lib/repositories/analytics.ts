import { createHash } from "node:crypto";
import { getDb, nowIso, plainRows } from "../db";
import { newId } from "../domain/ids";
import { conversionRate, type ViewSource } from "../domain/analytics";

/**
 * Product-link analytics.
 *
 * Views are recorded without cookies: a visitor is identified only by a hash of
 * IP + user agent + the current day, so nothing is linkable across days and no
 * personal data is stored.
 */

export const VIEW_RETENTION_DAYS = 90;

export function hashVisitor(ip: string, userAgent: string, date = new Date()): string {
  const day = date.toISOString().slice(0, 10);
  const salt = process.env.ORDERPILOT_IP_SALT ?? "kandc";
  return createHash("sha256")
    .update(`${salt}:view:${day}:${ip}:${userAgent}`)
    .digest("hex")
    .slice(0, 40);
}

export type RecordViewInput = {
  productId: string;
  source: ViewSource;
  referrerHost?: string | null;
  visitorHash: string;
};

/**
 * Records a view for a published product. Silently ignores drafts and unknown
 * products so the tracking endpoint cannot be used to probe the catalogue.
 */
export function recordProductView(input: RecordViewInput): boolean {
  const product = getDb()
    .prepare(
      "SELECT id, seller_id FROM products WHERE id = ? AND publication_status = 'published'",
    )
    .get(input.productId) as { id: string; seller_id: string } | undefined;

  if (!product) return false;

  getDb()
    .prepare(
      `INSERT INTO product_views (id, product_id, seller_id, source, referrer_host, visitor_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId(),
      product.id,
      product.seller_id,
      input.source,
      input.referrerHost?.slice(0, 100) ?? null,
      input.visitorHash,
      nowIso(),
    );

  return true;
}

export type ProductPerformance = {
  productId: string;
  views: number;
  uniqueVisitors: number;
  orders: number;
  conversionRate: number;
};

function performanceFor(
  sellerId: string,
  productId: string,
  since: string,
): ProductPerformance {
  const db = getDb();

  const viewRow = db
    .prepare(
      `SELECT COUNT(*) AS views, COUNT(DISTINCT visitor_hash) AS uniques
       FROM product_views
       WHERE product_id = ? AND seller_id = ? AND created_at >= ?`,
    )
    .get(productId, sellerId, since) as { views: number; uniques: number };

  const orderRow = db
    .prepare(
      `SELECT COUNT(*) AS orders
       FROM orders
       WHERE product_id = ? AND seller_id = ? AND created_at >= ? AND status != 'cancelled'`,
    )
    .get(productId, sellerId, since) as { orders: number };

  const views = Number(viewRow?.views ?? 0);
  const uniqueVisitors = Number(viewRow?.uniques ?? 0);
  const orders = Number(orderRow?.orders ?? 0);

  return {
    productId,
    views,
    uniqueVisitors,
    orders,
    conversionRate: conversionRate(orders, uniqueVisitors),
  };
}

function sinceIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** Performance for one product, over the last `days` days. */
export function productPerformance(
  sellerId: string,
  productId: string,
  days = 30,
): ProductPerformance {
  return performanceFor(sellerId, productId, sinceIso(days));
}

/**
 * Performance for several products at once, keyed by product id. Kept to two
 * aggregate queries plus one per-product pair, which is fine for a catalogue of
 * this size (bounded by the caller's limit).
 */
export function productPerformanceMap(
  sellerId: string,
  productIds: string[],
  days = 30,
): Record<string, ProductPerformance> {
  const since = sinceIso(days);
  const map: Record<string, ProductPerformance> = {};
  for (const productId of productIds) {
    map[productId] = performanceFor(sellerId, productId, since);
  }
  return map;
}

export type SourceBreakdownRow = { source: string; views: number };

/** Views grouped by source, for the "where traffic comes from" summary. */
export function sourceBreakdown(sellerId: string, days = 30): SourceBreakdownRow[] {
  return plainRows<SourceBreakdownRow>(
    getDb()
      .prepare(
        `SELECT COALESCE(source, 'direct') AS source, COUNT(*) AS views
         FROM product_views
         WHERE seller_id = ? AND created_at >= ?
         GROUP BY COALESCE(source, 'direct')
         ORDER BY views DESC`,
      )
      .all(sellerId, sinceIso(days)),
  );
}

export type ShopPerformance = { views: number; uniqueVisitors: number; orders: number };

/** Totals across the whole catalogue, for the dashboard summary. */
export function shopPerformance(sellerId: string, days = 30): ShopPerformance {
  const since = sinceIso(days);
  const db = getDb();

  const views = db
    .prepare(
      `SELECT COUNT(*) AS views, COUNT(DISTINCT visitor_hash) AS uniques
       FROM product_views WHERE seller_id = ? AND created_at >= ?`,
    )
    .get(sellerId, since) as { views: number; uniques: number };

  const orders = db
    .prepare(
      `SELECT COUNT(*) AS orders FROM orders
       WHERE seller_id = ? AND created_at >= ? AND source IN ('product_link', 'shop')
         AND status != 'cancelled'`,
    )
    .get(sellerId, since) as { orders: number };

  return {
    views: Number(views?.views ?? 0),
    uniqueVisitors: Number(views?.uniques ?? 0),
    orders: Number(orders?.orders ?? 0),
  };
}

/** Housekeeping: drop views older than the retention window. */
export function pruneViews(olderThanDays = VIEW_RETENTION_DAYS): number {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
  const result = getDb().prepare("DELETE FROM product_views WHERE created_at < ?").run(cutoff);
  return Number(result.changes ?? 0);
}
