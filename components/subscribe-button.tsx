"use client";

import { useActionState } from "react";
import { startSubscriptionAction } from "../lib/actions/billing";
import type { ActionState } from "../lib/actions/types";
import { Alert } from "./ui";
import { SubmitButton } from "./submit-button";

const initialState: ActionState = null;

/** Sends the seller to Paystack checkout for the monthly plan. */
export function SubscribeButton({ label = "Subscribe now" }: { label?: string }) {
  const [state, formAction] = useActionState(startSubscriptionAction, initialState);

  return (
    <form action={formAction} className="space-y-2">
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <SubmitButton className="btn-primary" pendingLabel="Opening Paystack…">
        {label}
      </SubmitButton>
    </form>
  );
}
