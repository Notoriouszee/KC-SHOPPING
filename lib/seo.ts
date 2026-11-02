import type { Metadata } from "next";
import { appUrl } from "./config";
import { formatNaira } from "./domain/money";
import type { PublicProduct, PublicShop } from "./domain/types";

/**
 * Metadata for public storefront pages.
 *
 * Everything here is rendered on the server so a crawler that never runs
 * JavaScript still receives complete Open Graph and Twitter tags. Image URLs are
 * absolutised because `og:image` must be a full URL for most platforms.
 */

export const SITE_NAME = "K&C Shopping";
export const DEFAULT_OG_IMAGE = "/og-default.png";
export const DEFAULT_OG_WIDTH = 1200;
export const DEFAULT_OG_HEIGHT = 630;

/** Recommended minimum for a large social preview. */
export const OG_MIN_WIDTH = 600;

export type OgImage = {
  url: string;
  width?: number;
  height?: number;
  alt: string;
};

export function absoluteUrl(path: string, origin = appUrl()): string {
  const base = origin.replace(/\/+$/, "");
  if (/^https?:\/\//i.test(path)) return path;
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** Turns a stored media path (or absolute URL) into something a crawler can fetch. */
export function absoluteImage(
  url: string | null | undefined,
  origin = appUrl(),
): string | null {
  if (!url) return null;
  return absoluteUrl(url, origin);
}

export function priceAmount(kobo: number): string {
  return (Math.round(kobo) / 100).toFixed(2);
}

export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Chooses the preview image for a product.
 *
 * Order: the real product photo → the shop logo → the generic K&C Shopping card.
 * The fallback is never described as a photo of the product; the alt text says
 * what the image actually is.
 */
export function productOgImage(product: PublicProduct, origin = appUrl()): OgImage {
  const cover = product.images[0];

  if (cover) {
    const url = absoluteImage(cover.url, origin);
    if (url) {
      return {
        url,
        width: cover.width ?? undefined,
        height: cover.height ?? undefined,
        alt: cover.alt?.trim() || product.name,
      };
    }
  }

  const logo = absoluteImage(product.shop.shop_logo_url, origin);
  if (logo) {
    return { url: logo, alt: `${product.shop.shop_name} logo` };
  }

  return {
    url: absoluteImage(DEFAULT_OG_IMAGE, origin)!,
    width: DEFAULT_OG_WIDTH,
    height: DEFAULT_OG_HEIGHT,
    alt: `${product.shop.shop_name} on ${SITE_NAME}`,
  };
}

export function shopOgImage(shop: PublicShop, origin = appUrl()): OgImage {
  const logo = absoluteImage(shop.shop_logo_url, origin);
  if (logo) return { url: logo, alt: `${shop.shop_name} logo` };

  return {
    url: absoluteImage(DEFAULT_OG_IMAGE, origin)!,
    width: DEFAULT_OG_WIDTH,
    height: DEFAULT_OG_HEIGHT,
    alt: `${shop.shop_name} on ${SITE_NAME}`,
  };
}

/** Price first, then the seller's own words — what a buyer scanning a preview needs. */
export function productDescription(product: PublicProduct): string {
  const price = formatNaira(product.price_kobo);
  const availability = product.availability === "available" ? "" : "Out of stock · ";

  if (product.description?.trim()) {
    return truncate(`${availability}${price} · ${product.description}`, 200);
  }

  return truncate(
    `${availability}${price} at ${product.shop.shop_name}. Message the shop to order on WhatsApp.`,
    200,
  );
}

export function buildProductMetadata(product: PublicProduct, origin = appUrl()): Metadata {
  const url = absoluteUrl(`/product/${product.shop.shop_slug}/${product.slug}`, origin);
  const title = `${product.name} · ${product.shop.shop_name}`;
  const description = productDescription(product);
  const image = productOgImage(product, origin);

  return {
    title,
    description,
    alternates: { canonical: url },
    // The root layout defaults to noindex for private app routes; public
    // storefront pages opt back in explicitly.
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      url,
      images: [
        {
          url: image.url,
          width: image.width,
          height: image.height,
          alt: image.alt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image.url],
    },
    // Price, currency and availability deliberately live in the JSON-LD
    // (productJsonLd) and in the description. Next renders custom `other` keys as
    // `<meta name="...">`, which is not valid Open Graph syntax, and Facebook
    // deprecated the `product:*` namespace - so emitting it would be noise.
  };
}

export function buildShopMetadata(shop: PublicShop, origin = appUrl()): Metadata {
  const url = absoluteUrl(`/shop/${shop.shop_slug}`, origin);
  const description = shop.shop_description?.trim()
    ? truncate(shop.shop_description, 200)
    : `Browse ${shop.shop_name} on ${SITE_NAME} and order directly.`;
  const image = shopOgImage(shop, origin);

  return {
    title: shop.shop_name,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: shop.shop_name,
      description,
      url,
      images: [
        {
          url: image.url,
          width: image.width,
          height: image.height,
          alt: image.alt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: shop.shop_name,
      description,
      images: [image.url],
    },
  };
}

/**
 * schema.org Product markup, which search engines use for rich results.
 *
 * Serialised with `<` escaped so a product name can never close the script tag.
 */
export function productJsonLd(product: PublicProduct, origin = appUrl()): string {
  const url = absoluteUrl(`/product/${product.shop.shop_slug}/${product.slug}`, origin);
  const images = product.images
    .map((image) => absoluteImage(image.url, origin))
    .filter((value): value is string => Boolean(value));

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description:
      product.description?.trim() || `${product.name} from ${product.shop.shop_name}.`,
    sku: product.slug,
    brand: { "@type": "Brand", name: product.shop.shop_name },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "NGN",
      price: priceAmount(product.price_kobo),
      availability:
        product.availability === "available"
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: product.shop.shop_name },
    },
  };

  if (images.length > 0) data.image = images;

  return JSON.stringify(data).replace(/</g, "\\u003c");
}
