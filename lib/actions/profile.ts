"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../auth/session";
import { updateProfile } from "../auth/users";
import { requirePhone, requiredString } from "../domain/validation";
import { failure, formText, type ActionState } from "./types";

export async function updateProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  try {
    const ownerName = requiredString(formText(formData, "ownerName"), "ownerName", "Your name", {
      max: 120,
    });
    const businessName = requiredString(
      formText(formData, "businessName"),
      "businessName",
      "Business name",
      { max: 120 },
    );
    const phoneRaw = formText(formData, "phone");
    const phone = phoneRaw ? requirePhone(phoneRaw) : null;

    updateProfile(user.id, { ownerName, businessName, phone });
  } catch (error) {
    return failure(error, "We could not save your profile.");
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true, message: "Profile saved." };
}
