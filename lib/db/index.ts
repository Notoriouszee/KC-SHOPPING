import { readdirSync, readFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Local persistence layer.
 *
 * The production target is Supabase (PostgreSQL + RLS). Because this checkout
 * has no Supabase project attached, the app runs against a local SQLite file
 * that mirrors the same schema. Repositories always scope by `seller_id`, which
 * is the local equivalent of the RLS policies in supabase/migrations.
 */

function migrationDir(): string {
  return resolve(process.cwd(), "lib", "db", "migrations");
}

function databasePath(): string {
  return process.env.ORDERPILOT_DB_PATH ?? join(process.cwd(), "data", "orderpilot.db");
}

type DbCache = { db: DatabaseSync; path: string };

// Next.js dev mode re-evaluates modules on hot reload; cache the handle on
// globalThis so we do not leak file descriptors or re-run migrations.
const globalCache = globalThis as typeof globalThis & { __kandcDb?: DbCache };

function applyMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);

  const applied = new Set(
    db
      .prepare("SELECT name FROM _migrations")
      .all()
      .map((row) => String(row.name)),
  );

  const files = readdirSync(migrationDir())
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationDir(), file), "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }
}

export function getDb(): DatabaseSync {
  const path = databasePath();
  if (globalCache.__kandcDb?.path === path) {
    return globalCache.__kandcDb.db;
  }

  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  applyMigrations(db);

  globalCache.__kandcDb = { db, path };
  return db;
}

/** Used by `npm run db:reset` — drops the file and re-migrates from scratch. */
export function resetDatabase(): void {
  const path = databasePath();
  if (globalCache.__kandcDb) {
    globalCache.__kandcDb.db.close();
    globalCache.__kandcDb = undefined;
  }
  for (const suffix of ["", "-wal", "-shm"]) {
    const target = `${path}${suffix}`;
    if (existsSync(target)) rmSync(target, { force: true });
  }
  getDb();
}

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * SQLite returns rows with a null prototype. React refuses to serialise those
 * across the server/client boundary ("Only plain objects ... can be passed to
 * Client Components"), so every row that leaves the data layer is copied into a
 * plain object here.
 */
export function plainRow<T>(row: unknown): T | null {
  if (row === null || row === undefined) return null;
  return { ...(row as Record<string, unknown>) } as T;
}

export function plainRows<T>(rows: unknown[]): T[] {
  return rows.map((row) => ({ ...(row as Record<string, unknown>) }) as T);
}
