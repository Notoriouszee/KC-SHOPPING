import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { destroySession, userForSessionToken, type SafeUser } from "./users";

export const SESSION_COOKIE = "kandc_session";

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) destroySession(token);
  store.delete(SESSION_COOKIE);
}

/** Reads the signed-in account for the current request (deduped per render). */
export const getCurrentUser = cache(async (): Promise<SafeUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return userForSessionToken(token);
});

/** For seller routes: anonymous visitors sign in, customers go to their area. */
export async function requireUser(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin");
  if (user.account_type === "customer") redirect("/account");
  return user;
}

/** For customer routes: anonymous visitors sign in and come back. */
export async function requireCustomer(nextPath?: string): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?role=customer${nextPath ? `&next=${encodeURIComponent(nextPath)}` : ""}`);
  }
  if (user.role === "admin") redirect("/admin");
  if (user.account_type !== "customer") redirect("/dashboard");
  return user;
}

/**
 * For admin routes. Admins see data across every seller, so this is the only
 * guard that grants cross-tenant reads.
 */
export async function requireAdmin(nextPath?: string): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`);
  }
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}
