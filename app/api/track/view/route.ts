import { cookies } from "next/headers";
import { classifyViewSource } from "../../../../lib/domain/analytics";
import { SESSION_COOKIE } from "../../../../lib/auth/session";
import { userForSessionToken } from "../../../../lib/auth/users";
import { hashVisitor, recordProductView } from "../../../../lib/repositories/analytics";
import { recordActivity } from "../../../../lib/repositories/activity";
import { getDb } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Records a product page view.
 *
 * Called by a small client beacon after the page mounts, so:
 *  - link-preview crawlers (which never run JavaScript) are not counted as
 *    visitors;
 *  - Next's prefetching does not inflate the numbers.
 *
 * Always answers 204: a tracking failure must never surface to a customer.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { productId?: unknown; src?: unknown; referrer?: unknown }
      | null;

    const productId = typeof body?.productId === "string" ? body.productId : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId)) {
      return new Response(null, { status: 204 });
    }

    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
    const userAgent = request.headers.get("user-agent") ?? "";

    const referrer =
      typeof body?.referrer === "string" && body.referrer !== ""
        ? body.referrer
        : request.headers.get("referer");

    const { source, referrerHost } = classifyViewSource({
      src: typeof body?.src === "string" ? body.src : null,
      referrer,
      // hostname (not host) so the port used in development does not matter.
      siteHost: new URL(request.url).hostname,
    });

    await recordProductView({
      productId,
      source,
      referrerHost,
      visitorHash: hashVisitor(ip, userAgent),
    });

    // Personalisation input: only for signed-in customers, and only the product
    // and its shop — never the visitor hash or any network detail.
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    const viewer = token ? await userForSessionToken(token) : null;

    if (viewer && viewer.account_type === "customer") {
      const product = await (await getDb())
        .prepare("SELECT seller_id FROM products WHERE id = ?")
        .get(productId);

      const sellerId = (product as { seller_id?: string } | null)?.seller_id;
      if (sellerId) {
        await recordActivity({
          userId: viewer.id,
          kind: "view",
          productId,
          shopId: sellerId,
        });
      }
    }
  } catch {
    // Deliberately swallowed: analytics must never break a customer's page.
  }

  return new Response(null, { status: 204 });
}

export async function GET() {
  return new Response("Method not allowed", { status: 405 });
}
