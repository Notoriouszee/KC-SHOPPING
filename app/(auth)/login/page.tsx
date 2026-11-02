import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "../../../components/auth-forms";
import { getCurrentUser } from "../../../lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; next?: string; role?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) {
    redirect(
      user.role === "admin"
        ? "/admin"
        : user.account_type === "customer"
          ? "/account"
          : "/dashboard",
    );
  }

  const params = await searchParams;
  const notice =
    params.notice === "signed-out"
      ? "You have been signed out."
      : params.notice === "session-expired"
        ? "Your session expired. Please sign in again."
        : params.notice === "password-reset"
          ? "Your password has been changed. Sign in with the new one."
          : undefined;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Welcome back</h1>
      <p className="mt-1.5 text-sm text-ink-500">
        Sign in to manage your shop, or to track an order you placed.
      </p>

      {params.role === "customer" ? (
        <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
          Sign in to place this order. Browsing shops stays free — an account is only needed to buy.
        </div>
      ) : null}

      <div className="mt-7">
        <LoginForm notice={notice} next={params.next} />
      </div>

      <p className="mt-3 text-center text-sm">
        <Link href="/forgot-password" className="font-medium text-brand-700 hover:underline">
          Forgot your password?
        </Link>
      </p>

      <div className="mt-8 rounded-xl border border-slate-200 bg-surface px-4 py-3 text-xs text-ink-500">
        <p className="font-semibold text-ink-700">Demo accounts</p>
        <p className="mt-1">
          Seller: <span className="font-mono text-ink-900">ada@mystore.ng</span> ·{" "}
          <span className="font-mono text-ink-900">orderpilot123</span>
        </p>
        <p className="mt-0.5">
          Customer: <span className="font-mono text-ink-900">blessing@customer.ng</span> ·{" "}
          <span className="font-mono text-ink-900">orderpilot123</span>
        </p>
      </div>

      <p className="mt-6 text-center text-sm">
        <Link href="/" className="font-semibold text-brand-700 hover:underline">
          ← Back to browsing shops
        </Link>
      </p>
    </div>
  );
}
