import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "../../../lib/auth/session";
import { formatNaira } from "../../../lib/domain/money";
import { relativeDay } from "../../../lib/domain/dates";
import { followUpStats, listFollowUps } from "../../../lib/repositories/followups";
import { listOrders, orderStats } from "../../../lib/repositories/orders";
import { OrdersTable } from "../../../components/orders-table";
import { Alert, Card, CardHeader, EmptyState, PageHeader, StatCard } from "../../../components/ui";
import { completeFollowUpAction } from "../../../lib/actions/followups";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const stats = orderStats(user.id);
  const followUpCounts = followUpStats(user.id);
  const recentOrders = listOrders(user.id, { limit: 6 });
  const dueFollowUps = listFollowUps(user.id, { status: "open", limit: 5 });

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user.owner_name.split(" ")[0]}`}
        description="Here is where your order book stands today."
        action={
          <Link href="/orders/new" className="btn-primary">
            + New order
          </Link>
        }
      />

      {params.welcome === "1" ? (
        <div className="mb-6">
          <Alert tone="success">
            Your K&C Shopping account is ready. Start by adding a customer order, or set up your public
            shop link next.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open orders"
          value={String(stats.openOrders)}
          hint={`${stats.ordersThisMonth} order${stats.ordersThisMonth === 1 ? "" : "s"} this month`}
          tone="info"
        />
        <StatCard
          label="Awaiting payment"
          value={formatNaira(stats.unpaidTotalKobo)}
          hint="Outstanding across open orders"
          tone={stats.unpaidTotalKobo > 0 ? "warn" : "neutral"}
        />
        <StatCard
          label="Paid orders value"
          value={formatNaira(stats.paidTotalKobo)}
          hint="Orders marked fully paid"
          tone="success"
        />
        <StatCard
          label="Follow-ups"
          value={String(followUpCounts.open)}
          hint={
            followUpCounts.overdue > 0
              ? `${followUpCounts.overdue} overdue`
              : `${followUpCounts.dueToday} due today`
          }
          tone={followUpCounts.overdue > 0 ? "danger" : "neutral"}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader
            title="Recent orders"
            description="The last few orders across your shop."
            action={
              <Link href="/orders" className="text-sm font-semibold text-brand-700 hover:underline">
                View all
              </Link>
            }
          />
          <OrdersTable
            orders={recentOrders}
            compact
            emptyTitle="No orders yet"
            emptyDescription="Create your first order to see it here."
            emptyAction={
              <Link href="/orders/new" className="btn-primary mt-2">
                Create an order
              </Link>
            }
          />
        </Card>

        <Card>
          <CardHeader
            title="Follow-ups due"
            description="Customers waiting on a nudge."
            action={
              <Link
                href="/follow-ups"
                className="text-sm font-semibold text-brand-700 hover:underline"
              >
                All
              </Link>
            }
          />
          {dueFollowUps.length === 0 ? (
            <EmptyState
              title="Nothing due"
              description="You are all caught up on follow-ups."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {dueFollowUps.map((followUp) => (
                <li key={followUp.id} className="flex items-start justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">{followUp.title}</p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {followUp.customer_name ?? "Customer"}
                      {followUp.order_reference ? ` · ${followUp.order_reference}` : ""} ·{" "}
                      {relativeDay(followUp.due_at)}
                    </p>
                  </div>
                  <form action={completeFollowUpAction}>
                    <input type="hidden" name="followUpId" value={followUp.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-ink-700 hover:bg-slate-50"
                    >
                      Done
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
