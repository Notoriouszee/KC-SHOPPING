import Link from "next/link";
import { formatNaira } from "../lib/domain/money";
import { formatDate } from "../lib/domain/dates";
import type { OrderWithCustomer } from "../lib/domain/types";
import { OrderStatusBadge, PaymentBadge } from "./status-badges";
import { EmptyState } from "./ui";

export function OrdersTable({
  orders,
  compact = false,
  emptyTitle = "No orders yet",
  emptyDescription,
  emptyAction,
}: {
  orders: OrderWithCustomer[];
  compact?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
}) {
  if (orders.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse">
        <thead className="border-b border-slate-100">
          <tr>
            <th className="table-head">Order</th>
            <th className="table-head">Customer</th>
            {compact ? null : <th className="table-head">Items</th>}
            <th className="table-head">Total</th>
            <th className="table-head">Status</th>
            <th className="table-head">Payment</th>
            {compact ? null : <th className="table-head">Date</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {orders.map((order) => (
            <tr key={order.id} className="hover:bg-slate-50/70">
              <td className="table-cell">
                <Link
                  href={`/orders/${order.id}`}
                  className="font-semibold text-brand-700 hover:underline"
                >
                  {order.reference}
                </Link>
                {order.source !== "manual" ? (
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-500">
                    {order.source === "product_link" ? "Product link" : "Shop"}
                  </span>
                ) : null}
              </td>
              <td className="table-cell">
                <span className="font-medium text-ink-900">{order.customer_name}</span>
                <span className="mt-0.5 block text-xs text-ink-500">{order.customer_phone}</span>
              </td>
              {compact ? null : (
                <td className="table-cell max-w-[240px]">
                  <span className="line-clamp-2">{order.item_summary ?? "—"}</span>
                </td>
              )}
              <td className="table-cell whitespace-nowrap font-medium text-ink-900">
                {formatNaira(order.total_kobo)}
              </td>
              <td className="table-cell">
                <OrderStatusBadge status={order.status} />
              </td>
              <td className="table-cell">
                <PaymentBadge status={order.payment_status} />
              </td>
              {compact ? null : (
                <td className="table-cell whitespace-nowrap text-ink-500">
                  {formatDate(order.created_at)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
