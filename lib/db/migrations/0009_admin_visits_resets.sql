-- Admin area, delivery confirmation, site-wide visits and password resets.

-- The customer confirms they received the order. Both the seller and the admin
-- can see this, which is what makes a dispute answerable.
ALTER TABLE orders ADD COLUMN received_confirmed_at TEXT;

-- Page visits across the public site (not just product pages), for the admin's
-- day/month/year visitor counts. Privacy model matches product_views: no cookies,
-- no IPs, only a daily-salted visitor hash.
CREATE TABLE site_visits (
  id           TEXT PRIMARY KEY,
  path         TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX site_visits_created_idx ON site_visits (created_at DESC);
CREATE INDEX site_visits_visitor_idx ON site_visits (visitor_hash, created_at DESC);

-- Password reset tokens. Only the hash is stored, so a database leak cannot be
-- used to reset anyone's password.
CREATE TABLE password_resets (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX password_resets_user_idx ON password_resets (user_id, created_at DESC);
