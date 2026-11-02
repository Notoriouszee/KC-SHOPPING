"use client";

import { useActionState } from "react";
import { createFollowUpAction } from "../lib/actions/followups";
import type { ActionState } from "../lib/actions/types";
import { toDateTimeInputValue } from "../lib/domain/dates";
import { Alert, Field } from "./ui";
import { SubmitButton } from "./submit-button";

const initialState: ActionState = null;

export function FollowUpForm({
  orderId,
  customerId,
  defaultTitle = "",
}: {
  orderId?: string;
  customerId?: string;
  defaultTitle?: string;
}) {
  const [state, formAction] = useActionState(createFollowUpAction, initialState);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  return (
    <form action={formAction} className="space-y-3">
      {state?.error && !state?.fieldErrors ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.ok ? <Alert tone="success">{state.message}</Alert> : null}

      {orderId ? <input type="hidden" name="orderId" value={orderId} /> : null}
      {customerId ? <input type="hidden" name="customerId" value={customerId} /> : null}

      <Field label="What needs doing?" htmlFor="followUpTitle" error={state?.fieldErrors?.title}>
        <input
          id="followUpTitle"
          name="title"
          className="input"
          defaultValue={defaultTitle}
          placeholder="Confirm delivery address"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="When" htmlFor="dueAt" error={state?.fieldErrors?.dueAt}>
          <input
            id="dueAt"
            name="dueAt"
            type="datetime-local"
            className="input"
            defaultValue={toDateTimeInputValue(tomorrow)}
          />
        </Field>
        <Field label="Note" htmlFor="followUpNotes">
          <input id="followUpNotes" name="notes" className="input" placeholder="Optional" />
        </Field>
      </div>

      <SubmitButton className="btn-secondary" pendingLabel="Scheduling…">
        Schedule follow-up
      </SubmitButton>
    </form>
  );
}
