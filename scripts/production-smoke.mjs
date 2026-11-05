/**
 * End-to-end check of the **production** backends.
 *
 * Runs the real repositories against Supabase Postgres and the real image path
 * against Supabase Storage, then cleans up after itself. This is the check that
 * proves the Vercel configuration works without deploying.
 *
 *   node --import ./scripts/register.mjs scripts/production-smoke.mjs
 *
 * It forces DATA_BACKEND=supabase / STORAGE_BACKEND=supabase, so it always
 * exercises Postgres and the bucket even if .env.local says otherwise.
 */
import { loadEnv } from "./load-env.mjs";

loadEnv();

process.env.DATA_BACKEND = "supabase";
process.env.STORAGE_BACKEND = "supabase";

const url = process.env.SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const dbUrl = process.env.SUPABASE_DB_URL ?? "";

if (!url || !serviceKey || !dbUrl) {
  console.error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_DB_URL are required.");
  process.exit(1);
}

const { signUp, findUserByEmail, authenticate } = await import("../lib/auth/users.ts");
const { updateShopProfile, getShopProfile, getPublicShop, listPublicShops } = await import(
  "../lib/repositories/shop.ts"
);
const { createProduct, listPublicCatalogue, getPublicProduct, setCoverImage } = await import(
  "../lib/repositories/products.ts"
);
const { createCustomer } = await import("../lib/repositories/customers.ts");
const { createOrder, recordPayment, getOrderDetail } = await import("../lib/repositories/orders.ts");
const { subscriptionState } = await import("../lib/repositories/subscriptions.ts");
const { saveImage, deleteStoredImage, parseStoredUrl } = await import("../lib/storage.ts");
const { getDb } = await import("../lib/db/index.ts");
const { recordSiteVisit, visitorTotals } = await import("../lib/repositories/visits.ts");

const stamp = Date.now();
const email = `smoke-${stamp}@kandc.example`;

let failures = 0;
function check(label, ok, detail = "") {
  if (ok) console.log(`  ok   ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

let sellerId = null;
let imageUrl = null;

try {
  console.log("\n1. Writes go to Postgres");

  const created = await signUp({
    email,
    password: "smoke-password-123",
    ownerName: "Smoke Seller",
    businessName: "Smoke Postgres Shop",
    accountType: "seller",
  });
  if ("error" in created) throw new Error(created.error);
  sellerId = created.user.id;
  check("seller created", Boolean(sellerId), sellerId.slice(0, 8) + "…");

  await updateShopProfile(sellerId, {
    shopName: "Smoke Postgres Shop",
    description: "Created by the production smoke test.",
    contactPhone: "08030000000",
    bankName: "GTBank",
    accountName: "Smoke Shop",
    accountNumber: "0123456789",
    deliveryFeeKobo: 150000,
    deliveryNote: "Paid on delivery",
  });

  const profile = await getShopProfile(sellerId);
  check("shop profile round-trips", profile?.shop_bank_name === "GTBank");
  check("shop slug assigned", Boolean(profile?.shop_slug), profile?.shop_slug ?? "");

  const product = await createProduct(sellerId, {
    name: "Smoke Bag",
    priceKobo: 5000000,
    publicationStatus: "published",
  });
  check("product created", Boolean(product?.id), product?.slug ?? "");

  const publicProduct = await getPublicProduct(profile.shop_slug, product.slug);
  check("product readable through the public query", Boolean(publicProduct));

  const catalogue = await listPublicCatalogue(10);
  check("catalogue includes it", catalogue.some((row) => row.id === product.id));

  const customer = await createCustomer(sellerId, {
    name: "Smoke Buyer",
    phone: "08031111111",
  });
  const order = await createOrder(sellerId, {
    customer: { id: customer.id },
    items: [{ description: "Smoke Bag", quantity: 1, unitPriceKobo: 5000000 }],
    deliveryFeeKobo: 0,
    source: "manual",
  });
  check("order created", Boolean(order?.id), order?.reference ?? "");

  const paid = await recordPayment(sellerId, order.id, 5000000);
  check("payment recorded", paid.payment_status === "paid");

  const detail = await getOrderDetail(sellerId, order.id);
  check("order detail reads back", detail?.paid_kobo === 5000000);

  const subscription = await subscriptionState(sellerId);
  check("trial subscription created", subscription.status === "trialing" && subscription.active);

  const shops = await listPublicShops({ limit: 50 });
  check("public shop listing works", shops.some((shop) => shop.shop_slug === profile.shop_slug));

  console.log("\n2. Uploads go to Supabase Storage");

  // Smallest valid PNG (1x1, transparent).
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const file = new File([png], "smoke.png", { type: "image/png" });
  const saved = await saveImage(file, { folder: "shop-logos", ownerId: sellerId });

  if ("error" in saved) {
    check("image saved", false, saved.error);
  } else {
    imageUrl = saved.url;
    check("image saved", true, saved.url.slice(0, 60) + "…");
    check("public bucket URL", saved.url.includes("/storage/v1/object/public/"));

    const parsed = parseStoredUrl(saved.url);
    check("stored URL parses", Boolean(parsed?.bucket && parsed?.key), parsed?.bucket ?? "");

    const response = await fetch(saved.url);
    check("image is fetchable", response.status === 200, String(response.status));

    const rejected = await saveImage(new File([Buffer.from("not an image")], "x.png"), {
      folder: "shop-logos",
      ownerId: sellerId,
    });
    check("invalid bytes rejected", "error" in rejected);
  }

  console.log("\n3. Postgres is the database actually in use");

  const db = await getDb();
  const row = await db.get("SELECT email FROM users WHERE id = ?", sellerId);
  check("row is in Postgres", row?.email === email, String(row?.email ?? ""));

  await recordSiteVisit("/smoke", `smoke-${stamp}`);
  const totals = await visitorTotals();
  check("visit counter works", totals.allTime >= 1);

  const login = await authenticate(email, "smoke-password-123");
  check("password verify works on Postgres hashes", Boolean(login?.token));
} catch (error) {
  failures += 1;
  console.error(`\nFAILED: ${error.stack ?? error.message}`);
} finally {
  if (imageUrl) await deleteStoredImage(imageUrl).catch(() => {});

  if (sellerId) {
    // Cascades through products, orders, sessions and subscriptions.
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    try {
      await client.connect();
      await client.query("delete from public.users where id = $1", [sellerId]);
      console.log("\nCleaned up the smoke-test seller.");
    } finally {
      await client.end().catch(() => {});
    }
  }
}

console.log(
  failures === 0
    ? "\nProduction smoke test passed — Postgres and Storage both work."
    : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
