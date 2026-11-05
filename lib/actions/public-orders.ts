"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../auth/session";
import { hashClientIp, createPublicOrder } from "../repositories/public-orders";
import { clientIp } from "../request-ip";
import { failure, formText, isRedirectError, type ActionState } from "./types";

export async function placePublicOrderAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Buying requires an account; browsing does not.
  const user = await getCurrentUser();
  if (!user || user.account_type !== "customer") {
    return { error: "Please sign in as a customer to place this order." };
  }

  const headerList = await headers();
  const ipHash = hashClientIp(clientIp(headerList));

  try {
    const result = await createPublicOrder({
      shopSlug: formText(formData, "shopSlug"),
      productSlug: formText(formData, "productSlug"),
      name: formText(formData, "name") || user.owner_name,
      phone: formText(formData, "phone") || user.phone || "",
      quantity: Number.parseInt(formText(formData, "quantity") || "1", 10),
      address: formText(formData, "address") || null,
      notes: formText(formData, "notes") || null,
      honeypot: formText(formData, "website"),
      ipHash,
      buyerUserId: user.id,
    });

    redirect(`/order/${result.token}`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return failure(error, "We could not place that order. Please try again.");
  }
}
