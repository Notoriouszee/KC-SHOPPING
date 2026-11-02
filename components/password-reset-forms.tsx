"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  requestPasswordResetAction,
  resetPasswordAction,
  type ResetState,
} from "../lib/actions/password-reset";
import { Alert, Field } from "./ui";
import { SubmitButton } from "./submit-button";

const initialState: ResetState = null;

export function RequestResetForm() {
  const [state, formAction] = useActionState(requestPasswordResetAction, initialState);

  if (state?.sent) {
    return (
      <div className="space-y-4">
        <Alert tone="success">
          If that email has an account, a reset link has been created. It expires in one hour.
        </Alert>

        {state.resetUrl ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Email delivery is not configured yet</p>
            <p className="mt-1">
              Use this link to set a new password. In production an email would be sent instead.
            </p>
            <Link
              href={state.resetUrl.replace(/^https?:\/\/[^/]+/, "")}
              className="mt-2 inline-block break-all font-semibold text-brand-700 underline"
            >
              Open the reset link →
            </Link>
          </div>
        ) : null}

        <Link href="/login" className="btn-secondary w-full text-center">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field
        label="Email"
        htmlFor="email"
        error={state?.fieldErrors?.email}
        hint="The address you signed up with."
      >
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="input"
          placeholder="you@example.com"
        />
      </Field>

      <SubmitButton pendingLabel="Creating link…">Send reset link</SubmitButton>

      <p className="text-center text-sm text-ink-500">
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Back to log in
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(resetPasswordAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <input type="hidden" name="token" value={token} />

      <Field
        label="New password"
        htmlFor="password"
        error={state?.fieldErrors?.password}
        hint="At least 8 characters."
      >
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="input"
        />
      </Field>

      <Field
        label="Confirm new password"
        htmlFor="confirmPassword"
        error={state?.fieldErrors?.confirmPassword}
      >
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="input"
        />
      </Field>

      <SubmitButton pendingLabel="Saving…">Set new password</SubmitButton>
    </form>
  );
}
