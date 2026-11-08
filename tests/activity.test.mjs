/**
 * Activity tracking and the recommendation inputs.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

const { signUp } = await import("../lib/auth/users.ts");
const { updateShopProfile } = await import("../lib/repositories/shop.ts");
const { createProduct } = await import("../lib/repositories/products.ts");
const {
  ACTIVITY_WEIGHTS,
  buildAffinity,
  decayFactor,
  priceBand,
  recentActivity,
  recordActivity,
} = await import("../lib/repositories/activity.ts");
const { recommendedProducts } = await import("../lib/repositories/discovery.ts");
const { getDb } = await import("../lib/db/index.ts");

let customer;
let shopA;
let productA;

before(async () => {
  const seller = await signUp({
    email: "activity-seller@test.ng",
    password: "password123",
    ownerName: "Activity Seller",
    businessName: "Activity Shop",
    accountType: "seller",
  });
  if ("error" in seller) throw new Error(seller.error);
  await updateShopProfile(seller.user.id, { shopName: "Activity Shop", description: "x" });
  shopA = seller.user;

  productA = await createProduct(seller.user.id, {
    name: "Viewed Bag",
    priceKobo: 3_000_000,
    publicationStatus: "published",
  });

  for (let index = 0; index < 3; index += 1) {
    await createProduct(seller.user.id, {
      name: `Other Piece ${index}`,
      priceKobo: 3_500_000,
      publicationStatus: "published",
    });
  }

  const created = await signUp({
    email: "activity-buyer@test.ng",
    password: "password123",
    ownerName: "Activity Buyer",
    accountType: "customer",
  });
  if ("error" in created) throw new Error(created.error);
  customer = created.user;
});

test("weights follow the brief", () => {
  assert.equal(ACTIVITY_WEIGHTS.view, 2);
  assert.equal(ACTIVITY_WEIGHTS.search, 3);
  assert.equal(ACTIVITY_WEIGHTS.purchase, 10);
});

test("decay halves the influence every three weeks", () => {
  assert.equal(decayFactor(0), 1);
  assert.ok(Math.abs(decayFactor(21) - 0.5) < 1e-9);
  assert.ok(decayFactor(42) < 0.26);
});

test("price bands cover the whole range", () => {
  assert.equal(priceBand(500_000), "under-10k"); // 5,000 naira
  assert.equal(priceBand(1_500_000), "10k-25k");
  assert.equal(priceBand(3_000_000), "25k-50k");
  assert.equal(priceBand(7_000_000), "50k-100k");
  assert.equal(priceBand(20_000_000), "over-100k");
});

test("recording activity stores the weight and shop", async () => {
  await recordActivity({
    userId: customer.id,
    kind: "view",
    productId: productA.id,
    shopId: shopA.id,
  });

  const rows = await recentActivity(customer.id);
  const view = rows.find((row) => row.product_id === productA.id);

  assert.ok(view, "activity not stored");
  assert.equal(view.kind, "view");
  assert.equal(Number(view.weight), 2);
  assert.equal(view.shop_id, shopA.id);
});

test("repeated searches within the hour are de-duplicated", async () => {
  await recordActivity({ userId: customer.id, kind: "search", term: "leather bag" });
  await recordActivity({ userId: customer.id, kind: "search", term: "leather bag" });

  const rows = await recentActivity(customer.id);
  const searches = rows.filter((row) => row.kind === "search" && row.term === "leather bag");

  assert.equal(searches.length, 1);
});

test("affinity aggregates shops, bands and purchases", async () => {
  const rows = await recentActivity(customer.id);
  const prices = new Map([[productA.id, 3_000_000]]);
  const affinity = buildAffinity(rows, prices);

  assert.ok(affinity.shops.get(shopA.id) > 0);
  assert.ok(affinity.bands.get("25k-50k") > 0);
  assert.equal(affinity.hasSignal, true);
  assert.deepEqual(affinity.terms, ["leather bag"]);
});

test("recommendations are personalised once there is signal", async () => {
  const result = await recommendedProducts(customer.id, { seed: 11, limit: 6 });
  assert.equal(result.personalised, true);
  assert.ok(result.products.length > 0);
});

test("guests always get the general discovery feed", async () => {
  const result = await recommendedProducts(null, { seed: 11, limit: 6 });
  assert.equal(result.personalised, false);
  assert.equal(result.reason, "discovery");
  assert.ok(result.products.length > 0);
});

test("purchased products are excluded from recommendations", async () => {
  await recordActivity({
    userId: customer.id,
    kind: "purchase",
    productId: productA.id,
    shopId: shopA.id,
  });

  const result = await recommendedProducts(customer.id, { seed: 11, limit: 6 });
  assert.ok(!result.products.some((product) => product.id === productA.id));
});

test("activity rows are scoped to the customer", async () => {
  const other = await signUp({
    email: "activity-other@test.ng",
    password: "password123",
    ownerName: "Someone Else",
    accountType: "customer",
  });
  if ("error" in other) throw new Error(other.error);

  const rows = await recentActivity(other.user.id);
  assert.equal(rows.length, 0);

  const count = await (await getDb())
    .prepare("SELECT COUNT(*) AS c FROM customer_activity WHERE user_id = ?")
    .get(customer.id);
  assert.ok(Number(count.c) >= 3);
});