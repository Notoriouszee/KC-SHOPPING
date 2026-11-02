"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { placePublicOrderAction } from "../lib/actions/public-orders";
import type { ActionState } from "../lib/actions/types";
import { formatNaira } from "../lib/domain/money";
import { MAX_PUBLIC_QUANTITY } from "../lib/domain/public-order";
import { Alert, Field } from "./ui";
import { SubmitButton } from "./submit-button";

const initialState: ActionState = null;

export function PublicOrderForm({
  shopSlug,
  productSlug,
  productName,
  priceKobo,
  deliveryFeeKobo = 0,
  defaultName = "",
  defaultPhone = "",
  maxQuantity = MAX_PUBLIC_QUANTITY,
}: {
  shopSlug: string;
  productSlug: string;
  productName: string;
  priceKobo: number;
  deliveryFeeKobo?: number;
  defaultName?: string;
  defaultPhone?: string;
  maxQuantity?: number;
}) {
  const [state, formAction] = useActionState(placePublicOrderAction, initialState);
  const [quantity, setQuantity] = useState("1");

  const parsedQuantity = Math.max(1, Math.min(Number.parseInt(quantity, 10) || 1, maxQuantity));
  const total = useMemo(() => priceKobo * parsedQuantity, [priceKobo, parsedQuantity]);

  return (
    <form action={formAction} className="space-y-5">
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <input type="hidden" name="shopSlug" value={shopSlug} />
      <input type="hidden" name="productSlug" value={productSlug} />

      {/* Honeypot: hidden from people, tempting to bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="name" error={state?.fieldErrors?.name}>
          <input
            id="name"
            name="name"
            className="input"
            autoComplete="name"
            defaultValue={defaultName}
            placeholder="Chinedu Eze"
            required
          />
        </Field>

        <Field
          label="Phone number"
          htmlFor="phone"
          error={state?.fieldErrors?.phone}
          hint="The seller will call or message you on this number."
        >
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className="input"
            defaultValue={defaultPhone}
            placeholder="0803 123 4567"
            required
          />
        </Field>
      </div>

      <div>
        <span className="label">Quantity</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setQuantity(String(Math.max(1, parsedQuantity - 1)))}
            className="h-11 w-11 rounded-xl border border-slate-300 text-lg font-semibold text-ink-700 hover:bg-slate-50 disabled:opacity-40"
            aria-label="Decrease quantity"
            disabled={parsedQuantity <= 1}
          >
            −
          </button>
          <input
            id="quantity"
            name="quantity"
            type="number"
            min={1}
            max={maxQuantity}
            step={1}
            inputMode="numeric"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className="input w-20 text-center"
            aria-label="Quantity"
          />
          <button
            type="button"
            onClick={() => setQuantity(String(Math.min(maxQuantity, parsedQuantity + 1)))}
            className="h-11 w-11 rounded-xl border border-slate-300 text-lg font-semibold text-ink-700 hover:bg-slate-50 disabled:opacity-40"
            aria-label="Increase quantity"
            disabled={parsedQuantity >= maxQuantity}
          >
            +
          </button>
          <span className="text-sm text-ink-500">
            {formatNaira(priceKobo)} each
          </span>
        </div>
        {state?.fieldErrors?.quantity ? (
          <p className="mt-1.5 text-sm text-rose-600">{state.fieldErrors.quantity}</p>
        ) : null}
      </div>

      <Field
        label="Delivery address"
        htmlFor="address"
        error={state?.fieldErrors?.address}
        hint="Optional — you can agree delivery with the seller on the phone."
      >
        <textarea
          id="address"
          name="address"
          rows={2}
          className="input resize-y"
          placeholder="12 Admiralty Way, Lekki, Lagos"
          autoComplete="street-address"
        />
      </Field>

      <Field label="Notes for the seller" htmlFor="notes" error={state?.fieldErrors?.notes}>
        <input
          id="notes"
          name="notes"
          className="input"
          placeholder="Colour, size, landmark…"
        />
      </Field>

      <div className="rounded-xl bg-slate-50 px-4 py-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-500">
            {productName} × {parsedQuantity}
          </span>
          <span className="text-ink-700">{formatNaira(total)}</span>
        </div>
        {deliveryFeeKobo > 0 ? (
          <div className="mt-1 flex items-center justify-between">
            <span className="text-ink-500">Delivery (pay on delivery)</span>
            <span className="text-ink-700">{formatNaira(deliveryFeeKobo)}</span>
          </div>
        ) : null}
        <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-1.5">
          <span className="text-sm font-semibold text-ink-900">Pay now</span>
          <span className="text-base font-semibold text-ink-900">{formatNaira(total)}</span>
        </div>
        <p className="mt-2 text-xs text-ink-500">
          You will not pay on this page. Transfer the amount above to the shop, upload your receipt
          on the next screen, and pay any delivery fee when your order arrives.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <SubmitButton className="btn-primary flex-1" pendingLabel="Placing order…">
          Place order
        </SubmitButton>
        <Link
          href={`/product/${shopSlug}/${productSlug}`}
          className="btn-secondary flex-1 text-center"
        >
          Back to product
        </Link>
      </div>
    </form>
  );
}
