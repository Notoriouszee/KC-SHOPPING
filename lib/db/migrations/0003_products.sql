-- Product catalogue.
--
-- Mirrors supabase/migrations/0003_products.sql. Products use two independent
-- states: `publication_status` (draft/published — whether the product appears
-- publicly at all) and `availability` (available/out_of_stock — whether the
-- seller can fulfil it). Keeping them separate is what lets a seller hide a
-- product without losing its history.
--
-- A product slug is unique per seller, not globally, because product URLs are
-- namespaced by the shop: /product/<shop-slug>/<product-slug>.

CREATE TABLE products (
  id                TEXT PRIMARY KEY,
  seller_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  slug              TEXT NOT NULL,
  description       TEXT,
  price_kobo        INTEGER NOT NULL CHECK (price_kobo >= 0),
  publication_status TEXT NOT NULL DEFAULT 'draft'
                     CHECK (publication_status IN ('draft', 'published')),
  availability      TEXT NOT NULL DEFAULT 'available'
                     CHECK (availability IN ('available', 'out_of_stock')),
  published_at      TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Case-insensitive uniqueness within a seller.
CREATE UNIQUE INDEX products_seller_slug_unique ON products (seller_id, lower(slug));
CREATE INDEX products_seller_created_idx ON products (seller_id, created_at DESC);
CREATE INDEX products_public_idx ON products (seller_id, publication_status, availability);

CREATE TABLE product_images (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  seller_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  alt        TEXT,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX product_images_product_idx ON product_images (product_id, position);
CREATE INDEX product_images_seller_idx ON product_images (seller_id);
