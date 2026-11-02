/**
 * Public ordering: validation, server-side pricing, attribution, abuse limits,
 * and what the customer's confirmation page is allowed to reveal.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

const { signUp } = await import("../lib/auth/users.ts");
const { createProduct, setPublication, setAvailability } = await import(
  "../lib/repositories/products.ts"
);
const { getShopProfile } = await import("../lib/repositories/shop.ts");
const { listOrders, getOrderDetail } = await import("../lib/repositories/orders.ts");
const { createPublicOrder, getPublicOrderByToken, hashClientIp, isRateLimited } = await import(
  "../lib/repositories/public-orders.ts"
);
const { PUBLIC_ORDER_MAX_PER_WINDOW } = await import("../lib/domain/public-order.ts");

let sellerA;
let sellerB;
let shopSlug;
let bag;
let draft;
let soldOut;

const VALID = () => ({
  name: "Chinedu Eze",
  phone: "0803 123 4567",
  quantity: 1,
  address: "12 Admiralty Way, Lekki",
});

before(async () => {
  const a = await signUp({
    email: "order-a@test.ng",
    password: "password123",
    ownerName: "Ada",
    businessName: "Order Shop",
  });
  if ("error" in a) throw new Error(a.error);
  sellerA = a.user;
  shopSlug = getShopProfile(sellerA.id).shop_slug;

  const b = await signUp({
    email: "order-b@test.ng",
    password: "password123",
    ownerName: "Bayo",
    businessName: "Other Shop",
  });
  if ("error" in b) throw new Error(b.error);
  sellerB = b.user;

  bag = createProduct(sellerA.id, {
    name: "Public Bag",
    priceKobo: 4500000,
    publicationStatus: "published",
  });

  draft = createProduct(sellerA.id, {
    name: "Draft Bag",
    priceKobo: 1000000,
    publicationStatus: "draft",
  });

  soldOut = createProduct(sellerA.id, {
    name: "Sold Out Bag",
    priceKobo: 2000000,
    publicationStatus: "published",
  });
  setAvailability(sellerA.id, soldOut.id, "out_of_stock");
});

test("a customer can place an order without an account, priced by the database", () => {
  const result = createPublicOrder({
    shopSlug,
    productSlug: bag.slug,
    name: "Chinedu Eze",
    phone: "0803 123 4567",
    quantity: 2,
    address: "12 Admiralty Way, Lekki",
    notes: "Please call before delivery",
    ipHash: hashClientIp("10.0.0.1"),
  });

  assert.match(result.reference, /^OP-[0-9A-HJKMNP-TV-Z]{6}$/);
  assert.equal(result.token.length, 48);
  // Two bags at the database price, not anything the client sent.
  assert.equal(result.totalKobo, 9000000);

  const order = getOrderDetail(sellerA.id, result.orderId);
  assert.ok(order);
  assert.equal(order.source, "product_link");
  assert.equal(order.status, "new");
  assert.equal(order.payment_status, "unpaid");
  assert.equal(order.total_kobo, 9000000);
  assert.equal(order.paid_kobo, 0);
  assert.equal(order.product_id, bag.id);
  assert.equal(order.items[0].product_id, bag.id);
  assert.equal(order.items[0].description, "Public Bag");
  assert.equal(order.customer_name, "Chinedu Eze");
  assert.equal(order.delivery_address, "12 Admiralty Way, Lekki");
  assert.match(order.events[0].message, /shared product link/i);
});

test("the order shows up in the right seller's dashboard only", () => {
  const mine = listOrders(sellerA.id, { source: "product_link" });
  assert.ok(mine.length >= 1);
  assert.ok(mine.every((order) => order.source === "product_link"));

  const theirs = listOrders(sellerB.id);
  assert.equal(theirs.length, 0);
});

test("submitted prices are ignored — the product price wins", () => {
  // There is no price field in the input type at all; this asserts the total the
  // database derives for a quantity of 3.
  const result = createPublicOrder({
    ...VALID(),
    shopSlug,
    productSlug: bag.slug,
    quantity: 3,
    ipHash: hashClientIp("10.0.0.2"),
  });
  assert.equal(result.totalKobo, 4500000 * 3);
});

test("customer details are validated", () => {
  assert.throws(
    () => createPublicOrder({ ...VALID(), name: "", shopSlug, productSlug: bag.slug, ipHash: hashClientIp("10.0.1.1") }),
    /Enter your name/i,
  );
  assert.throws(
    () => createPublicOrder({ ...VALID(), phone: "abc", shopSlug, productSlug: bag.slug, ipHash: hashClientIp("10.0.1.2") }),
    /valid phone number/i,
  );
  assert.throws(
    () => createPublicOrder({ ...VALID(), quantity: 0, shopSlug, productSlug: bag.slug, ipHash: hashClientIp("10.0.1.3") }),
    /between 1 and 20/i,
  );
  assert.throws(
    () => createPublicOrder({ ...VALID(), quantity: 21, shopSlug, productSlug: bag.slug, ipHash: hashClientIp("10.0.1.4") }),
    /between 1 and 20/i,
  );
  assert.throws(
    () => createPublicOrder({ ...VALID(), notes: "x".repeat(501), shopSlug, productSlug: bag.slug, ipHash: hashClientIp("10.0.1.5") }),
    /under 500/i,
  );
});

test("drafts, sold-out and unknown products cannot be ordered", () => {
  assert.throws(
    () => createPublicOrder({ ...VALID(), shopSlug, productSlug: draft.slug, ipHash: hashClientIp("10.0.2.1") }),
    /no longer available/i,
  );
  assert.throws(
    () => createPublicOrder({ ...VALID(), shopSlug, productSlug: soldOut.slug, ipHash: hashClientIp("10.0.2.2") }),
    /out of stock/i,
  );
  assert.throws(
    () => createPublicOrder({ ...VALID(), shopSlug, productSlug: "does-not-exist", ipHash: hashClientIp("10.0.2.3") }),
    /no longer available/i,
  );
  assert.throws(
    () => createPublicOrder({ ...VALID(), shopSlug: "no-such-shop", productSlug: bag.slug, ipHash: hashClientIp("10.0.2.4") }),
    /no longer available/i,
  );
});

test("the honeypot rejects bots and records the attempt", () => {
  assert.throws(
    () =>
      createPublicOrder({
        ...VALID(),
        shopSlug,
        productSlug: bag.slug,
        honeypot: "http://spam.example",
        ipHash: hashClientIp("10.0.3.1"),
      }),
    /could not place that order/i,
  );

  // One bot attempt must not consume a whole human's allowance, but it is counted.
  assert.equal(isRateLimited(hashClientIp("10.0.3.1")), false);
});

test("repeat submissions from one device are rate limited", () => {
  const ip = hashClientIp("10.0.4.1");
  for (let index = 0; index < PUBLIC_ORDER_MAX_PER_WINDOW; index += 1) {
    createPublicOrder({ ...VALID(), shopSlug, productSlug: bag.slug, quantity: 1, ipHash: ip });
  }

  assert.equal(isRateLimited(ip), true);
  assert.throws(
    () => createPublicOrder({ ...VALID(), shopSlug, productSlug: bag.slug, ipHash: ip }),
    /Too many order attempts/i,
  );
});

test("the confirmation page reveals order facts, never personal details", () => {
  const created = createPublicOrder({
    ...VALID(),
    shopSlug,
    productSlug: bag.slug,
    quantity: 2,
    address: "7 Bodija Estate, Ibadan",
    ipHash: hashClientIp("10.0.5.1"),
  });

  const view = getPublicOrderByToken(created.token);
  assert.ok(view);
  assert.equal(view.reference, created.reference);
  assert.equal(view.product_name, "Public Bag");
  assert.equal(view.quantity, 2);
  assert.equal(view.total_kobo, 9000000);
  assert.equal(view.unit_price_kobo, 4500000);
  assert.equal(view.payment_status, "unpaid");
  assert.equal(view.shop_name, "Order Shop");
  assert.equal(view.shop_slug, shopSlug);
  assert.ok(view.created_at);

  // Nothing sensitive travels with the public view.
  for (const forbidden of ["customer_name", "customer_phone", "phone", "delivery_address", "email", "seller_id"]) {
    assert.equal(forbidden in view, false, `${forbidden} must not be exposed`);
  }
  assert.equal(JSON.stringify(view).includes("Chinedu"), false);
  assert.equal(JSON.stringify(view).includes("Ibadan"), false);
});

test("bad confirmation tokens return nothing", () => {
  assert.equal(getPublicOrderByToken(""), null);
  assert.equal(getPublicOrderByToken("not-a-token"), null);
  assert.equal(getPublicOrderByToken("a".repeat(47)), null);
  assert.equal(getPublicOrderByToken("a".repeat(48)), null);
  assert.equal(getPublicOrderByToken("Z".repeat(48)), null);
});

test("tokens are unique per order", () => {
  const first = createPublicOrder({ ...VALID(), shopSlug, productSlug: bag.slug, ipHash: hashClientIp("10.0.6.1") });
  const second = createPublicOrder({ ...VALID(), shopSlug, productSlug: bag.slug, ipHash: hashClientIp("10.0.6.2") });
  assert.notEqual(first.token, second.token);
  assert.notEqual(first.reference, second.reference);
});

test("customer IPs are hashed with a per-day salt", () => {
  const day = new Date("2026-01-01T10:00:00Z");
  const sameDay = hashClientIp("197.210.1.1", day);
  const nextDay = hashClientIp("197.210.1.1", new Date("2026-01-02T10:00:00Z"));

  assert.equal(hashClientIp("197.210.1.1", day), sameDay);
  assert.notEqual(sameDay, nextDay);
  assert.equal(sameDay.includes("197.210"), false);
  assert.equal(sameDay.length, 40);
});

test("publishing an order does not mark it paid", () => {
  const result = createPublicOrder({
    ...VALID(),
    shopSlug,
    productSlug: bag.slug,
    quantity: 1,
    ipHash: hashClientIp("10.0.7.1"),
  });
  const order = getOrderDetail(sellerA.id, result.orderId);
  assert.equal(order.payment_status, "unpaid");
  assert.equal(order.paid_kobo, 0);
});
