-- Public ordering from a shared product link.
--
-- Adds the attribution links (which product an order came from), an unguessable
-- token for the customer's own confirmation page, and a small table used to rate
-- limit anonymous submissions.

ALTER TABLE orders ADD COLUMN product_id TEXT REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN public_token TEXT;

ALTER TABLE order_items ADD COLUMN product_id TEXT REFERENCES products(id) ON DELETE SET NULL;

-- Only public orders have a token; internal orders leave it NULL.
CREATE UNIQUE INDEX orders_public_token_unique
  ON orders (public_token)
  WHERE public_token IS NOT NULL;

CREATE INDEX orders_product_idx ON orders (product_id);
CREATE INDEX order_items_product_idx ON order_items (product_id);

-- One row per anonymous submission (accepted or rejected). Used for rate
-- limiting; the IP is stored only as a daily-salted hash.
CREATE TABLE public_order_attempts (
  id         TEXT PRIMARY KEY,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  ip_hash    TEXT NOT NULL,
  outcome    TEXT NOT NULL CHECK (outcome IN ('accepted', 'rejected', 'bot')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX public_order_attempts_ip_idx ON public_order_attempts (ip_hash, created_at DESC);
CREATE INDEX public_order_attempts_product_idx ON public_order_attempts (product_id, created_at DESC);
