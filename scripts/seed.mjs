/**
 * Seeds the local database with a demo seller, customers, orders and follow-ups.
 * Usage: npm run db:seed
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { newId } from "../lib/domain/ids.ts";
import { getDb } from "../lib/db/index.ts";
import { signUp } from "../lib/auth/users.ts";
import { createCustomer } from "../lib/repositories/customers.ts";
import { createOrder, recordPayment, updateOrderStatus } from "../lib/repositories/orders.ts";
import { createFollowUp } from "../lib/repositories/followups.ts";
import {
  changeShopSlug,
  clearSlugCooldown,
  getShopProfile,
  isSlugTaken,
  updateShopProfile,
} from "../lib/repositories/shop.ts";
import {
  addImage,
  createProduct,
} from "../lib/repositories/products.ts";
import { normaliseSlug } from "../lib/domain/slug.ts";
import { imageDimensions } from "../lib/domain/image-dimensions.ts";
import { createPublicOrder, hashClientIp } from "../lib/repositories/public-orders.ts";

const naira = (amount) => amount * 100;

// Optional demo logo (generated separately); the shop falls back to initials.
const demoLogo = existsSync(join(process.cwd(), "data", "uploads", "shop-logos", "mystore-logo.png"))
  ? "/media/shop-logos/mystore-logo.png"
  : null;

const PRODUCT_IMAGE_DIR = join(process.cwd(), "data", "uploads", "product-images");

/** Demo photos are optional: the catalogue works without them. */
function demoImage(name) {
  const file = `demo-${name}.png`;
  const path = join(PRODUCT_IMAGE_DIR, file);
  if (!existsSync(path)) return null;

  // Measure the real file so og:image:width/height are accurate.
  const size = imageDimensions(new Uint8Array(readFileSync(path)));
  return {
    url: `/media/product-images/${file}`,
    width: size?.width ?? null,
    height: size?.height ?? null,
  };
}

function daysFromNow(days, hour = 9) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

/**
 * Empties the demo data without deleting the database file.
 *
 * A running `next start` keeps the SQLite file open on Windows, so deleting it
 * fails with EPERM. Deleting rows in dependency order works against a live
 * server and keeps the file (and its WAL) valid.
 */
async function wipe() {
  const db = await getDb();
  for (const table of [
    "product_images",
    "products",
    "follow_ups",
    "order_events",
    "order_items",
    "orders",
    "customers",
    "shop_slug_history",
    "sessions",
    "users",
  ]) {
    await db.run(`DELETE FROM ${table};`);
  }
}

await wipe();

const created = await signUp({
  email: "ada@mystore.ng",
  password: "orderpilot123",
  ownerName: "Ada Nwosu",
  businessName: "Mystore Fashion",
  phone: "08031234567",
});

if ("error" in created) throw new Error(created.error);
const seller = created.user;

// Complete the storefront profile. The slug is assigned automatically at
// sign-up; only override it when the readable choice is still free.
await updateShopProfile(seller.id, {
  shopName: "Mystore Fashion",
  description:
    "Handpicked bags, shoes and accessories for women who like to stand out. Delivering across Lagos in 24 hours, nationwide in 3 days.",
  contactPhone: "08031234567",
  logoUrl: demoLogo,
  bankName: "GTBank",
  accountName: "Mystore Fashion / Ada Nwosu",
  accountNumber: "0123456789",
  deliveryFeeKobo: naira(1500),
  deliveryNote: "Lagos Island 1,500 · mainland 2,500. Paid on delivery.",
});

const preferredSlug = normaliseSlug("mystore-fashion");
if (!(await isSlugTaken(preferredSlug, seller.id))) {
  await changeShopSlug(seller.id, preferredSlug);
  // Seeding is not a seller action; do not leave the 24h cooldown in place.
  await clearSlugCooldown(seller.id);
}

