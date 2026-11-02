/**
 * Best-effort client IP extraction.
 *
 * `x-forwarded-for` is only trustworthy when the app sits behind a proxy that
 * overwrites it (Vercel, Cloudflare, nginx with the right config). Behind no
 * proxy, a client can spoof it — which weakens per-IP limits but never grants
 * access to anything, so it is used only for rate limiting and analytics.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
