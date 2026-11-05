import type { Metadata } from "next";
import Link from "next/link";
import { adminPayments, type PaymentFilter } from "../../../../lib/repositories/admin";
import { formatNaira } from "../../../../lib/domain/money";
import { formatDateTime } from "../../../../lib/domain/dates";
import { PAYMENT_STATUS_LABELS, ORDER_STATUS_LABELS } from "../../../../lib/domain/status";

export const metadata: Metadata = { title: "Admin payments" };
export const dynamic = "force-dynamic";

const filters: { key: PaymentFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending payment" },
  { key: "confirmed", label: "Confirmed" },
  { key: "receipts", label: "With receipts" },
];

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const params = await searchParams;
  const filter = (filters.find((item) => item.key === params.filter)?.key ?? "all") as PaymentFilter;
  const query = (params.q ?? "").trim();

  const rows = await adminPayments({ filter, query, limit: 200 });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Payments</h1>
          <p className="mt-1 text-sm text-ink-500">
            Every order across every shop, with its payment reference and receipt.
          </p>
        </div>

        <form action="/admin/payments" className="flex gap-2">
          <input type="hidden" name="filter" value={filter} />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Reference, shop, customer or phone"
            className="input h-10 w-64"
          />
          <button type="submit" className="btn-secondary">
            Search
          </button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <Link
            key={item.key}
            href={`/admin/payments?filter=${item.key}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              filter === item.key
                ? "bg-ink-900 text-white"
                : "border border-slate-200 bg-surface text-ink-700 hover:bg-slate-50"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-500">No orders match this view.</p>
        ) : (
          <table className="table min-w-[900px]">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Shop</th>
                <th>Customer</th>
                <th className="text-right">Total</th>
                <th className="text-right">Paid</th>
                <th>Payment</th>
                <th>Receipt</th>
                <th>Delivered</th>
                <th>Placed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link
                      href={`/admin/lookup?ref=${row.reference}`}
                      className="font-mono text-xs font-semibold text-brand-700 hover:underline"
                    >
                      {row.reference}
                    </Link>
                    <p className="text-xs text-ink-500">{ORDER_STATUS_LABELS[row.status as keyof typeof ORDER_STATUS_LABELS] ?? row.status}</p>
                  </td>
                  <td className="text-sm text-ink-700">{row.shop_name}</td>
                  <td className="text-sm">
                    <span className="block text-ink-900">{row.customer_name}</span>
                    <span className="text-xs text-ink-500">{row.customer_phone}</span>
                  </td>
                  <td className="text-right text-sm">{formatNaira(row.total_kobo)}</td>
                  <td className="text-right text-sm">{formatNaira(row.paid_kobo)}</td>
                  <td>
                    <span
                      className={`badge ${
                        row.payment_status === "paid"
                          ? "bg-emerald-100 text-emerald-800"
                          : row.payment_status === "refunded"
                            ? "bg-slate-200 text-slate-700"
                            : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {PAYMENT_STATUS_LABELS[row.payment_status as keyof typeof PAYMENT_STATUS_LABELS] ?? row.payment_status}
                    </span>
                  </td>
                  <td>
                    {row.receipt_url ? (
                      <a
                        href={row.receipt_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-brand-700 hover:underline"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-xs text-ink-400">—</span>
                    )}
                  </td>
                  <td className="text-xs">
                    {row.received_confirmed_at ? (
                      <span className="text-emerald-700">Confirmed</span>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-xs text-ink-500">
                    {formatDateTime(row.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
