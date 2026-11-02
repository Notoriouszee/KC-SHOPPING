import Link from "next/link";
import { requireUser } from "../../lib/auth/session";
import { logoutAction } from "../../lib/actions/auth";
import { followUpStats } from "../../lib/repositories/followups";
import { orderStats } from "../../lib/repositories/orders";
import { ensureShopSlugs } from "../../lib/repositories/shop";
import { subscriptionState } from "../../lib/repositories/subscriptions";
import { AppShell, type NavGroup } from "../../components/app-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // Cheap idempotent backfill: any seller created before the storefront existed
  // gets a shop link the first time they open the dashboard.
  ensureShopSlugs();

  const subscription = subscriptionState(user.id);
  const orders = orderStats(user.id);
  const followUps = followUpStats(user.id);

  const groups: NavGroup[] = [
    {
      title: "Workspace",
      items: [
        { href: "/dashboard", label: "Overview", icon: "\u25A6" },
        { href: "/orders", label: "Orders", icon: "\u2630", badge: orders.openOrders },
        { href: "/customers", label: "Customers", icon: "\u263A" },
        { href: "/payments", label: "Payments", icon: "\u20A6" },
        {
          href: "/follow-ups",
          label: "Follow-ups",
          icon: "\u2691",
          badge: followUps.overdue + followUps.dueToday,
        },
      ],
    },
    {
      title: "Storefront",
      items: [
        { href: "/products", label: "Products", icon: "\u25A4" },
        { href: "/share-products", label: "Share Products", icon: "\u2934" },
        { href: "/my-shop", label: "My Shop", icon: "\u2302" },
      ],
    },
    {
      title: "Account",
      items: [
        { href: "/billing", label: "Billing", icon: "\u20A6" },
        { href: "/settings", label: "Settings", icon: "\u2699" },
      ],
    },
  ];

  return (
    <AppShell
      businessName={user.business_name}
      ownerName={user.owner_name}
      groups={groups}
      signOut={
        <form action={logoutAction}>
          <button type="submit" className="btn-secondary px-3 py-1.5">
            Sign out
          </button>
        </form>
      }
    >
      {subscription.active ? null : (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p>
            {subscription.status === "cancelled"
              ? "Your subscription has ended."
              : "Your free month has ended."}{" "}
            Your shop stays visible, but adding or editing products needs an active plan.
          </p>
          <Link href="/billing" className="btn-primary px-3 py-1.5">
            Go to billing
          </Link>
        </div>
      )}
      {children}
    </AppShell>
  );
}
