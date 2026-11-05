import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

/**
 * Application database.
 *
 * Two backends behind one interface:
 *  - **postgres** — Supabase. Used in production (and anywhere `DATA_BACKEND`
 *    says so). Nothing is written to disk.
 *  - **sqlite** — local development and the test suite, where a file is handy.
 *
 * The interface keeps the SQLite shape the repositories were written against
 * (`getDb().prepare(sql).get(...params)`), but every call is asynchronous because
 * Postgres is. The Postgres implementation rewrites `?` placeholders to `$n`.
 */

export type DbStatement = {
  get<T = Record<string, unknown>>(...params: unknown[]): Promise<T | null>;
  all<T = Record<string, unknown>>(...params: unknown[]): Promise<T[]>;
  run(...params: unknown[]): Promise<{ changes: number }>;
};

export type DbHandle = {
  prepare(sql: string): DbStatement;
  /** Shortcut for one-shot statements. */
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | null>;
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]>;
  run(sql: string, ...params: unknown[]): Promise<{ changes: number }>;
  /** Runs `fn` inside a transaction. Use the passed handle, not the outer one. */
  transaction<T>(fn: (tx: DbHandle) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

export type DbBackend = "postgres" | "sqlite";

/* -------------------------------------------------------------------------- */
/* Backend selection                                                          */
/* -------------------------------------------------------------------------- */

function explicitBackend(): DbBackend | null {
  const value = (process.env.DATA_BACKEND ?? "").trim().toLowerCase();
  if (value === "supabase" || value === "postgres" || value === "pg") return "postgres";
  if (value === "sqlite") return "sqlite";
  return null;
}

/**
 * Production defaults to Postgres: silently falling back to SQLite there would
 * write to a read-only filesystem (or a temporary one) and lose data.
 */
export function dbBackend(): DbBackend {
  const explicit = explicitBackend();
  if (explicit) return explicit;
  return process.env.NODE_ENV === "production" ? "postgres" : "sqlite";
}

export function databaseUrl(): string {
  const url =
    process.env.SUPABASE_DB_URL ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.POSTGRES_PRISMA_URL;

  if (!url) {
    throw new Error(
      "No Postgres connection string. Set SUPABASE_DB_URL (Supabase → Settings → Database → " +
        "Connection string → URI) in the environment, or set DATA_BACKEND=sqlite for local development.",
    );
  }

  return url;
}

/* -------------------------------------------------------------------------- */
/* Postgres                                                                   */
/* -------------------------------------------------------------------------- */

type PgPool = import("pg").Pool;
type PgClient = import("pg").PoolClient;

type PgState = { pool: PgPool; rewritten: Map<string, string> };

/**
 * `?` → `$1, $2, …`. The repositories were written for SQLite; keeping that
 * convention means the SQL only lives in one place.
 */
function rewrite(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${(index += 1)}`);
}

function cachedRewrite(state: PgState, sql: string): string {
  const existing = state.rewritten.get(sql);
  if (existing) return existing;

  const rewritten = rewrite(sql);
  // Bound the cache; the app has a fixed set of statements, but be safe.
  if (state.rewritten.size > 500) state.rewritten.clear();
  state.rewritten.set(sql, rewritten);
  return rewritten;
}

type Queryable = {
  query: (text: string, values?: unknown[]) => Promise<{
    rows: Record<string, unknown>[];
    rowCount: number | null;
  }>;
};

function pgHandle(state: PgState, queryable?: Queryable): DbHandle {
  const runner: Queryable = queryable ?? {
    query: (text, values) => state.pool.query(text, values as never[]),
  };

  const statement = (sql: string): DbStatement => {
    const text = cachedRewrite(state, sql);
    return {
      async get<T>(...params: unknown[]) {
        const result = await runner.query(text, params);
        return (result.rows[0] as T) ?? null;
      },
      async all<T>(...params: unknown[]) {
        const result = await runner.query(text, params);
        return result.rows as T[];
      },
      async run(...params: unknown[]) {
        const result = await runner.query(text, params);
        return { changes: result.rowCount ?? 0 };
      },
    };
  };

  return {
    prepare: statement,
    get: (sql, ...params) => statement(sql).get(...params),
    all: (sql, ...params) => statement(sql).all(...params),
    run: (sql, ...params) => statement(sql).run(...params),

    async transaction<T>(fn: (tx: DbHandle) => Promise<T>) {
      if (queryable) return fn(pgHandle(state, queryable));

      const client: PgClient = await state.pool.connect();
      try {
        await client.query("begin");
        const value = await fn(pgHandle(state, client));
        await client.query("commit");
        return value;
      } catch (error) {
        await client.query("rollback").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },

    async close() {
      await state.pool.end();
    },
  };
}

async function createPgHandle(url: string): Promise<DbHandle> {
  const pg = await import("pg");

  // Timestamps come back as ISO-8601 strings, matching what the SQLite code and
  // the UI formatters expect ("2026-10-29 20:47:14.524+00" would parse loosely).
  pg.default.types.setTypeParser(1184, (value: string) => new Date(value).toISOString()); // timestamptz
  pg.default.types.setTypeParser(1114, (value: string) => new Date(`${value}Z`).toISOString()); // timestamp
  pg.default.types.setTypeParser(1082, (value: string) => value); // date (no time)
  // Money is stored as integers.
  pg.default.types.setTypeParser(20, (value: string) => Number(value)); // int8
  pg.default.types.setTypeParser(1700, (value: string) => Number(value)); // numeric

  const pool = new pg.default.Pool({
    connectionString: url,
    max: Number(process.env.PG_POOL_MAX ?? 5),
    ssl: url.includes("localhost") || url.includes("127.0.0.1") ? undefined : { rejectUnauthorized: false },
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
  });

  // Surface pool errors instead of crashing the process later.
  pool.on("error", (error) => {
    console.error("[db] postgres pool error:", error.message);
  });

  return pgHandle({ pool, rewritten: new Map() });
}

/* -------------------------------------------------------------------------- */
/* SQLite (local development and tests)                                       */
/* -------------------------------------------------------------------------- */

type SqliteState = { db: import("node:sqlite").DatabaseSync; path: string };

function migrationDir(): string {
  return resolve(process.cwd(), "lib", "db", "migrations");
}

export function sqlitePath(): string {
  return process.env.ORDERPILOT_DB_PATH ?? join(process.cwd(), "data", "orderpilot.db");
}

function applySqliteMigrations(db: import("node:sqlite").DatabaseSync): void {
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
      .map((row) => String((row as { name: string }).name)),
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

function openSqlite(): import("node:sqlite").DatabaseSync {
  // Required lazily so production bundles never load the SQLite built-in.
  const require = createRequire(import.meta.url);
  const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");

  const path = sqlitePath();
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  applySqliteMigrations(db);
  return db;
}

function sqliteHandle(state: SqliteState): DbHandle {
  const statement = (sql: string): DbStatement => ({
    async get<T>(...params: unknown[]) {
      const row = state.db.prepare(sql).get(...(params as never[]));
      return (row as T) ?? null;
    },
    async all<T>(...params: unknown[]) {
      return state.db.prepare(sql).all(...(params as never[])) as T[];
    },
    async run(...params: unknown[]) {
      const result = state.db.prepare(sql).run(...(params as never[]));
      return { changes: Number(result.changes ?? 0) };
    },
  });

  return {
    prepare: statement,
    get: (sql, ...params) => statement(sql).get(...params),
    all: (sql, ...params) => statement(sql).all(...params),
    run: (sql, ...params) => statement(sql).run(...params),

    async transaction<T>(fn: (tx: DbHandle) => Promise<T>) {
      state.db.exec("BEGIN");
      try {
        const value = await fn(sqliteHandle(state));
        state.db.exec("COMMIT");
        return value;
      } catch (error) {
        state.db.exec("ROLLBACK");
        throw error;
      }
    },

    async close() {
      state.db.close();
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

type Cache = { handle?: Promise<DbHandle>; sqlite?: SqliteState };
const globalCache = globalThis as typeof globalThis & { __kandcDb?: Cache };

/**
 * Resolves the database handle. The first call opens the connection; later calls
 * reuse it (Next.js re-evaluates modules on hot reload, so it is cached on
 * globalThis).
 */
export async function getDb(): Promise<DbHandle> {
  const cache = (globalCache.__kandcDb ??= {});

  if (!cache.handle) {
    cache.handle = (async () => {
      if (dbBackend() === "postgres") return createPgHandle(databaseUrl());
      cache.sqlite = { db: openSqlite(), path: sqlitePath() };
      return sqliteHandle(cache.sqlite);
    })();
  }

  return cache.handle;
}

/** Synchronous accessor for the SQLite file path, used by scripts. */
export function isSqliteBackend(): boolean {
  return dbBackend() === "sqlite";
}

/** Used by `npm run db:reset` — drops the file and re-migrates from scratch. */
export async function resetDatabase(): Promise<void> {
  if (dbBackend() === "postgres") {
    throw new Error("db:reset only applies to the local SQLite backend.");
  }

  const cache = globalCache.__kandcDb;
  if (cache?.handle) {
    const handle = await cache.handle;
    await handle.close().catch(() => {});
    cache.handle = undefined;
    cache.sqlite = undefined;
  }

  for (const suffix of ["", "-wal", "-shm"]) {
    const target = `${sqlitePath()}${suffix}`;
    if (existsSync(target)) rmSync(target, { force: true });
  }

  await getDb();
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
