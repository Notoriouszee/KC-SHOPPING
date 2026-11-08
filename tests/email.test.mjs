/**
 * Order notifications: exactly-once, failure-tolerant, and safe for guests.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const { signUp } = await import("../lib/auth/users.ts");
const { updateShopProfile, getShopProfile } = await import("../lib/repositories/shop.ts");
const { createProduct } = await import("../lib/repositories/products.ts");
const { createPublicOrder, hashClientIp } = await import("../lib/repositories/public-orders.ts");
const { updateOrderStatus } = await import("../lib/repositories/orders.ts");
const {
  notifySellerNewOrder,
  notifyCustomerOutForDelivery,
  retryFailedEmails,
} = await import("../lib/email/notify.ts");
const { sendEmail, emailConfigured } = await import("../lib/email/transport.ts");
const { getDb } = await import("../lib/db/index.ts");

let seller;
let buyer;
let product;
let shopSlug;

const originalKey = process.env.RESEND_API_KEY;
const originalFetch = globalThis.fetch;

async function events(orderId) {
  const db = await getDb();
  return db
    .prepare("SELECT kind, status, recipient, attempts FROM email_events WHERE order_id = ? ORDER BY kind")
    .all(orderId);
}

async function placeOrder(extra = {}) {
  return createPublicOrder({
    shopSlug,
    productSlug: product.slug,
    name: "Email Buyer",
    phone: "08031234567",
    quantity: 1,
    address: "1 Mail Street, Lagos",
    ipHash: hashClientIp(`email-test-${Date.now()}-${Math.random()}`),
    ...extra,
  });
}

before(async () => {
  delete process.env.RESEND_API_KEY;

  const created = await signUp({
    email: "email-seller@test.ng",
    password: "password123",
    ownerName: "Email Seller",
    businessName: "Email Shop",
    accountType: "seller",
  });
  if ("error" in created) throw new Error(created.error);
  seller = created.user;

  await updateShopProfile(seller.id, { shopName: "Email Shop", description: "Shop for email tests" });
  shopSlug = (await getShopProfile(seller.id)).shop_slug;

  product = await createProduct(seller.id, {
    name: "Emailed Bag",
    priceKobo: 4_000_000,
    publicationStatus: "published",
  });

  const customer = await signUp({
    email: "email-buyer@test.ng",
    password: "password123",
    ownerName: "Email Buyer",
    accountType: "customer",
  });
  if ("error" in customer) throw new Error(customer.error);
  buyer = customer.user;
});

after(() => {
  if (originalKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalKey;
  globalThis.fetch = originalFetch;
});

test("placing an order notifies the seller exactly once", async () => {
  const order = await placeOrder({ buyerUserId: buyer.id });
  const rows = (await events(order.orderId)).filter((row) => row.kind === "seller_new_order");

  assert.equal(rows.length, 1, "seller should be notified once");
  assert.equal(rows[0].recipient, "email-seller@test.ng");
  // No provider configured in tests: recorded as skipped, never as a failure.
  assert.equal(rows[0].status, "skipped");
});

test("a second attempt does not send a duplicate", async () => {
  const order = await placeOrder({ buyerUserId: buyer.id });
  await notifySellerNewOrder(order.orderId);
  await notifySellerNewOrder(order.orderId);

  const rows = (await events(order.orderId)).filter((row) => row.kind === "seller_new_order");
  assert.equal(rows.length, 1);
});

test("going out for delivery notifies the customer once", async () => {
  const order = await placeOrder({ buyerUserId: buyer.id });

  await updateOrderStatus(seller.id, order.orderId, "confirmed");
  await updateOrderStatus(seller.id, order.orderId, "processing");
  await updateOrderStatus(seller.id, order.orderId, "ready");
  await updateOrderStatus(seller.id, order.orderId, "ready");

  const rows = (await events(order.orderId)).filter((row) => row.kind === "customer_out_for_delivery");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].recipient, "email-buyer@test.ng");
});

test("a guest order records a skipped customer notification", async () => {
  const order = await placeOrder();

  await updateOrderStatus(seller.id, order.orderId, "confirmed");
  await updateOrderStatus(seller.id, order.orderId, "processing");
  await updateOrderStatus(seller.id, order.orderId, "ready");

  const rows = (await events(order.orderId)).filter((row) => row.kind === "customer_out_for_delivery");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "skipped");
  assert.equal(rows[0].recipient, "");
});

test("a provider failure is recorded, not thrown", async () => {
  process.env.RESEND_API_KEY = "re_test_key";

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: "provider is down" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });

  const order = await placeOrder({ buyerUserId: buyer.id });

  const rows = (await events(order.orderId)).filter((row) => row.kind === "seller_new_order");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "failed");
  assert.ok(Number(rows[0].attempts) >= 1);
});

test("failed notifications can be retried successfully", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ id: "email_123" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const result = await retryFailedEmails(20);
  assert.ok(result.sent >= 1, "expected at least one retry to succeed");
  assert.equal(result.failed, 0);

  const db = await getDb();
  const rows = await db
    .prepare("SELECT status FROM email_events WHERE status = 'failed'")
    .all();
  assert.equal(rows.length, 0);
});

test("sending is skipped, not failed, when no provider is configured", async () => {
  delete process.env.RESEND_API_KEY;
  assert.equal(emailConfigured(), false);

  const result = await sendEmail({
    to: "someone@test.ng",
    subject: "Test",
    html: "<p>Hello</p>",
    text: "Hello",
  });

  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
});

test("an invalid recipient is rejected without throwing", async () => {
  process.env.RESEND_API_KEY = "re_test_key";
  const result = await sendEmail({ to: "not-an-email", subject: "x", html: "", text: "" });
  assert.equal(result.ok, false);
  assert.match(result.error, /Invalid recipient/);
  delete process.env.RESEND_API_KEY;
  globalThis.fetch = originalFetch;
});

test("the templates carry the order details and brand", async () => {
  const { sellerNewOrderEmail, outForDeliveryEmail } = await import("../lib/email/templates.ts");

  const data = {
    reference: "OP-TEST01",
    shopName: "Email Shop",
    customerName: "Email Buyer",
    customerPhone: "08031234567",
    totalKobo: 4_000_000,
    paymentStatus: "unpaid",
    status: "new",
    items: [{ name: "Emailed Bag", quantity: 2, unitPriceKobo: 2_000_000 }],
    deliveryAddress: "1 Mail Street",
    orderUrl: "https://example.test/orders/1",
    supportEmail: "kandcshopping11@gmail.com",
  };

  const sellerMail = sellerNewOrderEmail(data);
  assert.equal(sellerMail.subject, "New Order Received — K&C Shopping");
  assert.match(sellerMail.html, /OP-TEST01/);
  assert.match(sellerMail.html, /Emailed Bag/);
  assert.match(sellerMail.html, /K&amp;C/);
  assert.match(sellerMail.text, /Manage this order/);

  const buyerMail = outForDeliveryEmail({ ...data, status: "ready" });
  assert.equal(buyerMail.subject, "Your Order Is on Its Way! — K&C Shopping");
  assert.match(buyerMail.html, /1 Mail Street/);
  assert.match(buyerMail.text, /View your order/);
});

test("customer emails are sent only at the delivery step", async () => {
  const order = await placeOrder({ buyerUserId: buyer.id });

  await updateOrderStatus(seller.id, order.orderId, "confirmed");
  let rows = (await events(order.orderId)).filter((row) => row.kind === "customer_out_for_delivery");
  assert.equal(rows.length, 0, "confirmed is not a delivery status");

  await updateOrderStatus(seller.id, order.orderId, "processing");
  rows = (await events(order.orderId)).filter((row) => row.kind === "customer_out_for_delivery");
  assert.equal(rows.length, 0, "processing is not a delivery status");

  await updateOrderStatus(seller.id, order.orderId, "ready");
  rows = (await events(order.orderId)).filter((row) => row.kind === "customer_out_for_delivery");
  assert.equal(rows.length, 1);
});