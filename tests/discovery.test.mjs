/**
 * Product discovery: randomised but stable ordering, seller fairness, exclusions.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

const { signUp } = await import("../lib/auth/users.ts");
const { updateShopProfile } = await import("../lib/repositories/shop.ts");
const { createProduct } = await import("../lib/repositories/products.ts");
const {
  discoverProducts,
  newArrivals,
  applySellerCap,
  simpleHash,
} = await import("../lib/repositories/discovery.ts");

const sellers = [];

before(async () => {
  for (const [index, name] of ["Atelier", "Finery", "Sole"].entries()) {
    const created = await signUp({
      email: `discover-${name.toLowerCase()}@test.ng`,
      password: "password123",
      ownerName: `${name} Owner`,
      businessName: `${name} House`,
      accountType: "seller",
    });
    if ("error" in created) throw new Error(created.error);

    await updateShopProfile(created.user.id, {
      shopName: `${name} House`,
      description: `Shop ${index}`,
    });

    for (let item = 0; item < 3; item += 1) {
      await createProduct(created.user.id, {
        name: `${name} Piece ${item}`,
        priceKobo: 1_000_000 + index * 500_000 + item,
        publicationStatus: "published",
      });
    }

    sellers.push(created.user);
  }
});

test("the feed never returns more than two products from one seller", async () => {
  const products = await discoverProducts({ seed: 42, limit: 6 });
  assert.ok(products.length > 0, "expected products");

  const perSeller = new Map();
  for (const product of products) {
    perSeller.set(product.seller_id, (perSeller.get(product.seller_id) ?? 0) + 1);
  }

  for (const [sellerId, count] of perSeller) {
    assert.ok(count <= 2, `seller ${sellerId} appeared ${count} times`);
  }
});

test("the same seed returns the same order, a different seed shuffles", async () => {
  const first = await discoverProducts({ seed: 1234, limit: 9 });
  const again = await discoverProducts({ seed: 1234, limit: 9 });
  assert.deepEqual(
    first.map((product) => product.id),
    again.map((product) => product.id),
    "same seed must be stable (pagination relies on it)",
  );

  const orders = new Set();
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const products = await discoverProducts({ seed, limit: 9 });
    orders.add(products.map((product) => product.id).join(","));
  }

  assert.ok(orders.size > 1, "different seeds should produce different arrangements");
});

test("pagination with one seed does not repeat products across pages", async () => {
  const pageOne = await discoverProducts({ seed: 777, limit: 3, offset: 0 });
  const pageTwo = await discoverProducts({ seed: 777, limit: 3, offset: 3 });

  const overlap = pageOne.filter((product) => pageTwo.some((other) => other.id === product.id));
  assert.equal(overlap.length, 0, "pages must not repeat products");
});

test("drafts and sold-out products are excluded", async () => {
  const draft = await createProduct(sellers[0].id, {
    name: "Secret Draft",
    priceKobo: 900_000,
    publicationStatus: "draft",
  });

  const soldOut = await createProduct(sellers[1].id, {
    name: "Gone Piece",
    priceKobo: 900_000,
    publicationStatus: "published",
    availability: "out_of_stock",
  });

  const products = await discoverProducts({ seed: 5, limit: 30 });
  const ids = products.map((product) => product.id);
  assert.ok(!ids.includes(draft.id), "draft leaked into the feed");
  assert.ok(!ids.includes(soldOut.id), "sold-out product leaked into the feed");
});

test("new arrivals are newest-first", async () => {
  const arrivals = await newArrivals(5, 3);
  assert.ok(arrivals.length > 0);

  const times = arrivals.map((product) => new Date(product.created_at).getTime());
  const sorted = [...times].sort((a, b) => b - a);
  assert.deepEqual(times, sorted);
});

test("applySellerCap respects the cap and fills the page", () => {
  const base = { slug: "x", price_kobo: 1, availability: "available", shop_slug: "s", cover_url: null, created_at: new Date().toISOString() };
  const products = [
    { ...base, id: "1", name: "a", seller_id: "s1", shop_name: "A", views: 0 },
    { ...base, id: "2", name: "b", seller_id: "s1", shop_name: "A", views: 0 },
    { ...base, id: "3", name: "c", seller_id: "s1", shop_name: "A", views: 0 },
    { ...base, id: "4", name: "d", seller_id: "s2", shop_name: "B", views: 0 },
  ];

  const capped = applySellerCap(products, 4, 2);
  assert.equal(capped.length, 4, "short pages are topped up from the overflow");
  assert.equal(capped.filter((product) => product.seller_id === "s1").length, 3);
});

test("simpleHash is stable and numeric", () => {
  assert.equal(simpleHash("abc"), simpleHash("abc"));
  assert.notEqual(simpleHash("abc"), simpleHash("abd"));
  assert.ok(simpleHash("abc") >= 0);
});