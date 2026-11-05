-- Make the Postgres schema the application's primary store.
--
-- Three differences from the SQLite schema mattered once the app started reading
-- Postgres directly:
--   1. `sessions` did not exist (authentication sessions live server-side).
--   2. `profiles` had no `password_hash` (passwords are app-managed).
--   3. `orders.delivery_fee_on_delivery` was boolean, while the code stores 0/1.

create table if not exists public.sessions (
  token      text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists sessions_user_id_idx on public.sessions (user_id);

-- Server-only table: no policies, so the anon and authenticated roles see nothing.
alter table public.sessions enable row level security;

alter table public.profiles
  add column if not exists password_hash text;

-- Boolean -> integer, keeping existing rows meaningful.
alter table public.orders
  alter column delivery_fee_on_delivery drop default;

alter table public.orders
  alter column delivery_fee_on_delivery type integer
  using (case when delivery_fee_on_delivery then 1 else 0 end);

alter table public.orders
  alter column delivery_fee_on_delivery set default 0;

-- Guard rails for the columns the app always writes.
alter table public.orders
  alter column delivery_fee_on_delivery set not null;

comment on column public.orders.delivery_fee_on_delivery is
  '1 = the delivery fee is collected by the rider (not transferred online).';

-- Passwords are scrypt hashes; enforce a sane shape without breaking existing rows.
create index if not exists profiles_shop_slug_idx on public.profiles (shop_slug);
create index if not exists sessions_expires_idx on public.sessions (expires_at);
