import type { MetadataRoute } from "next";

/**
 * Only public storefront pages are useful to crawl. Dashboard and auth routes
 * require a session and are disallowed so they never surface in search results
 * as a sign-in redirect.
 *
 * There is deliberately no `host` directive: robots.txt is prerendered at build
 * time, so a host baked in here would be wrong as soon as the app is served from
 * a different domain.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/shop/", "/product/", "/media/", "/og-default.png"],
        disallow: [
          "/dashboard",
          "/orders",
          "/customers",
          "/payments",
          "/follow-ups",
          "/products",
          "/share-products",
          "/my-shop",
          "/settings",
          "/login",
          "/signup",
        ],
      },
    ],
  };
}
