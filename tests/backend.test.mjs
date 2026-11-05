/**
 * Backend selection and configuration guards.
 *
 * These are the switches that decide whether the app writes to Supabase (the
 * only valid choice in production) or to the local SQLite file used by tests and
 * development. Getting them wrong is what caused the production crash, so they
 * are asserted explicitly.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const { dbBackend, databaseUrl } = await import("../lib/db/index.ts");
const { storageBackend } = await import("../lib/storage.ts");

// Only the variables these tests change are captured, so restoring them cannot
// clobber configuration owned by other suites (e.g. ORDERPILOT_UPLOAD_ROOT).
const MANAGED_KEYS = [
  "DATA_BACKEND",
  "NODE_ENV",
  "SUPABASE_DB_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "STORAGE_BACKEND",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const snapshot = Object.fromEntries(MANAGED_KEYS.map((key) => [key, process.env[key]]));

function restoreEnv() {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

before(() => {
  delete process.env.DATA_BACKEND;
  delete process.env.NODE_ENV;
  delete process.env.SUPABASE_DB_URL;
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  delete process.env.STORAGE_BACKEND;
});

after(restoreEnv);

function withEnv(values) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test("DATA_BACKEND selects the backend explicitly", (t) => {
  t.after(restoreEnv);
  withEnv({ DATA_BACKEND: "sqlite", NODE_ENV: "production" });
  assert.equal(dbBackend(), "sqlite");

  withEnv({ DATA_BACKEND: "supabase" });
  assert.equal(dbBackend(), "postgres");

  withEnv({ DATA_BACKEND: "postgres" });
  assert.equal(dbBackend(), "postgres");
});

test("production defaults to Postgres, development to SQLite", (t) => {
  t.after(restoreEnv);
  withEnv({ DATA_BACKEND: undefined, NODE_ENV: "production" });
  assert.equal(dbBackend(), "postgres");

  withEnv({ NODE_ENV: "development" });
  assert.equal(dbBackend(), "sqlite");

  withEnv({ NODE_ENV: "test" });
  assert.equal(dbBackend(), "sqlite");
});

test("a missing connection string fails with an actionable message", (t) => {
  t.after(restoreEnv);
  withEnv({
    DATA_BACKEND: "supabase",
    SUPABASE_DB_URL: undefined,
    DATABASE_URL: undefined,
    POSTGRES_URL: undefined,
  });

  assert.throws(() => databaseUrl(), /SUPABASE_DB_URL/);
});

test("the connection string is read from the supported variables", (t) => {
  t.after(restoreEnv);
  withEnv({ SUPABASE_DB_URL: "postgresql://a/b" });
  assert.equal(databaseUrl(), "postgresql://a/b");

  withEnv({ SUPABASE_DB_URL: undefined, DATABASE_URL: "postgresql://c/d" });
  assert.equal(databaseUrl(), "postgresql://c/d");
});

test("storage defaults to Supabase in production and files locally", (t) => {
  t.after(restoreEnv);
  withEnv({
    NODE_ENV: "development",
    STORAGE_BACKEND: undefined,
    SUPABASE_URL: undefined,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
  });
  assert.equal(storageBackend(), "local");

  withEnv({ STORAGE_BACKEND: "local", NODE_ENV: "production" });
  assert.equal(storageBackend(), "local");

  withEnv({
    STORAGE_BACKEND: undefined,
    NODE_ENV: "production",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
  });
  assert.equal(storageBackend(), "supabase");
});

test("production without Supabase storage fails loudly", (t) => {
  t.after(restoreEnv);
  withEnv({
    NODE_ENV: "production",
    STORAGE_BACKEND: undefined,
    SUPABASE_URL: undefined,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
  });

  assert.throws(() => storageBackend(), /Image storage is not configured/);
});
