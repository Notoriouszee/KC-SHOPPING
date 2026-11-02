"use server";

import { revalidatePath } from "next/cache";
import { requireUser, getCurrentUser } from "../auth/session";
import { attachReceipt, confirmReceipt, getOrderForBuyer } from "../repositories/orders";
import { getPublicOrderByToken } from "../repositories/public-orders";
import { deleteStoredImage, saveImage } from "../storage";
import { ValidationError } from "../domain/validation";
import { failure, formText, type ActionState } from "./types";

/**
 * Customer uploads proof of payment.
 *
 * Authorised either by the order's unguessable public token (the link shown after
 * checkout) or by being the signed-in buyer. Nobody else can attach anything.
 */
export async function uploadReceiptAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orderId = formText(formData, "orderId");
  const token = formText(formData, "token");
  const note = formText(formData, "note");
  const file = formData.get("receipt");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a screenshot or photo of your payment." };
  }

  let sellerId: string | null = null;

  if (token) {
    const view = getPublicOrderByToken(token);
    if (!view || view.order_id !== orderId) {
      return { error: "That order link is no longer valid." };
    }
    sellerId = null; // resolved below from the order itself
  } else {
    const user = await getCurrentUser();
    if (!user) {
      return { error: "Sign in to upload a receipt." };
    }
    const order = getOrderForBuyer(user.id, orderId);
    if (!order) return { error: "We could not find that order." };
    sellerId = order.seller_id;
  }

  const saved = await saveImage(file as File, {
    folder: "payment-receipts",
    ownerId: orderId,
    maxBytes: 4 * 1024 * 1024,
  });

  if ("error" in saved) return { error: saved.error, fieldErrors: { receipt: saved.error } };

  try {
    attachReceipt(orderId, { url: saved.url, note: note || null });
  } catch (error) {
    await deleteStoredImage(saved.url);
    return failure(error, "We could not save that receipt.");
  }

  revalidatePath("/account");
  if (sellerId) revalidatePath(`/orders/${orderId}`);
  if (token) revalidatePath(`/order/${token}`);

  return { ok: true, message: "Receipt sent. The seller will confirm your payment." };
}

/** Seller confirms the uploaded receipt and settles what the customer owes. */
export async function confirmReceiptAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const orderId = formText(formData, "orderId");
  if (!orderId) return;

  try {
    confirmReceipt(user.id, orderId);
  } catch (error) {
    if (!(error instanceof ValidationError)) console.error("[confirm receipt]", error);
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/payments");
  revalidatePath("/dashboard");
}
