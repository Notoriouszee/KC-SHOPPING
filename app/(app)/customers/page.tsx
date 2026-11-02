import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "../../../lib/auth/session";
import { formatDate } from "../../../lib/domain/dates";
import { formatNaira } from "../../../lib/domain/money";
import { listCustomers } from "../../../lib/repositories/customers";
import { CustomerForm } from "../../../components/customer-form";
import { Card, EmptyState, PageHeader } from "../../../components/ui";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const customers = listCustomers(user.id, { query: query || undefined, limit: 300 });

  return (
    <div>
      <PageHeader title="Customers" description="Everyone you have sold to, in one list." />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <form className="flex w-full gap-2 sm:w-auto" action="/customers">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search by name or phone"
            className="input w-full sm:w-72"
            aria-label="Search customers"
          />
          <button type="submit" className="btn-secondary">
            Search
          </button>
        </form>

        <details className="w-full sm:w-auto">
          <summary className="btn-primary cursor-pointer list-none">+ Add customer</summary>
          <div className="mt-3">
            <Card className="p-5">
              <CustomerForm />
            </Card>
          </div>
        </details>
      </div>

      <Card>
        <div className="border-b border-slate-100 px-5 py-3 text-sm text-ink-500">
          {customers.length} customer{customers.length === 1 ? "" : "s"}
          {query ? ` matching “${query}”` : ""}
        </div>

        {customers.length === 0 ? (
          <EmptyState
            title={query ? "No matching customers" : "No customers yet"}
            description={
              query
                ? "Try a different name or phone number."
                : "Customers are added automatically when you record an order, or you can add one now."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-slate-100">
                <tr>
                  <th className="table-head">Customer</th>
                  <th className="table-head">Phone</th>
                  <th className="table-head text-right">Orders</th>
                  <th className="table-head text-right">Paid value</th>
                  <th className="table-head">Last order</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50/70">
                    <td className="table-cell">
                      <Link
                        href={`/customers/${customer.id}`}
                        className="font-semibold text-brand-700 hover:underline"
                      >
                        {customer.name}
                      </Link>
                    </td>
                    <td className="table-cell whitespace-nowrap">{customer.phone}</td>
                    <td className="table-cell text-right">{customer.order_count}</td>
                    <td className="table-cell whitespace-nowrap text-right">
                      {formatNaira(customer.total_spent_kobo)}
                    </td>
                    <td className="table-cell whitespace-nowrap text-ink-500">
                      {customer.last_order_at ? formatDate(customer.last_order_at) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
