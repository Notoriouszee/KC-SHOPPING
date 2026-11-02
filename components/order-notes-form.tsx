"use client";

import { useActionState } from "react";
import { updateOrderNotesAction } from "../lib/actions/orders";
import type { ActionState } from "../lib/actions/types";
import { Alert, Field } from "./ui";
import { SubmitButton } from "./submit-button";

const initialState: ActionState = null;

export function OrderNotesForm({
  orderId,
  deliveryAddress,
  notes,
  deliveryFeeKobo,
}: {
  orderId: string;
  deliveryAddress: string | null;
  notes: string | null;
  deliveryFeeKobo: number;
}) {
  const [state, formAction] = useActionState(updateOrderNotesAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.ok ? <Alert tone="success">{state.message}</Alert> : null}

      <input type="hidden" name="orderId" value={orderId} />

      <Field label="Delivery address" htmlFor="deliveryAddress">
        <input
          id="deliveryAddress"
          name="deliveryAddress"
          className="input"
          defaultValue={deliveryAddress ?? ""}
          placeholder="Where should this go?"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Delivery fee (₦)" htmlFor="deliveryFee">
          <input
            id="deliveryFee"
            name="deliveryFee"
            inputMode="decimal"
            className="input"
            defaultValue={(deliveryFeeKobo / 100).toFixed(2)}
          />
        </Field>
        <Field label="Notes" htmlFor="notes">
          <input
            id="notes"
            name="notes"
            className="input"
            defaultValue={notes ?? ""}
            placeholder="Internal notes"
          />
        </Field>
      </div>

      <SubmitButton className="btn-secondary" pendingLabel="Saving…">
        Save details
      </SubmitButton>
    </form>
  );
}
