/**
 * Link tracking: source classification, privacy of visitor identity, view
 * recording rules, and the per-product performance numbers sellers see.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

const { signUp } = await import("../lib/auth/users.ts");
const { createProduct } = await import("../lib/repositories/products.ts");
const { createOrder } = await import("../lib/repositories/orders.ts");
const { getShopProfile } = await import("../lib/repositories/shop.ts");
const {
  classifyReferrerHost,
  classifyViewSource,
  conversionRate,
  SOURCE_LABELS,
} = await import("../lib/domain/analytics.ts");
const {
  hashVisitor,
  productPerformance,
  productPerformanceMap,
  pruneViews,
  recordProductView,
  shopPerformance,
  sourceBreakdown,
} = await import("../lib/repositories/analytics.ts");
const { getDb } = await import("../lib/db/index.ts");

let seller;
let otherSeller;
let product;
let draft;

before(async () => {
  const a = await signUp({
    email: "analytics-a@test.ng",
    password: "password123",
    ownerName: "Ada",
    businessName: "Analytics Shop",
  });
  if ("error" in a) throw new Error(a.error);
  seller = a.user;

  const b = await signUp({
    email: "analytics-b@test.ng",
    password: "password123",
    ownerName: "Bayo",
    businessName: "Analytics Other",
  });
  if ("error" in b) throw new Error(b.error);
  otherSeller = b.user;

  product = createProduct(seller.id, {
    name: "Tracked Bag",
    priceKobo: 2000000,
    publicationStatus: "published",
  });

  draft = createProduct(seller.id, {
    name: "Draft Bag",
    priceKobo: 1000000,
  });
});

/* -------------------------------------------------------------------------- */
/* Source classification                                                      */
/* -------------------------------------------------------------------------- */

test("referrers map to the platforms people actually share on", () => {
  const cases = [
    ["https://wa.me/2348030000000", "whatsapp"],
    ["https://web.whatsapp.com/", "whatsapp"],
    ["https://l.instagram.com/?u=abc", "instagram"],
    ["https://www.instagram.com/p/xyz/", "instagram"],
    ["https://lm.facebook.com/l.php?u=abc", "facebook"],
    ["https://m.facebook.com/", "facebook"],
    ["https://t.co/abc", "x"],
    ["https://x.com/user/status/1", "x"],
    ["https://t.me/share/url", "telegram"],
    ["https://www.tiktok.com/@shop", "tiktok"],
    ["https://www.google.com/search?q=bag", "search"],
    ["https://www.bing.com/search?q=bag", "search"],
  ];

  for (const [referrer, expected] of cases) {
    assert.equal(classifyReferrerHost(referrer).source, expected, referrer);
  }
});

