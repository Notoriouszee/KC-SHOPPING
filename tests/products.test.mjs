/**
 * Product catalogue tests: creation, slug allocation, tenancy, publishing rules
 * for public visibility, images and deletion.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

const { signUp } = await import("../lib/auth/users.ts");
const {
  MAX_PRODUCT_IMAGES,
  addImage,
  createProduct,
  deleteProduct,
  getProduct,
  getPublicProduct,
  listProducts,
  listPublishedProducts,
  productStats,
  removeImage,
  setAvailability,
  setCoverImage,
  setPublication,
  uniqueProductSlug,
  updateProduct,
} = await import("../lib/repositories/products.ts");
const { getShopProfile } = await import("../lib/repositories/shop.ts");
const { getDb } = await import("../lib/db/index.ts");

let ada;
let bayo;
let adaShopSlug;
let bag;

const image = (name) => `/media/product-images/${name}.png`;

before(async () => {
  const a = await signUp({
    email: "prod-a@test.ng",
    password: "password123",
    ownerName: "Ada",
    businessName: "Ada Collection",
  });
  if ("error" in a) throw new Error(a.error);
  ada = a.user;
  adaShopSlug = (await getShopProfile(ada.id)).shop_slug;

  const b = await signUp({
    email: "prod-b@test.ng",
    password: "password123",
    ownerName: "Bayo",
    businessName: "Bayo Products",
  });
  if ("error" in b) throw new Error(b.error);
  bayo = b.user;

  bag = await createProduct(ada.id, {
    name: "Black Designer Bag",
    priceKobo: 4500000,
    description: "Genuine leather with a dust bag.",
  });
});

test("a new product gets a readable slug and starts as a draft", () => {
  assert.equal(bag.slug, "black-designer-bag");
  assert.equal(bag.publication_status, "draft");
  assert.equal(bag.availability, "available");
  assert.equal(bag.price_kobo, 4500000);
  assert.equal(bag.published_at, null);
  assert.equal(bag.images.length, 0);
  assert.match(bag.id, /^[0-9a-f-]{36}$/);
});

test("product names collide only within the same seller", async () => {
  const second = await createProduct(ada.id, { name: "Black Designer Bag", priceKobo: 100000 });
  assert.equal(second.slug, "black-designer-bag-2");

  const other = await createProduct(bayo.id, { name: "Black Designer Bag", priceKobo: 200000 });
  assert.equal(other.slug, "black-designer-bag");

  assert.equal(await uniqueProductSlug(ada.id, "Black Designer Bag"), "black-designer-bag-3");
});

test("product input is validated", async () => {
  await assert.rejects(async () => {
    await createProduct(ada.id, { name: "", priceKobo: 1000 });
  }, /Product name/i);
  await assert.rejects(async () => {
    await createProduct(ada.id, { name: "X", priceKobo: -5 });
  }, /valid price/i);
  await assert.rejects(async () => {
    await createProduct(ada.id, { name: "Y", priceKobo: 100, description: "a".repeat(2001) });
  }, /2000 characters/i);
  await assert.rejects(async () => {
    await createProduct(ada.id, { name: "Z", priceKobo: 100, availability: "maybe" });
  }, /availability/i);
  await assert.rejects(async () => {
    await createProduct(ada.id, { name: "Z", priceKobo: 100, publicationStatus: "live" });
  }, /publication/i);
});

test("a rename keeps the original product slug so shared links survive", async () => {
  const renamed = await updateProduct(ada.id, bag.id, {
    name: "Black Leather Designer Bag",
    priceKobo: 4700000,
  });
  assert.equal(renamed.name, "Black Leather Designer Bag");
  assert.equal(renamed.slug, "black-designer-bag");
  assert.equal(renamed.price_kobo, 4700000);
});

test("drafts are invisible publicly, published products are visible", async () => {
  // Draft: no public page.
  assert.equal(await getPublicProduct(adaShopSlug, bag.slug), null);
  assert.equal((await listPublishedProducts(ada.id)).length, 0);

  const published = await setPublication(ada.id, bag.id, "published");
  assert.equal(published.publication_status, "published");
  assert.ok(published.published_at);

  const publicProduct = await getPublicProduct(adaShopSlug, bag.slug);
  assert.ok(publicProduct);
  assert.equal(publicProduct.name, "Black Leather Designer Bag");
  assert.equal(publicProduct.shop.shop_slug, adaShopSlug);
  // Only storefront-safe shop fields travel with a public product.
  assert.equal("email" in publicProduct.shop, false);

  // Lookup is case-insensitive on both slugs.
  assert.ok(await getPublicProduct(adaShopSlug.toUpperCase(), bag.slug.toUpperCase()));

  // Unpublishing removes it again, even though published_at is kept nulled.
  const unpublished = await setPublication(ada.id, bag.id, "draft");
  assert.equal(unpublished.published_at, null);
  assert.equal(await getPublicProduct(adaShopSlug, bag.slug), null);
});

test("a published product is public only while its shop has a live slug", async () => {
  await setPublication(ada.id, bag.id, "published");
  assert.ok(await getPublicProduct(adaShopSlug, bag.slug));

  // Simulate a shop without a slug (e.g. mid-migration).
  const db = await getDb();
  await db.prepare("UPDATE users SET shop_slug = NULL WHERE id = ?").run(ada.id);
  assert.equal(await getPublicProduct(adaShopSlug, bag.slug), null);

  // Restore.
  await db.prepare("UPDATE users SET shop_slug = ? WHERE id = ?").run(adaShopSlug, ada.id);
  assert.ok(await getPublicProduct(adaShopSlug, bag.slug));
});

test("another seller can never read or mutate a product", async () => {
  assert.equal(await getProduct(bayo.id, bag.id), null);
  assert.equal(
    (await listProducts(bayo.id)).some((product) => product.id === bag.id),
    false,
  );

  await assert.rejects(async () => {
    await updateProduct(bayo.id, bag.id, { name: "Hijacked", priceKobo: 1 });
  }, /not found/i);
  await assert.rejects(async () => {
    await setPublication(bayo.id, bag.id, "draft");
  }, /not found/i);
  await assert.rejects(async () => {
    await setAvailability(bayo.id, bag.id, "out_of_stock");
  }, /not found/i);
  await assert.rejects(async () => {
    await deleteProduct(bayo.id, bag.id);
  }, /not found/i);
  await assert.rejects(async () => {
    await addImage(bayo.id, bag.id, { url: image("hijack") });
  }, /not found/i);

  // The product is untouched.
  assert.equal((await getProduct(ada.id, bag.id)).name, "Black Leather Designer Bag");
});

test("availability can be toggled and is exposed on the public record", async () => {
  const out = await setAvailability(ada.id, bag.id, "out_of_stock");
  assert.equal(out.availability, "out_of_stock");
  assert.equal((await getPublicProduct(adaShopSlug, bag.slug)).availability, "out_of_stock");

  await setAvailability(ada.id, bag.id, "available");
  assert.equal((await getPublicProduct(adaShopSlug, bag.slug)).availability, "available");
});

test("images are capped, ordered, and the cover can be changed", async () => {
  const first = await addImage(ada.id, bag.id, { url: image("one"), alt: "front" });
  const second = await addImage(ada.id, bag.id, { url: image("two") });
  const third = await addImage(ada.id, bag.id, { url: image("three") });

  let product = await getProduct(ada.id, bag.id);
  assert.deepEqual(
    product.images.map((entry) => entry.url),
    [image("one"), image("two"), image("three")],
  );
  assert.equal(product.images[0].position, 0);

  await setCoverImage(ada.id, bag.id, third.id);
  product = await getProduct(ada.id, bag.id);
  assert.equal(product.images[0].url, image("three"));
  assert.equal(product.images[0].id, third.id);
  assert.equal(product.images[1].url, image("one"));

  // Public pages see the same ordering, so the cover is the link-preview image.
  assert.equal((await getPublicProduct(adaShopSlug, bag.slug)).images[0].url, image("three"));

  // Cap is enforced.
  await addImage(ada.id, bag.id, { url: image("four") });
  await addImage(ada.id, bag.id, { url: image("five") });
  await assert.rejects(async () => {
    await addImage(ada.id, bag.id, { url: image("six") });
  }, /up to 5 photos/i);
  assert.equal((await getProduct(ada.id, bag.id)).images.length, MAX_PRODUCT_IMAGES);

  // Removal returns the URL so the caller can delete the stored file.
  const removed = await removeImage(ada.id, second.id);
  assert.equal(removed.url, image("two"));
  assert.equal(removed.productId, bag.id);
  assert.equal((await getProduct(ada.id, bag.id)).images.length, 4);

  // One seller cannot delete another seller's image.
  await assert.rejects(async () => {
    await removeImage(bayo.id, first.id);
  }, /not found/i);
});

test("image URLs outside our media root or https are rejected", async () => {
  await assert.rejects(
    async () => {
      await addImage(ada.id, bag.id, { url: "javascript:alert(1)" });
    },
    /not allowed/i,
  );
  await assert.rejects(async () => {
    await addImage(ada.id, bag.id, { url: "/etc/passwd" });
  }, /not allowed/i);
});

test("filters and stats reflect the seller's catalogue", async () => {
  await createProduct(ada.id, { name: "Silk Scarf", priceKobo: 900000, publicationStatus: "published" });
  await createProduct(ada.id, { name: "Leather Sandals", priceKobo: 1250000, publicationStatus: "draft" });

  const drafts = await listProducts(ada.id, { status: "draft" });
  assert.ok(drafts.length >= 1);
  assert.ok(drafts.every((product) => product.publication_status === "draft"));

  const published = await listProducts(ada.id, { status: "published" });
  assert.ok(published.every((product) => product.publication_status === "published"));

  const found = await listProducts(ada.id, { query: "scarf" });
  assert.equal(found.length, 1);
  assert.equal(found[0].name, "Silk Scarf");

  const stats = await productStats(ada.id);
  assert.equal(stats.total, (await listProducts(ada.id)).length);
  assert.equal(stats.published, published.length);

  // Another seller's stats are independent.
  assert.equal((await productStats(bayo.id)).total, 1);
});

test("deleting a product removes it and returns its image urls", async () => {
  const disposable = await createProduct(ada.id, { name: "Disposable", priceKobo: 1000 });
  await addImage(ada.id, disposable.id, { url: image("disposable") });

  const urls = await deleteProduct(ada.id, disposable.id);
  assert.deepEqual(urls, [image("disposable")]);
  assert.equal(await getProduct(ada.id, disposable.id), null);
  assert.equal(
    (await listProducts(ada.id)).some((product) => product.id === disposable.id),
    false,
  );
});

test("repository results are plain objects (safe for client components)", async () => {
  const product = await getProduct(ada.id, bag.id);
  assert.equal(Object.getPrototypeOf(product), Object.prototype);
  assert.equal(Object.getPrototypeOf(product.images[0]), Object.prototype);
  assert.equal(Object.getPrototypeOf(await getPublicProduct(adaShopSlug, bag.slug)), Object.prototype);
});
