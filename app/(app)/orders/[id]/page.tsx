import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "../../../../lib/auth/session";
import { formatDateTime, relativeDay } from "../../../../lib/domain/dates";
import { formatNaira } from "../../../../lib/domain/money";
import {
  ORDER_SOURCE_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_TRANSITIONS,
  PAYMENT_STATUS_LABELS,
} from "../../../../lib/domain/status";
import { amountDueOnline, getOrderDetail } from "../../../../lib/repositories/orders";
import { getProduct } from "../../../../lib/repositories/products";
import { completeFollowUpAction } from "../../../../lib/actions/followups";
import { refundOrderAction, updateOrderStatusAction } from "../../../../lib/actions/orders";
import { confirmReceiptAction } from "../../../../lib/actions/receipts";
import { FollowUpForm } from "../../../../components/follow-up-form";
import { OrderNotesForm } from "../../../../components/order-notes-form";
import { PaymentForm } from "../../../../components/payment-form";
import { OrderStatusBadge, PaymentBadge } from "../../../../components/status-badges";
import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader } from "../../../../components/ui";

export const metadata: Metadata = { title: "Order" };

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;

  const order = await getOrderDetail(user.id, id);
  if (!order) notFound();

  // Delivery collected on delivery is not part of what the customer transfers.
  const dueOnline = amountDueOnline(order);
  const remaining = Math.max(0, dueOnline - order.paid_kobo);
  const deliveryOnDelivery = order.delivery_fee_on_delivery === 1 && order.delivery_fee_kobo > 0;
  const transitions = ORDER_TRANSITIONS[order.status];
  // Orders placed from a shared product link keep a reference to that product.
  const sourceProduct = order.product_id ? await getProduct(user.id, order.product_id) : null;

  return (
    <div>
      <div className="mb-4">
        <Link href="/orders" className="text-sm font-medium text-ink-500 hover:text-ink-900">
          ← Back to orders
        </Link>
      </div>

      {query.created === "1" ? (
        <div className="mb-4">
          <Alert tone="success">
            Order <strong>{order.reference}</strong> created. It is saved as{" "}
            <strong>unpaid</strong> until you record a payment.
          </Alert>
        </div>
      ) : null}

      <PageHeader
        title={order.reference}
        description={`${ORDER_SOURCE_LABELS[order.source]} · ${formatDateTime(order.created_at)}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
            <PaymentBadge status={order.payment_status} />
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Items" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px]">
                <thead className="border-b border-slate-100">
                  <tr>
                    <th className="table-head">Item</th>
                    <th className="table-head text-right">Qty</th>
                    <th className="table-head text-right">Unit</th>
                    <th className="table-head text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td className="table-cell font-medium text-ink-900">{item.description}</td>
                      <td className="table-cell text-right">{item.quantity}</td>
                      <td className="table-cell text-right">{formatNaira(item.unit_price_kobo)}</td>
                      <td className="table-cell text-right font-medium text-ink-900">
                        {formatNaira(item.line_total_kobo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="space-y-1.5 border-t border-slate-100 px-5 py-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-500">Subtotal</dt>
                <dd className="text-ink-900">{formatNaira(order.subtotal_kobo)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Delivery</dt>
                <dd className="text-ink-900">{formatNaira(order.delivery_fee_kobo)}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-1.5 text-base font-semibold">
                <dt>Total</dt>
                <dd>{formatNaira(order.total_kobo)}</dd>
              </div>
              <div className="flex justify-between text-emerald-700">
                <dt>Paid</dt>
                <dd>{formatNaira(order.paid_kobo)}</dd>
              </div>
              {deliveryOnDelivery ? (
                <div className="flex justify-between text-xs text-amber-700">
                  <dt>Delivery (paid on delivery)</dt>
                  <dd>{formatNaira(order.delivery_fee_kobo)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between font-medium">
                <dt className={remaining > 0 ? "text-rose-700" : "text-ink-500"}>Balance</dt>
                <dd className={remaining > 0 ? "text-rose-700" : "text-ink-900"}>
                  {formatNaira(remaining)}
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Delivery confirmation"
              description="Recorded by the customer from their order page or the order link."
              action={
                order.received_confirmed_at ? (
                  <Badge tone="success">Confirmed</Badge>
                ) : (
                  <Badge tone="neutral">Awaiting customer</Badge>
                )
              }
            />
            <div className="px-5 py-4 text-sm">
              {order.received_confirmed_at ? (
                <p className="text-ink-700">
                  The customer confirmed they received this order on{" "}
                  <span className="font-medium text-ink-900">
                    {formatDateTime(order.received_confirmed_at)}
                  </span>
                  . Admins can see this too, which is what protects you in a dispute.
                </p>
              ) : (
                <p className="text-ink-500">
                  The customer has not confirmed delivery yet. Ask them to tap “I received this order”
                  on their order page once it arrives.
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Customer payment receipt"
              description="Uploaded by the customer after they transferred payment."
              action={
                order.receipt_url && remaining > 0 ? (
                  <form action={confirmReceiptAction}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <button type="submit" className="btn-primary px-3 py-1.5 text-xs">
                      Confirm payment
                    </button>
                  </form>
                ) : null
              }
            />
            <div className="space-y-3 px-5 py-4">
              {order.receipt_url ? (
                <>
                  <a
                    href={order.receipt_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block w-fit"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={order.receipt_url}
                      alt="Customer payment receipt"
                      className="h-40 rounded-xl border border-slate-200 object-contain"
                    />
                  </a>
                  {order.receipt_note ? (
                    <p className="text-sm text-ink-700">{order.receipt_note}</p>
                  ) : null}
                  <p className="text-xs text-ink-500">
                    Uploaded {formatDateTime(order.receipt_uploaded_at)}. Confirm only after the
                    money has landed in your account.
                  </p>
                </>
              ) : (
                <p className="text-sm text-ink-500">
                  No receipt yet. The customer can upload one from their order page.
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Payment"
              description={`Current status: ${PAYMENT_STATUS_LABELS[order.payment_status]}`}
              action={
                order.paid_kobo > 0 && order.payment_status !== "refunded" ? (
                  <form action={refundOrderAction}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <button type="submit" className="text-sm font-medium text-rose-600 hover:underline">
                      Mark refunded
                    </button>
                  </form>
                ) : null
              }
            />
            <div className="px-5 py-4">
              {remaining === 0 ? (
                <p className="text-sm text-ink-500">This order is fully paid. Nothing to collect.</p>
              ) : (
                <PaymentForm orderId={order.id} remainingKobo={remaining} />
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Where this order came from" />
            <div className="space-y-2 px-5 py-4 text-sm">
              <p className="font-medium text-ink-900">{ORDER_SOURCE_LABELS[order.source]}</p>
              {sourceProduct ? (
                <Link
                  href={`/products/${sourceProduct.id}`}
                  className="inline-block font-medium text-brand-700 hover:underline"
                >
                  {sourceProduct.name} ↗
                </Link>
              ) : order.product_id ? (
                <p className="text-ink-500">
                  The product this link pointed to has since been deleted.
                </p>
              ) : null}
              {order.source === "product_link" ? (
                <p className="text-xs text-ink-500">
                  The customer placed this from a shared product link — no account needed. They
                  were shown reference {order.reference}.
                </p>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Delivery details and notes" />
            <div className="px-5 py-4">
              <OrderNotesForm
                orderId={order.id}
                deliveryAddress={order.delivery_address}
                notes={order.notes}
                deliveryFeeKobo={order.delivery_fee_kobo}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Activity" description="Everything that happened on this order." />
            <ol className="space-y-3 px-5 py-4">
              {order.events.map((event) => (
                <li key={event.id} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-400"
                  />
                  <div>
                    <p className="text-sm text-ink-900">{event.message}</p>
                    <p className="text-xs text-ink-500">{formatDateTime(event.created_at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Customer" />
            <div className="space-y-2 px-5 py-4 text-sm">
              <p className="text-base font-semibold text-ink-900">{order.customer_name}</p>
              <p>
                <a href={`tel:${order.customer_phone}`} className="text-brand-700 hover:underline">
                  {order.customer_phone}
                </a>
              </p>
              <p>
                <a
                  href={`https://wa.me/234${order.customer_phone.replace(/^0/, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-700 hover:underline"
                >
                  Message on WhatsApp
                </a>
              </p>
              {order.delivery_address ? (
                <p className="text-ink-500">{order.delivery_address}</p>
              ) : null}
              <Link
                href={`/customers/${order.customer_id}`}
                className="inline-block pt-1 text-sm font-semibold text-brand-700 hover:underline"
              >
                View customer record
              </Link>
            </div>
          </Card>

          <Card>
            <CardHeader title="Status" description="Move the order along as it progresses." />
            <div className="space-y-2 px-5 py-4">
              {transitions.length === 0 ? (
                <p className="text-sm text-ink-500">
                  This order is {ORDER_STATUS_LABELS[order.status].toLowerCase()} and cannot move
                  further.
                </p>
              ) : (
                transitions.map((next) => (
                  <form key={next} action={updateOrderStatusAction}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="status" value={next} />
                    <button
                      type="submit"
                      className={`w-full rounded-xl border px-3 py-2 text-left text-sm font-medium ${
                        next === "cancelled"
                          ? "border-rose-200 text-rose-700 hover:bg-rose-50"
                          : "border-slate-200 text-ink-700 hover:bg-slate-50"
                      }`}
                    >
                      Mark as {ORDER_STATUS_LABELS[next].toLowerCase()}
                    </button>
                  </form>
                ))
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Follow-ups" />
            <div className="space-y-3 px-5 py-4">
              {order.followUps.length === 0 ? (
                <p className="text-sm text-ink-500">No follow-ups scheduled for this order.</p>
              ) : (
                <ul className="space-y-2">
                  {order.followUps.map((followUp) => (
                    <li
                      key={followUp.id}
                      className="flex items-start justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-ink-900">{followUp.title}</p>
                        <p className="text-xs text-ink-500">
                          {relativeDay(followUp.due_at)} · {followUp.status}
                        </p>
                      </div>
                      {followUp.status === "open" ? (
                        <form action={completeFollowUpAction}>
                          <input type="hidden" name="followUpId" value={followUp.id} />
                          <input type="hidden" name="orderId" value={order.id} />
                          <button
                            type="submit"
                            className="rounded-lg border border-slate-200 bg-surface px-2 py-1 text-xs font-semibold text-ink-700"
                          >
                            Done
                          </button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}

              <details className="rounded-xl border border-slate-200">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-ink-700">
                  Add a follow-up
                </summary>
                <div className="border-t border-slate-100 px-3 py-3">
                  <FollowUpForm orderId={order.id} defaultTitle="Check in on this order" />
                </div>
              </details>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
