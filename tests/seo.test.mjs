/**
 * Social preview metadata: image dimensions, Open Graph/Twitter tags, image
 * selection order and schema.org structured data.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { imageDimensions } = await import("../lib/domain/image-dimensions.ts");
const {
  DEFAULT_OG_IMAGE,
  absoluteImage,
  absoluteUrl,
  buildProductMetadata,
  buildShopMetadata,
  priceAmount,
  productDescription,
  productJsonLd,
  productOgImage,
  shopOgImage,
  truncate,
} = await import("../lib/seo.ts");

const ORIGIN = "https://orderpilot.com";

const shop = {
  id: "seller-1",
  shop_slug: "mystore-fashion",
  shop_name: "Mystore Fashion",
  shop_description: "Handpicked bags and accessories.",
  shop_logo_url: "/media/shop-logos/logo.png",
  shop_contact_phone: "08031234567",
};

function makeProduct(overrides = {}) {
  return {
    id: "product-1",
    seller_id: "seller-1",
    name: "Black Designer Bag",
    slug: "black-designer-bag",
    description: "Genuine leather with a dust bag.",
    price_kobo: 4500000,
    publication_status: "published",
    availability: "available",
    published_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    images: [
      {
        id: "img-1",
        product_id: "product-1",
        seller_id: "seller-1",
        url: "/media/product-images/bag.png",
        alt: "Black leather bag",
        position: 0,
        width: 1200,
        height: 900,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    shop,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* Image dimension parsing                                                     */
/* -------------------------------------------------------------------------- */

function pngHeader(width, height) {
  const buffer = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function jpegHeader(width, height) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, ...Array(14).fill(0)]);
  const sof0 = Buffer.alloc(19);
  sof0[0] = 0xff;
  sof0[1] = 0xc0;
  sof0.writeUInt16BE(17, 2);
  sof0[4] = 8; // precision
  sof0.writeUInt16BE(height, 5);
  sof0.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof0]);
}

function webpHeader(variant, width, height) {
  const riff = Buffer.alloc(12);
  riff.write("RIFF", 0, "ascii");
  riff.write("WEBP", 8, "ascii");

  if (variant === "VP8X") {
    const chunk = Buffer.alloc(18);
    chunk.write("VP8X", 0, "ascii");
    chunk.writeUInt32LE(10, 4);
    chunk.writeUIntLE(width - 1, 12, 3);
    chunk.writeUIntLE(height - 1, 15, 3);
    return Buffer.concat([riff, chunk]);
  }

  if (variant === "VP8L") {
    const chunk = Buffer.alloc(13);
    chunk.write("VP8L", 0, "ascii");
    chunk.writeUInt32LE(5, 4);
    const w = width - 1;
    const h = height - 1;
    chunk[8] = 0x2f;
    chunk[9] = w & 0xff;
    chunk[10] = ((w >> 8) & 0x3f) | ((h & 0x03) << 6);
    chunk[11] = (h >> 2) & 0xff;
    chunk[12] = (h >> 10) & 0x0f;
    return Buffer.concat([riff, chunk]);
  }

  // VP8 (lossy)
  const chunk = Buffer.alloc(18);
  chunk.write("VP8 ", 0, "ascii");
  chunk.writeUInt32LE(10, 4);
  chunk[11] = 0x9d;
  chunk[12] = 0x01;
  chunk[13] = 0x2a;
  chunk.writeUInt16LE(width, 14);
  chunk.writeUInt16LE(height, 16);
  return Buffer.concat([riff, chunk]);
}

test("PNG dimensions are read from the IHDR chunk", () => {
  assert.deepEqual(imageDimensions(new Uint8Array(pngHeader(1200, 900))), {
    width: 1200,
    height: 900,
  });
});

test("JPEG dimensions are read from the start-of-frame segment", () => {
  assert.deepEqual(imageDimensions(new Uint8Array(jpegHeader(1024, 768))), {
    width: 1024,
    height: 768,
  });
});

test("all three WebP variants are understood", () => {
  assert.deepEqual(imageDimensions(new Uint8Array(webpHeader("VP8X", 1280, 720))), {
    width: 1280,
    height: 720,
  });
  assert.deepEqual(imageDimensions(new Uint8Array(webpHeader("VP8L", 300, 200))), {
    width: 300,
    height: 200,
  });
  assert.deepEqual(imageDimensions(new Uint8Array(webpHeader("VP8", 640, 480))), {
    width: 640,
    height: 480,
  });
});

