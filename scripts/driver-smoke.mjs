/**
 * Proves the async driver works against Supabase, including RLS context.
 *
 * Creates a seller through Supabase Auth, writes a product through the driver as
 * that user (`set local role authenticated` + JWT claims), then reads as an
 * anonymous visitor and as a different seller to confirm the policies apply.
 *
 *   node --import ./scripts/register.mjs scripts/driver-smoke.mjs
 */
import { loadEnv } from "./load-env.mjs";
import { createPgDb } from "../lib/db/driver.ts";

loadEnv();

const url = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const dbUrl = process.env.SUPABASE_DB_URL ?? "";

if (!url || !anon || !service || !dbUrl) {
  console.error("Supabase env is incomplete; see .env.example.");
  process.exit(1);
}

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(url, service, { auth: { persistSession: false } });

const stamp = Date.now();
const password = "driver-smoke-123456";
const sellerEmail = `driver-seller-${stamp}@kandc.test`;
const otherEmail = `driver-other-${stamp}@kandc.test`;

let failures = 0;
function check(label, ok, detail = "") {
  if (ok) console.log(`  ok   ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const db = await createPgDb(dbUrl);

let sellerId = null;
let otherId = null;

try {
  const { data: seller, error: sellerError } = await admin.auth.admin.createUser({
    email: sellerEmail,
    password,
    email_confirm: true,
    user_metadata: { owner_name: "Driver Seller", business_name: "Driver Shop", account_type: "seller" },
  });
  if (sellerError) throw new Error(sellerError.message);
  sellerId = seller.user.id;

  const { data: other, error: otherError } = await admin.auth.admin.createUser({
    email: otherEmail,
    password,
    email_confirm: true,
    user_metadata: { owner_name: "Driver Other", business_name: "Driver Other Shop", account_type: "seller" },
  });
  if (otherError) throw new Error(otherError.message);
  otherId = other.user.id;

  console.log("\n1. Driver reads through the service role");
  const profile = await db.get(
    "SELECT id, shop_slug, account_type FROM profiles WHERE id = ?",
    [sellerId],
  );
  check("profile readable", Boolean(profile), String(profile?.shop_slug ?? ""));

  console.log("\n2. Writes as the signed-in seller (RLS enforced)");

  await db.withContext({ role: "authenticated", userId: sellerId }, async (tx) => {
    await tx.run(
      `INSERT INTO products (seller_id, name, slug, description, price_kobo, publication_status, availability)
       VALUES (?, ?, ?, ?, ?, 'published', 'available')`,
      [sellerId, "Driver Bag", `driver-bag-${stamp}`, "From the driver smoke test", 4500000],
    );
    await tx.run(
      `INSERT INTO products (seller_id, name, slug, description, price_kobo, publication_status, availability)
       VALUES (?, ?, ?, ?, ?, 'draft', 'available')`,
      [sellerId, "Driver Draft", `driver-draft-${stamp}`, "Should stay private", 1000000],
    );
  });

  const asSeller = await db.withContext({ role: "authenticated", userId: sellerId }, (tx) =>
    tx.all("SELECT name, publication_status FROM products WHERE seller_id = ? ORDER BY name", [sellerId]),
  );
  check("seller sees both of their products", asSeller.length === 2, `${asSeller.length} rows`);

  console.log("\n3. Reads as an anonymous visitor");
  const asAnon = await db.withContext({ role: "anon" }, (tx) =>
    tx.all("SELECT name FROM products WHERE seller_id = ?", [sellerId]),
  );
  check("anon sees only the published product", asAnon.length === 1, `${asAnon.length} rows`);
  check("anon cannot read profiles", (await db.withContext({ role: "anon" }, (tx) =>
    tx.all("SELECT id FROM profiles WHERE id = ?", [sellerId]),
  )).length === 0);

  console.log("\n4. Writes as another seller");
  const otherSees = await db.withContext({ role: "authenticated", userId: otherId }, (tx) =>
    tx.all("SELECT name FROM products WHERE seller_id = ?", [sellerId]),
  );
  check("other seller sees only the published product", otherSees.length === 1);

  let blocked = false;
  await db
    .withContext({ role: "authenticated", userId: otherId }, (tx) =>
      tx.run("UPDATE products SET price_kobo = 1 WHERE seller_id = ?", [sellerId]),
    )
    .catch(() => {
      blocked = true;
    });
  const afterUpdate = await db.withContext({ role: "authenticated", userId: otherId }, (tx) =>
    tx.all("SELECT price_kobo FROM products WHERE seller_id = ?", [sellerId]),
  );
  check(
    "another seller cannot change prices",
    blocked || afterUpdate.every((row) => Number(row.price_kobo) !== 1),
  );

  console.log("\n5. Parameter rewriting");
  const odd = await db.get("SELECT ? AS a, ? AS b", [1, "two"]);
  check("`?` placeholders are rewritten to `$n`", Number(odd?.a) === 1 && odd?.b === "two");
} catch (error) {
  failures += 1;
  console.error(`\nFAILED: ${error.message}`);
} finally {
  await db.close();
  for (const id of [sellerId, otherId]) {
    if (id) await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  console.log("\nCleaned up the smoke-test accounts (products cascade).");
}

console.log(
  failures === 0
    ? "\nDriver smoke test passed — the same repository SQL runs on Supabase with RLS."
    : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
