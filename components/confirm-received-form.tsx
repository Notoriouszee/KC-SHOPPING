"use client";

import { useActionState } from "react";
import { confirmReceivedAction, confirmReceivedByTokenAction } from "../lib/actions/delivery";
import type { ActionState } from "../lib/actions/types";
import { Alert } from "./ui";
import { SubmitButton } from "./submit-button";

const initialState: ActionState = null;

/**
 * "I received this order" — recorded against the order so the seller and the
 * admin can both see the buyer confirmed delivery.
 */
export function ConfirmReceivedForm({
  orderId,
  token,
  alreadyConfirmedAt,
  confirmedLabel,
}: {
  orderId?: string;
  token?: string;
  alreadyConfirmedAt?: string | null;
  confirmedLabel?: string;
}) {
  const [state, formAction] = useActionState(
    token ? confirmReceivedByTokenAction : confirmReceivedAction,
    initialState,
  );

  if (alreadyConfirmedAt) {
    return (
      <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        {confirmedLabel ?? "You confirmed you received this order."}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.ok ? <Alert tone="success">{state.message}</Alert> : null}

      {orderId ? <input type="hidden" name="orderId" value={orderId} /> : null}
      {token ? <input type="hidden" name="token" value={token} /> : null}

      <SubmitButton className="btn-primary" pendingLabel="Confirming…">
        I received this order
      </SubmitButton>
      <p className="text-xs text-ink-500">
        Only confirm once the item is in your hands. The seller sees this too.
      </p>
    </form>
  );
}
