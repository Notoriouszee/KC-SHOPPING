import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "../../../lib/auth/session";
import { relativeDay } from "../../../lib/domain/dates";
import { listFollowUps, followUpStats } from "../../../lib/repositories/followups";
import { listCustomers } from "../../../lib/repositories/customers";
import {
  cancelFollowUpAction,
  completeFollowUpAction,
  reopenFollowUpAction,
} from "../../../lib/actions/followups";
import { NewFollowUpForm } from "../../../components/new-follow-up-form";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "../../../components/ui";

export const metadata: Metadata = { title: "Follow-ups" };

type Tab = "open" | "done" | "all";

export default async function FollowUpsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const tab: Tab = params.tab === "done" ? "done" : params.tab === "all" ? "all" : "open";

  const followUps = listFollowUps(user.id, { status: tab, limit: 300 });
  const stats = followUpStats(user.id);
  const customers = listCustomers(user.id, { limit: 300 }).map((customer) => ({
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
  }));

  const openItems = followUps.filter((item) => item.status === "open");
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const groups = [
    {
      key: "overdue",
      title: "Overdue",
      items: openItems.filter((item) => new Date(item.due_at).getTime() < startOfToday.getTime()),
    },
    {
      key: "today",
      title: "Due today",
      items: openItems.filter((item) => {
        const due = new Date(item.due_at).getTime();
        return due >= startOfToday.getTime() && due < startOfTomorrow.getTime();
      }),
    },
    {
      key: "upcoming",
      title: "Upcoming",
      items: openItems.filter((item) => new Date(item.due_at).getTime() >= startOfTomorrow.getTime()),
    },
  ].filter((group) => group.items.length > 0);

  const tabs: { key: Tab; label: string; href: string }[] = [
    { key: "open", label: "Open", href: "/follow-ups" },
    { key: "done", label: "Completed", href: "/follow-ups?tab=done" },
    { key: "all", label: "All", href: "/follow-ups?tab=all" },
  ];

  const renderItem = (item: (typeof followUps)[number]) => (
    <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-ink-900">{item.title}</p>
          {item.status === "done" ? <Badge tone="success">Done</Badge> : null}
          {item.status === "cancelled" ? <Badge tone="neutral">Cancelled</Badge> : null}
        </div>
        <p className="mt-0.5 text-xs text-ink-500">
          {item.customer_name ?? "Customer"}
          {item.order_reference ? (
            <>
              {" · "}
              <Link href={`/orders/${item.order_id}`} className="text-brand-700 hover:underline">
                {item.order_reference}
              </Link>
            </>
          ) : null}
          {" · "}
          {relativeDay(item.due_at)}
        </p>
        {item.notes ? <p className="mt-1 text-xs text-ink-500">{item.notes}</p> : null}
      </div>

      <div className="flex items-center gap-2">
        {item.status === "open" ? (
          <>
            <form action={completeFollowUpAction}>
              <input type="hidden" name="followUpId" value={item.id} />
              <button type="submit" className="btn-secondary px-2.5 py-1.5 text-xs">
                Mark done
              </button>
            </form>
            <form action={cancelFollowUpAction}>
              <input type="hidden" name="followUpId" value={item.id} />
              <button type="submit" className="btn-ghost px-2 py-1.5 text-xs text-ink-500">
                Dismiss
              </button>
            </form>
          </>
        ) : null}
        {item.status === "done" ? (
          <form action={reopenFollowUpAction}>
            <input type="hidden" name="followUpId" value={item.id} />
            <button type="submit" className="btn-secondary px-2.5 py-1.5 text-xs">
              Reopen
            </button>
          </form>
        ) : null}
      </div>
    </li>
  );

  return (
    <div>
      <PageHeader
        title="Follow-ups"
        description={
          stats.overdue > 0
            ? `${stats.overdue} overdue · ${stats.dueToday} due today`
            : `${stats.open} open · ${stats.dueToday} due today`
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="-mx-1 flex gap-1">
          {tabs.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === item.key
                  ? "bg-ink-900 text-white"
                  : "text-ink-500 hover:bg-slate-200/70 hover:text-ink-900"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <details className="w-full sm:w-auto">
          <summary className="btn-primary cursor-pointer list-none">+ Schedule follow-up</summary>
          <div className="mt-3">
            <Card className="p-5">
              {customers.length === 0 ? (
                <p className="text-sm text-ink-500">
                  Add a customer or an order first — follow-ups attach to one of them.
                </p>
              ) : (
                <NewFollowUpForm customers={customers} />
              )}
            </Card>
          </div>
        </details>
      </div>

      {tab === "open" ? (
        groups.length === 0 ? (
          <Card>
            <EmptyState
              title="You are all caught up"
              description="No open follow-ups. Schedule one so a customer never slips through."
            />
          </Card>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <Card key={group.key}>
                <CardHeader
                  title={group.title}
                  action={<span className="text-sm text-ink-500">{group.items.length}</span>}
                />
                <ul className="divide-y divide-slate-100">{group.items.map(renderItem)}</ul>
              </Card>
            ))}
          </div>
        )
      ) : (
        <Card>
          {followUps.length === 0 ? (
            <EmptyState
              title={tab === "done" ? "Nothing completed yet" : "No follow-ups yet"}
              description="Follow-ups you schedule will appear here."
            />
          ) : (
            <ul className="divide-y divide-slate-100">{followUps.map(renderItem)}</ul>
          )}
        </Card>
      )}
    </div>
  );
}
