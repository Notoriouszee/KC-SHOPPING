import { createHash } from "node:crypto";
import { getDb, nowIso, plainRows } from "../db";
import { newId } from "../domain/ids";

/**
 * Site-wide visit counts for the admin dashboard.
 *
 * Same privacy model as product views: no cookies, no IPs, only a hash of
 * IP + user agent + day, which stops being linkable tomorrow.
 */

export function hashSiteVisitor(ip: string, userAgent: string, date = new Date()): string {
  const day = date.toISOString().slice(0, 10);
  const salt = process.env.ORDERPILOT_IP_SALT ?? "kandc";
  return createHash("sha256")
    .update(`${salt}:visit:${day}:${ip}:${userAgent}`)
    .digest("hex")
    .slice(0, 40);
}

/** Only public, crawlable pages are counted. */
export async function recordSiteVisit(path: string, visitorHash: string): Promise<void> {
  await (await getDb())
    .prepare("INSERT INTO site_visits (id, path, visitor_hash, created_at) VALUES (?, ?, ?, ?)")
    .run(newId(), path.slice(0, 200), visitorHash, nowIso());
}

export type VisitorTotals = {
  today: number;
  last7Days: number;
  thisMonth: number;
  thisYear: number;
  allTime: number;
  uniqueThisMonth: number;
};

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const row = await (await getDb())
    .prepare(sql)
    .get<{ c: number }>(...(params as never[]));
  return Number(row?.c ?? 0);
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function visitorTotals(): Promise<VisitorTotals> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 1);
  const startOfYear = new Date(startOfDay.getFullYear(), 0, 1);

  return {
    today: await count("SELECT COUNT(*) AS c FROM site_visits WHERE created_at >= ?", [startOfDay.toISOString()]),
    last7Days: await count("SELECT COUNT(*) AS c FROM site_visits WHERE created_at >= ?", [isoDaysAgo(7)]),
    thisMonth: await count("SELECT COUNT(*) AS c FROM site_visits WHERE created_at >= ?", [startOfMonth.toISOString()]),
    thisYear: await count("SELECT COUNT(*) AS c FROM site_visits WHERE created_at >= ?", [startOfYear.toISOString()]),
    allTime: await count("SELECT COUNT(*) AS c FROM site_visits"),
    uniqueThisMonth: await count(
      "SELECT COUNT(DISTINCT visitor_hash) AS c FROM site_visits WHERE created_at >= ?",
      [startOfMonth.toISOString()],
    ),
  };
}

export type VisitorBucket = { bucket: string; visits: number; uniqueVisitors: number };

/**
 * Grouped visit counts. `grain` maps to a substring of the ISO timestamp, which
 * works on SQLite; the Postgres adapter will need `to_char` when the driver port
 * lands.
 */
export async function visitorSeries(
  grain: "day" | "month" | "year",
  limit: number,
): Promise<VisitorBucket[]> {
  const length = grain === "day" ? 10 : grain === "month" ? 7 : 4;

  // `CAST(... AS TEXT)` works on both backends: SQLite stores the timestamp as
  // text already, and Postgres has no `substr(timestamptz, …)`.
  return plainRows<VisitorBucket>(
    await (await getDb())
      .prepare(
        `SELECT substr(CAST(created_at AS TEXT), 1, ${length}) AS bucket,
                COUNT(*) AS visits,
                COUNT(DISTINCT visitor_hash) AS uniqueVisitors
         FROM site_visits
         GROUP BY substr(CAST(created_at AS TEXT), 1, ${length})
         ORDER BY bucket DESC
         LIMIT ?`,
      )
      .all(Math.min(Math.max(limit, 1), 400)),
  ).map((row) => ({
    bucket: String(row.bucket),
    visits: Number(row.visits),
    uniqueVisitors: Number(row.uniqueVisitors),
  }));
}

/** Visits per page, to see what people actually browse. */
export async function topPages(limit = 8): Promise<{ path: string; visits: number }[]> {
  return plainRows<{ path: string; visits: number }>(
    await (await getDb())
      .prepare(
        `SELECT path, COUNT(*) AS visits FROM site_visits GROUP BY path ORDER BY visits DESC LIMIT ?`,
      )
      .all(limit),
  ).map((row) => ({ path: String(row.path), visits: Number(row.visits) }));
}

export async function pruneSiteVisits(olderThanDays = 90): Promise<number> {
  const cutoff = isoDaysAgo(olderThanDays);
  const result = await (await getDb()).prepare("DELETE FROM site_visits WHERE created_at < ?").run(cutoff);
  return Number(result.changes ?? 0);
}
