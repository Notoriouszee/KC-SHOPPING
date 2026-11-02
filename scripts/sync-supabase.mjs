/**
 * Copies the local SQLite database into Supabase.
 *
 *   node --import ./scripts/register.mjs scripts/sync-supabase.mjs          # once
 *   node --import ./scripts/register.mjs scripts/sync-supabase.mjs --watch  # every 60s
 *   node --import ./scripts/register.mjs scripts/sync-supabase.mjs --dry-run
 *
 * Reads SUPABASE_DB_URL (and the local database path) from .env.local.
 */
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { loadEnv } from "./load-env.mjs";
import { mirrorAll } from "../lib/sync/mirror.ts";

loadEnv();

const dryRun = process.argv.includes("--dry-run");
const watch = process.argv.includes("--watch");
const intervalSeconds = Number(process.env.SYNC_INTERVAL_SECONDS ?? 60);

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("SUPABASE_DB_URL is not set; nothing to sync.");
  process.exit(1);
}

const localPath =
  process.env.ORDERPILOT_DB_PATH ?? join(process.cwd(), "data", "orderpilot.db");

const { default: pg } = await import("pg");

async function runOnce() {
  const local = new DatabaseSync(localPath, { readOnly: true });
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  });

  try {
    await client.connect();
    const results = await mirrorAll(local, client, { dryRun });

    for (const result of results) {
      if (result.skipped) {
        console.log(`  skip ${result.table.padEnd(22)} ${result.reason}`);
        continue;
      }
      console.log(
        `  ${dryRun ? "plan" : "ok  "} ${result.table.padEnd(22)} ${String(dryRun ? result.localRows : result.written).padStart(4)} rows${
          result.deleted > 0 ? `, ${result.deleted} removed` : ""
        }`,
      );
    }

    const total = results.reduce((sum, result) => sum + result.written, 0);
    console.log(`${new Date().toISOString()}  mirrored ${total} rows${dryRun ? " (dry run)" : ""}`);
  } finally {
    await client.end().catch(() => {});
    local.close();
  }
}

if (watch) {
  console.log(`Mirroring ${localPath} to Supabase every ${intervalSeconds}s. Ctrl+C to stop.`);
  // First pass immediately, then on an interval; failures do not stop the loop.
  for (;;) {
    try {
      await runOnce();
    } catch (error) {
      console.error(`${new Date().toISOString()}  sync failed: ${error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
  }
} else {
  await runOnce();
}
