"use client";

import { useFormStatus } from "react-dom";

/** Submit button that reflects the pending state of its enclosing <form>. */
export function SubmitButton({
  children,
  className = "btn-primary",
  pendingLabel = "Working…",
  disabled = false,
}: {
  children: React.ReactNode;
  className?: string;
  pendingLabel?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending || disabled} className={className}>
      {pending ? pendingLabel : children}
    </button>
  );
}