test("malformed or truncated files return null instead of throwing", () => {
  assert.equal(imageDimensions(new Uint8Array(0)), null);
  assert.equal(imageDimensions(new Uint8Array(pngHeader(1200, 900).subarray(0, 12))), null);
  assert.equal(imageDimensions(new Uint8Array(Buffer.from("not an image at all"))) , null);
  assert.equal(imageDimensions(new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(4)]))), null);
});

/* -------------------------------------------------------------------------- */
/* URL and image selection                                                    */
/* -------------------------------------------------------------------------- */

test("URLs are absolutised exactly once", () => {
  assert.equal(absoluteUrl("/shop/x", ORIGIN), "https://orderpilot.com/shop/x");
  assert.equal(absoluteUrl("/shop/x", "https://orderpilot.com/"), "https://orderpilot.com/shop/x");
  assert.equal(absoluteUrl("shop/x", ORIGIN), "https://orderpilot.com/shop/x");
  assert.equal(absoluteUrl("https://cdn.example.com/a.png", ORIGIN), "https://cdn.example.com/a.png");
  assert.equal(absoluteImage(null, ORIGIN), null);
  assert.equal(absoluteImage("/media/a.png", ORIGIN), "https://orderpilot.com/media/a.png");
});

test("the product preview uses the real photograph, not a generic image", () => {
  const image = productOgImage(makeProduct(), ORIGIN);
  assert.equal(image.url, "https://orderpilot.com/media/product-images/bag.png");
  assert.equal(image.width, 1200);
  assert.equal(image.height, 900);
  assert.equal(image.alt, "Black leather bag");
});

test("a photo without stored dimensions still produces a valid preview", () => {
  const image = productOgImage(
    makeProduct({ images: [{ ...makeProduct().images[0], width: null, height: null }] }),
    ORIGIN,
  );
  assert.equal(image.url, "https://orderpilot.com/media/product-images/bag.png");
  assert.equal(image.width, undefined);
  assert.equal(image.height, undefined);
});

test("without a product photo the shop logo is used, then the brand card", () => {
  const withLogo = productOgImage(makeProduct({ images: [] }), ORIGIN);
  assert.equal(withLogo.url, "https://orderpilot.com/media/shop-logos/logo.png");
  assert.match(withLogo.alt, /Mystore Fashion logo/);

  const noLogo = productOgImage(
    makeProduct({ images: [], shop: { ...shop, shop_logo_url: null } }),
    ORIGIN,
  );
  assert.equal(noLogo.url, `https://orderpilot.com${DEFAULT_OG_IMAGE}`);
  assert.equal(noLogo.width, 1200);
  assert.equal(noLogo.height, 630);
  // The fallback is described as a shop card, never as a photo of the product.
  assert.doesNotMatch(noLogo.alt, /photo/i);
});

test("shop previews prefer the logo and fall back to the brand card", () => {
  assert.equal(shopOgImage(shop, ORIGIN).url, "https://orderpilot.com/media/shop-logos/logo.png");
  assert.equal(
    shopOgImage({ ...shop, shop_logo_url: null }, ORIGIN).url,
    `https://orderpilot.com${DEFAULT_OG_IMAGE}`,
  );
});

/* -------------------------------------------------------------------------- */
/* Metadata                                                                   */
/* -------------------------------------------------------------------------- */

test("product metadata carries name, shop, price and the real image", () => {
  const meta = buildProductMetadata(makeProduct(), ORIGIN);

  assert.match(String(meta.title), /Black Designer Bag/);
  assert.match(String(meta.title), /Mystore Fashion/);

  assert.match(String(meta.description), /₦45,000/);
  assert.match(String(meta.description), /Genuine leather/);

  assert.equal(meta.alternates?.canonical, "https://orderpilot.com/product/mystore-fashion/black-designer-bag");

  assert.equal(meta.openGraph?.type, "website");
  assert.equal(meta.openGraph?.siteName, "K&C Shopping");
  assert.equal(meta.openGraph?.url, "https://orderpilot.com/product/mystore-fashion/black-designer-bag");

  const ogImages = meta.openGraph?.images;
  const first = Array.isArray(ogImages) ? ogImages[0] : ogImages;
  assert.equal(first.url, "https://orderpilot.com/media/product-images/bag.png");
  assert.equal(first.width, 1200);
  assert.equal(first.height, 900);

  assert.equal(meta.twitter?.card, "summary_large_image");
  assert.deepEqual(meta.twitter?.images, ["https://orderpilot.com/media/product-images/bag.png"]);

  // Price is carried by the description and the JSON-LD, not by invalid
  // `<meta name="product:...">` tags.
  assert.equal(meta.other, undefined);

  // Public pages must be indexable even though the root layout defaults to noindex.
  assert.equal(meta.robots?.index, true);
});

