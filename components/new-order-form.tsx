"use client";

import { useActionState, useMemo, useState } from "react";
import { createOrderAction } from "../lib/actions/orders";
import type { ActionState } from "../lib/actions/types";
import { formatNaira, parseNairaToKobo } from "../lib/domain/money";
import { Alert, Card, CardHeader, Field } from "./ui";
import { SubmitButton } from "./submit-button";

type Row = { key: number; description: string; quantity: string; price: string };

type CustomerOption = { id: string; name: string; phone: string };

const initialState: ActionState = null;

let nextKey = 2;

export function NewOrderForm({ customers }: { customers: CustomerOption[] }) {
  const [state, formAction] = useActionState(createOrderAction, initialState);
  const [mode, setMode] = useState<"existing" | "new">(customers.length > 0 ? "existing" : "new");
  const [rows, setRows] = useState<Row[]>([{ key: 1, description: "", quantity: "1", price: "" }]);
  const [deliveryFee, setDeliveryFee] = useState("0");

  const totals = useMemo(() => {
    const subtotal = rows.reduce((sum, row) => {
      const unit = parseNairaToKobo(row.price) ?? 0;
      const quantity = Number.parseInt(row.quantity, 10) || 0;
      return sum + unit * quantity;
    }, 0);
    const fee = parseNairaToKobo(deliveryFee) ?? 0;
    return { subtotal, fee, total: subtotal + fee };
  }, [rows, deliveryFee]);

  const updateRow = (key: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const addRow = () =>
    setRows((current) => [...current, { key: nextKey++, description: "", quantity: "1", price: "" }]);

  const removeRow = (key: number) =>
    setRows((current) => (current.length === 1 ? current : current.filter((row) => row.key !== key)));

  const itemError =
    state?.fieldErrors?.items ?? state?.fieldErrors?.["itemPrice.0"] ?? state?.fieldErrors?.description;

  return (
    <form action={formAction} className="space-y-6">
      {state?.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Card>
        <CardHeader title="Customer" description="Who is this order for?" />
        <div className="space-y-4 px-5 py-5">
          {customers.length > 0 ? (
            <div className="flex gap-2 rounded-xl bg-slate-100 p-1">
              {(
                [
                  ["existing", "Existing customer"],
                  ["new", "New customer"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    mode === value ? "bg-surface text-ink-900 shadow-sm" : "text-ink-500"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}

          <input type="hidden" name="customerMode" value={mode} />

          {mode === "existing" ? (
            <Field label="Customer" htmlFor="customerId" error={state?.fieldErrors?.customerId}>
              <select id="customerId" name="customerId" className="input" defaultValue="">
                <option value="" disabled>
                  Choose a customer
                </option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} — {customer.phone}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Customer name" htmlFor="customerName" error={state?.fieldErrors?.customerName}>
                <input
                  id="customerName"
                  name="customerName"
                  className="input"
                  placeholder="Chinedu Eze"
                  autoComplete="off"
                />
              </Field>
              <Field
                label="Phone number"
                htmlFor="customerPhone"
                error={state?.fieldErrors?.customerPhone}
              >
                <input
                  id="customerPhone"
                  name="customerPhone"
                  type="tel"
                  inputMode="tel"
                  className="input"
                  placeholder="0803 123 4567"
                  autoComplete="off"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Delivery address" htmlFor="customerAddress">
                  <input
                    id="customerAddress"
                    name="customerAddress"
                    className="input"
                    placeholder="12 Admiralty Way, Lekki, Lagos"
                  />
                </Field>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Items" description="What did the customer order?" />
        <div className="space-y-4 px-5 py-5">
          {rows.map((row, index) => (
            <div key={row.key} className="grid gap-3 sm:grid-cols-[1fr_88px_140px_40px] sm:items-end">
              <Field label={index === 0 ? "Item" : ""} htmlFor={`item-${row.key}`}>
                <input
                  id={`item-${row.key}`}
                  name="itemDescription"
                  className="input"
                  value={row.description}
                  onChange={(event) => updateRow(row.key, { description: event.target.value })}
                  placeholder="Black designer bag"
                />
              </Field>
              <Field label={index === 0 ? "Qty" : ""} htmlFor={`qty-${row.key}`}>
                <input
                  id={`qty-${row.key}`}
                  name="itemQuantity"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  className="input"
                  value={row.quantity}
                  onChange={(event) => updateRow(row.key, { quantity: event.target.value })}
                />
              </Field>
              <Field label={index === 0 ? "Unit price (₦)" : ""} htmlFor={`price-${row.key}`}>
                <input
                  id={`price-${row.key}`}
                  name="itemPrice"
                  inputMode="decimal"
                  className="input"
                  value={row.price}
                  onChange={(event) => updateRow(row.key, { price: event.target.value })}
                  placeholder="25000"
                />
              </Field>
              <div className={index === 0 ? "pb-1 sm:pb-2" : "pb-1 sm:pb-2"}>
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  disabled={rows.length === 1}
                  aria-label="Remove item"
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-ink-500 hover:bg-slate-50 disabled:opacity-40"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}

          <button type="button" onClick={addRow} className="btn-secondary text-sm">
            + Add another item
          </button>

          {itemError ? <p className="text-sm text-rose-600">{itemError}</p> : null}
        </div>
      </Card>

      <Card>
        <CardHeader title="Delivery and notes" />
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
          <Field
            label="Delivery fee (₦)"
            htmlFor="deliveryFee"
            error={state?.fieldErrors?.deliveryFee}
            hint="Leave as 0 if you are not charging delivery."
          >
            <input
              id="deliveryFee"
              name="deliveryFee"
              inputMode="decimal"
              className="input"
              value={deliveryFee}
              onChange={(event) => setDeliveryFee(event.target.value)}
            />
          </Field>
          <div className="sm:col-span-1">
            <Field label="Delivery address" htmlFor="deliveryAddress" hint="Optional for pickup orders.">
              <input
                id="deliveryAddress"
                name="deliveryAddress"
                className="input"
                placeholder="Same as customer address"
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Order notes" htmlFor="notes">
              <textarea
                id="notes"
                name="notes"
                rows={3}
                className="input resize-y"
                placeholder="Colour preference, delivery instructions, anything the seller should remember."
              />
            </Field>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-6 sm:justify-start">
              <dt className="text-ink-500">Subtotal</dt>
              <dd className="font-medium text-ink-900">{formatNaira(totals.subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-6 sm:justify-start">
              <dt className="text-ink-500">Delivery</dt>
              <dd className="font-medium text-ink-900">{formatNaira(totals.fee)}</dd>
            </div>
            <div className="flex justify-between gap-6 border-t border-slate-100 pt-1 sm:justify-start">
              <dt className="font-semibold text-ink-900">Total</dt>
              <dd className="font-semibold text-ink-900">{formatNaira(totals.total)}</dd>
            </div>
          </dl>

          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-500">Saved as <strong>unpaid</strong> until you record payment.</span>
            <SubmitButton pendingLabel="Saving order…">Save order</SubmitButton>
          </div>
        </div>
      </Card>
    </form>
  );
}
