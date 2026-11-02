"use client";

import { useActionState } from "react";
import { createCustomerAction, updateCustomerAction } from "../lib/actions/customers";
import type { ActionState } from "../lib/actions/types";
import type { Customer } from "../lib/domain/types";
import { Alert, Field } from "./ui";
import { SubmitButton } from "./submit-button";

const initialState: ActionState = null;

export function CustomerForm({ customer }: { customer?: Customer }) {
  const isEdit = Boolean(customer);
  const [state, formAction] = useActionState(
    isEdit ? updateCustomerAction : createCustomerAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3">
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.ok ? <Alert tone="success">{state.message}</Alert> : null}

      {customer ? <input type="hidden" name="customerId" value={customer.id} /> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name" htmlFor="name" error={state?.fieldErrors?.name}>
          <input
            id="name"
            name="name"
            className="input"
            defaultValue={customer?.name ?? ""}
            placeholder="Chinedu Eze"
          />
        </Field>
        <Field label="Phone number" htmlFor="phone" error={state?.fieldErrors?.phone}>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            className="input"
            defaultValue={customer?.phone ?? ""}
            placeholder="0803 123 4567"
          />
        </Field>
        <Field label="Alt. phone" htmlFor="altPhone">
          <input
            id="altPhone"
            name="altPhone"
            type="tel"
            inputMode="tel"
            className="input"
            defaultValue={customer?.alt_phone ?? ""}
            placeholder="Optional"
          />
        </Field>
        <Field label="Delivery address" htmlFor="address">
          <input
            id="address"
            name="address"
            className="input"
            defaultValue={customer?.address ?? ""}
            placeholder="12 Admiralty Way, Lekki"
          />
        </Field>
      </div>

      <Field label="Notes" htmlFor="notes" hint="Preferences, sizes, anything worth remembering.">
        <textarea
          id="notes"
          name="notes"
          rows={2}
          className="input resize-y"
          defaultValue={customer?.notes ?? ""}
        />
      </Field>

      <SubmitButton pendingLabel="Saving…">
        {isEdit ? "Save changes" : "Add customer"}
      </SubmitButton>
    </form>
  );
}
