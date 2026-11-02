import { hashSiteVisitor, recordSiteVisit } from "../../../../lib/repositories/visits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Records a public page visit for the admin's day/month/year visitor counts.
 *
 * Called by a client beacon after mount, so crawlers and prefetches are not
 * counted. Always answers 204: tracking must never affect a visitor.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { path?: unknown } | null;
    const path = typeof body?.path === "string" ? body.path : "";

    // Only paths we care about, and never a query string (it can carry data).
    if (!path.startsWith("/") || path.startsWith("/api/") || path.length > 200) {
      return new Response(null, { status: 204 });
    }

    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
    const userAgent = request.headers.get("user-agent") ?? "";

    recordSiteVisit(path.split("?")[0]!, hashSiteVisitor(ip, userAgent));
  } catch {
    // Deliberately swallowed.
  }

  return new Response(null, { status: 204 });
}

export async function GET() {
  return new Response("Method not allowed", { status: 405 });
}
