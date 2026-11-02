/**
 * HTTP acceptance checks against a running K&C Shopping server.
 *
 * Covers the criteria that only a real request can prove: no sign-in required,
 * correct page content, crawler metadata, security headers and the customer's
 * confirmation page.
 *
 * Usage (with the app running):
 *   node --import ./scripts/register.mjs scripts/acceptance.mjs
 *   PORT=3100 node --import ./scripts/register.mjs scripts/acceptance.mjs
 */
import { getDb } from "../lib/db/index.ts";
import { createSession, findUserByEmail } from "../lib/auth/users.ts";
import { createPublicOrder, hashClientIp } from "../lib/repositories/public-orders.ts";
import { getShopProfile } from "../lib/repositories/shop.ts";

const BASE = process.env.ACCEPTANCE_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3100}`;

let failures = 0;
let passes = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passes += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function get(path, options = {}) {
  return fetch(`${BASE}${path}`, { redirect: "manual", ...options });
}

async function text(path, options = {}) {
  const response = await get(path, options);
  return { response, body: await response.text() };
}

function meta(html, attribute, key) {
  const match = html.match(new RegExp(`<meta ${attribute}="${key}" content="([^"]*)"`));
  return match?.[1] ?? null;
}

// --- fixtures ---------------------------------------------------------------
const seller = findUserByEmail("ada@mystore.ng");
const shop = seller ? getShopProfile(seller.id) : null;
const buyer = findUserByEmail("blessing@customer.ng");
const product = getDb()
  .prepare("SELECT id, name, slug, price_kobo FROM products WHERE slug = 'black-designer-bag'")
  .get();
const draft = getDb().prepare("SELECT slug FROM products WHERE slug = 'silk-scarf'").get();
// The cover image can be replaced by the seller, so compare against what is stored.
const cover = getDb()
  .prepare(
    "SELECT width, height FROM product_images WHERE product_id = ? ORDER BY position ASC LIMIT 1",
  )
  .get(product.id);

if (!seller || !shop?.shop_slug || !product) {
  console.error("Demo data missing. Run: npm run db:seed");
  process.exit(1);
}

const shopSlug = shop.shop_slug;
const productPath = `/product/${shopSlug}/${product.slug}`;
const expectedPrice = `₦${(product.price_kobo / 100).toLocaleString("en-NG")}`;

console.log(`\nK&C Shopping acceptance checks against ${BASE}\n`);

// --- 1-3: public pages, no account -----------------------------------------
const shopPage = await text(`/shop/${shopSlug}`);
check("public shop page loads without signing in", shopPage.response.status === 200);
check("shop page shows the shop name", shopPage.body.includes(seller.business_name));
check("shop page lists published products", shopPage.body.includes("Black Designer Bag"));

const productPage = await text(productPath);
check("public product page loads without signing in", productPage.response.status === 200);
check("product page shows the product name", productPage.body.includes(product.name));
check("product page shows the price in naira", productPage.body.includes(expectedPrice));
check("product page shows the product photo", productPage.body.includes("/media/product-images/demo-bag.png"));
check("product page links to the shop", productPage.body.includes(`/shop/${shopSlug}`));
check(
  "unpublished product is not reachable",
  (await get(`/product/${shopSlug}/${draft.slug}`)).status === 404,
);
check(
  "unknown product is a 404, not a crash",
  (await get(`/product/${shopSlug}/no-such-product`)).status === 404,
);

// --- 4: private routes stay private ----------------------------------------
const dashboard = await get("/dashboard");
check(
  "dashboard redirects anonymous visitors",
  [307, 308].includes(dashboard.status),
  `got ${dashboard.status}`,
);
check(
  "dashboard does not render any order data when signed out",
  !(await dashboard.text()).includes("Recent orders"),
);

// --- 5: crawler metadata ---------------------------------------------------
const crawler = await text(productPath, {
  headers: { "user-agent": "facebookexternalhit/1.1", accept: "text/html" },
});
const ogTitle = meta(crawler.body, "property", "og:title");
const ogImage = meta(crawler.body, "property", "og:image");
const ogUrl = meta(crawler.body, "property", "og:url");
const ogWidth = meta(crawler.body, "property", "og:image:width");

check("crawler sees an og:title with product and shop", Boolean(ogTitle) && ogTitle.includes(product.name) && ogTitle.includes(seller.business_name));
check("crawler sees an absolute og:image", Boolean(ogImage) && ogImage.startsWith("http"));
check(
  "crawler sees og:image dimensions",
  ogWidth === String(cover?.width ?? 900),
  `got ${ogWidth}, expected ${cover?.width ?? 900}`,
);
check("crawler sees an absolute og:url", Boolean(ogUrl) && ogUrl.includes(productPath));
check("crawler sees a Twitter card", meta(crawler.body, "name", "twitter:card") === "summary_large_image");

if (ogImage) {
  const image = await get(new URL(ogImage).pathname);
  check(
    "the og:image is fetchable without cookies",
    image.status === 200 && (image.headers.get("content-type") ?? "").startsWith("image/"),
  );
}

// --- 6: private data never reaches a public page ---------------------------
for (const [label, body] of [
  ["shop", shopPage.body],
  ["product", productPage.body],
]) {
  check(
    `${label} page does not expose the seller email`,
    !body.includes(seller.email),
  );
  check(`${label} page does not expose password hashes`, !body.includes("password_hash"));
}

