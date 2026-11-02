"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticate, signUp } from "../auth/users";
import { clearSessionCookie, setSessionCookie } from "../auth/session";
import { passwordProblem } from "../auth/password";
import {
  clearLoginFailures,
  ipKey,
  isLoginBlocked,
  loginKey,
  recordLoginFailure,
} from "../repositories/auth-attempts";
import { clientIp } from "../request-ip";
import { ValidationError, isEmail } from "../domain/validation";

export type AuthState = { error?: string; fieldErrors?: Record<string, string> } | null;

function safeNext(value: string): string | null {
  // Only internal, single-slash paths — never an open redirect.
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\")) return null;
  return value;
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = text(formData, "email").toLowerCase();
  const password = text(formData, "password");

  const fieldErrors: Record<string, string> = {};
  if (!email) fieldErrors.email = "Enter your email address.";
  if (!password) fieldErrors.password = "Enter your password.";
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const headerList = await headers();
  const ip = clientIp(headerList);
  const ipHash = ipKey(ip);
  const attemptKey = loginKey(ip, email);

  // Brute-force protection: checked before the password, so a locked-out device
  // cannot keep guessing and cannot tell whether the account exists.
  if (isLoginBlocked(attemptKey, ipHash)) {
    recordLoginFailure(attemptKey, ipHash, "blocked");
    return {
      error: "Too many sign-in attempts. Please wait a few minutes and try again.",
    };
  }

  let result: Awaited<ReturnType<typeof authenticate>> = null;
  try {
    result = await authenticate(email, password);
  } catch (error) {
    console.error("login failed", error);
    return { error: "We could not sign you in right now. Please try again." };
  }

  if (!result) {
    recordLoginFailure(attemptKey, ipHash, "failed");
    return { error: "Incorrect email or password." };
  }

  clearLoginFailures(attemptKey);
  await setSessionCookie(result.token);

  // Send the user back where they were going, if that is a safe internal path.
  const requested = text(formData, "next");
  const fallback =
    result.user.role === "admin"
      ? "/admin"
      : result.user.account_type === "customer"
        ? "/account"
        : "/dashboard";
  redirect(safeNext(requested) ?? fallback);
}

export async function signupAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = text(formData, "email").toLowerCase();
  const password = text(formData, "password");
  const confirm = text(formData, "confirmPassword");
  const ownerName = text(formData, "ownerName");
  const businessName = text(formData, "businessName");
  const phone = text(formData, "phone");
  const accountType = text(formData, "accountType") === "customer" ? "customer" : "seller";
  const isSeller = accountType === "seller";

  const fieldErrors: Record<string, string> = {};
  if (!ownerName) fieldErrors.ownerName = "Enter your name.";
  if (isSeller && !businessName) fieldErrors.businessName = "Enter your business or shop name.";
  if (!email) fieldErrors.email = "Enter your email address.";
  else if (!isEmail(email)) fieldErrors.email = "Enter a valid email address.";
  if (!password) fieldErrors.password = "Choose a password.";
  if (password && confirm !== password) fieldErrors.confirmPassword = "Passwords do not match.";

  const problem = password ? passwordProblem(password) : null;
  if (problem) fieldErrors.password = problem;

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  try {
    const created = await signUp({
      email,
      password,
      ownerName,
      businessName: isSeller ? businessName : ownerName,
      phone: phone || null,
      accountType,
    });
    if ("error" in created) return { error: created.error };
    await setSessionCookie(created.token);
  } catch (error) {
    if (error instanceof ValidationError) {
      return { error: error.message };
    }
    console.error("signup failed", error);
    return { error: "We could not create your account right now. Please try again." };
  }

  const requested = text(formData, "next");
  const fallback = isSeller ? "/dashboard?welcome=1" : "/account?welcome=1";
  redirect(safeNext(requested) ?? fallback);
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}
