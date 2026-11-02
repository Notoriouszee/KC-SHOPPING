-- OrderPilot local development schema (SQLite).
--
-- This mirrors supabase/migrations/0001_core.sql, which is the production
-- source of truth (PostgreSQL + Row Level Security). The local schema exists so
-- the app can run and be tested without a Supabase project. Every table keeps
-- `seller_id` as the tenant boundary so the repository layer can enforce the
-- same ownership rules the RLS policies enforce in production.
--
-- Money is stored in integer kobo (1 naira = 100 kobo) to avoid float drift.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  owner_name    TEXT NOT NULL,
  business_name TEXT NOT NULL,
  phone         TEXT,
  role          TEXT NOT NULL DEFAULT 'seller' CHECK (role IN ('seller', 'admin')),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);

CREATE TABLE customers (
  id         TEXT PRIMARY KEY,
  seller_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  alt_phone  TEXT,
  address    TEXT,
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (seller_id, phone)
);

CREATE INDEX customers_seller_idx ON customers (seller_id, created_at DESC);

CREATE TABLE orders (
  id                TEXT PRIMARY KEY,
  seller_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id       TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  reference         TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new', 'confirmed', 'processing', 'ready', 'delivered', 'cancelled')),
  payment_status    TEXT NOT NULL DEFAULT 'unpaid'
                    CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'refunded')),
  subtotal_kobo     INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_kobo >= 0),
  delivery_fee_kobo INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee_kobo >= 0),
  total_kobo        INTEGER NOT NULL DEFAULT 0 CHECK (total_kobo >= 0),
  paid_kobo         INTEGER NOT NULL DEFAULT 0 CHECK (paid_kobo >= 0),
  delivery_address  TEXT,
  notes             TEXT,
  source            TEXT NOT NULL DEFAULT 'manual'
                    CHECK (source IN ('manual', 'product_link', 'shop')),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX orders_seller_created_idx ON orders (seller_id, created_at DESC);
CREATE INDEX orders_seller_status_idx ON orders (seller_id, status);
CREATE INDEX orders_customer_idx ON orders (customer_id);

CREATE TABLE order_items (
  id              TEXT PRIMARY KEY,
  order_id        TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  seller_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_kobo INTEGER NOT NULL CHECK (unit_price_kobo >= 0),
  line_total_kobo INTEGER NOT NULL CHECK (line_total_kobo >= 0),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX order_items_order_idx ON order_items (order_id);
CREATE INDEX order_items_seller_idx ON order_items (seller_id);

CREATE TABLE order_events (
  id         TEXT PRIMARY KEY,
  order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  seller_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  message    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX order_events_order_idx ON order_events (order_id, created_at);

CREATE TABLE follow_ups (
  id           TEXT PRIMARY KEY,
  seller_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id     TEXT REFERENCES orders(id) ON DELETE CASCADE,
  customer_id  TEXT REFERENCES customers(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  notes        TEXT,
  due_at       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  completed_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (order_id IS NOT NULL OR customer_id IS NOT NULL)
);

CREATE INDEX follow_ups_seller_due_idx ON follow_ups (seller_id, status, due_at);
