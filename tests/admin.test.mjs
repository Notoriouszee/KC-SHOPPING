/**
 * Admin area, delivery confirmation, site visits and password resets.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { signUp, authenticate } = await import("../lib/auth/users.ts");
const { createProduct } = await import("../lib/repositories/products.ts");
const { createCustomer } = await import("../lib/repositories/customers.ts");
const { createOrder, getOrderDetail, confirmReceived, confirmReceivedByToken } = await import(
  "../lib/repositories/orders.ts"
);
const { getShopProfile } = await import("../lib/repositories/shop.ts");
const { createPublicOrder, hashClientIp } = await import("../lib/repositories/public-orders.ts");
const {
  adminOverview,
  adminPayments,
  adminOrderByReference,
  adminShops,
  adminCustomers,
} = await import("../lib/repositories/admin.ts");
const { recordSiteVisit, visitorTotals, visitorSeries, topPages, hashSiteVisitor } = await import(
  "../lib/repositories/visits.ts"
);
const { createResetToken, resetPassword } = await import("../lib/auth/password-reset.ts");
const { getDb } = await import("../lib/db/index.ts");

let seller;
let buyer;
let product;
let order;

async function setup() {
  const s = await signUp({
    email: "admin-seller@test.ng",
    password: "password123",
    ownerName: "Ada",
    businessName: "Admin Test Shop",
  });
  if ("error" in s) throw new Error(s.error);
  seller = s.user;

  const b = await signUp({
    email: "admin-buyer@test.ng",
    password: "password123",
    ownerName: "Blessing",
    phone: "08095000001",
    accountType: "customer",
  });
  if ("error" in b) throw new Error(b.error);
  buyer = b.user;

  product = createProduct(seller.id, {
    name: "Admin Test Bag",
    priceKobo: 5000000,
    publicationStatus: "published",
  });

  order = createPublicOrder({
    shopSlug: getShopProfile(seller.id).shop_slug,
    productSlug: product.slug,
    name: "Blessing",
    phone: "08095000001",
    quantity: 1,
    buyerUserId: buyer.id,
    ipHash: hashClientIp("198.51.100.10"),
  });
}
await setup();

test("customers confirm delivery on their own order", () => {
  assert.equal(getOrderDetail(seller.id, order.orderId).received_confirmed_at, null);

  const confirmed = confirmReceived(order.orderId, buyer.id);
  assert.ok(confirmed.received_confirmed_at);

  // Idempotent: confirming twice does not move the timestamp.
  const again = confirmReceived(order.orderId, buyer.id);
  assert.equal(again.received_confirmed_at, confirmed.received_confirmed_at);

  // The seller sees it, which is the point.
  assert.ok(getOrderDetail(seller.id, order.orderId).received_confirmed_at);
});

test("a stranger cannot confirm someone else's delivery", () => {
  const other = createPublicOrder({
    shopSlug: getShopProfile(seller.id).shop_slug,
    productSlug: product.slug,
    name: "Blessing",
    phone: "08095000001",
    quantity: 1,
    buyerUserId: buyer.id,
    ipHash: hashClientIp("198.51.100.11"),
  });

  assert.throws(() => confirmReceived(other.orderId, seller.id), /not found/i);
  assert.equal(getOrderDetail(seller.id, other.orderId).received_confirmed_at, null);
});

test("delivery can also be confirmed with the order token", () => {
  const anonymous = createPublicOrder({
    shopSlug: getShopProfile(seller.id).shop_slug,
    productSlug: product.slug,
    name: "Walk In",
    phone: "08095000002",
    quantity: 1,
    ipHash: hashClientIp("198.51.100.12"),
  });

  confirmReceivedByToken(anonymous.token);
  assert.ok(getOrderDetail(seller.id, anonymous.orderId).received_confirmed_at);

  // An invalid token must not touch anything.
  assert.throws(() => confirmReceivedByToken("f".repeat(48)), /not found/i);
  assert.throws(() => confirmReceivedByToken("nope"), /not found/i);
});

test("cancelled orders cannot be confirmed", () => {
  const cancelled = createPublicOrder({
    shopSlug: getShopProfile(seller.id).shop_slug,
    productSlug: product.slug,
    name: "Blessing",
    phone: "08095000001",
    quantity: 1,
    buyerUserId: buyer.id,
    ipHash: hashClientIp("198.51.100.13"),
  });
  getDb().prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(cancelled.orderId);

  assert.throws(() => confirmReceived(cancelled.orderId, buyer.id), /cancelled/i);
});

test("admin overview counts across every seller", () => {
  const overview = adminOverview();
  assert.ok(overview.orders > 0);
  assert.ok(overview.sellers > 0);
  assert.ok(overview.customers > 0);
  assert.ok(overview.deliveriesConfirmedByCustomer >= 2);
  assert.ok(overview.outstandingKobo >= 0);
});

test("admin payment filters separate pending from confirmed", () => {
  const pending = adminPayments({ filter: "pending", limit: 200 });
  assert.ok(pending.every((row) => row.payment_status === "unpaid" || row.payment_status === "partial"));
  assert.ok(pending.every((row) => row.status !== "cancelled"));
  assert.ok(pending.some((row) => row.reference === order.reference));

  // Record a payment and it moves to the confirmed bucket.
  getDb()
    .prepare("UPDATE orders SET paid_kobo = total_kobo, payment_status = 'paid' WHERE id = ?")
    .run(order.orderId);

  const confirmed = adminPayments({ filter: "confirmed", limit: 200 });
  assert.ok(confirmed.some((row) => row.reference === order.reference));
  assert.ok(!adminPayments({ filter: "pending", limit: 200 }).some((row) => row.reference === order.reference));
});

test("admin search matches reference, shop and phone", () => {
  const byReference = adminPayments({ query: order.reference });
  assert.ok(byReference.some((row) => row.reference === order.reference));

  const byShop = adminPayments({ query: "Admin Test Shop" });
  assert.ok(byShop.length >= 1);

  const byPhone = adminPayments({ query: "08095000001" });
  assert.ok(byPhone.length >= 1);
});

test("a reference lookup returns the receipt and the timeline", () => {
  getDb()
    .prepare(
      "UPDATE orders SET receipt_url = ?, receipt_note = ?, receipt_uploaded_at = ? WHERE id = ?",
    )
    .run("/media/payment-receipts/dispute.png", "Paid from GTBank", new Date().toISOString(), order.orderId);

  const found = adminOrderByReference(order.reference.toLowerCase());
  assert.ok(found);
  assert.equal(found.reference, order.reference);
  assert.equal(found.receipt_url, "/media/payment-receipts/dispute.png");
  assert.equal(found.receipt_note, "Paid from GTBank");
  assert.ok(found.items.length >= 1);
  assert.ok(found.events.length >= 1);
  // The delivery confirmation is visible to the admin.
  assert.ok(found.received_confirmed_at);

  assert.equal(adminOrderByReference("OP-NOPE99"), null);
});

test("admin user lists include sellers and customers", () => {
  assert.ok(adminShops(200).some((shop) => shop.shop_slug === getShopProfile(seller.id).shop_slug));
  assert.ok(adminCustomers(200).some((customer) => customer.id === buyer.id));
});

test("site visits are counted per day, month and year", () => {
  const visitorHash = hashSiteVisitor("203.0.113.9", "test-agent");
  recordSiteVisit("/", visitorHash);
  recordSiteVisit("/shops", visitorHash);

  const totals = visitorTotals();
  assert.ok(totals.today >= 2);
  assert.ok(totals.thisMonth >= 2);
  assert.ok(totals.thisYear >= 2);
  assert.ok(totals.allTime >= 2);

  const days = visitorSeries("day", 30);
  assert.ok(days.length >= 1);
  assert.ok(days[0].visits >= 1);

  assert.ok(visitorSeries("month", 12).length >= 1);
  assert.ok(visitorSeries("year", 5).length >= 1);
  assert.ok(topPages(5).length >= 1);
});

test("the visitor hash is not the IP and changes daily", () => {
  const day = new Date("2026-01-01T10:00:00Z");
  const next = new Date("2026-01-02T10:00:00Z");
  const a = hashSiteVisitor("203.0.113.9", "ua", day);
  const b = hashSiteVisitor("203.0.113.9", "ua", next);

  assert.notEqual(a, "203.0.113.9");
  assert.notEqual(a, b);
});

test("a reset token changes the password once", async () => {
  const created = createResetToken("admin-buyer@test.ng", (token) => `/reset-password/${token}`);
  assert.ok(created);

  const before = await authenticate("admin-buyer@test.ng", "password123");
  assert.ok(before?.token);

  const result = await resetPassword(created.token, "brand-new-password");
  assert.deepEqual(result, { ok: true });

  // Old password no longer works, new one does (authenticate returns null on failure).
  const old = await authenticate("admin-buyer@test.ng", "password123");
  assert.equal(old, null);
  const fresh = await authenticate("admin-buyer@test.ng", "brand-new-password");
  assert.ok(fresh?.token);

  // Single use.
  const reuse = await resetPassword(created.token, "another-password");
  assert.equal(reuse.ok, false);
});

test("reset tokens are rejected when invalid or too short", async () => {
  assert.equal((await resetPassword("not-a-token", "long-enough-password")).ok, false);
  assert.equal((await resetPassword("a".repeat(64), "short")).ok, false);
  assert.equal(createResetToken("nobody@test.ng", (t) => t), null);
});
