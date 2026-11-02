import type { Metadata } from "next";
import Link from "next/link";
import { adminOverview, adminPayments, adminCustomers, adminShops } from "../../../lib/repositories/admin";
import {
  topPages,
  visitorSeries,
  visitorTotals,
  type VisitorBucket,
} from "../../../lib/repositories/visits";
import { formatNaira } from "../../../lib/domain/money";
import { formatDateTime } from "../../../lib/domain/dates";

export const metadata: Metadata = { title: "Admin overview" };
export const dynamic = "force-dynamic";

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "warn" | "good";
}) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tracking-tight ${
          tone === "warn" ? "text-amber-700" : tone === "good" ? "text-emerald-700" : "text-ink-900"
        }`}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

function VisitorTable({ title, rows, grain }: { title: string; rows: VisitorBucket[]; grain: string }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-500">No visits recorded yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{grain}</th>
              <th className="text-right">Visits</th>
              <th className="text-right">Unique</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.bucket}>
                <td className="font-medium text-ink-900">{row.bucket}</td>
                <td className="text-right">{row.visits.toLocaleString()}</td>
                <td className="text-right text-ink-500">{row.uniqueVisitors.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default async function AdminHomePage() {
  const overview = adminOverview();
  const visitors = visitorTotals();
  const byDay = visitorSeries("day", 14);
  const byMonth = visitorSeries("month", 6);
  const byYear = visitorSeries("year", 5);
  const pages = topPages(6);
  const recent = adminPayments({ limit: 6 });
  const customers = adminCustomers(5);
  const shops = adminShops(5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Platform overview</h1>
        <p className="mt-1 text-sm text-ink-500">
          Everything happening across every shop, plus visitor counts by day, month and year.
        </p>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">Visitors</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Today" value={visitors.today} />
          <Stat label="Last 7 days" value={visitors.last7Days} />
          <Stat label="This month" value={visitors.thisMonth} hint={`${visitors.uniqueThisMonth} unique`} />
          <Stat label="This year" value={visitors.thisYear} />
          <Stat label="All time" value={visitors.allTime} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
          Commerce
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Sellers" value={overview.sellers} hint={`${overview.shops} shops live`} />
          <Stat label="Customer accounts" value={overview.customers} />
          <Stat label="Orders" value={overview.orders} hint={`${overview.publishedProducts} products live`} />
          <Stat
            label="Pending payments"
            value={overview.pendingPayments}
            hint={`${formatNaira(overview.outstandingKobo)} outstanding`}
            tone="warn"
          />
          <Stat label="Confirmed payments" value={overview.confirmedPayments} tone="good" />
          <Stat label="Receipts to review" value={overview.receiptsAwaitingReview} tone="warn" />
          <Stat label="Deliveries confirmed" value={overview.deliveriesConfirmedByCustomer} tone="good" />
          <Stat label="Collected" value={formatNaira(overview.grossPaidKobo)} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <VisitorTable title="Visits per day" rows={byDay} grain="Day" />
        <VisitorTable title="Visits per month" rows={byMonth} grain="Month" />
        <VisitorTable title="Visits per year" rows={byYear} grain="Year" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-ink-900">Most visited pages</h3>
            <Link href="/admin/users" className="text-xs font-medium text-brand-700 hover:underline">
              Users →
            </Link>
          </div>
          {pages.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-500">No visits recorded yet.</p>
          ) : (
            <table className="table">
              <tbody>
                {pages.map((page) => (
                  <tr key={page.path}>
                    <td className="font-mono text-xs text-ink-700">{page.path}</td>
                    <td className="text-right">{page.visits.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-ink-900">Latest orders</h3>
            <Link href="/admin/payments" className="text-xs font-medium text-brand-700 hover:underline">
              All payments →
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-500">No orders yet.</p>
          ) : (
            <table className="table">
              <tbody>
                {recent.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link
                        href={`/admin/lookup?ref=${order.reference}`}
                        className="font-mono text-xs font-semibold text-brand-700 hover:underline"
                      >
                        {order.reference}
                      </Link>
                      <p className="text-xs text-ink-500">{order.shop_name}</p>
                    </td>
                    <td className="text-right text-xs">
                      <span className="block font-medium text-ink-900">{formatNaira(order.total_kobo)}</span>
                      <span className="text-ink-500">{formatDateTime(order.created_at)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-ink-900">Newest shops</h3>
          </div>
          <table className="table">
            <tbody>
              {shops.map((shop) => (
                <tr key={shop.id}>
                  <td>
                    <p className="font-medium text-ink-900">{shop.shop_name}</p>
                    <p className="text-xs text-ink-500">{shop.email}</p>
                  </td>
                  <td className="text-right text-xs text-ink-500">
                    {shop.products} products · {shop.orders} orders
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-ink-900">Newest customers</h3>
          </div>
          <table className="table">
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <p className="font-medium text-ink-900">{customer.owner_name}</p>
                    <p className="text-xs text-ink-500">{customer.email}</p>
                  </td>
                  <td className="text-right text-xs text-ink-500">{customer.orders} orders</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
