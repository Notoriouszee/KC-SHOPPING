"use server";

import { redirect } from "next/navigation";
import { appUrl } from "../config";
import { requireUser } from "../auth/session";
import {
  initializeTransaction,
  paystackConfigured,
  subscriptionReference,
} from "../paystack";
import { planAmountKobo } from "../repositories/subscriptions";
import { failure, type ActionState } from "./types";

/**
 * Starts a Paystack checkout for the monthly plan. On success the seller is sent
 * to Paystack; the callback route verifies the payment before activating anything.
 */
export async function startSubscriptionAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  if (!paystackConfigured()) {
    return {
      error:
        "Payments are not configured yet. Set PAYSTACK_SECRET_KEY in .env.local, then try again.",
    };
  }

  try {
    const reference = subscriptionReference(user.id);
    const initialized = await initializeTransaction({
      email: user.email,
      amountKobo: planAmountKobo(),
      reference,
      callbackUrl: `${appUrl()}/api/paystack/callback`,
      metadata: { seller_id: user.id, plan: "seller-monthly" },
    });

    redirect(initialized.authorizationUrl);
  } catch (error) {
    // `redirect()` throws a control-flow signal; never swallow it.
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    if (typeof error === "object" && error !== null && "digest" in error) throw error;
    return failure(error, "We could not reach Paystack. Please try again.");
  }
}
