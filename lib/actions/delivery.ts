"use server";

import { revalidatePath } from "next/cache";
import { requireCustomer, getCurrentUser } from "../auth/session";
import { confirmReceived, confirmReceivedByToken } from "../repositories/orders";
import { ValidationError } from "../domain/validation";
import { failure, formText, type ActionState } from "./types";

/** Customer confirms delivery from their account. */
export async function confirmReceivedAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireCustomer();
  const orderId = formText(formData, "orderId");

  try {
    if (!orderId) throw new ValidationError([{ field: "order", message: "Order not found." }]);
    await confirmReceived(orderId, user.id);
  } catch (error) {
    return failure(error, "We could not confirm that delivery.");
  }

  revalidatePath("/account");
  return { ok: true, message: "Thanks — the seller can see that you received your order." };
}

/**
 * Confirmation from the public order page. Authorised by the order token, so a
 * customer who never created an account can still confirm delivery.
 */
export async function confirmReceivedByTokenAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await getCurrentUser();
  const token = formText(formData, "token");

  try {
    if (!token) throw new ValidationError([{ field: "token", message: "Order not found." }]);
    await confirmReceivedByToken(token);
  } catch (error) {
    return failure(error, "We could not confirm that delivery.");
  }

  revalidatePath(`/order/${token}`);
  return { ok: true, message: "Thanks — we have recorded that you received this order." };
}
