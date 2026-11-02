"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { loginAction, signupAction, type AuthState } from "../lib/actions/auth";
import { Alert, Field } from "./ui";
import { SubmitButton } from "./submit-button";

const initialState: AuthState = null;

export function LoginForm({ notice, next }: { notice?: string; next?: string }) {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <Field label="Email address" htmlFor="email" error={state?.fieldErrors?.email}>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="input"
          placeholder="you@business.com"
        />
      </Field>

      <Field label="Password" htmlFor="password" error={state?.fieldErrors?.password}>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input"
          placeholder="••••••••"
        />
      </Field>

      <SubmitButton className="btn-primary w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>

      <p className="text-center text-sm text-ink-500">
        New to K&C Shopping?{" "}
        <Link href="/signup" className="font-semibold text-brand-700 hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}

type Role = "seller" | "customer";

export function SignupForm({
  defaultRole = "seller",
  next,
}: {
  defaultRole?: Role;
  next?: string;
}) {
  const [state, formAction] = useActionState(signupAction, initialState);
  const [role, setRole] = useState<Role>(defaultRole);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <input type="hidden" name="accountType" value={role} />

      <div>
        <span className="label">I want to</span>
        <div className="flex gap-2 rounded-xl bg-slate-100 p-1">
          {(
            [
              ["customer", "Buy from shops"],
              ["seller", "Sell my products"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setRole(value)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                role === value ? "bg-surface text-ink-900 shadow-sm" : "text-ink-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-ink-500">
          {role === "customer"
            ? "You can browse shops without an account — create one only to place orders."
            : "You get a dashboard, a public shop link and product pages."}
        </p>
      </div>

      <Field label="Your name" htmlFor="ownerName" error={state?.fieldErrors?.ownerName}>
        <input
          id="ownerName"
          name="ownerName"
          autoComplete="name"
          required
          className="input"
          placeholder="Amaka Obi"
        />
      </Field>

      {role === "seller" ? (
        <Field
          label="Business or shop name"
          htmlFor="businessName"
          error={state?.fieldErrors?.businessName}
          hint="This appears on your dashboard and public shop."
        >
          <input
            id="businessName"
            name="businessName"
            autoComplete="organization"
            className="input"
            placeholder="Mystore Fashion"
          />
        </Field>
      ) : null}

      <Field
        label="Phone number"
        htmlFor="phone"
        hint={
          role === "customer"
            ? "Sellers use this to arrange delivery."
            : "Optional. Shown on your shop if you enable it."
        }
      >
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          className="input"
          placeholder="0803 123 4567"
        />
      </Field>

      <Field label="Email address" htmlFor="email" error={state?.fieldErrors?.email}>
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Password" htmlFor="password" error={state?.fieldErrors?.password}>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="input"
            placeholder="At least 8 characters"
          />
        </Field>
        <Field
          label="Confirm password"
          htmlFor="confirmPassword"
          error={state?.fieldErrors?.confirmPassword}
        >
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="input"
            placeholder="Repeat password"
          />
        </Field>
      </div>

      <SubmitButton className="btn-primary w-full" pendingLabel="Creating account…">
        {role === "customer" ? "Create customer account" : "Create seller account"}
      </SubmitButton>

      <p className="text-center text-sm text-ink-500">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
