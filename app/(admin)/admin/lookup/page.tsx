import type { Metadata } from "next";
import Link from "next/link";
import { adminOrderByReference } from "../../../../lib/repositories/admin";
import { formatNaira } from "../../../../lib/domain/money";
import { formatDateTime } from "../../../../lib/domain/dates";
import { PAYMENT_STATUS_LABELS, ORDER_STATUS_LABELS } from "../../../../lib/domain/status";

export const metadata: Metadata = { title: "Find a payment reference" };
export const dynamic = "force-dynamic";

export default async function AdminLookupPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const params = await searchParams;
  const reference = (params.ref ?? "").trim();
  const order = reference ? await adminOrderByReference(reference) : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Find a payment reference</h1>
        <p className="mt-1 text-sm text-ink-500">
          Search the reference a customer quotes in a dispute. You will see the order, the receipt they
          uploaded, and every event on it.
        </p>
      </div>

      <form action="/admin/lookup" className="flex flex-wrap gap-2">
        <input
          type="search"
          name="ref"
          defaultValue={reference}
          placeholder="OP-XXXXXX"
          className="input h-11 w-full font-mono sm:w-64"
          autoFocus={!reference}
        />
        <button type="submit" className="btn-primary">
          Look up
        </button>
      </form>

      {reference && !order ? (
        <div className="card px-6 py-10 text-center">
          <p className="text-base font-semibold text-ink-900">No order with reference “{reference}”</p>
          <p className="mt-1 text-sm text-ink-500">
            Check the reference — it always starts with “OP-”. You can also search by shop or phone on
            the payments page.
          </p>
          <Link href="/admin/payments" className="btn-secondary mt-4">
            Browse payments
          </Link>
        </div>
      ) : null}

      {order ? (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Reference</p>
                <p className="font-mono text-2xl font-semibold tracking-tight text-ink-900">
                  {order.reference}
                </p>
                <p className="mt-1 text-sm text-ink-500">
                  Placed {formatDateTime(order.created_at)} · {order.shop_name}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="badge bg-slate-100 text-slate-800">
                  {ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] ?? order.status}
                </span>
                <span
                  className={`badge ${
                    order.payment_status === "paid"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {PAYMENT_STATUS_LABELS[order.payment_status as keyof typeof PAYMENT_STATUS_LABELS] ??
                    order.payment_status}
                </span>
                {order.received_confirmed_at ? (
                  <span className="badge bg-emerald-100 text-emerald-800">Delivery confirmed</span>
                ) : (
                  <span className="badge bg-slate-100 text-slate-700">Delivery not confirmed</span>
                )}
              </div>
            </div>

            <dl className="mt-5 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-500">Total</dt>
                <dd className="text-lg font-semibold text-ink-900">{formatNaira(order.total_kobo)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-500">Paid</dt>
                <dd className="text-lg font-semibold text-emerald-700">{formatNaira(order.paid_kobo)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-500">Delivery fee</dt>
                <dd className="text-lg font-semibold text-ink-900">
                  {formatNaira(order.delivery_fee_kobo)}
                  {order.delivery_fee_on_delivery === 1 ? (
                    <span className="ml-1 text-xs font-normal text-amber-700">on delivery</span>
                  ) : null}
                </dd>
              </div>
            </dl>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-ink-900">Parties</h2>
              <div className="mt-3 space-y-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink-500">Seller</p>
                  <p className="font-medium text-ink-900">{order.shop_name}</p>
                  <p className="text-ink-600">{order.seller_email}</p>
                  <p className="text-ink-600">{order.seller_phone ?? "no phone on file"}</p>
                  {order.shop_slug ? (
                    <Link
                      href={`/shop/${order.shop_slug}`}
                      className="text-xs font-semibold text-brand-700 hover:underline"
                    >
                      Open shop →
                    </Link>
                  ) : null}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink-500">Customer</p>
                  <p className="font-medium text-ink-900">{order.customer_name}</p>
                  <p className="text-ink-600">{order.customer_phone}</p>
                  <p className="text-ink-600">{order.buyer_email ?? "no account (token order)"}</p>
                </div>
                {order.delivery_address ? (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-ink-500">Delivery address</p>
                    <p className="text-ink-700">{order.delivery_address}</p>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="card p-5">
              <h2 className="text-sm font-semibold text-ink-900">Payment receipt</h2>
              {order.receipt_url ? (
                <div className="mt-3 space-y-2">
                  <a href={order.receipt_url} target="_blank" rel="noreferrer" className="block w-fit">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={order.receipt_url}
                      alt="Payment receipt"
                      className="h-56 rounded-xl border border-slate-200 object-contain"
                    />
                  </a>
                  <p className="text-xs text-ink-500">
                    Uploaded {formatDateTime(order.receipt_uploaded_at)}
                  </p>
                  {order.receipt_note ? (
                    <p className="text-sm text-ink-700">“{order.receipt_note}”</p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-3 text-sm text-ink-500">The customer has not uploaded a receipt.</p>
              )}

              {order.received_confirmed_at ? (
                <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  Customer confirmed delivery on {formatDateTime(order.received_confirmed_at)}.
                </p>
              ) : null}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold text-ink-900">Items</h2>
            <table className="table mt-2">
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td className="text-ink-900">{item.description}</td>
                    <td className="text-right text-ink-600">× {item.quantity}</td>
                    <td className="text-right text-ink-900">
                      {formatNaira(item.unit_price_kobo * item.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {order.notes ? (
              <p className="mt-3 text-sm text-ink-600">
                <span className="font-medium text-ink-900">Seller notes:</span> {order.notes}
              </p>
            ) : null}
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-semibold text-ink-900">Timeline</h2>
            <ol className="mt-3 space-y-3">
              {order.events.map((event) => (
                <li key={event.id} className="text-sm">
                  <p className="font-medium text-ink-900">{event.message}</p>
                  <p className="text-xs text-ink-500">{formatDateTime(event.created_at)}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : null}
    </div>
  );
}
