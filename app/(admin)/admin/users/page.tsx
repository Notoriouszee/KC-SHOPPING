import type { Metadata } from "next";
import Link from "next/link";
import { adminCustomers, adminShops } from "../../../../lib/repositories/admin";
import { formatNaira } from "../../../../lib/domain/money";
import { formatDate } from "../../../../lib/domain/dates";

export const metadata: Metadata = { title: "Admin users" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const shops = await adminShops(200);
  const customers = await adminCustomers(200);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Users</h1>
        <p className="mt-1 text-sm text-ink-500">
          {shops.length} seller account{shops.length === 1 ? "" : "s"} and {customers.length} customer
          account{customers.length === 1 ? "" : "s"}.
        </p>
      </div>

      <section className="card overflow-x-auto">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink-900">Sellers</h2>
        </div>
        {shops.length === 0 ? (
          <p className="px-4 py-8 text-sm text-ink-500">No sellers yet.</p>
        ) : (
          <table className="table min-w-[760px]">
            <thead>
              <tr>
                <th>Shop</th>
                <th>Owner</th>
                <th className="text-right">Products</th>
                <th className="text-right">Orders</th>
                <th className="text-right">Collected</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {shops.map((shop) => (
                <tr key={shop.id}>
                  <td>
                    <p className="font-medium text-ink-900">{shop.shop_name}</p>
                    {shop.shop_slug ? (
                      <Link
                        href={`/shop/${shop.shop_slug}`}
                        className="text-xs font-semibold text-brand-700 hover:underline"
                      >
                        /shop/{shop.shop_slug}
                      </Link>
                    ) : (
                      <span className="text-xs text-ink-400">no shop link</span>
                    )}
                  </td>
                  <td className="text-sm">
                    <span className="block text-ink-900">{shop.owner_name}</span>
                    <span className="text-xs text-ink-500">{shop.email}</span>
                  </td>
                  <td className="text-right text-sm">{shop.products}</td>
                  <td className="text-right text-sm">{shop.orders}</td>
                  <td className="text-right text-sm">{formatNaira(shop.paid_kobo)}</td>
                  <td className="whitespace-nowrap text-xs text-ink-500">{formatDate(shop.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card overflow-x-auto">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink-900">Customers</h2>
        </div>
        {customers.length === 0 ? (
          <p className="px-4 py-8 text-sm text-ink-500">No customer accounts yet.</p>
        ) : (
          <table className="table min-w-[620px]">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th className="text-right">Orders</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td className="font-medium text-ink-900">{customer.owner_name}</td>
                  <td className="text-sm text-ink-700">{customer.email}</td>
                  <td className="text-sm text-ink-700">{customer.phone ?? "—"}</td>
                  <td className="text-right text-sm">{customer.orders}</td>
                  <td className="whitespace-nowrap text-xs text-ink-500">
                    {formatDate(customer.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