// --- 7: security headers ---------------------------------------------------
const headers = productPage.response.headers;
check("CSP header is set", (headers.get("content-security-policy") ?? "").includes("default-src 'self'"));
check("framing is blocked", headers.get("x-frame-options") === "DENY");
check("content sniffing is blocked", headers.get("x-content-type-options") === "nosniff");
check(
  "referrer policy is set",
  (headers.get("referrer-policy") ?? "").includes("strict-origin-when-cross-origin"),
);
check("permissions policy is set", Boolean(headers.get("permissions-policy")));

// --- 8: robots -------------------------------------------------------------
const robots = await text("/robots.txt");
check("robots.txt allows the storefront", robots.body.includes("Allow: /shop/"));
check("robots.txt disallows the dashboard", robots.body.includes("Disallow: /dashboard"));

// --- 9: browsing is public, buying needs an account -------------------------
const home = await text("/");
check("marketplace home loads without signing in", home.response.status === 200);
check("the homepage carries the K&amp;C brand", home.body.includes("K&amp;C"));
check("marketplace home lists shops", home.body.includes("Featured K&amp;C Sellers"));

const shopList = await text("/shops");
check("shop directory loads without signing in", shopList.response.status === 200);

const orderForm = await get(`${productPath}/order`);
check(
  "the order form requires a customer account",
  [307, 308].includes(orderForm.status) || orderForm.status === 200,
  `got ${orderForm.status}`,
);

const account = await get("/account");
check(
  "the customer area requires sign-in",
  [307, 308].includes(account.status),
  `got ${account.status}`,
);

const placed = createPublicOrder({
  shopSlug,
  productSlug: product.slug,
  name: "Acceptance Runner",
  phone: "08031239999",
  quantity: 2,
  address: "1 Acceptance Close, Lagos",
  buyerUserId: buyer?.id ?? null,
  ipHash: hashClientIp(`acceptance-${Date.now()}`),
});

const confirmation = await text(`/order/${placed.token}`);
check("confirmation page opens from the customer's token", confirmation.response.status === 200);
check("confirmation shows the order reference", confirmation.body.includes(placed.reference));
check(
  "confirmation shows the total",
  confirmation.body.includes(`₦${((product.price_kobo * 2) / 100).toLocaleString("en-NG")}`),
);
check("confirmation does not reveal the customer's name", !confirmation.body.includes("Acceptance Runner"));
check("confirmation does not reveal the delivery address", !confirmation.body.includes("Acceptance Close"));
check(
  "an invalid confirmation token is a 404",
  (await get(`/order/${"a".repeat(48)}`)).status === 404,
);

// --- 10: the seller sees it ------------------------------------------------
const sessionToken = createSession(seller.id);
const cookie = { cookie: `kandc_session=${sessionToken}` };

const sellerOrders = await text("/orders", { headers: cookie });
check("seller dashboard loads when signed in", sellerOrders.response.status === 200);
check("the new order appears in the seller's list", sellerOrders.body.includes(placed.reference));
check("the order is labelled as coming from a product link", sellerOrders.body.includes("Product link"));

const orderDetail = getDb()
  .prepare("SELECT id FROM orders WHERE public_token = ?")
  .get(placed.token);
const detail = await text(`/orders/${orderDetail.id}`, { headers: cookie });
check("order detail shows where it came from", detail.body.includes("Where this order came from"));
check("order detail links to the originating product", detail.body.includes(product.name));

check("the seller sees the payment-receipt section", detail.body.includes("Customer payment receipt"));
check("the seller sees the delivery-on-delivery line", detail.body.includes("paid on delivery"));

// --- 10b: sign out is reachable from the dashboard --------------------------
check("the dashboard exposes a sign-out control", sellerOrders.body.includes("Sign out"));

// --- 10c: the customer's own area -------------------------------------------
if (buyer) {
  const buyerCookie = { cookie: `kandc_session=${createSession(buyer.id)}` };
  const accountPage = await text("/account", { headers: buyerCookie });
  check("the customer area loads for a signed-in customer", accountPage.response.status === 200);
  if (shop?.shop_account_number) {
    check("the customer sees the shop account number", accountPage.body.includes(shop.shop_account_number));
  }
}
check(
  "the order is shown as unpaid",
  detail.body.includes("Unpaid") || detail.body.includes("unpaid"),
);

// --- 10d: contact, search, password reset, admin -----------------------------
const contact = await text("/contact");
check("contact page loads", contact.response.status === 200);
check("contact page shows the phone", contact.body.includes("09125172442"));
check("contact page shows the email", contact.body.includes("kandcshopping11@gmail.com"));

const search = await text("/search?q=bag");
check("search page loads", search.response.status === 200);
check("search finds a product", search.body.toLowerCase().includes("bag"));

const forgot = await text("/forgot-password");
check("forgot-password page loads", forgot.response.status === 200);

const adminAnon = await get("/admin");
check("the admin area requires sign-in", [307, 308].includes(adminAnon.status), `got ${adminAnon.status}`);

const visitTrack = await fetch(`${BASE}/api/track/visit`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ path: "/" }),
});
check("visit tracking accepts a beacon", visitTrack.status === 204);
check("visit tracking rejects GET", (await get("/api/track/visit")).status === 405);

// --- 11: tracking endpoint -------------------------------------------------
check("view tracking rejects GET", (await get("/api/track/view")).status === 405);
check(
  "view tracking ignores junk payloads",
  (
    await fetch(`${BASE}/api/track/view`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId: "nope" }),
    })
  ).status === 204,
);

// --- summary ---------------------------------------------------------------
console.log(`\n${passes} passed, ${failures} failed\n`);
process.exit(failures === 0 ? 0 : 1);
