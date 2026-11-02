import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "../../../lib/auth/session";
import { ORDER_STATUS_LABELS, ORDER_STATUSES, isOrderStatus } from "../../../lib/domain/status";
import { listOrders } from "../../../lib/repositories/orders";
import { OrdersTable } from "../../../components/orders-table";
import { Card, PageHeader } from "../../../components/ui";

export const metadata: Metadata = { title: "Orders" };

type Search = { status?: string; q?: string; payment?: string };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const params = await searchParams;

  const status = params.status === "open" ? "open" : isOrderStatus(params.status) ? params.status : "all";
  const query = (params.q ?? "").trim();

  const orders = listOrders(user.id, {
    status,
    query: query || undefined,
    paymentStatus:
      params.payment === "unpaid" || params.payment === "partial" || params.payment === "paid"
        ? params.payment
        : "all",
    limit: 200,
  });

  const tabs: { key: string; label: string; href: string }[] = [
    { key: "all", label: "All", href: "/orders" },
    { key: "open", label: "Open", href: "/orders?status=open" },
    ...ORDER_STATUSES.map((value) => ({
      key: value,
      label: ORDER_STATUS_LABELS[value],
      href: `/orders?status=${value}`,
    })),
  ];

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Every order, from first enquiry to delivery."
        action={
          <Link href="/orders/new" className="btn-primary">
            + New order
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                status === tab.key
                  ? "bg-ink-900 text-white"
                  : "text-ink-500 hover:bg-slate-200/70 hover:text-ink-900"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <form className="flex w-full gap-2 sm:w-auto" action="/orders">
          {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search reference, name or phone"
            className="input w-full sm:w-72"
            aria-label="Search orders"
          />
          <button type="submit" className="btn-secondary">
            Search
          </button>
        </form>
      </div>

      <Card>
        <div className="border-b border-slate-100 px-5 py-3 text-sm text-ink-500">
          {orders.length} order{orders.length === 1 ? "" : "s"}
          {query ? ` matching “${query}”` : ""}
        </div>
        <OrdersTable
          orders={orders}
          emptyTitle={query ? "No matching orders" : "No orders yet"}
          emptyDescription={
            query
              ? "Try a different reference, customer name or phone number."
              : "Create your first order to start tracking it here."
          }
          emptyAction={
            <Link href="/orders/new" className="btn-primary mt-2">
              Create an order
            </Link>
          }
        />
      </Card>
    </div>
  );
}
