/**
 * Verifies a Supabase project is reachable and provisioned correctly.
 *
 *   node --import ./scripts/register.mjs scripts/supabase-check.mjs
 *
 * Reads .env.local. Reports what is missing rather than throwing a stack trace.
 */
import { loadEnv } from "./load-env.mjs";
import { readdirSync } from "node:fs";
import { join } from "node:path";

loadEnv();

const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const problems = [];
if (!url) problems.push("SUPABASE_URL missing");
if (!anon) problems.push("NEXT_PUBLIC_SUPABASE_ANON_KEY missing");
if (!url.startsWith("https://")) problems.push("SUPABASE_URL should start with https://");

if (problems.length > 0) {
  console.error("Cannot check the project yet:");
  for (const problem of problems) console.error(`  · ${problem}`);
  console.error("\nCopy .env.example to .env.local and fill in the values.");
  process.exit(1);
}

const { createClient } = await import("@supabase/supabase-js");
const anonClient = createClient(url, anon, { auth: { persistSession: false } });

console.log(`Project: ${url}`);
console.log(`Anon key: ${anon.slice(0, 12)}… (${anon.length} chars)`);
console.log(`Service role key: ${service ? "present" : "missing (optional until you need admin writes)"}`);

let failures = 0;

async function check(label, fn) {
  try {
    const detail = await fn();
    console.log(`  ok   ${label}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    failures += 1;
    console.log(`  FAIL ${label} — ${error.message}`);
  }
}

console.log("\nSchema and policies");

const expectedTables = [
  "users",
  "customers",
  "orders",
  "order_items",
  "order_events",
  "follow_ups",
  "products",
  "product_images",
  "product_views",
  "shop_slug_history",
  "public_order_attempts",
  "auth_attempts",
];

await check("anon key can reach the REST API", async () => {
  // `/rest/v1/` itself answers 401; a real table query is the honest test.
  const { error, status } = await anonClient.from("profiles").select("id").limit(1);
  if (error && status === 401) throw new Error(error.message);
  return "reachable";
});

for (const table of expectedTables) {
  await check(`table ${table}`, async () => {
    const { error } = await anonClient.from(table).select("count", { count: "exact", head: true });
    // A missing table returns a PostgREST error; RLS returning 0 rows is fine.
    if (error) throw new Error(error.message);
    return "";
  });
}

await check("public_shops view", async () => {
  const { error } = await anonClient.from("public_shops").select("shop_slug").limit(1);
  if (error) throw new Error(error.message);
  return "";
});

console.log("\nStorage buckets");

// Bucket metadata needs the service role; the anon key is not allowed to list it.
const adminClient = service
  ? createClient(url, service, { auth: { persistSession: false } })
  : null;

for (const bucket of ["shop-assets", "product-images", "payment-receipts"]) {
  await check(`bucket ${bucket}`, async () => {
    if (!adminClient) return "skipped (no service role key)";
    const { data, error } = await adminClient.storage.getBucket(bucket);
    if (error) throw new Error(error.message);
    return data.public ? "public" : "private";
  });
}

console.log("\nMigrations");
const dir = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
console.log(`  ${files.length} local migration file(s): ${files.join(", ")}`);

console.log(
  failures === 0
    ? "\nAll checks passed — the project is ready for the app."
    : `\n${failures} check(s) failed. If tables are missing, run: pnpm db:supabase`,
);

process.exit(failures === 0 ? 0 : 1);
