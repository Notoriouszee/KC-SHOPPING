-- OrderPilot core schema (PostgreSQL / Supabase).
--
-- This is the production source of truth. The local SQLite schema in
-- lib/db/migrations/0001_core.sql mirrors it so the app can run without a
-- Supabase project. Row Level Security is what enforces tenancy in production;
-- the repository layer performs the equivalent checks locally.
--
-- Money is stored in integer kobo (1 naira = 100 kobo).

create extension if not exists "pgcrypto";

------------------------------------------------------------------------------
-- Seller profiles
------------------------------------------------------------------------------

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null,
  owner_name    text not null,
  business_name text not null,
  phone         text,
  role          text not null default 'seller' check (role in ('seller', 'admin')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is 'One row per seller, keyed to auth.users.';

-- Keeps profiles in step with Supabase Auth sign-ups.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, owner_name, business_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'owner_name', ''),
    coalesce(new.raw_user_meta_data ->> 'business_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

------------------------------------------------------------------------------
-- Customers
------------------------------------------------------------------------------

create table public.customers (
  id         uuid primary key default gen_random_uuid(),
  seller_id  uuid not null references public.profiles (id) on delete cascade,
  name       text not null check (char_length(trim(name)) between 1 and 120),
  phone      text not null,
  alt_phone  text,
  address    text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_id, phone)
);

create index customers_seller_idx on public.customers (seller_id, created_at desc);

------------------------------------------------------------------------------
-- Orders
------------------------------------------------------------------------------

create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  seller_id         uuid not null references public.profiles (id) on delete cascade,
  customer_id       uuid not null references public.customers (id) on delete restrict,
  reference         text not null unique,
  status            text not null default 'new'
                    check (status in ('new', 'confirmed', 'processing', 'ready', 'delivered', 'cancelled')),
  payment_status    text not null default 'unpaid'
                    check (payment_status in ('unpaid', 'partial', 'paid', 'refunded')),
  subtotal_kobo     bigint not null default 0 check (subtotal_kobo >= 0),
  delivery_fee_kobo bigint not null default 0 check (delivery_fee_kobo >= 0),
  total_kobo        bigint not null default 0 check (total_kobo >= 0),
  paid_kobo         bigint not null default 0 check (paid_kobo >= 0),
  delivery_address  text,
  notes             text,
  source            text not null default 'manual'
                    check (source in ('manual', 'product_link', 'shop')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index orders_seller_created_idx on public.orders (seller_id, created_at desc);
create index orders_seller_status_idx on public.orders (seller_id, status);
create index orders_customer_idx on public.orders (customer_id);

create table public.order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders (id) on delete cascade,
  seller_id       uuid not null references public.profiles (id) on delete cascade,
  description     text not null,
  quantity        integer not null default 1 check (quantity > 0),
  unit_price_kobo bigint not null check (unit_price_kobo >= 0),
  line_total_kobo bigint not null check (line_total_kobo >= 0),
  created_at      timestamptz not null default now()
);

create index order_items_order_idx on public.order_items (order_id);

create table public.order_events (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  seller_id  uuid not null references public.profiles (id) on delete cascade,
  type       text not null,
  message    text not null,
  created_at timestamptz not null default now()
);

create index order_events_order_idx on public.order_events (order_id, created_at);

------------------------------------------------------------------------------
-- Follow-ups
------------------------------------------------------------------------------

create table public.follow_ups (
  id           uuid primary key default gen_random_uuid(),
  seller_id    uuid not null references public.profiles (id) on delete cascade,
  order_id     uuid references public.orders (id) on delete cascade,
  customer_id  uuid references public.customers (id) on delete cascade,
  title        text not null check (char_length(trim(title)) between 1 and 160),
  notes        text,
  due_at       timestamptz not null,
  status       text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  constraint follow_ups_target_check check (order_id is not null or customer_id is not null)
);

create index follow_ups_seller_due_idx on public.follow_ups (seller_id, status, due_at);

------------------------------------------------------------------------------
-- Row Level Security
------------------------------------------------------------------------------

alter table public.profiles    enable row level security;
alter table public.customers   enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.follow_ups  enable row level security;

-- Profiles: a seller may only see and edit their own row.
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_insert_own on public.profiles
  for insert with check (id = auth.uid());

-- Customers: ownership by seller_id.
create policy customers_select_own on public.customers
  for select using (seller_id = auth.uid());

create policy customers_insert_own on public.customers
  for insert with check (seller_id = auth.uid());

create policy customers_update_own on public.customers
  for update using (seller_id = auth.uid()) with check (seller_id = auth.uid());

create policy customers_delete_own on public.customers
  for delete using (seller_id = auth.uid());

-- Orders.
create policy orders_select_own on public.orders
  for select using (seller_id = auth.uid());

create policy orders_insert_own on public.orders
  for insert with check (
    seller_id = auth.uid()
    -- The customer must belong to the same seller.
    and exists (
      select 1 from public.customers c
      where c.id = customer_id and c.seller_id = auth.uid()
    )
  );

create policy orders_update_own on public.orders
  for update using (seller_id = auth.uid()) with check (seller_id = auth.uid());

create policy orders_delete_own on public.orders
  for delete using (seller_id = auth.uid());

-- Order items.
create policy order_items_select_own on public.order_items
  for select using (seller_id = auth.uid());

create policy order_items_insert_own on public.order_items
  for insert with check (
    seller_id = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_id and o.seller_id = auth.uid()
    )
  );

create policy order_items_update_own on public.order_items
  for update using (seller_id = auth.uid()) with check (seller_id = auth.uid());

create policy order_items_delete_own on public.order_items
  for delete using (seller_id = auth.uid());

-- Order events.
create policy order_events_select_own on public.order_events
  for select using (seller_id = auth.uid());

create policy order_events_insert_own on public.order_events
  for insert with check (
    seller_id = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_id and o.seller_id = auth.uid()
    )
  );

-- Follow-ups.
create policy follow_ups_select_own on public.follow_ups
  for select using (seller_id = auth.uid());

create policy follow_ups_insert_own on public.follow_ups
  for insert with check (seller_id = auth.uid());

create policy follow_ups_update_own on public.follow_ups
  for update using (seller_id = auth.uid()) with check (seller_id = auth.uid());

create policy follow_ups_delete_own on public.follow_ups
  for delete using (seller_id = auth.uid());

------------------------------------------------------------------------------
-- Quote: new customer orders must never start as paid
------------------------------------------------------------------------------

create or replace function public.orders_default_payment_status()
returns trigger
language plpgsql
as $$
begin
  -- Payment status is derived from recorded money, not set by the client.
  if new.paid_kobo = 0 then
    new.payment_status := 'unpaid';
  end if;
  return new;
end;
$$;

create trigger orders_payment_status_guard
  before insert on public.orders
  for each row execute function public.orders_default_payment_status();
