import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "../../../lib/auth/session";
import { formatDate } from "../../../lib/domain/dates";
import { formatNaira } from "../../../lib/domain/money";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "../../../lib/domain/status";
import { amountDueOnline, listOrders, orderStats } from "../../../lib/repositories/orders";
import { PaymentBadge } from "../../../components/status-badges";
import { Card, CardHeader, EmptyState, PageHeader, StatCard } from "../../../components/ui";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage() {
  const user = await requireUser();

  const stats = orderStats(user.id);
  const orders = listOrders(user.id, { limit: 500 });
  const outstanding = orders
    .filter((order) => order.payment_status === "unpaid" || order.payment_status === "partial")
    .filter((order) => order.status !== "cancelled");
  const refunded = orders.filter((order) => order.payment_status === "refunded");
  const collected = orders.reduce((sum, order) => sum + order.paid_kobo, 0);

  return (
    <div>
      <PageHeader
        title="Payments"
        description="What has been collected, and what is still owed."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Collected" value={formatNaira(collected)} tone="success" />
        <StatCard
          label="Outstanding"
          value={formatNaira(stats.unpaidTotalKobo)}
          hint={`${outstanding.length} order${outstanding.length === 1 ? "" : "s"} with a balance`}
          tone={stats.unpaidTotalKobo > 0 ? "warn" : "neutral"}
        />
        <StatCard label="Refunded orders" value={String(refunded.length)} tone="neutral" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Awaiting payment"
            description="Record a payment from the order page."
          />
          {outstanding.length === 0 ? (
            <EmptyState title="Nothing outstanding" description="Every order has been settled." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {outstanding.map((order) => {
                // Delivery paid on delivery is not money the customer owes now.
                const balance = Math.max(0, amountDueOnline(order) - order.paid_kobo);
                return (
                  <li key={order.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <Link
                        href={`/orders/${order.id}`}
                        className="text-sm font-semibold text-brand-700 hover:underline"
                      >
                        {order.reference}
                      </Link>
                      <p className="truncate text-xs text-ink-500">
                        {order.customer_name} · {order.customer_phone}
                      </p>
                      <p className="text-xs text-ink-500">
                        {ORDER_STATUS_LABELS[order.status]} · {PAYMENT_STATUS_LABELS[order.payment_status]}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-rose-700">{formatNaira(balance)}</p>
                      <p className="text-xs text-ink-500">of {formatNaira(order.total_kobo)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent payment activity" description="Orders you have recorded money against." />
          {orders.filter((order) => order.paid_kobo > 0).length === 0 ? (
            <EmptyState
              title="No payments recorded"
              description="Open an order and use the payment form to record money received."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px]">
                <thead className="border-b border-slate-100">
                  <tr>
                    <th className="table-head">Order</th>
                    <th className="table-head">Date</th>
                    <th className="table-head text-right">Paid</th>
                    <th className="table-head">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders
                    .filter((order) => order.paid_kobo > 0)
                    .slice(0, 20)
                    .map((order) => (
                      <tr key={order.id}>
                        <td className="table-cell">
                          <Link
                            href={`/orders/${order.id}`}
                            className="font-medium text-brand-700 hover:underline"
                          >
                            {order.reference}
                          </Link>
                        </td>
                        <td className="table-cell whitespace-nowrap text-ink-500">
                          {formatDate(order.created_at)}
                        </td>
                        <td className="table-cell whitespace-nowrap text-right">
                          {formatNaira(order.paid_kobo)}
                        </td>
                        <td className="table-cell">
                          <PaymentBadge status={order.payment_status} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
