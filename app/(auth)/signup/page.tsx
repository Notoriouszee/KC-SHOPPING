import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignupForm } from "../../../components/auth-forms";
import { getCurrentUser } from "../../../lib/auth/session";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; next?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect(user.account_type === "customer" ? "/account" : "/dashboard");

  const params = await searchParams;
  const defaultRole = params.role === "customer" ? "customer" : "seller";

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Create your account</h1>
      <p className="mt-1.5 text-sm text-ink-500">
        Buy from shops, or open your own shop — you choose. No card needed.
      </p>

      <div className="mt-6">
        <SignupForm defaultRole={defaultRole} next={params.next} />
      </div>

      <p className="mt-6 text-center text-sm">
        <Link href="/" className="font-semibold text-brand-700 hover:underline">
          ← Back to browsing shops
        </Link>
      </p>
    </div>
  );
}
