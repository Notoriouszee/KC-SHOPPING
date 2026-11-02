/**
 * Shop slug rules.
 *
 * The slug is the seller's public address (/shop/<slug>), so it must be
 * readable, case-insensitive and never collide with a route the app itself
 * serves. These rules are enforced server-side; the UI mirrors them for
 * immediate feedback but never relies on the client.
 */

export const SLUG_MIN = 3;
export const SLUG_MAX = 40;

/** Lowercase letters, digits and single hyphens; must start and end alphanumeric. */
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Routes and identifiers that must never belong to a seller. Keeping this list
 * in one place means a new route can be reserved by adding a single entry.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // App routes
  "shop",
  "shops",
  "product",
  "products",
  "order",
  "orders",
  "customer",
  "customers",
  "payment",
  "payments",
  "follow-up",
  "follow-ups",
  "followups",
  "dashboard",
  "settings",
  "login",
  "logout",
  "signup",
  "signin",
  "signout",
  "register",
  "account",
  "profile",
  "admin",
  "api",
  "app",
  "auth",
  "media",
  "uploads",
  "assets",
  "static",
  "public",
  "files",
  "images",
  "img",
  "cdn",
  "share",
  "checkout",
  "cart",
  "new",
  "edit",
  "create",
  "delete",
  "update",
  "search",
  "explore",
  "discover",
  "marketplace",
  "store",
  "stores",
  "seller",
  "sellers",
  // Infrastructure / metadata
  "_next",
  "next",
  "favicon",
  "robots",
  "sitemap",
  "manifest",
  "health",
  "status",
  "track",
  "webhook",
  "webhooks",
  "graphql",
  "rss",
  "feed",
  // Brand and legal
  "kandc",
  "support",
  "help",
  "docs",
  "blog",
  "pricing",
  "about",
  "contact",
  "terms",
  "privacy",
  "legal",
  "security",
  "mail",
  "email",
  "www",
]);

export type SlugProblem = { code: string; message: string };

/**
 * Normalises arbitrary text into a candidate slug:
 * "Mystore Fashion" -> "mystore-fashion", "Ada's Bags!" -> "adas-bags".
 */
export function normaliseSlug(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
}

/** Returns the first reason the slug is not acceptable, or null when it is. */
export function slugProblem(slug: string): SlugProblem | null {
  if (slug.length === 0) {
    return { code: "empty", message: "Choose a shop link." };
  }
  if (slug.length < SLUG_MIN) {
    return { code: "short", message: `Use at least ${SLUG_MIN} characters.` };
  }
  if (slug.length > SLUG_MAX) {
    return { code: "long", message: `Keep it under ${SLUG_MAX} characters.` };
  }
  if (!SLUG_PATTERN.test(slug)) {
    return {
      code: "format",
      message: "Use lowercase letters, numbers and hyphens only, starting and ending with a letter or number.",
    };
  }
  if (slug.includes("--")) {
    return { code: "hyphens", message: "Avoid double hyphens." };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { code: "reserved", message: "That link is reserved by K&C Shopping. Try another." };
  }
  if (/^\d+$/.test(slug)) {
    return { code: "numeric", message: "Include at least one letter so the link is readable." };
  }
  return null;
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

/* -------------------------------------------------------------------------- */
/* Product slugs                                                               */
/* -------------------------------------------------------------------------- */

export const PRODUCT_SLUG_MAX = 60;

/**
 * Product slugs live under a shop (/product/<shop>/<product>), so they do not
 * need the reserved-word list — only a safe, readable shape.
 */
export function normaliseProductSlug(input: string): string {
  return normaliseSlug(input).slice(0, PRODUCT_SLUG_MAX).replace(/-+$/g, "");
}

export function productSlugProblem(slug: string): SlugProblem | null {
  if (slug.length < 2) return { code: "short", message: "Product link is too short." };
  if (slug.length > PRODUCT_SLUG_MAX) {
    return { code: "long", message: `Keep the product link under ${PRODUCT_SLUG_MAX} characters.` };
  }
  if (!SLUG_PATTERN.test(slug)) {
    return {
      code: "format",
      message: "Use lowercase letters, numbers and hyphens only.",
    };
  }
  return null;
}

/**
 * Produces readable alternatives when a slug is taken, e.g.
 * ["mystore-fashion-2", "mystore-fashion-3", "mystore-fashion-ng"].
 */
export function slugSuggestions(base: string, limit = 3): string[] {
  const root = normaliseSlug(base) || "shop";
  const trimmed = root.slice(0, SLUG_MAX - 3).replace(/-+$/g, "");
  const suggestions: string[] = [];
  for (let index = 2; suggestions.length < limit - 1; index += 1) {
    suggestions.push(`${trimmed}-${index}`);
  }
  const suffixes = ["ng", "lagos", "store", "hub"];
  for (const suffix of suffixes) {
    if (suggestions.length >= limit) break;
    const candidate = `${trimmed}-${suffix}`.slice(0, SLUG_MAX);
    suggestions.push(candidate);
  }
  return suggestions;
}
