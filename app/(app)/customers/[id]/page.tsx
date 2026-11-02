import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "../../../../lib/auth/session";
import { formatDate, relativeDay } from "../../../../lib/domain/dates";
import { formatNaira } from "../../../../lib/domain/money";
import { getCustomer } from "../../../../lib/repositories/customers";
import { completeFollowUpAction } from "../../../../lib/actions/followups";
import { listFollowUps } from "../../../../lib/repositories/followups";
import { listOrders } from "../../../../lib/repositories/orders";
import { CustomerForm } from "../../../../components/customer-form";
import { FollowUpForm } from "../../../../components/follow-up-form";
import { OrdersTable } from "../../../../components/orders-table";
import { Card, CardHeader, EmptyState, PageHeader } from "../../../../components/ui";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const customer = getCustomer(user.id, id);
  if (!customer) notFound();

  const orders = listOrders(user.id, { customerId: customer.id, limit: 100 });
  const followUps = listFollowUps(user.id, { status: "open", limit: 100 }).filter(
    (followUp) => followUp.customer_id === customer.id,
  );
  const paidTotal = orders
    .filter((order) => order.payment_status === "paid")
    .reduce((sum, order) => sum + order.total_kobo, 0);

  return (
    <div>
      <div className="mb-4">
        <Link href="/customers" className="text-sm font-medium text-ink-500 hover:text-ink-900">
          ← Back to customers
        </Link>
      </div>

      <PageHeader
        title={customer.name}
        description={`Customer since ${formatDate(customer.created_at)}`}
        action={
          <Link href="/orders/new" className="btn-primary">
            + New order
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Order history"
              description={`${orders.length} order${orders.length === 1 ? "" : "s"} · ${formatNaira(paidTotal)} paid`}
            />
            <OrdersTable
              orders={orders}
              emptyTitle="No orders yet"
              emptyDescription="This customer has not placed an order."
            />
          </Card>

          <Card>
            <CardHeader title="Edit customer" />
            <div className="px-5 py-4">
              <CustomerForm customer={customer} />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Contact" />
            <div className="space-y-2 px-5 py-4 text-sm">
              <p>
                <a href={`tel:${customer.phone}`} className="text-brand-700 hover:underline">
                  {customer.phone}
                </a>
              </p>
              {customer.alt_phone ? (
                <p>
                  <a href={`tel:${customer.alt_phone}`} className="text-brand-700 hover:underline">
                    {customer.alt_phone}
                  </a>
                </p>
              ) : null}
              <p>
                <a
                  href={`https://wa.me/234${customer.phone.replace(/^0/, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-700 hover:underline"
                >
                  Message on WhatsApp
                </a>
              </p>
              {customer.address ? <p className="text-ink-500">{customer.address}</p> : null}
              {customer.notes ? (
                <p className="rounded-xl bg-slate-50 px-3 py-2 text-ink-700">{customer.notes}</p>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Follow-ups" />
            <div className="space-y-3 px-5 py-4">
              {followUps.length === 0 ? (
                <p className="text-sm text-ink-500">No open follow-ups for this customer.</p>
              ) : (
                <ul className="space-y-2">
                  {followUps.map((followUp) => (
                    <li
                      key={followUp.id}
                      className="flex items-start justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-ink-900">{followUp.title}</p>
                        <p className="text-xs text-ink-500">{relativeDay(followUp.due_at)}</p>
                      </div>
                      <form action={completeFollowUpAction}>
                        <input type="hidden" name="followUpId" value={followUp.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-slate-200 bg-surface px-2 py-1 text-xs font-semibold text-ink-700"
                        >
                          Done
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}

              <details className="rounded-xl border border-slate-200">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-ink-700">
                  Add a follow-up
                </summary>
                <div className="border-t border-slate-100 px-3 py-3">
                  <FollowUpForm customerId={customer.id} defaultTitle="Check in with customer" />
                </div>
              </details>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
