"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../auth/session";
import {
  cancelFollowUp,
  completeFollowUp,
  createFollowUp,
  reopenFollowUp,
} from "../repositories/followups";
import { failure, formText, type ActionState } from "./types";

/** Accepts `datetime-local` or `date` input and returns an ISO timestamp. */
function normaliseDue(raw: string): string {
  if (!raw) return "";
  const withTime = raw.length === 10 ? `${raw}T09:00` : raw;
  const parsed = new Date(withTime);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

export async function createFollowUpAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  try {
    createFollowUp(user.id, {
      title: formText(formData, "title"),
      dueAt: normaliseDue(formText(formData, "dueAt")),
      notes: formText(formData, "notes") || null,
      orderId: formText(formData, "orderId") || null,
      customerId: formText(formData, "customerId") || null,
    });
  } catch (error) {
    return failure(error, "We could not create that follow-up.");
  }

  const orderId = formText(formData, "orderId");
  revalidatePath("/follow-ups");
  revalidatePath("/dashboard");
  if (orderId) revalidatePath(`/orders/${orderId}`);
  return { ok: true, message: "Follow-up scheduled." };
}

export async function completeFollowUpAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = formText(formData, "followUpId");
  const orderId = formText(formData, "orderId");
  if (!id) return;

  try {
    completeFollowUp(user.id, id);
  } catch (error) {
    console.error("[follow-up complete]", error);
  }

  revalidatePath("/follow-ups");
  revalidatePath("/dashboard");
  if (orderId) revalidatePath(`/orders/${orderId}`);
}

export async function reopenFollowUpAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = formText(formData, "followUpId");
  if (!id) return;
  reopenFollowUp(user.id, id);
  revalidatePath("/follow-ups");
}

export async function cancelFollowUpAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = formText(formData, "followUpId");
  if (!id) return;
  cancelFollowUp(user.id, id);
  revalidatePath("/follow-ups");
}
