-- Shop profile and public shop slug.
--
-- Mirrors supabase/migrations/0002_shop.sql. The slug is the seller's public
-- identity (/shop/<slug>) so it needs a case-insensitive uniqueness guarantee
-- and a history table so old links can redirect instead of 404-ing.

ALTER TABLE users ADD COLUMN shop_slug TEXT;
ALTER TABLE users ADD COLUMN shop_name TEXT;
ALTER TABLE users ADD COLUMN shop_description TEXT;
ALTER TABLE users ADD COLUMN shop_logo_url TEXT;
ALTER TABLE users ADD COLUMN shop_contact_phone TEXT;
ALTER TABLE users ADD COLUMN shop_slug_changed_at TEXT;

-- Case-insensitive uniqueness; NULL slugs (not yet backfilled) are ignored.
CREATE UNIQUE INDEX users_shop_slug_unique ON users (lower(shop_slug)) WHERE shop_slug IS NOT NULL;

CREATE TABLE shop_slug_history (
  old_slug   TEXT PRIMARY KEY,
  seller_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX shop_slug_history_seller_idx ON shop_slug_history (seller_id, created_at DESC);

-- Every slug a seller has ever used must stay globally unique, otherwise an old
-- link could be reclaimed by a different seller and silently hijacked.
CREATE UNIQUE INDEX shop_slug_history_unique ON shop_slug_history (lower(old_slug));
