/**
 * Customer accounts, seller payment details, receipt confirmation and
 * delivery-fee-paid-on-delivery.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

const { signUp } = await import("../lib/auth/users.ts");
const { createProduct } = await import("../lib/repositories/products.ts");
const {
  ensureShopSlugs,
  getPublicShop,
  getShopProfile,
  updateShopProfile,
} = await import("../lib/repositories/shop.ts");
const { createPublicOrder, hashClientIp } = await import("../lib/repositories/public-orders.ts");
const {
  amountDueOnline,
  attachReceipt,
  confirmReceipt,
  getOrderDetail,
  getOrderForBuyer,
  listOrdersForBuyer,
} = await import("../lib/repositories/orders.ts");
const { getDb } = await import("../lib/db/index.ts");

let seller;
let otherSeller;
let buyer;
let shopSlug;
let product;

before(async () => {
  const s = await signUp({
    email: "pay-seller@test.ng",
    password: "password123",
    ownerName: "Ada",
    businessName: "Pay Shop",
  });
  if ("error" in s) throw new Error(s.error);
  seller = s.user;
  shopSlug = getShopProfile(seller.id).shop_slug;

  const o = await signUp({
    email: "pay-other@test.ng",
    password: "password123",
    ownerName: "Bayo",
    businessName: "Other Pay Shop",
  });
  if ("error" in o) throw new Error(o.error);
  otherSeller = o.user;

  const b = await signUp({
    email: "pay-buyer@test.ng",
    password: "password123",
    ownerName: "Blessing Etim",
    phone: "08095678901",
    accountType: "customer",
  });
  if ("error" in b) throw new Error(b.error);
  buyer = b.user;

  updateShopProfile(seller.id, {
    shopName: "Pay Shop",
    description: "Shop with payment details.",
    bankName: "GTBank",
    accountName: "Pay Shop / Ada",
    accountNumber: "0123456789",
    deliveryFeeKobo: 150000,
    deliveryNote: "Paid on delivery",
  });

  product = createProduct(seller.id, {
    name: "Receipt Bag",
    priceKobo: 4000000,
    publicationStatus: "published",
  });
});

test("a customer account has no shop link", () => {
  assert.equal(buyer.account_type, "customer");
  assert.equal(getShopProfile(buyer.id).shop_slug, null);
  // Sellers still get one.
  assert.equal(typeof shopSlug, "string");
  assert.ok(shopSlug.length >= 3);
});

test("the seller's payment details and delivery fee are stored and public", () => {
  const profile = getShopProfile(seller.id);
  assert.equal(profile.shop_bank_name, "GTBank");
  assert.equal(profile.shop_account_number, "0123456789");
  assert.equal(profile.shop_delivery_fee_kobo, 150000);

  const shop = getPublicShop(shopSlug);
  assert.equal(shop.shop_bank_name, "GTBank");
  assert.equal(shop.shop_account_number, "0123456789");
  assert.equal(shop.shop_delivery_fee_kobo, 150000);
  // Still no private fields.
  assert.equal("email" in shop, false);
});

test("delivery fee is recorded but not part of the amount transferred now", () => {
  const result = createPublicOrder({
    shopSlug,
    productSlug: product.slug,
    name: "Blessing Etim",
    phone: "08095678901",
    quantity: 2,
    address: "5 Marian Road, Calabar",
    buyerUserId: buyer.id,
    ipHash: hashClientIp("203.0.113.50"),
  });

  // Goods 2 × ₦40,000 = ₦80,000; delivery ₦1,500 paid on delivery.
  assert.equal(result.amountDueOnlineKobo, 8000000);
  assert.equal(result.deliveryFeeKobo, 150000);
  assert.equal(result.totalKobo, 8150000);

  const order = getOrderDetail(seller.id, result.orderId);
  assert.equal(order.delivery_fee_on_delivery, 1);
  assert.equal(order.amount_due_online_kobo, 8000000);
  assert.equal(amountDueOnline(order), 8000000);
  assert.equal(order.buyer_user_id, buyer.id);
  assert.equal(order.payment_status, "unpaid");
});

test("a receipt cannot be confirmed before it exists", () => {
  const result = createPublicOrder({
    shopSlug,
    productSlug: product.slug,
    name: "Blessing Etim",
    phone: "08095678901",
    quantity: 1,
    buyerUserId: buyer.id,
    ipHash: hashClientIp("203.0.113.51"),
  });

  assert.throws(() => confirmReceipt(seller.id, result.orderId), /has not uploaded a receipt/i);
});

test("uploading a receipt and confirming marks the goods paid, not the delivery", () => {
  const result = createPublicOrder({
    shopSlug,
    productSlug: product.slug,
    name: "Blessing Etim",
    phone: "08095678901",
    quantity: 1,
    buyerUserId: buyer.id,
    ipHash: hashClientIp("203.0.113.52"),
  });

  attachReceipt(result.orderId, {
    url: "/media/payment-receipts/receipt.png",
    note: "Paid from GTBank",
    amountKobo: 4000000,
  });

  const withReceipt = getOrderDetail(seller.id, result.orderId);
  assert.equal(withReceipt.receipt_url, "/media/payment-receipts/receipt.png");
  assert.equal(withReceipt.receipt_note, "Paid from GTBank");
  assert.ok(withReceipt.receipt_uploaded_at);

  const confirmed = confirmReceipt(seller.id, result.orderId);
  assert.equal(confirmed.paid_kobo, 4000000);
  assert.equal(confirmed.payment_status, "paid");
  // Delivery is still collected on delivery, so the order value is untouched.
  assert.equal(confirmed.total_kobo, 4150000);
  assert.equal(confirmed.delivery_fee_on_delivery, 1);
});

test("another seller cannot confirm someone else's receipt", () => {
  const result = createPublicOrder({
    shopSlug,
    productSlug: product.slug,
    name: "Blessing Etim",
    phone: "08095678901",
    quantity: 1,
    buyerUserId: buyer.id,
    ipHash: hashClientIp("203.0.113.53"),
  });

  attachReceipt(result.orderId, { url: "/media/payment-receipts/other.png" });

  assert.throws(() => confirmReceipt(otherSeller.id, result.orderId), /not found/i);
  assert.equal(getOrderDetail(seller.id, result.orderId).payment_status, "unpaid");
});

test("customers only ever see their own orders", () => {
  const mine = listOrdersForBuyer(buyer.id);
  assert.ok(mine.length > 0);
  assert.ok(mine.every((order) => order.buyer_user_id === buyer.id));

  // A different customer sees nothing.
  const other = getDb()
    .prepare("SELECT id FROM users WHERE email = 'pay-seller@test.ng'")
    .get();
  assert.equal(listOrdersForBuyer(other.id).length, 0);

  // Direct lookup is scoped too.
  assert.equal(getOrderForBuyer(other.id, mine[0].id), null);
  assert.ok(getOrderForBuyer(buyer.id, mine[0].id));
});

test("orders without a delivery-on-delivery fee still owe the full total", async () => {
  // A shop with no delivery fee configured.
  const plainSeller = await signUp({
    email: "pay-plain@test.ng",
    password: "password123",
    ownerName: "Plain",
    businessName: "Plain Shop",
  });
  if ("error" in plainSeller) throw new Error(plainSeller.error);

  const plainProduct = createProduct(plainSeller.user.id, {
    name: "Plain Item",
    priceKobo: 1000000,
    publicationStatus: "published",
  });
  const plainSlug = getShopProfile(plainSeller.user.id).shop_slug;

  const result = createPublicOrder({
    shopSlug: plainSlug,
    productSlug: plainProduct.slug,
    name: "Blessing Etim",
    phone: "08095678901",
    quantity: 1,
    buyerUserId: buyer.id,
    ipHash: hashClientIp("203.0.113.54"),
  });

  assert.equal(result.deliveryFeeKobo, 0);
  const order = getOrderDetail(plainSeller.user.id, result.orderId);
  assert.equal(order.delivery_fee_on_delivery, 0);
  assert.equal(amountDueOnline(order), order.total_kobo);
});

test("backfilling shop links ignores customer accounts", () => {
  // A customer created without a slug must stay without one.
  const before = getDb()
    .prepare("SELECT COUNT(*) AS c FROM users WHERE account_type = 'customer' AND shop_slug IS NOT NULL")
    .get();
  ensureShopSlugs();
  const after = getDb()
    .prepare("SELECT COUNT(*) AS c FROM users WHERE account_type = 'customer' AND shop_slug IS NOT NULL")
    .get();
  assert.equal(Number(after.c), Number(before.c));
  assert.equal(Number(after.c), 0);
});