test("out-of-stock products say so in metadata", () => {
  const meta = buildProductMetadata(makeProduct({ availability: "out_of_stock" }), ORIGIN);
  assert.match(String(meta.description), /Out of stock/);
  const data = JSON.parse(productJsonLd(makeProduct({ availability: "out_of_stock" }), ORIGIN));
  assert.equal(data.offers.availability, "https://schema.org/OutOfStock");
});

test("a product with no description still gets a useful one", () => {
  const meta = buildProductMetadata(makeProduct({ description: null }), ORIGIN);
  assert.match(String(meta.description), /₦45,000/);
  assert.match(String(meta.description), /Mystore Fashion/);
});

test("long descriptions are trimmed to a preview-friendly length", () => {
  const meta = buildProductMetadata(makeProduct({ description: "x".repeat(500) }), ORIGIN);
  assert.ok(String(meta.description).length <= 200);
  assert.ok(String(meta.description).endsWith("…"));
});

test("shop metadata uses the logo and its own canonical URL", () => {
  const meta = buildShopMetadata(shop, ORIGIN);
  assert.equal(meta.title, "Mystore Fashion");
  assert.equal(meta.alternates?.canonical, "https://orderpilot.com/shop/mystore-fashion");
  assert.equal(meta.openGraph?.url, "https://orderpilot.com/shop/mystore-fashion");
  assert.equal(meta.robots?.index, true);

  const ogImages = meta.openGraph?.images;
  const first = Array.isArray(ogImages) ? ogImages[0] : ogImages;
  assert.equal(first.url, "https://orderpilot.com/media/shop-logos/logo.png");

  const noDescription = buildShopMetadata({ ...shop, shop_description: null }, ORIGIN);
  assert.match(String(noDescription.description), /Mystore Fashion/);
});

test("helpers format price and trim text predictably", () => {
  assert.equal(priceAmount(4500000), "45000.00");
  assert.equal(priceAmount(125050), "1250.50");
  assert.equal(truncate("a  b\nc", 10), "a b c");
  assert.equal(truncate("abcdefghij", 5), "abcd…");
  assert.equal(productDescription(makeProduct()).startsWith("₦45,000"), true);
});

/* -------------------------------------------------------------------------- */
/* Structured data                                                            */
/* -------------------------------------------------------------------------- */

test("structured data is valid JSON with price, currency and availability", () => {
  const json = productJsonLd(makeProduct(), ORIGIN);
  const data = JSON.parse(json);

  assert.equal(data["@context"], "https://schema.org");
  assert.equal(data["@type"], "Product");
  assert.equal(data.name, "Black Designer Bag");
  assert.equal(data.offers.price, "45000.00");
  assert.equal(data.offers.priceCurrency, "NGN");
  assert.equal(data.offers.availability, "https://schema.org/InStock");
  assert.equal(data.offers.url, "https://orderpilot.com/product/mystore-fashion/black-designer-bag");
  assert.deepEqual(data.image, ["https://orderpilot.com/media/product-images/bag.png"]);
});

test("out-of-stock structured data reports OutOfStock", () => {
  const data = JSON.parse(productJsonLd(makeProduct({ availability: "out_of_stock" }), ORIGIN));
  assert.equal(data.offers.availability, "https://schema.org/OutOfStock");
});

test("structured data cannot break out of its script tag", () => {
  const evil = makeProduct({ name: 'Bag </script><script>alert("x")</script>' });
  const json = productJsonLd(evil, ORIGIN);
  assert.equal(json.includes("</script"), false);
  assert.equal(json.includes("<script"), false);
  // Still valid JSON after escaping.
  assert.equal(JSON.parse(json).name.includes("</script>"), true);
});

test("a product without photos omits the image field rather than inventing one", () => {
  const data = JSON.parse(productJsonLd(makeProduct({ images: [] }), ORIGIN));
  assert.equal("image" in data, false);
});
