"use server";

import { redirect } from "next/navigation";
import { appUrl } from "../config";
import { createResetToken, passwordResetLinksVisible, resetPassword } from "../auth/password-reset";
import { isEmail } from "../domain/validation";
import { formText, type ActionState } from "./types";

export type ResetState =
  | { error?: string; fieldErrors?: Record<string, string>; resetUrl?: string; sent?: boolean }
  | null;

export async function requestPasswordResetAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const email = formText(formData, "email").toLowerCase();

  if (!email || !isEmail(email)) {
    return { fieldErrors: { email: "Enter the email you signed up with." } };
  }

  const request = createResetToken(email, (token) => `${appUrl()}/reset-password/${token}`);

  // The response is identical whether or not the account exists, so this cannot
  // be used to discover which emails are registered.
  if (!request || !passwordResetLinksVisible()) {
    return { sent: true };
  }

  // No mail provider is configured yet, so the link is surfaced on screen.
  // Set ORDERPILOT_SHOW_RESET_LINKS=0 once email delivery is wired up.
  return { sent: true, resetUrl: request.resetUrl };
}

export async function resetPasswordAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const token = formText(formData, "token");
  const password = formText(formData, "password");
  const confirm = formText(formData, "confirmPassword");

  if (password !== confirm) {
    return { fieldErrors: { confirmPassword: "Passwords do not match." } };
  }

  const result = await resetPassword(token, password);
  if (!result.ok) return { error: result.error };

  redirect("/login?notice=password-reset");
}
