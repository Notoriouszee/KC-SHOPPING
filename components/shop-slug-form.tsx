"use client";

import { useActionState, useMemo, useState } from "react";
import { changeShopSlugAction } from "../lib/actions/shop";
import type { ActionState } from "../lib/actions/types";
import { formatDateTime } from "../lib/domain/dates";
import { SLUG_MAX, normaliseSlug, slugProblem } from "../lib/domain/slug";
import { Alert, Field } from "./ui";
import { SubmitButton } from "./submit-button";

const initialState: ActionState = null;

export function ShopSlugForm({
  currentSlug,
  origin,
  canChange,
  nextAllowedAt,
}: {
  currentSlug: string;
  origin: string;
  canChange: boolean;
  nextAllowedAt: string | null;
}) {
  const [state, formAction] = useActionState(changeShopSlugAction, initialState);
  const [value, setValue] = useState(currentSlug);
  const [confirmed, setConfirmed] = useState(false);

  const normalised = useMemo(() => normaliseSlug(value), [value]);
  const problem = useMemo(() => slugProblem(normalised), [normalised]);
  const unchanged = normalised === currentSlug;

  return (
    <form action={formAction} className="space-y-4">
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.ok ? <Alert tone="success">{state.message}</Alert> : null}

      {!canChange && nextAllowedAt ? (
        <Alert tone="warn">
          To keep shared links reliable, a shop link can only change once every 24 hours. You can
          change it again after <strong>{formatDateTime(nextAllowedAt)}</strong>.
        </Alert>
      ) : null}

      <Field
        label="Shop link"
        htmlFor="slug"
        error={state?.fieldErrors?.slug}
        hint="Lowercase letters, numbers and hyphens. This becomes your public address."
      >
        <div className="flex flex-wrap items-stretch gap-2">
          <span className="inline-flex items-center rounded-xl border border-slate-300 bg-slate-100 px-3 text-sm text-ink-500">
            {origin}/shop/
          </span>
          <input
            id="slug"
            name="slug"
            className="input min-w-[180px] flex-1"
            value={value}
            maxLength={SLUG_MAX}
            onChange={(event) => setValue(event.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={!canChange}
          />
        </div>
      </Field>

      <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
        <span className="text-ink-500">Preview: </span>
        <span className="font-medium text-ink-900">
          {origin}/shop/{normalised || "your-shop"}
        </span>
        {problem && !unchanged ? (
          <span className="mt-1 block text-xs text-rose-600">{problem.message}</span>
        ) : null}
        {unchanged ? (
          <span className="mt-1 block text-xs text-ink-500">
            This is your current link. Type a new one to change it.
          </span>
        ) : null}
      </div>

      <label className="flex items-start gap-2.5 text-sm text-ink-700">
        <input
          type="checkbox"
          name="confirmChange"
          value="yes"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          disabled={!canChange}
        />
        <span>
          I understand my old shop link will stop working on its own and will permanently redirect
          to the new link. Already-shared links keep working.
        </span>
      </label>

      <SubmitButton
        className="btn-secondary"
        pendingLabel="Updating link…"
        disabled={!canChange || !confirmed || unchanged || problem !== null}
      >
        Change shop link
      </SubmitButton>

      {!canChange ? (
        <p className="text-xs text-ink-500">
          The form is disabled until the 24-hour window passes.
        </p>
      ) : null}
    </form>
  );
}
