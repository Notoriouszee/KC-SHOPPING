/**
 * Central place for public URL construction. The storefront and share links
 * depend on this, so it is driven by one environment variable rather than string
 * concatenation scattered across pages.
 */
export const APP_NAME = "K&C Shopping";

/** Strips trailing slashes so callers cannot create `//shop/...` links. */
function normaliseOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}

export function appUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return normaliseOrigin(configured);
  if (process.env.VERCEL_URL) return `https://${normaliseOrigin(process.env.VERCEL_URL)}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function shopUrl(slug: string, origin = appUrl()): string {
  return `${normaliseOrigin(origin)}/shop/${slug}`;
}

export function productUrl(slug: string, productSlug: string, origin = appUrl()): string {
  return `${normaliseOrigin(origin)}/product/${slug}/${productSlug}`;
}
