import type { Metadata } from "next";
import { RequestResetForm } from "../../../components/password-reset-forms";

export const metadata: Metadata = {
  title: "Forgot password",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <div className="card p-6 sm:p-8">
      <h1 className="text-xl font-semibold tracking-tight text-ink-900">Reset your password</h1>
      <p className="mb-6 mt-1 text-sm text-ink-500">
        Enter your email and we will create a link to set a new password.
      </p>

      <RequestResetForm />
    </div>
  );
}
