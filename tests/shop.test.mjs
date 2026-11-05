/**
 * Shop profile + public slug tests: slug rules, reserved routes, uniqueness,
 * automatic assignment, controlled changes and old-link redirects.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

const { signUp } = await import("../lib/auth/users.ts");
const { normaliseSlug, slugProblem, isReservedSlug, slugSuggestions } = await import(
  "../lib/domain/slug.ts"
);
const {
  allocateSlug,
  assignInitialSlug,
  changeShopSlug,
  clearSlugCooldown,
  ensureShopSlugs,
  getPublicShop,
  getShopProfile,
  isSlugTaken,
  listSlugHistory,
  resolveRetiredSlug,
  slugChangeCooldown,
  updateShopProfile,
} = await import("../lib/repositories/shop.ts");
const { getDb } = await import("../lib/db/index.ts");

let ada;
let bayo;

before(async () => {
  const a = await signUp({
    email: "shop-a@test.ng",
    password: "password123",
    ownerName: "Ada",
    businessName: "Mystore Fashion",
    phone: "08011111111",
  });
  if ("error" in a) throw new Error(a.error);
  ada = a.user;

  const b = await signUp({
    email: "shop-b@test.ng",
    password: "password123",
    ownerName: "Bayo",
    businessName: "Bayo Bags",
    phone: "08022222222",
  });
  if ("error" in b) throw new Error(b.error);
  bayo = b.user;
});

test("slugs normalise readable text into a safe address", () => {
  assert.equal(normaliseSlug("Mystore Fashion"), "mystore-fashion");
  assert.equal(normaliseSlug("  Ada's Bags!! "), "adas-bags");
  assert.equal(normaliseSlug("Café Ünit"), "cafe-unit");
  assert.equal(normaliseSlug("---hello---world---"), "hello-world");
  assert.equal(normaliseSlug("a".repeat(60)).length, 40);
  assert.equal(normaliseSlug("!!!"), "");
});

test("slug rules reject reserved words, bad shapes and pure numbers", () => {
  assert.equal(slugProblem("mystore-fashion"), null);

  assert.equal(slugProblem("").code, "empty");
  assert.equal(slugProblem("ab").code, "short");
  assert.equal(slugProblem("-leading").code, "format");
  assert.equal(slugProblem("trailing-").code, "format");
  assert.equal(slugProblem("Upper Case").code, "format");
  assert.equal(slugProblem("double--hyphen").code, "hyphens");
  assert.equal(slugProblem("12345").code, "numeric");

  // Every app route must be protected.
  for (const reserved of ["shop", "products", "dashboard", "login", "api", "admin", "settings"]) {
    assert.equal(slugProblem(reserved)?.code, "reserved", `${reserved} should be reserved`);
    assert.equal(isReservedSlug(reserved), true);
  }
});

test("slug suggestions are readable and valid", () => {
  const suggestions = slugSuggestions("mystore-fashion", 3);
  assert.equal(suggestions.length, 3);
  for (const suggestion of suggestions) {
    assert.equal(slugProblem(suggestion), null, suggestion);
  }
});

test("sign-up assigns a unique public slug from the business name", async () => {
  const profile = await getShopProfile(ada.id);
  assert.equal(profile.shop_slug, "mystore-fashion");

  const other = await getShopProfile(bayo.id);
  assert.equal(other.shop_slug, "bayo-bags");
  assert.notEqual(profile.shop_slug, other.shop_slug);
});

test("allocateSlug never returns a slug that is already taken", async () => {
  const second = await allocateSlug("Mystore Fashion");
  assert.notEqual(second, "mystore-fashion");
  assert.equal(slugProblem(second), null);
  assert.equal(await isSlugTaken(second), false);

  assert.equal((await allocateSlug("Shop")).startsWith("shop-"), true);
});

test("the public shop lookup is case-insensitive and returns only public fields", async () => {
  const shop = await getPublicShop("MyStore-Fashion");
  assert.ok(shop);
  assert.equal(shop.shop_slug, "mystore-fashion");
  assert.equal(shop.shop_name, "Mystore Fashion");
  // No private columns leak into the public shape.
  assert.equal("email" in shop, false);
  assert.equal("business_name" in shop, false);
  assert.equal("password_hash" in shop, false);

  assert.equal(await getPublicShop("does-not-exist"), null);
});

test("shop details can be updated without touching the slug", async () => {
  await updateShopProfile(ada.id, {
    shopName: "Mystore Fashion NG",
    description: "Bags and accessories.",
    contactPhone: "08031234567",
    logoUrl: "/media/shop-logos/example.png",
  });

  const shop = await getPublicShop("mystore-fashion");
  assert.equal(shop.shop_name, "Mystore Fashion NG");
  assert.equal(shop.shop_description, "Bags and accessories.");
  assert.equal(shop.shop_contact_phone, "08031234567");
  assert.equal(shop.shop_logo_url, "/media/shop-logos/example.png");
});

test("a slug change keeps the old link working via redirect", async () => {
  const result = await changeShopSlug(ada.id, "ada-boutique");
  assert.equal(result.slug, "ada-boutique");
  assert.equal(result.previousSlug, "mystore-fashion");

  // New link resolves.
  assert.equal((await getPublicShop("ada-boutique")).shop_slug, "ada-boutique");

  // Old link is gone as a live shop but resolves to a redirect target.
  assert.equal(await getPublicShop("mystore-fashion"), null);
  const redirect = await resolveRetiredSlug("mystore-fashion");
  assert.equal(redirect.seller_id, ada.id);
  assert.equal(redirect.current_slug, "ada-boutique");

  // History is visible to the seller.
  const history = await listSlugHistory(ada.id);
  assert.equal(history[0].old_slug, "mystore-fashion");
});

test("a retired slug cannot be taken by another seller", async () => {
  assert.equal(await isSlugTaken("mystore-fashion"), true);
  await assert.rejects(async () => {
    await changeShopSlug(bayo.id, "mystore-fashion");
  }, /already taken/i);
  assert.equal((await getShopProfile(bayo.id)).shop_slug, "bayo-bags");
});

test("a seller cannot reclaim their own retired slug", async () => {
  // Uniqueness is checked before the cooldown, so the specific error is stable.
  await assert.rejects(async () => {
    await changeShopSlug(ada.id, "mystore-fashion");
  }, /already taken/i);
  assert.equal((await getShopProfile(ada.id)).shop_slug, "ada-boutique");
});

test("slug changes are rate limited by a 24 hour cooldown", async () => {
  const cooldown = await slugChangeCooldown(ada.id);
  assert.equal(cooldown.canChange, false);
  assert.ok(cooldown.nextAllowedAt);

  await assert.rejects(async () => {
    await changeShopSlug(ada.id, "ada-boutique-2");
  }, /changed recently/i);

  // After the admin/demo cooldown reset the change is allowed again.
  await clearSlugCooldown(ada.id);
  assert.equal((await slugChangeCooldown(ada.id)).canChange, true);
  const result = await changeShopSlug(ada.id, "ada-boutique-2");
  assert.equal(result.previousSlug, "ada-boutique");
  assert.equal((await resolveRetiredSlug("ada-boutique")).current_slug, "ada-boutique-2");
});

test("changing a slug to the same value is a no-op", async () => {
  await clearSlugCooldown(ada.id);
  const result = await changeShopSlug(ada.id, "ada-boutique-2");
  assert.equal(result.slug, "ada-boutique-2");
  assert.equal((await listSlugHistory(ada.id)).filter((entry) => entry.old_slug === "ada-boutique-2").length, 0);
});

test("invalid and reserved slugs are rejected with a usable message", async () => {
  await assert.rejects(async () => {
    await changeShopSlug(ada.id, "dashboard");
  }, /reserved/i);
  await assert.rejects(async () => {
    await changeShopSlug(ada.id, "!!");
  }, /characters|Choose/i);
  assert.equal((await getShopProfile(ada.id)).shop_slug, "ada-boutique-2");
});

test("ensureShopSlugs backfills accounts that predate the storefront", async () => {
  // Simulate a legacy account by clearing the slug directly.
  const db = await getDb();
  await db.prepare("UPDATE users SET shop_slug = NULL WHERE id = ?").run(bayo.id);
  assert.equal((await getShopProfile(bayo.id)).shop_slug, null);

  const assigned = await ensureShopSlugs();
  assert.ok(assigned >= 1);
  assert.equal((await getShopProfile(bayo.id)).shop_slug, "bayo-bags");

  // Idempotent: a second run assigns nothing.
  assert.equal(await ensureShopSlugs(), 0);
});

test("assignInitialSlug is collision-safe", async () => {
  const slug = await allocateSlug("Mystore Fashion");
  assert.equal(await isSlugTaken(slug), false);
  await assignInitialSlug(bayo.id, "Mystore Fashion");
  assert.notEqual((await getShopProfile(bayo.id)).shop_slug, "mystore-fashion");
});

test("repository results are plain objects (safe to pass to client components)", async () => {
  // SQLite rows use a null prototype; React refuses to serialise those across
  // the server/client boundary, so the data layer must copy them.
  const profile = await getShopProfile(ada.id);
  const shop = await getPublicShop("ada-boutique-2");
  assert.equal(Object.getPrototypeOf(profile), Object.prototype);
  assert.equal(Object.getPrototypeOf(shop), Object.prototype);
  assert.equal(Object.getPrototypeOf((await listSlugHistory(ada.id))[0]), Object.prototype);
});