// Catalogue: a mix of published, draft and out-of-stock products so every UI
// state is visible in the demo.
const productSeed = [
  {
    name: "Black Designer Bag",
    price: 45000,
    image: "bag",
    description:
      "Genuine leather shoulder bag with gold hardware and a detachable strap. Comes with a dust bag. Available in black and tan.",
    published: true,
    availability: "available",
  },
  {
    name: "Ankara Wrap Dress",
    price: 18000,
    image: "dress",
    description:
      "Hand-tailored ankara wrap dress, fully lined. Fits UK 8â€“14. Made to order in 3 working days.",
    published: true,
    availability: "available",
  },
  {
    name: "Leather Sandals",
    price: 12500,
    image: "sandals",
    description:
      "Full-grain leather sandals with padded soles. Sizes 38â€“44. Restocking next week â€” message to reserve a pair.",
    published: true,
    availability: "out_of_stock",
  },
  {
    name: "Beaded Necklace Set",
    price: 6500,
    image: "necklace",
    description: "Handmade beaded necklace and earring set. Lightweight, nickel-free fittings.",
    published: true,
    availability: "available",
  },
  {
    name: "Silk Scarf",
    price: 9000,
    image: "scarf",
    description: "100% silk scarf, 90cm square. Draft: waiting on the final studio photos.",
    published: false,
    availability: "available",
  },
];

const products = [];
for (const item of productSeed) {
  const product = await createProduct(seller.id, {
    name: item.name,
    priceKobo: naira(item.price),
    description: item.description,
    availability: item.availability,
    publicationStatus: item.published ? "published" : "draft",
  });

  const image = demoImage(item.image);
  if (image) {
    await addImage(seller.id, product.id, {
      url: image.url,
      alt: item.name,
      width: image.width,
      height: image.height,
    });
  }

  products.push(product);
}

const customers = {};
for (const person of [
  { key: "chinedu", name: "Chinedu Eze", phone: "08031234567", address: "12 Admiralty Way, Lekki, Lagos" },
  { key: "fatima", name: "Fatima Bello", phone: "08062345678", address: "Plot 4, Wuse II, Abuja" },
  { key: "ngozi", name: "Ngozi Okonkwo", phone: "08073456789", address: "22 Aba Road, Port Harcourt" },
  { key: "tunde", name: "Tunde Adeyemi", phone: "08084567890", address: "7 Bodija Estate, Ibadan" },
  { key: "blessing", name: "Blessing Etim", phone: "08095678901", address: "5 Marian Road, Calabar" },
]) {
  customers[person.key] = await createCustomer(seller.id, {
    name: person.name,
    phone: person.phone,
    address: person.address,
  });
}

const orders = [];

// 1. Fully paid, mid-fulfilment.
orders.push(
  await createOrder(seller.id, {
    customer: { id: customers.chinedu.id, name: customers.chinedu.name, phone: customers.chinedu.phone },
    items: [{ description: "Black designer bag", quantity: 1, unitPriceKobo: naira(45000) }],
    deliveryFeeKobo: naira(2500),
    notes: "Gift wrap requested.",
  }),
);

// 2. Part paid.
orders.push(
  await createOrder(seller.id, {
    customer: { id: customers.fatima.id, name: customers.fatima.name, phone: customers.fatima.phone },
    items: [{ description: "Ankara wrap dress", quantity: 2, unitPriceKobo: naira(18000) }],
    deliveryFeeKobo: naira(1500),
  }),
);

// 3. Brand new, unpaid.
orders.push(
  await createOrder(seller.id, {
    customer: { id: customers.ngozi.id, name: customers.ngozi.name, phone: customers.ngozi.phone },
    items: [{ description: "Leather sandals", quantity: 1, unitPriceKobo: naira(12500) }],
  }),
);

// 4. Delivered and paid.
orders.push(
  await createOrder(seller.id, {
    customer: { id: customers.tunde.id, name: customers.tunde.name, phone: customers.tunde.phone },
    items: [{ description: "Embroidered kaftan", quantity: 1, unitPriceKobo: naira(32000) }],
    deliveryFeeKobo: naira(2000),
  }),
);

// 5. Ready for pickup, part paid.
orders.push(
  await createOrder(seller.id, {
    customer: { id: customers.blessing.id, name: customers.blessing.name, phone: customers.blessing.phone },
    items: [{ description: "Beaded necklace set", quantity: 3, unitPriceKobo: naira(6500) }],
  }),
);

// 6. Cancelled.
orders.push(
  await createOrder(seller.id, {
    customer: { id: customers.chinedu.id, name: customers.chinedu.name, phone: customers.chinedu.phone },
    items: [{ description: "Silk scarf", quantity: 1, unitPriceKobo: naira(9000) }],
  }),
);

// Progress order 1 to processing with full payment.
await updateOrderStatus(seller.id, orders[0].id, "confirmed");
await updateOrderStatus(seller.id, orders[0].id, "processing");
await recordPayment(seller.id, orders[0].id, orders[0].total_kobo);

// Order 2: confirmed with a deposit.
await updateOrderStatus(seller.id, orders[1].id, "confirmed");
await recordPayment(seller.id, orders[1].id, naira(20000));

