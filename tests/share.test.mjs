/**
 * Share link and message formats.
 *
 * The acceptance criteria for sharing hang on two things being exactly right:
 * the copied link must point at the correct product page, and the pasted message
 * must carry that link. Both are covered here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { appUrl, productUrl, shopUrl } = await import("../lib/config.ts");
const {
  fileNameForProduct,
  nativeSharePayload,
  productDetailsText,
  shareMessage,
  shareTextWithLink,
  whatsappShareUrl,
} = await import("../lib/domain/share.ts");

const content = {
  name: "Black Designer Bag",
  priceLabel: "₦45,000",
  shopName: "Mystore Fashion",
  url: "https://orderpilot.com/product/mystore-fashion/black-designer-bag",
  description: "Genuine leather with a dust bag.",
  available: true,
};

test("product and shop URLs are built from one origin helper", () => {
  assert.equal(
    productUrl("mystore-fashion", "black-designer-bag", "https://orderpilot.com"),
    "https://orderpilot.com/product/mystore-fashion/black-designer-bag",
  );
  assert.equal(
    shopUrl("mystore-fashion", "https://orderpilot.com"),
    "https://orderpilot.com/shop/mystore-fashion",
  );

  // A trailing slash in configuration must not produce a double slash.
  assert.equal(
    productUrl("shop", "item", "https://orderpilot.com/"),
    "https://orderpilot.com/product/shop/item",
  );

  // Default origin is local development.
  assert.match(appUrl(), /^http:\/\/localhost:\d+$/);
});

test("the caption carries product, price and shop", () => {
  assert.equal(shareMessage(content), "Black Designer Bag\n₦45,000\nMystore Fashion");
  assert.equal(
    shareMessage({ ...content, available: false }),
    "Black Designer Bag\n₦45,000 (out of stock)\nMystore Fashion",
  );
});

test("the pasted text always ends with a working product URL", () => {
  const text = shareTextWithLink(content);
  const lines = text.split("\n");
  assert.equal(lines.at(-1), content.url);
  assert.ok(text.includes("Black Designer Bag"));
  assert.ok(text.includes("₦45,000"));
});

test("the WhatsApp share URL encodes the message and needs no phone number", () => {
  const url = whatsappShareUrl(content);
  assert.ok(url.startsWith("https://wa.me/?text="));

  const encoded = url.replace("https://wa.me/?text=", "");
  const decoded = decodeURIComponent(encoded);
  assert.equal(decoded, shareTextWithLink(content));
  assert.ok(decoded.includes(content.url));

  // Newlines and the naira sign must survive encoding.
  assert.equal(decoded.split("\n").length, 4);
  assert.ok(decoded.includes("₦45,000"));
});

test("product details copy includes the description but stays bounded", () => {
  const details = productDetailsText(content);
  assert.ok(details.includes("Black Designer Bag"));
  assert.ok(details.includes("Genuine leather"));
  assert.ok(details.endsWith(content.url));
  assert.ok(details.includes("Mystore Fashion"));

  const long = productDetailsText({ ...content, description: "x".repeat(500) });
  assert.ok(long.length < 500);
  assert.ok(long.includes("…"));
});

test("download file names are slugged and extension-safe", () => {
  assert.equal(fileNameForProduct("Black Designer Bag", "image/png"), "black-designer-bag.png");
  assert.equal(fileNameForProduct("Ankara / Wrap!! Dress", "image/jpeg"), "ankara-wrap-dress.jpeg");
  assert.equal(fileNameForProduct("", "image/webp"), "product.webp");
  // Unknown or unexpected types fall back to .png instead of inventing one.
  assert.equal(fileNameForProduct("Bag", "image/svg+xml"), "bag.png");
  assert.equal(fileNameForProduct("Bag", "application/octet-stream"), "bag.png");
  // No path separators can escape from a crafted product name.
  assert.equal(fileNameForProduct("../../etc/passwd", "image/png"), "etc-passwd.png");
});

test("the native share payload mirrors the caption and link", () => {
  const payload = nativeSharePayload(content);
  assert.equal(payload.title, "Black Designer Bag — Mystore Fashion");
  assert.equal(payload.text, shareMessage(content));
  assert.equal(payload.url, content.url);
});
