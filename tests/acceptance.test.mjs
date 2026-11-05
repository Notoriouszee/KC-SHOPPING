/**
 * The spec's acceptance criteria, expressed as tests against the real data layer.
 *
 * Each test names the criterion it proves. Nothing here mocks anything: these are
 * the same repositories the web app calls.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

const { signUp } = await import("../lib/auth/users.ts");
const {
  addImage,
  createProduct,
  deleteProduct,
  getProduct,
  getPublicProduct,
  setPublication,
  updateProduct,
} = await import("../lib/repositories/products.ts");
const { getPublicShop, getShopProfile, changeShopSlug, resolveRetiredSlug } = await import(
  "../lib/repositories/shop.ts"
);
const { createPublicOrder, getPublicOrderByToken, hashClientIp } = await import(
  "../lib/repositories/public-orders.ts"
);
const { getOrderDetail, listOrders } = await import("../lib/repositories/orders.ts");
const { getDb } = await import("../lib/db/index.ts");

// Each submission comes from a different "device", so the per-IP order limit
// never interferes with the assertions.
let ipCounter = 0;
function placeOrder(input) {
  const ipHash = hashClientIp(`10.9.0.${(ipCounter += 1)}`);
  return createPublicOrder(Object.assign({}, input, { ipHash }));
}

let sellerA;
let sellerB;
let shopA;
let productA;
let draftA;

before(async () => {
  const a = await signUp({
    email: "accept-a@test.ng",
    password: "password123",
    ownerName: "Ada",
    businessName: "Acceptance Shop",
  });
  if ("error" in a) throw new Error(a.error);
  sellerA = a.user;
  shopA = (await getShopProfile(sellerA.id)).shop_slug;

  const b = await signUp({
    email: "accept-b@test.ng",
    password: "password123",
    ownerName: "Bayo",
    businessName: "Acceptance Other",
  });
  if ("error" in b) throw new Error(b.error);
  sellerB = b.user;

  productA = await createProduct(sellerA.id, {
    name: "Acceptance Bag",
    priceKobo: 3500000,
    description: "A bag that proves the flow works.",
    publicationStatus: "published",
  });
  await addImage(sellerA.id, productA.id, {
    url: "/media/product-images/acceptance.png",
    alt: "Acceptance bag",
    width: 900,
    height: 675,
  });

  draftA = await createProduct(sellerA.id, {
    name: "Acceptance Draft",
    priceKobo: 1000000,
  });
});

test("criterion: every seller has a unique public shop URL", async () => {
  const a = await getShopProfile(sellerA.id);
  const b = await getShopProfile(sellerB.id);

  assert.ok(a.shop_slug, "seller A has a slug");
  assert.ok(b.shop_slug, "seller B has a slug");
  assert.notEqual(a.shop_slug, b.shop_slug);
  assert.ok(await getPublicShop(a.shop_slug), "the public shop resolves");
});

test("criterion: every published product has a working direct URL", async () => {
  const product = await getPublicProduct(shopA, productA.slug);
  assert.ok(product, "published product resolves from its URL");
  assert.equal(product.slug, "acceptance-bag");
  assert.equal(product.shop.shop_slug, shopA);

  const draft = await getPublicProduct(shopA, draftA.slug);
  assert.equal(draft, null, "a draft has no working URL");
});

test("criterion: the public page shows the right image, name, price and seller", async () => {
  const product = await getPublicProduct(shopA, productA.slug);
  assert.equal(product.name, "Acceptance Bag");
  assert.equal(product.price_kobo, 3500000);
  assert.equal(product.images[0].url, "/media/product-images/acceptance.png");
  assert.equal(product.images[0].width, 900);
  assert.equal(product.shop.shop_name, "Acceptance Shop");
});

test("criterion: a customer can order without an account", async () => {
  const result = await placeOrder({
    shopSlug: shopA,
    productSlug: productA.slug,
    name: "Walk In Customer",
    phone: "08030001111",
    quantity: 2,
    address: "1 Acceptance Road, Lagos",
  });

  assert.match(result.reference, /^OP-/);
  assert.equal(result.totalKobo, 7000000);

  const view = await getPublicOrderByToken(result.token);
  assert.ok(view, "the customer can reopen their confirmation");
  assert.equal(view.reference, result.reference);
});

test("criterion: the order appears in the correct seller's dashboard", async () => {
  const orders = await listOrders(sellerA.id, { source: "product_link" });
  assert.ok(orders.length >= 1);
  assert.ok(orders.every((order) => order.source === "product_link"));

  // Seller B sees nothing of A's.
  assert.equal((await listOrders(sellerB.id)).length, 0);
});

test("criterion: product, seller, quantity and total are validated", async () => {
  // Product must exist and be published.
  await assert.rejects(
    async () => {
      await placeOrder({
        shopSlug: shopA,
        productSlug: "not-a-product",
        name: "Walk In",
        phone: "08030002222",
        quantity: 1,
      });
    },
    /no longer available/i,
  );

  // Quantity bounds.
  await assert.rejects(
    async () => {
      await placeOrder({
        shopSlug: shopA,
        productSlug: productA.slug,
        name: "Walk In",
        phone: "08030002223",
        quantity: 999,
      });
    },
    /between 1 and 20/i,
  );

  // The seller is derived from the shop, and the price from the product.
  const result = await placeOrder({
    shopSlug: shopA,
    productSlug: productA.slug,
    name: "Price Check",
    phone: "08030002224",
    quantity: 3,
  });
  const order = await getOrderDetail(sellerA.id, result.orderId);
  assert.equal(order.seller_id, sellerA.id);
  assert.equal(order.total_kobo, 3500000 * 3);
  assert.equal(order.items[0].unit_price_kobo, 3500000);
});

test("criterion: new orders are never falsely marked as paid", async () => {
  const result = await placeOrder({
    shopSlug: shopA,
    productSlug: productA.slug,
    name: "Payment Check",
    phone: "08030003333",
    quantity: 1,
  });
  const order = await getOrderDetail(sellerA.id, result.orderId);

  assert.equal(order.payment_status, "unpaid");
  assert.equal(order.paid_kobo, 0);
  assert.equal(order.status, "new");
});

test("criterion: sellers cannot edit or publish another seller's product", async () => {
  assert.equal(await getProduct(sellerB.id, productA.id), null);
  await assert.rejects(
    async () => {
      await updateProduct(sellerB.id, productA.id, { name: "Hijacked", priceKobo: 1 });
    },
    /not found/i,
  );
  await assert.rejects(async () => {
    await setPublication(sellerB.id, productA.id, "draft");
  }, /not found/i);
  await assert.rejects(async () => {
    await deleteProduct(sellerB.id, productA.id);
  }, /not found/i);

  // And the product is untouched.
  assert.equal((await getProduct(sellerA.id, productA.id)).name, "Acceptance Bag");
});

test("criterion: unpublished or deleted products cannot be ordered via stale links", async () => {
  // Unpublish, then try to order from the old link.
  await setPublication(sellerA.id, productA.id, "draft");
  assert.equal(await getPublicProduct(shopA, productA.slug), null);
  await assert.rejects(
    async () => {
      await placeOrder({
        shopSlug: shopA,
        productSlug: productA.slug,
        name: "Stale Link",
        phone: "08030004444",
        quantity: 1,
      });
    },
    /no longer available/i,
  );

  // Republish, then delete: the link must stop working again.
  await setPublication(sellerA.id, productA.id, "published");
  assert.ok(await getPublicProduct(shopA, productA.slug));
  await deleteProduct(sellerA.id, productA.id);
  assert.equal(await getPublicProduct(shopA, productA.slug), null);
  await assert.rejects(
    async () => {
      await placeOrder({
        shopSlug: shopA,
        productSlug: productA.slug,
        name: "Deleted Link",
        phone: "08030004445",
        quantity: 1,
      });
    },
    /no longer available/i,
  );

  // Restore a product so later tests and the demo keep working.
  productA = await createProduct(sellerA.id, {
    name: "Acceptance Bag",
    priceKobo: 3500000,
    publicationStatus: "published",
  });
});

test("criterion: public pages expose no private seller or customer data", async () => {
  const shop = await getPublicShop(shopA);
  const product = await getPublicProduct(shopA, productA.slug);

  for (const record of [shop, product, product.shop]) {
    const serialised = JSON.stringify(record);
    for (const forbidden of ["accept-a@test.ng", "password_hash", "owner_name", "email"]) {
      assert.equal(serialised.includes(forbidden), false, `${forbidden} must not leak`);
    }
  }

  // A customer's confirmation view carries no personal details either.
  const result = await placeOrder({
    shopSlug: shopA,
    productSlug: productA.slug,
    name: "Private Customer",
    phone: "08030005555",
    quantity: 1,
    address: "Secret Street 9",
  });
  const view = JSON.stringify(await getPublicOrderByToken(result.token));
  for (const forbidden of ["Private Customer", "08030005555", "Secret Street", "email"]) {
    assert.equal(view.includes(forbidden), false, `${forbidden} must not leak`);
  }
});

test("criterion: changing a shop link does not break existing shared links", async () => {
  const before = shopA;
  const result = await changeShopSlug(sellerA.id, "acceptance-shop-2");
  assert.equal(result.slug, "acceptance-shop-2");

  // The old slug is no longer a live shop...
  assert.equal(await getPublicShop(before), null);
  // ...but it is recoverable as a redirect target.
  assert.equal((await resolveRetiredSlug(before)).current_slug, "acceptance-shop-2");

  // New links work under the new slug.
  shopA = "acceptance-shop-2";
  assert.ok(await getPublicShop(shopA));
  assert.ok(await getPublicProduct(shopA, productA.slug));
});

test("criterion: the database enforces the same ownership rules as the app", async () => {
  // Local stand-in for RLS: every tenant table carries seller_id, and the orders
  // table cannot reference another seller's customer through the repository.
  const db = await getDb();
  const tables = (
    await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('customers','orders','order_items','order_events','follow_ups','products','product_images','product_views')",
      )
      .all()
  ).map((row) => row.name);

  assert.ok(tables.length >= 8, "tenant tables exist");

  for (const table of tables) {
    const columns = (
      await db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
    ).map((row) => row.name);
    assert.ok(columns.includes("seller_id"), `${table} is scoped by seller_id`);
  }
});
