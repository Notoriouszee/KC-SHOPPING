import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Used only by `npm test`. `node --test --test-isolation=none` runs every test
// file in one process, so one database is chosen up front and shared by all
// suites (they keep their data separate with distinct sellers and emails).
//
// Tests always run on the local SQLite backend: they are fast, hermetic, and must
// not touch the production database even when .env.local points at Supabase.
process.env.DATA_BACKEND = "sqlite";
process.env.STORAGE_BACKEND = "local";

if (!process.env.ORDERPILOT_DB_PATH) {
  process.env.ORDERPILOT_DB_PATH = join(
    tmpdir(),
    `kandc-tests-${process.pid}-${Date.now()}.db`,
  );
}

register("./ts-loader.mjs", pathToFileURL(import.meta.filename));
