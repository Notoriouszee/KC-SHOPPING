-- Product discovery, email notification history and customer activity.

-- A stable per-product random value. Product feeds are ordered by
-- ((discovery_salt + seed) % 1000000), so every visit gets a different but
-- consistent (paginated) arrangement without sorting the whole table by RAND().
ALTER TABLE products ADD COLUMN discovery_salt INTEGER NOT NULL DEFAULT 0;

UPDATE products
   SET discovery_salt = abs(random()) % 1000000
 WHERE discovery_salt = 0;

CREATE INDEX IF NOT EXISTS products_discovery_idx
  ON products (publication_status, availability, discovery_salt);

-- One row per notification we intend to send. The unique index is what makes
-- "exactly once" possible: a second attempt for the same order and kind is a
-- no-op rather than a duplicate email.
CREATE TABLE email_events (
  id          TEXT PRIMARY KEY,
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('seller_new_order', 'customer_out_for_delivery')),
  recipient   TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  provider_id TEXT,
  error       TEXT,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX email_events_once_idx ON email_events (order_id, kind);
CREATE INDEX email_events_status_idx ON email_events (status, created_at);

-- What a signed-in customer looked at, searched for, or bought. Only the product,
-- the shop, a weight and a timestamp are stored: no IP, no device, no free text
-- beyond the search term the customer typed.
CREATE TABLE customer_activity (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  shop_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('view', 'search', 'purchase')),
  weight     INTEGER NOT NULL,
  term       TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX customer_activity_user_idx ON customer_activity (user_id, created_at DESC);
CREATE INDEX customer_activity_product_idx ON customer_activity (product_id);