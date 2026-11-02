"use client";

import { useActionState } from "react";
import { uploadReceiptAction } from "../lib/actions/receipts";
import type { ActionState } from "../lib/actions/types";
import { Alert, Field } from "./ui";
import { SubmitButton } from "./submit-button";

const initialState: ActionState = null;

/**
 * Lets the customer attach a screenshot/photo of their transfer. Works both from
 * the confirmation link and from the signed-in customer area.
 */
export function ReceiptUploadForm({
  orderId,
  token,
  existingReceiptUrl,
  compact = false,
}: {
  orderId: string;
  token?: string;
  existingReceiptUrl?: string | null;
  compact?: boolean;
}) {
  const [state, formAction] = useActionState(uploadReceiptAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.ok ? <Alert tone="success">{state.message}</Alert> : null}

      <input type="hidden" name="orderId" value={orderId} />
      {token ? <input type="hidden" name="token" value={token} /> : null}

      {existingReceiptUrl ? (
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={existingReceiptUrl}
            alt="Uploaded payment receipt"
            className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
          />
          <p className="text-xs text-ink-500">
            Receipt uploaded. Uploading another one replaces it.
          </p>
        </div>
      ) : null}

      <Field
        label="Payment receipt"
        htmlFor={`receipt-${orderId}`}
        error={state?.fieldErrors?.receipt}
        hint="Screenshot of your bank transfer, up to 4MB."
      >
        <input
          id={`receipt-${orderId}`}
          name="receipt"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          required
          className="block w-full text-sm text-ink-500 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
        />
      </Field>

      <Field label="Note (optional)" htmlFor={`note-${orderId}`}>
        <input
          id={`note-${orderId}`}
          name="note"
          className="input"
          placeholder="Paid from GTBank •••• 1234"
        />
      </Field>

      <SubmitButton className={compact ? "btn-secondary" : "btn-primary"} pendingLabel="Uploading…">
        Send receipt
      </SubmitButton>
    </form>
  );
}
