"use client";

import { useActionState } from "react";
import { createFollowUpAction } from "../lib/actions/followups";
import type { ActionState } from "../lib/actions/types";
import { toDateTimeInputValue } from "../lib/domain/dates";
import { Alert, Field } from "./ui";
import { SubmitButton } from "./submit-button";

const initialState: ActionState = null;

export function NewFollowUpForm({
  customers,
}: {
  customers: { id: string; name: string; phone: string }[];
}) {
  const [state, formAction] = useActionState(createFollowUpAction, initialState);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  return (
    <form action={formAction} className="space-y-3">
      {state?.error && !state?.fieldErrors ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.error && state?.fieldErrors ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.ok ? <Alert tone="success">{state.message}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Customer" htmlFor="followUpCustomer" error={state?.fieldErrors?.customerId}>
          <select id="followUpCustomer" name="customerId" className="input" defaultValue="">
            <option value="" disabled>
              Choose a customer
            </option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} — {customer.phone}
              </option>
            ))}
          </select>
        </Field>

        <Field label="When" htmlFor="followUpDueAt" error={state?.fieldErrors?.dueAt}>
          <input
            id="followUpDueAt"
            name="dueAt"
            type="datetime-local"
            className="input"
            defaultValue={toDateTimeInputValue(tomorrow)}
          />
        </Field>
      </div>

      <Field label="Task" htmlFor="followUpTask" error={state?.fieldErrors?.title}>
        <input
          id="followUpTask"
          name="title"
          className="input"
          placeholder="Ask if she received the bag"
        />
      </Field>

      <Field label="Note" htmlFor="followUpNote">
        <input id="followUpNote" name="notes" className="input" placeholder="Optional" />
      </Field>

      <SubmitButton pendingLabel="Scheduling…">Schedule follow-up</SubmitButton>
    </form>
  );
}
