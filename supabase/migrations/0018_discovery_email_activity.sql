-- Product discovery, email notification history and customer activity.

alter table public.products
  add column if not exists discovery_salt integer not null default 0;

update public.products
   set discovery_salt = floor(random() * 1000000)::int
 where discovery_salt = 0;

create index if not exists products_discovery_idx
  on public.products (publication_status, availability, discovery_salt);

-- One row per notification; the unique index gives "exactly once" semantics.
create table if not exists public.email_events (
  id          text primary key,
  order_id    uuid not null references public.orders (id) on delete cascade,
  kind        text not null check (kind in ('seller_new_order', 'customer_out_for_delivery')),
  recipient   text not null,
  status      text not null default 'pending'
              check (status in ('pending', 'sent', 'failed', 'skipped')),
  provider_id text,
  error       text,
  attempts    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists email_events_once_idx
  on public.email_events (order_id, kind);
create index if not exists email_events_status_idx
  on public.email_events (status, created_at);

alter table public.email_events enable row level security;

-- Customer activity (personalisation input). Server-only: no policies.
create table if not exists public.customer_activity (
  id         text primary key,
  user_id    uuid not null references public.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,
  shop_id    uuid references public.users (id) on delete cascade,
  kind       text not null check (kind in ('view', 'search', 'purchase')),
  weight     integer not null,
  term       text,
  created_at timestamptz not null default now()
);

create index if not exists customer_activity_user_idx
  on public.customer_activity (user_id, created_at desc);
create index if not exists customer_activity_product_idx
  on public.customer_activity (product_id);

alter table public.customer_activity enable row level security;