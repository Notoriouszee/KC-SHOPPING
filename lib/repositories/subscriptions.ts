import { getDb, nowIso, plainRow } from "../db";

/**
 * Seller subscriptions.
 *
 * Every seller gets one free month. After that they pay a monthly plan through
 * Paystack; until it is paid the dashboard stays readable but the shop becomes
 * read-only (no new or edited products).
 */

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "cancelled";

export type Subscription = {
  seller_id: string;
  plan: string;
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_end: string | null;
  amount_kobo: number;
  paystack_reference: string | null;
  last_payment_at: string | null;
  created_at: string;
  updated_at: string;
};

export const TRIAL_DAYS = 30;
export const PLAN_DAYS = 30;

export function planAmountKobo(): number {
  const configured = Number(process.env.SELLER_PLAN_KOBO ?? "");
  return Number.isFinite(configured) && configured > 0 ? Math.round(configured) : 250_000;
}

function addDays(days: number, from = new Date()): string {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function getSubscription(sellerId: string): Subscription | null {
  return plainRow<Subscription>(
    getDb().prepare("SELECT * FROM seller_subscriptions WHERE seller_id = ?").get(sellerId),
  );
}

/** Creates the trial row on first use, so older accounts are never locked out. */
export function ensureSubscription(sellerId: string): Subscription {
  const existing = getSubscription(sellerId);
  if (existing) return existing;

  const timestamp = nowIso();
  getDb()
    .prepare(
      `INSERT INTO seller_subscriptions
         (seller_id, plan, status, trial_ends_at, amount_kobo, created_at, updated_at)
       VALUES (?, 'seller-monthly', 'trialing', ?, ?, ?, ?)`,
    )
    .run(sellerId, addDays(TRIAL_DAYS), planAmountKobo(), timestamp, timestamp);

  return getSubscription(sellerId)!;
}

export type SubscriptionState = {
  subscription: Subscription;
  status: SubscriptionStatus;
  /** True while the seller may create or edit products. */
  active: boolean;
  /** Whole days left in the trial or the paid period; 0 when expired. */
  daysLeft: number;
  /** The date that matters next: trial end or period end. */
  endsAt: string | null;
};

export function evaluate(subscription: Subscription, now = Date.now()): SubscriptionState {
  const trialEnd = subscription.trial_ends_at ? new Date(subscription.trial_ends_at).getTime() : 0;
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end).getTime()
    : 0;

  if (subscription.status === "cancelled") {
    return { subscription, status: "cancelled", active: false, daysLeft: 0, endsAt: subscription.current_period_end };
  }

  if (periodEnd > now) {
    return {
      subscription,
      status: "active",
      active: true,
      daysLeft: Math.ceil((periodEnd - now) / 86_400_000),
      endsAt: subscription.current_period_end,
    };
  }

  if (trialEnd > now) {
    return {
      subscription,
      status: "trialing",
      active: true,
      daysLeft: Math.ceil((trialEnd - now) / 86_400_000),
      endsAt: subscription.trial_ends_at,
    };
  }

  return {
    subscription,
    status: "past_due",
    active: false,
    daysLeft: 0,
    endsAt: subscription.current_period_end ?? subscription.trial_ends_at,
  };
}

/** The state for a seller, creating their trial if this is the first visit. */
export function subscriptionState(sellerId: string): SubscriptionState {
  return evaluate(ensureSubscription(sellerId));
}

/**
 * Records a successful payment. Extends from the later of "now" and the current
 * period end, so paying early never loses days.
 */
export function activateSubscription(
  sellerId: string,
  options: { days?: number; reference: string; amountKobo?: number },
): Subscription {
  const existing = ensureSubscription(sellerId);
  const now = Date.now();

  const currentEnd = existing.current_period_end
    ? new Date(existing.current_period_end).getTime()
    : 0;
  // Paying during the trial must not throw the remaining days away, and paying
  // early must not either: the new month starts at the later of the two ends.
  const trialEnd = existing.trial_ends_at ? new Date(existing.trial_ends_at).getTime() : 0;
  const start = Math.max(now, currentEnd, trialEnd);
  const days = options.days ?? PLAN_DAYS;
  const periodEnd = new Date(start + days * 86_400_000).toISOString();
  const timestamp = nowIso();

  getDb()
    .prepare(
      `UPDATE seller_subscriptions
          SET status = 'active',
              current_period_end = ?,
              paystack_reference = ?,
              last_payment_at = ?,
              amount_kobo = ?,
              updated_at = ?
        WHERE seller_id = ?`,
    )
    .run(
      periodEnd,
      options.reference,
      timestamp,
      options.amountKobo ?? existing.amount_kobo,
      timestamp,
      sellerId,
    );

  return getSubscription(sellerId)!;
}

export function cancelSubscription(sellerId: string): Subscription {
  ensureSubscription(sellerId);
  getDb()
    .prepare("UPDATE seller_subscriptions SET status = 'cancelled', updated_at = ? WHERE seller_id = ?")
    .run(nowIso(), sellerId);
  return getSubscription(sellerId)!;
}

/** True when the seller may write to their catalogue. */
export function hasActiveSubscription(sellerId: string): boolean {
  return subscriptionState(sellerId).active;
}
