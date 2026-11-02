"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveProductAction } from "../lib/actions/products";
import type { ActionState } from "../lib/actions/types";
import type { ProductWithImages } from "../lib/domain/types";
import { Alert, Field } from "./ui";
import { SubmitButton } from "./submit-button";

const initialState: ActionState = null;

export function ProductForm({ product }: { product?: ProductWithImages }) {
  const [state, formAction] = useActionState(saveProductAction, initialState);
  const [publication, setPublication] = useState<"draft" | "published">(
    product?.publication_status ?? "draft",
  );
  const [removals, setRemovals] = useState<string[]>([]);
  const [newFiles, setNewFiles] = useState<string[]>([]);
  const [cover, setCover] = useState<string>(
    product?.images.find((image) => image.position === 0)?.id ?? product?.images[0]?.id ?? "",
  );

  const keptImages = (product?.images ?? []).filter((image) => !removals.includes(image.id));

  return (
    <form action={formAction} className="space-y-6">
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state?.ok ? <Alert tone="success">{state.message}</Alert> : null}

      {product ? <input type="hidden" name="productId" value={product.id} /> : null}
      <input type="hidden" name="publicationStatus" value={publication} />
      {cover ? <input type="hidden" name="coverImage" value={cover} /> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Product name"
          htmlFor="name"
          error={state?.fieldErrors?.name}
          hint="What customers will see, e.g. “Black designer bag”."
        >
          <input
            id="name"
            name="name"
            className="input"
            defaultValue={product?.name ?? ""}
            maxLength={120}
            placeholder="Black designer bag"
            required
          />
        </Field>

        <Field
          label="Price (₦)"
          htmlFor="price"
          error={state?.fieldErrors?.price}
          hint="Naira only. You can change this any time."
        >
          <input
            id="price"
            name="price"
            inputMode="decimal"
            className="input"
            defaultValue={product ? (product.price_kobo / 100).toFixed(2) : ""}
            placeholder="45000"
            required
          />
        </Field>
      </div>

      <Field
        label="Description"
        htmlFor="description"
        error={state?.fieldErrors?.description}
        hint="Size, material, colour options, delivery time — whatever helps the customer decide."
      >
        <textarea
          id="description"
          name="description"
          rows={5}
          className="input resize-y"
          defaultValue={product?.description ?? ""}
          maxLength={2000}
          placeholder="Genuine leather, comes with a dust bag. Available in black and tan."
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Availability"
          htmlFor="availability"
          error={state?.fieldErrors?.availability}
          hint="Out of stock products stay listed but cannot be ordered."
        >
          <select
            id="availability"
            name="availability"
            className="input"
            defaultValue={product?.availability ?? "available"}
          >
            <option value="available">Available</option>
            <option value="out_of_stock">Out of stock</option>
          </select>
        </Field>

        <div>
          <span className="label">Publishing</span>
          <div className="flex gap-2 rounded-xl bg-slate-100 p-1">
            {(
              [
                ["draft", "Draft"],
                ["published", "Publish"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setPublication(value)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  publication === value ? "bg-surface text-ink-900 shadow-sm" : "text-ink-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ink-500">
            {publication === "published"
              ? "Visible to anyone with your shop or product link."
              : "Only you can see drafts. Publish when you are ready to share."}
          </p>
        </div>
      </div>

      <div>
        <span className="label">Photos</span>
        <p className="mb-3 text-xs text-ink-500">
          Up to 5 photos. PNG, JPEG or WebP, 2MB each. The first photo is used as the cover and in
          link previews.
        </p>

        {keptImages.length > 0 ? (
          <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {keptImages.map((image) => {
              const isCover = cover === image.id;
              return (
                <li
                  key={image.id}
                  className={`overflow-hidden rounded-xl border ${
                    isCover ? "border-brand-500 ring-2 ring-brand-200" : "border-slate-200"
                  }`}
                >
                  <div className="relative aspect-square bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.url} alt="" className="h-full w-full object-cover" />
                    {isCover ? (
                      <span className="absolute left-1 top-1 rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-black">
                        Cover
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-between gap-1 px-2 py-1.5 text-xs">
                    <label className="flex items-center gap-1.5 text-ink-700">
                      <input
                        type="checkbox"
                        checked={removals.includes(image.id)}
                        onChange={(event) =>
                          setRemovals((current) =>
                            event.target.checked
                              ? [...current, image.id]
                              : current.filter((id) => id !== image.id),
                          )
                        }
                        className="h-3.5 w-3.5 rounded border-slate-300 text-rose-600"
                      />
                      Remove
                    </label>
                    <button
                      type="button"
                      onClick={() => setCover(image.id)}
                      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                        isCover ? "text-brand-700" : "text-ink-500 hover:bg-slate-100"
                      }`}
                      disabled={removals.includes(image.id)}
                    >
                      {isCover ? "Cover" : "Make cover"}
                    </button>
                  </div>
                  {removals.includes(image.id) ? (
                    <input type="hidden" name="removeImage" value={image.id} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        <input
          id="images"
          name="images"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={(event) =>
            setNewFiles(Array.from(event.target.files ?? []).map((file) => file.name))
          }
          className="block w-full text-sm text-ink-500 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
        />
        {state?.fieldErrors?.images ? (
          <p className="mt-1.5 text-sm text-rose-600">{state.fieldErrors.images}</p>
        ) : null}
        {newFiles.length > 0 ? (
          <p className="mt-1.5 text-xs text-ink-500">
            {newFiles.length} new photo{newFiles.length === 1 ? "" : "s"} ready to upload:{" "}
            {newFiles.join(", ")}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
        <SubmitButton pendingLabel="Saving…">
          {product ? "Save changes" : "Save product"}
        </SubmitButton>
        <Link href="/products" className="btn-secondary">
          Cancel
        </Link>
        <span className="text-xs text-ink-500">
          {publication === "published"
            ? "This product will appear on your shop immediately."
            : "Saved as a draft — not visible to customers."}
        </span>
      </div>
    </form>
  );
}
