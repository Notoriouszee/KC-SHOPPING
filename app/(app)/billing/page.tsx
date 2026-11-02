import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "../../../lib/auth/session";
import { paystackConfigured, paystackMode } from "../../../lib/paystack";
import {
  PLAN_DAYS,
  TRIAL_DAYS,
  planAmountKobo,
  subscriptionState,
} from "../../../lib/repositories/subscriptions";
import { formatNaira } from "../../../lib/domain/money";
import { formatDate } from "../../../lib/domain/dates";
import { SubscribeButton } from "../../../components/subscribe-button";
import { Alert, Card, CardHeader, PageHeader } from "../../../components/ui";

export const metadata: Metadata = { title: "Billing", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; reference?: string; reason?: string }>;
}) {
  const user = await requireUser();
  const subscription = subscriptionState(user.id);
  const params = await searchParams;

  const amount = formatNaira(subscription.subscription.amount_kobo || planAmountKobo());
  const endsAt = subscription.endsAt ? formatDate(subscription.endsAt) : "—";

  const badge =
    subscription.status === "trialing"
      ? { text: "Free trial", tone: "bg-white/10 text-white" }
      : subscription.status === "active"
        ? { text: "Active", tone: "bg-white text-black" }
        : subscription.status === "cancelled"
          ? { text: "Cancelled", tone: "bg-white/10 text-white/60" }
          : { text: "Payment due", tone: "bg-amber-100 text-amber-900" };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description={`Your shop is on a ${TRIAL_DAYS}-day free trial, then ${amount} per month.`}
      />

      {params.status === "paid" ? (
        <Alert tone="success">
          Payment received — your subscription is active until {endsAt}.
          {params.reference ? ` Reference ${params.reference}.` : ""}
        </Alert>
      ) : null}

      {params.status === "failed" ? (
        <Alert tone="danger">
          The payment was not completed{params.reason === "amount-mismatch" ? " (amount did not match the plan)" : ""}.
          Nothing was charged; you can try again.
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Plan"
          description="One plan for every seller. Cancel any time; access runs to the end of the paid month."
          action={<span className={`badge ${badge.tone}`}>{badge.text}</span>}
        />

        <div className="space-y-4 px-5 py-4">
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-[10px] uppercase tracking-[0.16em] text-ink-500">Price</dt>
              <dd className="text-lg font-semibold text-ink-900">
                {amount} <span className="text-xs font-normal text-ink-500">/ month</span>
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.16em] text-ink-500">
                {subscription.status === "active" ? "Renews" : "Trial ends"}
              </dt>
              <dd className="text-lg font-semibold text-ink-900">{endsAt}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.16em] text-ink-500">
                {subscription.status === "trialing" ? "Trial days left" : "Days left"}
              </dt>
              <dd className="text-lg font-semibold text-ink-900">
                {subscription.daysLeft}
                {subscription.status === "past_due" ? (
                  <span className="ml-2 text-xs font-normal text-rose-600">expired</span>
                ) : null}
              </dd>
            </div>
          </dl>

          {subscription.active ? (
            <p className="text-sm text-ink-500">
              {subscription.status === "trialing"
                ? `You are on the free month. Nothing to pay until ${endsAt}.`
                : `Paid until ${endsAt}. You can renew early — extra days are added, never lost.`}
            </p>
          ) : (
            <Alert tone="warn">
              Your {subscription.status === "cancelled" ? "subscription has ended" : "free month has ended"}.
              Your shop and its products stay visible to buyers, but you cannot add or edit products
              until you subscribe.
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <SubscribeButton
              label={subscription.status === "past_due" ? "Pay to reactivate" : "Subscribe for a month"}
            />
            <span className="text-xs text-ink-500">
              Secure checkout by Paystack · card, transfer or USSD
            </span>
          </div>

          {!paystackConfigured() ? (
            <Alert tone="danger">
              PAYSTACK_SECRET_KEY is not set, so checkout cannot start. Add it to .env.local.
            </Alert>
          ) : paystackMode() === "test" ? (
            <p className="text-xs text-ink-500">
              Paystack is in <strong>test mode</strong> — use test card 4084 0840 8408 4081, any future
              expiry and CVV 408.
            </p>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader title="What the subscription covers" />
        <ul className="space-y-2 px-5 py-4 text-sm text-ink-700">
          <li>· Your shop link and unlimited published products</li>
          <li>· Orders, customers, follow-ups and payment receipts</li>
          <li>· Share cards and link previews for every product</li>
          <li>· The monthly fee is separate from the money buyers pay you directly</li>
        </ul>
      </Card>

      <p className="text-xs text-ink-500">
        Questions about a charge?{" "}
        <Link href="/contact" className="text-white underline underline-offset-4">
          Contact us
        </Link>{" "}
        with the payment reference.
      </p>
    </div>
  );
}
