"use client";

import { useActionState, useState } from "react";
import { recordPaymentAction } from "../lib/actions/orders";
import type { ActionState } from "../lib/actions/types";
import { formatNaira, parseNairaToKobo } from "../lib/domain/money";
import { Alert } from "./ui";
import { SubmitButton } from "./submit-button";

const initialState: ActionState = null;

export function PaymentForm({
  orderId,
  remainingKobo,
}: {
  orderId: string;
  remainingKobo: number;
}) {
  const [state, formAction] = useActionState(recordPaymentAction, initialState);
  const [amount, setAmount] = useState("");

  const parsed = parseNairaToKobo(amount);
  const willBeComplete = parsed !== null && parsed >= remainingKobo;

  return (
    <form action={formAction} className="space-y-3">
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.ok ? <Alert tone="success">{state.message}</Alert> : null}

      <input type="hidden" name="orderId" value={orderId} />

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[160px] flex-1">
          <label className="label" htmlFor="amount">
            Amount received (₦)
          </label>
          <input
            id="amount"
            name="amount"
            inputMode="decimal"
            className="input"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={(remainingKobo / 100).toFixed(0)}
            aria-describedby="amount-hint"
          />
        </div>
        <button
          type="button"
          className="btn-secondary h-[42px]"
          onClick={() => setAmount((remainingKobo / 100).toFixed(2))}
        >
          Full balance
        </button>
        <SubmitButton pendingLabel="Recording…">Record payment</SubmitButton>
      </div>

      <p id="amount-hint" className="text-xs text-ink-500">
        {parsed !== null && parsed > 0
          ? willBeComplete
            ? `This will mark the order as fully paid (${formatNaira(remainingKobo)} outstanding).`
            : `Remaining balance after this: ${formatNaira(Math.max(0, remainingKobo - parsed))}.`
          : `Outstanding balance: ${formatNaira(remainingKobo)}.`}
      </p>
    </form>
  );
}
