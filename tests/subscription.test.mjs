/**
 * Seller subscriptions and Paystack plumbing (no network calls).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const { signUp } = await import("../lib/auth/users.ts");
const {
  TRIAL_DAYS,
  PLAN_DAYS,
  activateSubscription,
  cancelSubscription,
  ensureSubscription,
  evaluate,
  getSubscription,
  hasActiveSubscription,
  subscriptionState,
} = await import("../lib/repositories/subscriptions.ts");
const { verifyWebhookSignature, subscriptionReference, paystackMode } = await import(
  "../lib/paystack.ts"
);
const { getDb } = await import("../lib/db/index.ts");

const seller = await signUp({
  email: "subs-seller@test.ng",
  password: "password123",
  ownerName: "Subs Seller",
  businessName: "Subs Shop",
});

if ("error" in seller) throw new Error(seller.error);

test("a new seller starts on a free month", () => {
  const state = subscriptionState(seller.user.id);
  assert.equal(state.status, "trialing");
  assert.equal(state.active, true);
  assert.ok(state.daysLeft >= TRIAL_DAYS - 1 && state.daysLeft <= TRIAL_DAYS);

  const subscription = getSubscription(seller.user.id);
  assert.ok(subscription);
  assert.equal(subscription.status, "trialing");
  assert.equal(subscription.amount_kobo, 250_000);
});

test("ensureSubscription is idempotent", () => {
  const first = ensureSubscription(seller.user.id);
  const second = ensureSubscription(seller.user.id);
  assert.equal(first.created_at, second.created_at);

  const rows = getDb()
    .prepare("SELECT COUNT(*) AS c FROM seller_subscriptions WHERE seller_id = ?")
    .get(seller.user.id);
  assert.equal(Number(rows.c), 1);
});

test("after the trial a seller is past due and read-only", () => {
  const subscription = getSubscription(seller.user.id);
  const afterTrial = evaluate(
    { ...subscription, trial_ends_at: new Date(Date.now() - 1000).toISOString() },
    Date.now(),
  );

  assert.equal(afterTrial.status, "past_due");
  assert.equal(afterTrial.active, false);
  assert.equal(afterTrial.daysLeft, 0);
});

test("paying extends the period by a month and reactivates", () => {
  const before = getSubscription(seller.user.id);

  const activated = activateSubscription(seller.user.id, {
    reference: "kc_sub_test_1",
    amountKobo: 250_000,
  });

  assert.equal(activated.status, "active");
  assert.equal(activated.paystack_reference, "kc_sub_test_1");
  // The paid month starts after the trial, so no trial days are lost.
  assert.ok(before.trial_ends_at);
  const expectedStart = Math.max(Date.now(), new Date(before.trial_ends_at).getTime());
  const actual = new Date(activated.current_period_end).getTime();
  assert.ok(actual > expectedStart + 29 * 86_400_000);
  assert.ok(actual < expectedStart + 31 * 86_400_000);

  const state = evaluate(activated, Date.now());
  assert.equal(state.status, "active");
  assert.equal(state.active, true);
  assert.ok(state.daysLeft >= PLAN_DAYS - 1);
  assert.equal(hasActiveSubscription(seller.user.id), true);
});

test("paying early adds days instead of losing them", () => {
  const first = getSubscription(seller.user.id);
  assert.ok(first.current_period_end);
  const firstEnd = new Date(first.current_period_end).getTime();

  const renewed = activateSubscription(seller.user.id, {
    reference: "kc_sub_test_2",
    amountKobo: 250_000,
  });
  const renewedEnd = new Date(renewed.current_period_end).getTime();

  const added = Math.round((renewedEnd - firstEnd) / 86_400_000);
  assert.equal(added, PLAN_DAYS);
});

test("cancelling keeps the period but blocks renewal", () => {
  const cancelled = cancelSubscription(seller.user.id);
  assert.equal(cancelled.status, "cancelled");

  const state = evaluate(cancelled, Date.now());
  assert.equal(state.status, "cancelled");
  assert.equal(state.active, false);
});

test("subscription references are unique and carry no secret", () => {
  const a = subscriptionReference(seller.user.id);
  const b = subscriptionReference(seller.user.id);

  assert.notEqual(a, b);
  assert.match(a, /^kc_sub_[0-9a-f]{8}_/);
  assert.ok(a.length < 80);
});

test("webhook signatures are verified in constant time", () => {
  const body = JSON.stringify({ event: "charge.success", data: { reference: "x" } });

  // No secret configured: everything is rejected.
  const original = process.env.PAYSTACK_SECRET_KEY;
  delete process.env.PAYSTACK_SECRET_KEY;
  assert.equal(verifyWebhookSignature(body, "anything"), false);
  assert.equal(paystackMode(), "unconfigured");

  process.env.PAYSTACK_SECRET_KEY = "sk_test_unit";
  const good = createHmac("sha512", "sk_test_unit").update(body, "utf8").digest("hex");

  assert.equal(verifyWebhookSignature(body, good), true);
  assert.equal(verifyWebhookSignature(body, good.slice(0, -2) + "00"), false);
  assert.equal(verifyWebhookSignature(body, null), false);
  assert.equal(paystackMode(), "test");

  if (original === undefined) delete process.env.PAYSTACK_SECRET_KEY;
  else process.env.PAYSTACK_SECRET_KEY = original;
});
