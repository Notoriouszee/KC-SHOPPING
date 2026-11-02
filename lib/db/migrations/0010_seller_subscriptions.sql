-- Seller subscriptions: one free month, then a monthly plan paid through Paystack.

CREATE TABLE seller_subscriptions (
  seller_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan                 TEXT NOT NULL DEFAULT 'seller-monthly',
  status               TEXT NOT NULL DEFAULT 'trialing',
  trial_ends_at        TEXT,
  current_period_end   TEXT,
  amount_kobo          INTEGER NOT NULL DEFAULT 250000,
  paystack_reference   TEXT,
  last_payment_at      TEXT,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX seller_subscriptions_status_idx ON seller_subscriptions (status, current_period_end);

-- Every existing seller starts their trial now rather than losing access.
INSERT INTO seller_subscriptions (seller_id, status, trial_ends_at, amount_kobo)
SELECT id, 'trialing', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 days'), 250000
FROM users
WHERE account_type = 'seller'
  AND id NOT IN (SELECT seller_id FROM seller_subscriptions);
