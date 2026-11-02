-- Product link tracking (PostgreSQL / Supabase).
--
-- Same privacy model as the local schema: no cookies, no raw IPs, only a daily
-- salted visitor hash and the referrer host.

create table public.product_views (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products (id) on delete cascade,
  seller_id     uuid not null references public.profiles (id) on delete cascade,
  source        text,
  referrer_host text,
  visitor_hash  text not null,
  created_at    timestamptz not null default now()
);

create index product_views_product_idx on public.product_views (product_id, created_at desc);
create index product_views_seller_idx on public.product_views (seller_id, created_at desc);
create index product_views_visitor_idx on public.product_views (visitor_hash, created_at desc);

alter table public.product_views enable row level security;

-- Sellers may read views for their own products only.
create policy product_views_select_own on public.product_views
  for select using (seller_id = auth.uid());

-- No insert policy: views are written by the tracking endpoint using the
-- service role (or a SECURITY DEFINER function), never directly by a client.

comment on column public.product_views.visitor_hash is
  'Daily-salted hash of IP + user agent. Never linkable across days, never reversible.';
