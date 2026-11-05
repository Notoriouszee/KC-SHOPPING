import { verifyWebhookSignature } from "../../../../lib/paystack";
import { activateSubscription } from "../../../../lib/repositories/subscriptions";
import { findUserById } from "../../../../lib/auth/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Paystack webhook — the authoritative signal, independent of whether the buyer
 * ever returns to the callback URL.
 *
 * The raw body is signed with the secret key (HMAC-SHA512); anything that fails
 * verification is ignored with a 401 so Paystack retries it.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!verifyWebhookSignature(raw, signature)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: {
    event?: string;
    data?: { status?: string; reference?: string; amount?: number; metadata?: Record<string, unknown> };
  } | null = null;

  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const data = event?.data;
  const sellerId = typeof data?.metadata?.seller_id === "string" ? data.metadata.seller_id : "";
  const seller = sellerId ? await findUserById(sellerId) : null;

  if (
    event?.event === "charge.success" &&
    data?.status === "success" &&
    data.reference &&
    seller &&
    seller.account_type === "seller"
  ) {
    await activateSubscription(seller.id, {
      reference: data.reference,
      amountKobo: Number(data.amount ?? 0),
    });
  }

  // Always 200 once the signature is valid, so Paystack stops retrying.
  return Response.json({ received: true });
}