// Order 4: delivered and paid in full.
await updateOrderStatus(seller.id, orders[3].id, "confirmed");
await updateOrderStatus(seller.id, orders[3].id, "processing");
await updateOrderStatus(seller.id, orders[3].id, "delivered");
await recordPayment(seller.id, orders[3].id, orders[3].total_kobo);

// Order 5: ready for pickup, partial payment.
await updateOrderStatus(seller.id, orders[4].id, "processing");
await updateOrderStatus(seller.id, orders[4].id, "ready");
await recordPayment(seller.id, orders[4].id, naira(10000));

// Order 6: cancelled.
await updateOrderStatus(seller.id, orders[5].id, "cancelled");

await createFollowUp(seller.id, {
  title: "Confirm Chinedu received the bag",
  dueAt: daysFromNow(-1),
  notes: "He asked for delivery on Saturday.",
  orderId: orders[0].id,
  customerId: customers.chinedu.id,
});

await createFollowUp(seller.id, {
  title: "Collect balance for Ankara dress",
  dueAt: daysFromNow(0, 15),
  orderId: orders[1].id,
  customerId: customers.fatima.id,
});

await createFollowUp(seller.id, {
  title: "Ask Blessing when she is picking up",
  dueAt: daysFromNow(7),
  orderId: orders[4].id,
  customerId: customers.blessing.id,
});

// A demo customer account plus one order awaiting her payment receipt, so the
// customer side can be tried immediately.
const customerAccount = await signUp({
  email: "blessing@customer.ng",
  password: "orderpilot123",
  ownerName: "Blessing Etim",
  phone: "08095678901",
  accountType: "customer",
});
if ("error" in customerAccount) throw new Error(customerAccount.error);

const demoCustomerOrder = await createPublicOrder({
  shopSlug: (await getShopProfile(seller.id)).shop_slug,
  productSlug: "black-designer-bag",
  name: "Blessing Etim",
  phone: "08095678901",
  quantity: 1,
  address: "5 Marian Road, Calabar",
  buyerUserId: customerAccount.user.id,
  ipHash: hashClientIp("seed-demo-customer"),
});

// The platform admin. `role` is what grants cross-tenant reads; the account type
// stays "customer" so no shop slug is allocated. Override with ADMIN_EMAIL /
// ADMIN_PASSWORD, and change the password after the first login.
const adminEmail = process.env.ADMIN_EMAIL ?? "yusufharunabashir8809@gmail.com";
const adminPassword = process.env.ADMIN_PASSWORD ?? "j3kTNz8TMJoG9tX8";

const adminAccount = await signUp({
  email: adminEmail,
  password: adminPassword,
  ownerName: "Platform Admin",
  businessName: "K&C Shopping",
  accountType: "customer",
});
if ("error" in adminAccount) throw new Error(adminAccount.error);

await (await getDb()).prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(adminAccount.user.id);

// Some visit history so the admin dashboard has data on day one.
const demoPaths = [
  "/",
  "/shops",
  "/shop/mystore-fashion",
  "/product/mystore-fashion/black-designer-bag",
  "/contact",
];
const insertVisit = (await getDb()).prepare(
  "INSERT INTO site_visits (id, path, visitor_hash, created_at) VALUES (?, ?, ?, ?)",
);
for (let day = 29; day >= 0; day -= 1) {
  const visits = 4 + ((day * 7) % 11);
  for (let n = 0; n < visits; n += 1) {
    const when = new Date(Date.now() - day * 24 * 60 * 60 * 1000 - n * 60 * 1000);
    await insertVisit.run(
      newId(),
      demoPaths[(day + n) % demoPaths.length],
      `seed-visitor-${day}-${n % 6}`,
      when.toISOString(),
    );
  }
}

console.log("Seeded K&C Shopping local demo data.");
console.log("  Accounts: created for local development (credentials are not printed)");
console.log(`  Demo order awaiting receipt: ${demoCustomerOrder.reference}`);
console.log(`  Business: ${seller.business_name}`);
console.log(`  Shop:     /shop/${(await getShopProfile(seller.id)).shop_slug}`);
console.log(`  Customers: ${Object.keys(customers).length}`);
console.log(`  Products: ${products.length} (${productSeed.filter((p) => p.published).length} published, ${productSeed.filter((p) => !p.published).length} draft)`);
console.log(`  Orders: ${orders.length}`);
console.log("  Follow-ups: 3");
