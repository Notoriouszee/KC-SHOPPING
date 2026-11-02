"use client";

import type { ReactNode } from "react";

/**
 * A form whose submit asks for confirmation first. Used for destructive actions
 * (deleting a product) so a stray tap on mobile does not destroy data.
 */
export function ConfirmForm({
  action,
  fields,
  message,
  children,
  className = "",
}: {
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  message: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
        }
      }}
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
    </form>
  );
}
