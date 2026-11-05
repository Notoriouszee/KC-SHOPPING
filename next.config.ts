import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * The CSP keeps `'unsafe-inline'` for scripts and styles because Next.js injects
 * inline bootstrap/streaming scripts and Tailwind ships inline styles; without a
 * nonce pipeline that is the honest trade-off. Everything else is locked down:
 * no external script/style/connect origins, no framing, no plugins.
 *
 * `upgrade-insecure-requests` is deliberately absent: it would rewrite asset
 * requests to HTTPS when the app is served over plain HTTP (as it is locally),
 * breaking the page. HSTS covers the production case.
 */

// Images are served from Supabase Storage in production, which is a different
// origin from the app. Allow that specific project (and the supabase.co domain
// generally, so a project ref change does not silently break images).
const supabaseOrigin = (
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  ""
).replace(/\/+$/, "");

const imageOrigins = ["'self'", "data:", "blob:", "https://*.supabase.co", supabaseOrigin]
  .filter(Boolean)
  .join(" ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      `img-src ${imageOrigins}`,
      "font-src 'self' data:",
      "connect-src 'self'",
      "media-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    // Only send the session cookie over HTTPS once deployed (localhost exempt).
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  // Native/server-only packages must not be bundled:
  //  - `pg` drives the Postgres backend in production.
  //  - `node:sqlite` is only loaded when running the local SQLite backend.
  serverExternalPackages: ["pg", "node:sqlite", "@supabase/supabase-js"],
  experimental: {
    serverActions: {
      // Product photo uploads arrive through server actions.
      bodySizeLimit: "8mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