test("unknown hosts are recorded as 'other' with only the host kept", () => {
  const result = classifyReferrerHost("https://news.example.com/some/long/path?secret=1");
  assert.equal(result.source, "other");
  assert.equal(result.referrerHost, "news.example.com");
  // The path and query are never stored.
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("a missing referrer is 'direct', not a guess", () => {
  assert.deepEqual(classifyReferrerHost(null), { source: "direct", referrerHost: null });
  assert.deepEqual(classifyReferrerHost(""), { source: "direct", referrerHost: null });
  assert.deepEqual(classifyReferrerHost("not a url"), { source: "direct", referrerHost: null });
});

test("navigation inside the shop is its own source", () => {
  const result = classifyReferrerHost("https://orderpilot.com/shop/mystore", "orderpilot.com");
  assert.equal(result.source, "shop");
  assert.equal(result.referrerHost, "orderpilot.com");

  // Development serves on a port; the comparison must ignore it.
  const withPort = classifyReferrerHost("http://localhost:3100/shop/mystore-fashion", "localhost");
  assert.equal(withPort.source, "shop");

  const sameHostWithPort = classifyReferrerHost(
    "http://localhost:3100/product/a/b",
    "localhost:3100",
  );
  assert.equal(sameHostWithPort.source, "shop");
  assert.equal(sameHostWithPort.referrerHost, "localhost");
});

test("an explicit ?src= tag wins over the referrer", () => {
  const tagged = classifyViewSource({
    src: "instagram",
    referrer: "https://wa.me/2348030000000",
    siteHost: "orderpilot.com",
  });
  assert.equal(tagged.source, "instagram");

  // Unknown or junk tags are ignored rather than stored.
  assert.equal(classifyViewSource({ src: "bitcoin", referrer: null }).source, "direct");
  assert.equal(classifyViewSource({ src: "  ", referrer: null }).source, "direct");
});

test("every source has a label for the dashboard", () => {
  for (const [key, label] of Object.entries(SOURCE_LABELS)) {
    assert.equal(typeof label, "string");
    assert.ok(label.length > 0, key);
  }
});

test("conversion is a percentage of unique visitors", () => {
  assert.equal(conversionRate(0, 0), 0);
  assert.equal(conversionRate(2, 10), 20);
  assert.equal(conversionRate(1, 3), 33.3);
  assert.equal(conversionRate(5, 0), 0);
});

/* -------------------------------------------------------------------------- */
/* Visitor privacy                                                            */
/* -------------------------------------------------------------------------- */

test("visitor hashes are stable within a day but not linkable across days", () => {
  const day1 = new Date("2026-02-01T09:00:00Z");
  const day2 = new Date("2026-02-02T09:00:00Z");
  const ua = "Mozilla/5.0 (iPhone) WhatsApp/2.23";

  const a = hashVisitor("197.210.1.1", ua, day1);
  const b = hashVisitor("197.210.1.1", ua, day1);
  const c = hashVisitor("197.210.1.1", ua, day2);
  const d = hashVisitor("197.210.1.1", "Mozilla/5.0 (Android)", day1);

  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
  assert.equal(a.length, 40);
  assert.equal(a.includes("197.210"), false);
});

/* -------------------------------------------------------------------------- */
/* Recording views                                                            */
/* -------------------------------------------------------------------------- */

test("views are recorded for published products only", () => {
  const recorded = recordProductView({
    productId: product.id,
    source: "whatsapp",
    referrerHost: "wa.me",
    visitorHash: hashVisitor("10.1.0.1", "ua-a"),
  });
  assert.equal(recorded, true);

  const draftRecorded = recordProductView({
    productId: draft.id,
    source: "whatsapp",
    visitorHash: hashVisitor("10.1.0.1", "ua-a"),
  });
  assert.equal(draftRecorded, false);

  const unknown = recordProductView({
    productId: "8f14e45f-ceea-467a-9c72-8b7cd58a7b1e",
    source: "direct",
    visitorHash: hashVisitor("10.1.0.1", "ua-a"),
  });
  assert.equal(unknown, false);

  // Nothing was stored for the draft or the unknown id.
  const rows = getDb()
    .prepare("SELECT COUNT(*) AS total FROM product_views WHERE product_id = ?")
    .get(draft.id);
  assert.equal(Number(rows.total), 0);
});

test("performance counts views, unique visitors, orders and conversion", () => {
  const before = productPerformance(seller.id, product.id, 30);

  // Two visitors, three views.
  const alice = hashVisitor("10.2.0.1", "ua-a");
  const bob = hashVisitor("10.2.0.2", "ua-b");
  recordProductView({ productId: product.id, source: "whatsapp", visitorHash: alice });
  recordProductView({ productId: product.id, source: "whatsapp", visitorHash: alice });
  recordProductView({ productId: product.id, source: "instagram", visitorHash: bob });

  // Two orders from this product.
  for (let index = 0; index < 2; index += 1) {
    createOrder(seller.id, {
      customer: { name: "Tracked Buyer", phone: `08099887${index}00`, address: "Lagos" },
      items: [{ description: product.name, quantity: 1, unitPriceKobo: 2000000, productId: product.id }],
      source: "product_link",
      productId: product.id,
    });
  }

  const after = productPerformance(seller.id, product.id, 30);
  assert.equal(after.views, before.views + 3);
  assert.equal(after.uniqueVisitors, before.uniqueVisitors + 2);
  assert.equal(after.orders, before.orders + 2);
  assert.equal(after.conversionRate, conversionRate(after.orders, after.uniqueVisitors));

});

test("cancelled orders do not count as conversions", () => {
  const before = productPerformance(seller.id, product.id, 30);
  const order = createOrder(seller.id, {
    customer: { name: "Cancelled Buyer", phone: "08077665544", address: "Lagos" },
    items: [{ description: product.name, quantity: 1, unitPriceKobo: 2000000, productId: product.id }],
    source: "product_link",
    productId: product.id,
  });
  getDb().prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(order.id);

  const after = productPerformance(seller.id, product.id, 30);
  assert.equal(after.orders, before.orders);
});

test("performance is scoped to the seller", () => {
  const mine = productPerformanceMap(seller.id, [product.id]);
  assert.ok(mine[product.id].views > 0);

  const theirs = productPerformanceMap(otherSeller.id, [product.id]);
  assert.equal(theirs[product.id].views, 0);
  assert.equal(theirs[product.id].orders, 0);

  assert.equal(shopPerformance(otherSeller.id, 30).views, 0);
  assert.deepEqual(sourceBreakdown(otherSeller.id, 30), []);
});

test("the shop summary and source breakdown aggregate the seller's traffic", () => {
  const summary = shopPerformance(seller.id, 30);
  assert.ok(summary.views > 0);
  assert.ok(summary.uniqueVisitors > 0);

  const sources = sourceBreakdown(seller.id, 30);
  assert.ok(sources.length > 0);
  assert.ok(sources.some((row) => row.source === "whatsapp"));
  const total = sources.reduce((sum, row) => sum + row.views, 0);
  assert.ok(total <= summary.views);
});

test("old views are pruned but recent ones are kept", () => {
  const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
  getDb()
    .prepare(
      `INSERT INTO product_views (id, product_id, seller_id, source, referrer_host, visitor_hash, created_at)
       VALUES (?, ?, ?, 'direct', NULL, ?, ?)`,
    )
    .run("00000000-0000-4000-8000-000000000001", product.id, seller.id, hashVisitor("10.9.9.9", "old"), old);

  const kept = productPerformance(seller.id, product.id, 3650).views;
  const removed = pruneViews(90);
  assert.ok(removed >= 1);
  assert.equal(productPerformance(seller.id, product.id, 3650).views, kept - 1);
});

test("views are attributed to a real seller, not a client-supplied one", () => {
  // recordProductView takes no seller id at all; it reads it from the product.
  const countBefore = Number(
    getDb().prepare("SELECT COUNT(*) AS total FROM product_views").get().total,
  );
  recordProductView({
    productId: product.id,
    source: "direct",
    visitorHash: hashVisitor("10.3.0.1", "ua"),
  });
  const rows = getDb()
    .prepare("SELECT seller_id FROM product_views ORDER BY created_at DESC LIMIT 1")
    .get();
  assert.equal(rows.seller_id, seller.id);
  assert.equal(
    Number(getDb().prepare("SELECT COUNT(*) AS total FROM product_views").get().total),
    countBefore + 1,
  );
});
