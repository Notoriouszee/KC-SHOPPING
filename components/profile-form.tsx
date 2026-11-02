"use client";

import { useActionState } from "react";
import { updateProfileAction } from "../lib/actions/profile";
import type { ActionState } from "../lib/actions/types";
import { Alert, Field } from "./ui";
import { SubmitButton } from "./submit-button";

const initialState: ActionState = null;

export function ProfileForm({
  ownerName,
  businessName,
  phone,
  email,
}: {
  ownerName: string;
  businessName: string;
  phone: string | null;
  email: string;
}) {
  const [state, formAction] = useActionState(updateProfileAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.ok ? <Alert tone="success">{state.message}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="ownerName" error={state?.fieldErrors?.ownerName}>
          <input id="ownerName" name="ownerName" className="input" defaultValue={ownerName} />
        </Field>
        <Field
          label="Business name"
          htmlFor="businessName"
          error={state?.fieldErrors?.businessName}
        >
          <input id="businessName" name="businessName" className="input" defaultValue={businessName} />
        </Field>
        <Field label="Phone number" htmlFor="phone" error={state?.fieldErrors?.phone}>
          <input id="phone" name="phone" type="tel" className="input" defaultValue={phone ?? ""} />
        </Field>
        <Field label="Email" htmlFor="email" hint="Contact support to change your sign-in email.">
          <input id="email" name="email" className="input" defaultValue={email} disabled />
        </Field>
      </div>

      <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
    </form>
  );
}
