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
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
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
  // The local data layer uses Node's built-in SQLite module. Keep it out of the
  // bundler's module graph so server components can open the database directly.
  serverExternalPackages: ["node:sqlite"],
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
