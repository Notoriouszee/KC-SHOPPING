import { createHash } from "node:crypto";

/**
 * Mirror the local SQLite database into Supabase Postgres.
 *
 * The application still writes to SQLite; this job keeps the Supabase copy
 * current so the tables there are populated and queryable from the Supabase
 * dashboard, for reporting and as a backup.
 *
 * Design notes:
 *  - Column lists are discovered from both databases and intersected, so schema
 *    drift in either direction cannot break the sync.
 *  - Rows are upserted on `id`, so it is safe to run repeatedly.
 *  - Rows deleted locally are deleted remotely.
 *  - It connects with the direct connection string (owner role). Nothing here is
 *    reachable from the browser.
 */

export type MirrorTable = {
  /** Table name in SQLite. */
  name: string;
  /** Table name in Postgres, when it differs. */
  remote?: string;
  /** Skip remote deletes for append-only or shared tables. */
  skipDeletes?: boolean;
  /** Primary key column. Defaults to `id`; some tables use a natural key. */
  key?: string;
};

/** Parent tables first, so foreign keys are satisfied. */
export const MIRROR_TABLES: MirrorTable[] = [
  { name: "users" },
  { name: "customers" },
  { name: "products" },
  { name: "product_images" },
  { name: "orders" },
  { name: "order_items" },
  { name: "order_events" },
  { name: "follow_ups" },
  { name: "product_views" },
  { name: "site_visits" },
  { name: "shop_slug_history" },
  { name: "seller_subscriptions", key: "seller_id" },
  { name: "auth_attempts", skipDeletes: true },
];

export type TableMirrorResult = {
  table: string;
  localRows: number;
  written: number;
  deleted: number;
  skipped: boolean;
  reason?: string;
};

type LocalRow = Record<string, unknown>;

export type LocalDatabase = {
  prepare: (sql: string) => { all: () => unknown[] };
};

export type RemoteDatabase = {
  query: (
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
};

const BOOLEAN_TYPES = new Set(["boolean"]);

function asBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  return Number(value) !== 0;
}

/**
 * Mirrors every table. Returns a per-table report so callers can print or assert.
 */
export async function mirrorAll(
  local: LocalDatabase,
  client: RemoteDatabase,
  options: { tables?: MirrorTable[]; dryRun?: boolean } = {},
): Promise<TableMirrorResult[]> {
  const tables = options.tables ?? MIRROR_TABLES;
  const results: TableMirrorResult[] = [];

  for (const table of tables) {
    const remoteName = table.remote ?? table.name;

    let localRows: LocalRow[];
    try {
      localRows = local.prepare(`SELECT * FROM ${table.name}`).all() as LocalRow[];
    } catch {
      results.push({
        table: remoteName,
        localRows: 0,
        written: 0,
        deleted: 0,
        skipped: true,
        reason: "table missing locally",
      });
      continue;
    }

    const remoteColumns = await client.query(
      `select column_name, data_type
         from information_schema.columns
        where table_schema = 'public' and table_name = $1`,
      [remoteName],
    );

    if (remoteColumns.rows.length === 0) {
      results.push({
        table: remoteName,
        localRows: localRows.length,
        written: 0,
        deleted: 0,
        skipped: true,
        reason: "table missing in Supabase",
      });
      continue;
    }

    const types = new Map(
      remoteColumns.rows.map((row) => [String(row.column_name), String(row.data_type)]),
    );

    const localColumns = localRows.length > 0 ? Object.keys(localRows[0]!) : [];
    const columns = localColumns.filter((column) => types.has(column));

    if (columns.length === 0) {
      results.push({
        table: remoteName,
        localRows: localRows.length,
        written: 0,
        deleted: 0,
        skipped: true,
        reason: "no shared columns",
      });
      continue;
    }

    if (options.dryRun) {
      results.push({
        table: remoteName,
        localRows: localRows.length,
        written: 0,
        deleted: 0,
        skipped: false,
        reason: "dry run",
      });
      continue;
    }

    const key = table.key ?? "id";
    const hasKey = columns.includes(key);
    let written = 0;

    for (const row of localRows) {
      const values = columns.map((column) => {
        const value = row[column];
        if (BOOLEAN_TYPES.has(types.get(column) ?? "") && value !== null && value !== undefined) {
          return asBoolean(value);
        }
        return value === undefined ? null : value;
      });

      const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
      const updates = columns
        .filter((column) => column !== key)
        .map((column) => `${column} = EXCLUDED.${column}`)
        .join(", ");

      const conflict = hasKey
        ? `on conflict (${key}) do ${updates ? `update set ${updates}` : "nothing"}`
        : "";

      await client.query(
        `insert into public.${remoteName} (${columns.join(", ")})
         values (${placeholders})
         ${conflict}`,
        values,
      );
      written += 1;
    }

    // Propagate local deletions.
    let deleted = 0;
    if (hasKey && !table.skipDeletes) {
      const ids = localRows.map((row) => String(row[key]));
      const result = await client.query(
        `delete from public.${remoteName}
          where not (${key}::text = any($1::text[]))`,
        [ids],
      );
      deleted = result.rowCount ?? 0;
    }

    results.push({ table: remoteName, localRows: localRows.length, written, deleted, skipped: false });
  }

  return results;
}

/** Stable short hash, handy for logging which database was mirrored. */
export function databaseFingerprint(path: string): string {
  return createHash("sha256").update(path).digest("hex").slice(0, 8);
}
