"use client";

import { useActionState, useRef, useState } from "react";
import { updateShopAction } from "../lib/actions/shop";
import type { ActionState } from "../lib/actions/types";
import type { ShopProfile } from "../lib/domain/types";
import { Alert, Field } from "./ui";
import { SubmitButton } from "./submit-button";

const initialState: ActionState = null;

export function ShopProfileForm({ shop }: { shop: ShopProfile }) {
  const [state, formAction] = useActionState(updateShopAction, initialState);
  const [preview, setPreview] = useState<string | null>(shop.shop_logo_url);
  const [removing, setRemoving] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const objectUrl = useRef<string | null>(null);

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
    if (!file) {
      setPreview(removing ? null : shop.shop_logo_url);
      setFileName(null);
      return;
    }
    const url = URL.createObjectURL(file);
    objectUrl.current = url;
    setPreview(url);
    setFileName(file.name);
    setRemoving(false);
  };

  return (
    <form action={formAction} className="space-y-5">
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.ok ? <Alert tone="success">{state.message}</Alert> : null}

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Shop logo preview" className="h-full w-full object-cover" />
          ) : (
            <span className="text-2xl font-semibold text-slate-400" aria-hidden="true">
              {(shop.shop_name ?? shop.business_name).slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>

        <div className="min-w-[200px]">
          <Field
            label="Shop logo"
            htmlFor="shopLogo"
            error={state?.fieldErrors?.shopLogo}
            hint="PNG, JPEG or WebP up to 2MB. Square images look best."
          >
            <input
              id="shopLogo"
              name="shopLogo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={onFileChange}
              className="block w-full text-sm text-ink-500 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
            />
          </Field>
          {fileName ? <p className="mt-1 text-xs text-ink-500">Selected: {fileName}</p> : null}
        </div>

        {shop.shop_logo_url || preview ? (
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              name="removeLogo"
              value="1"
              checked={removing}
              onChange={(event) => {
                setRemoving(event.target.checked);
                if (event.target.checked) {
                  setPreview(null);
                  setFileName(null);
                } else {
                  setPreview(shop.shop_logo_url);
                }
              }}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Remove logo
          </label>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Shop name"
          htmlFor="shopName"
          error={state?.fieldErrors?.shopName}
          hint="Shown at the top of your public shop."
        >
          <input
            id="shopName"
            name="shopName"
            className="input"
            defaultValue={shop.shop_name ?? shop.business_name}
            maxLength={80}
            required
          />
        </Field>

        <Field
          label="Contact phone for customers"
          htmlFor="shopContactPhone"
          error={state?.fieldErrors?.shopContactPhone}
          hint="Optional. Shown publicly so customers can call or message you."
        >
          <input
            id="shopContactPhone"
            name="shopContactPhone"
            type="tel"
            inputMode="tel"
            className="input"
            defaultValue={shop.shop_contact_phone ?? ""}
            placeholder="0803 123 4567"
          />
        </Field>
      </div>

      <Field
        label="Short description"
        htmlFor="shopDescription"
        error={state?.fieldErrors?.shopDescription}
        hint="Up to 600 characters. Tell customers what you sell and where you deliver."
      >
        <textarea
          id="shopDescription"
          name="shopDescription"
          rows={3}
          className="input resize-y"
          defaultValue={shop.shop_description ?? ""}
          maxLength={600}
          placeholder="Handmade bags and accessories. Delivering across Lagos in 24 hours."
        />
      </Field>

      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <h3 className="text-sm font-semibold text-ink-900">Payment details</h3>
        <p className="mt-0.5 text-xs text-ink-500">
          Shown to customers after they order, so they can transfer the goods total and upload a
          receipt.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Bank" htmlFor="bankName" error={state?.fieldErrors?.bankName}>
            <input
              id="bankName"
              name="bankName"
              className="input"
              defaultValue={shop.shop_bank_name ?? ""}
              placeholder="GTBank"
            />
          </Field>

          <Field label="Account number" htmlFor="accountNumber" error={state?.fieldErrors?.accountNumber}>
            <input
              id="accountNumber"
              name="accountNumber"
              inputMode="numeric"
              className="input"
              defaultValue={shop.shop_account_number ?? ""}
              placeholder="0123456789"
            />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Account name" htmlFor="accountName" error={state?.fieldErrors?.accountName}>
              <input
                id="accountName"
                name="accountName"
                className="input"
                defaultValue={shop.shop_account_name ?? ""}
                placeholder="Mystore Fashion / Ada Nwosu"
              />
            </Field>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field
            label="Delivery fee (₦)"
            htmlFor="deliveryFee"
            error={state?.fieldErrors?.deliveryFee}
            hint="Paid on delivery, not added to the transfer."
          >
            <input
              id="deliveryFee"
              name="deliveryFee"
              inputMode="decimal"
              className="input"
              defaultValue={((shop.shop_delivery_fee_kobo ?? 0) / 100).toFixed(2)}
              placeholder="1500"
            />
          </Field>

          <Field
            label="Delivery note"
            htmlFor="deliveryNote"
            hint="Where you deliver, or how the fee is decided."
          >
            <input
              id="deliveryNote"
              name="deliveryNote"
              className="input"
              defaultValue={shop.shop_delivery_note ?? ""}
              placeholder="Lagos Island ₦1,500 · mainland ₦2,500"
            />
          </Field>
        </div>
      </div>

      <SubmitButton pendingLabel="Saving…">Save shop details</SubmitButton>
    </form>
  );
}
