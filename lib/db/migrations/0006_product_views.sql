-- Product link tracking.
--
-- Privacy decisions:
--   * no cookies and no IP addresses — visitors are counted via a hash of
--     (IP + user agent + day salt), which cannot be reversed into an identity and
--     stops being linkable across days;
--   * only the referrer *host* is stored (e.g. "whatsapp"), never the full URL;
--   * rows are pruned after the retention window.
--
-- What is deliberately NOT recorded: whether a particular person viewed a Status.
-- No platform provides that, and claiming it would be a lie.

CREATE TABLE product_views (
  id           TEXT PRIMARY KEY,
  product_id   TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  seller_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source       TEXT,
  referrer_host TEXT,
  visitor_hash TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX product_views_product_idx ON product_views (product_id, created_at DESC);
CREATE INDEX product_views_seller_idx ON product_views (seller_id, created_at DESC);
CREATE INDEX product_views_visitor_idx ON product_views (visitor_hash, created_at DESC);
