import type { Metadata } from "next";
import { ResetPasswordForm } from "../../../../components/password-reset-forms";

export const metadata: Metadata = {
  title: "Set a new password",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="card p-6 sm:p-8">
      <h1 className="text-xl font-semibold tracking-tight text-ink-900">Set a new password</h1>
      <p className="mb-6 mt-1 text-sm text-ink-500">
        Choose a password you have not used before. Signing in elsewhere will be required again.
      </p>

      <ResetPasswordForm token={token} />
    </div>
  );
}
