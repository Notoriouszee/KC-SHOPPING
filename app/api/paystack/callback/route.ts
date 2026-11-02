import { NextResponse } from "next/server";
import { verifyTransaction } from "../../../../lib/paystack";
import { activateSubscription, planAmountKobo } from "../../../../lib/repositories/subscriptions";
import { findUserById } from "../../../../lib/auth/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Paystack redirects the buyer here after checkout. The redirect is *not* trusted:
 * the reference is verified with Paystack, and the amount must match the plan.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const reference = url.searchParams.get("reference") ?? url.searchParams.get("trxref") ?? "";
  const fallback = new URL("/billing", url.origin);

  if (!reference) {
    fallback.searchParams.set("status", "failed");
    return NextResponse.redirect(fallback);
  }

  try {
    const verified = await verifyTransaction(reference);

    const sellerId =
      typeof verified.metadata?.seller_id === "string" ? verified.metadata.seller_id : "";
    const seller = sellerId ? findUserById(sellerId) : null;

    const paidEnough = verified.amountKobo >= planAmountKobo();

    if (verified.status === "success" && paidEnough && seller && seller.account_type === "seller") {
      activateSubscription(seller.id, {
        reference: verified.reference,
        amountKobo: verified.amountKobo,
      });
      fallback.searchParams.set("status", "paid");
      fallback.searchParams.set("reference", verified.reference);
      return NextResponse.redirect(fallback);
    }

    fallback.searchParams.set("status", "failed");
    fallback.searchParams.set("reason", paidEnough ? "not-successful" : "amount-mismatch");
    return NextResponse.redirect(fallback);
  } catch {
    fallback.searchParams.set("status", "failed");
    return NextResponse.redirect(fallback);
  }
}
