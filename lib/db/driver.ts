import { DatabaseSync } from "node:sqlite";

/**
 * One async database interface, two backends.
 *
 * The repositories are written once against this interface. Locally (and in the
 * unit tests) it runs on SQLite; with Supabase it runs on Postgres, where every
 * call is wrapped in a transaction that sets the Postgres role and JWT claims so
 * Row Level Security applies exactly as it would for a browser client.
 */

export type Row = Record<string, unknown>;

export type RunResult = { changes: number };

export interface Db {
  all<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T = Row>(sql: string, params?: unknown[]): Promise<T | null>;
  run(sql: string, params?: unknown[]): Promise<RunResult>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** `set local role` values PostgREST uses; `service` bypasses RLS. */
export type DbRole = "anon" | "authenticated" | "service";

export type DbContext = {
  role: DbRole;
  /** Supabase user id, for `authenticated` queries. */
  userId?: string | null;
};

export class DbError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "DbError";
    this.code = code;
  }
}

/* -------------------------------------------------------------------------- */
/* SQLite                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * SQLite adapter over the existing `node:sqlite` handle. Used for local demo
 * runs and the unit test suite, where a real network round trip per query would
 * make the tests slow and flaky.
 */
export function sqliteDb(handle: DatabaseSync): Db {
  const db: Db = {
    async all<T>(sql: string, params: unknown[] = []) {
      return handle.prepare(sql).all(...(params as never[])) as T[];
    },

    async get<T>(sql: string, params: unknown[] = []) {
      const row = handle.prepare(sql).get(...(params as never[]));
      return (row as T) ?? null;
    },

    async run(sql: string, params: unknown[] = []) {
      const result = handle.prepare(sql).run(...(params as never[]));
      return { changes: Number(result.changes ?? 0) };
    },

    async transaction<T>(fn: (tx: Db) => Promise<T>) {
      handle.exec("BEGIN");
      try {
        const value = await fn(db);
        handle.exec("COMMIT");
        return value;
      } catch (error) {
        handle.exec("ROLLBACK");
        throw error;
      }
    },

    async close() {
      handle.close();
    },
  };

  return db;
}

/* -------------------------------------------------------------------------- */
/* Postgres (Supabase)                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Rewrites `?` placeholders to `$1, $2, …`.
 *
 * The repositories use `?` because that is what SQLite wants; keeping that
 * convention means the SQL is written once. Our queries never contain a literal
 * `?` inside a string, which the simple scan below would misread.
 */
export function toPgParams(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${(index += 1)}`);
}

type PgPool = import("pg").Pool;
type PgClient = import("pg").PoolClient;

export type PgDb = Db & {
  /** Runs `fn` with the given Postgres role/JWT claims inside one transaction. */
  withContext<T>(context: DbContext, fn: (tx: Db) => Promise<T>): Promise<T>;
};

function contextClient(db: Db, client: PgClient, base: Db): Db {
  const scoped: Db = {
    async all<T>(sql: string, params: unknown[] = []) {
      const result = await client.query(toPgParams(sql), params);
      return result.rows as T[];
    },
    async get<T>(sql: string, params: unknown[] = []) {
      const result = await client.query(toPgParams(sql), params);
      return (result.rows[0] as T) ?? null;
    },
    async run(sql: string, params: unknown[] = []) {
      const result = await client.query(toPgParams(sql), params);
      return { changes: result.rowCount ?? 0 };
    },
    // Nested transactions become savepoints on the same client.
    async transaction<T>(fn: (tx: Db) => Promise<T>) {
      await client.query("savepoint sp");
      try {
        const value = await fn(scoped);
        await client.query("release savepoint sp");
        return value;
      } catch (error) {
        await client.query("rollback to savepoint sp");
        throw error;
      }
    },
    async close() {
      // Owned by the pool; nothing to do for a scoped client.
    },
  };

  void db;
  void base;
  return scoped;
}

export async function createPgDb(connectionString: string, options: { max?: number } = {}): Promise<PgDb> {
  const pg = await import("pg");

  // Postgres returns bigint/int8 and numeric as strings. Money is stored in kobo
  // as integers, so parsing to Number here keeps the repositories backend-agnostic.
  pg.default.types.setTypeParser(20, (value: string) => Number(value));
  pg.default.types.setTypeParser(1700, (value: string) => Number(value));

  const pool: PgPool = new pg.default.Pool({
    connectionString,
    max: options.max ?? 5,
    ssl: { rejectUnauthorized: false },
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  const base: Db = {
    async all<T>(sql: string, params: unknown[] = []) {
      const result = await pool.query(toPgParams(sql), params);
      return result.rows as T[];
    },
    async get<T>(sql: string, params: unknown[] = []) {
      const result = await pool.query(toPgParams(sql), params);
      return (result.rows[0] as T) ?? null;
    },
    async run(sql: string, params: unknown[] = []) {
      const result = await pool.query(toPgParams(sql), params);
      return { changes: result.rowCount ?? 0 };
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const value = await fn(contextClient(base, client, base));
        await client.query("commit");
        return value;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };

  const db: PgDb = {
    ...base,
    async withContext<T>(context: DbContext, fn: (tx: Db) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        // `set local` only lasts for this transaction, so pooled connections can
        // never leak one user's identity into another's request.
        await client.query(`set local role ${context.role}`);
        if (context.userId) {
          const claims = JSON.stringify({
            sub: context.userId,
            role: context.role,
            aud: "authenticated",
          });
          await client.query("select set_config('request.jwt.claims', $1, true)", [claims]);
        }
        const value = await fn(contextClient(base, client, base));
        await client.query("commit");
        return value;
      } catch (error) {
        await client.query("rollback").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };

  return db;
}
