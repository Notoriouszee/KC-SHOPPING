"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../auth/session";
import { createCustomer, updateCustomer } from "../repositories/customers";
import { failure, formText, type ActionState } from "./types";

function readCustomer(formData: FormData) {
  return {
    name: formText(formData, "name"),
    phone: formText(formData, "phone"),
    altPhone: formText(formData, "altPhone") || null,
    address: formText(formData, "address") || null,
    notes: formText(formData, "notes") || null,
  };
}

export async function createCustomerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  try {
    await createCustomer(user.id, readCustomer(formData));
  } catch (error) {
    return failure(error, "We could not save that customer.");
  }

  revalidatePath("/customers");
  revalidatePath("/dashboard");
  return { ok: true, message: "Customer saved." };
}

export async function updateCustomerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const customerId = formText(formData, "customerId");

  try {
    await updateCustomer(user.id, customerId, readCustomer(formData));
  } catch (error) {
    return failure(error, "We could not update that customer.");
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  return { ok: true, message: "Customer updated." };
}
