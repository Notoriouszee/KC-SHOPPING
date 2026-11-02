/**
 * Applies supabase/migrations/*.sql to a real Supabase (PostgreSQL) project, in
 * order, each in its own transaction, tracked in a `_migrations` table so it is
 * safe to re-run.
 *
 * Usage:
 *   $env:SUPABASE_DB_URL="postgresql://..."     # or put it in .env.local
 *   node --import ./scripts/register.mjs scripts/supabase-migrate.mjs
 *   node --import ./scripts/register.mjs scripts/supabase-migrate.mjs --dry-run
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnv } from "./load-env.mjs";

loadEnv();

const dryRun = process.argv.includes("--dry-run");
const url = process.env.SUPABASE_DB_URL;

if (!url) {
  console.error(
    "SUPABASE_DB_URL is not set.\n" +
      "Get it from Supabase → Settings → Database → Connection string → URI,\n" +
      "then put it in .env.local (gitignored).",
  );
  process.exit(1);
}

const { default: pg } = await import("pg");
const client = new pg.Client({
  connectionString: url,
  // Supabase requires TLS; its certificate is not in the local trust store.
  ssl: { rejectUnauthorized: false },
});

const dir = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

console.log(`Connecting to ${url.replace(/\/\/[^@]+@/, "//***@")} …`);
await client.connect();

try {
  await client.query(`
    create table if not exists _migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const applied = new Set(
    (await client.query("select name from _migrations")).rows.map((row) => row.name),
  );

  const pending = files.filter((name) => !applied.has(name));

  if (pending.length === 0) {
    console.log("Nothing to do — all migrations are already applied.");
  } else if (dryRun) {
    console.log(`Would apply ${pending.length} migration(s):`);
    for (const name of pending) console.log(`  · ${name}`);
  } else {
    for (const name of pending) {
      const sql = readFileSync(join(dir, name), "utf8");
      process.stdout.write(`Applying ${name} … `);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into _migrations (name) values ($1)", [name]);
        await client.query("commit");
        console.log("ok");
      } catch (error) {
        await client.query("rollback");
        console.log("FAILED");
        throw new Error(`${name}: ${error.message}`);
      }
    }
  }

  const tables = await client.query(
    `select table_name from information_schema.tables
     where table_schema = 'public' order by table_name`,
  );
  console.log(`\npublic tables: ${tables.rows.map((row) => row.table_name).join(", ")}`);
} finally {
  await client.end();
}
