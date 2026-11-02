-- Shop profile and public shop slug (PostgreSQL / Supabase).
--
-- The slug is public identity: /shop/<slug>. Old slugs are retained in
-- shop_slug_history so existing shared links keep working (permanent redirect)
-- and so a retired slug can never be taken by another seller.

alter table public.profiles
  add column shop_slug            text,
  add column shop_name            text,
  add column shop_description     text,
  add column shop_logo_url        text,
  add column shop_contact_phone   text,
  add column shop_slug_changed_at timestamptz;

-- Case-insensitive uniqueness.
create unique index profiles_shop_slug_unique
  on public.profiles (lower(shop_slug))
  where shop_slug is not null;

alter table public.profiles
  add constraint profiles_slug_shape
  check (shop_slug is null or shop_slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$');

create table public.shop_slug_history (
  old_slug   text primary key,
  seller_id  uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index shop_slug_history_unique
  on public.shop_slug_history (lower(old_slug));

create index shop_slug_history_seller_idx
  on public.shop_slug_history (seller_id, created_at desc);

alter table public.shop_slug_history enable row level security;

-- Public storefronts need to resolve an old slug to the shop that owns it.
create policy shop_slug_history_public_read on public.shop_slug_history
  for select using (true);

create policy shop_slug_history_insert_own on public.shop_slug_history
  for insert with check (seller_id = auth.uid());

------------------------------------------------------------------------------
-- Public storefront access
------------------------------------------------------------------------------

-- Anonymous visitors may read only the storefront-facing columns of a profile.
-- A view keeps private fields (email) out of reach of the anon role entirely.
create or replace view public.public_shops
with (security_invoker = false)
as
select
  id,
  shop_slug,
  coalesce(shop_name, business_name) as shop_name,
  shop_description,
  shop_logo_url,
  shop_contact_phone
from public.profiles
where shop_slug is not null;

grant select on public.public_shops to anon, authenticated;

-- Note: there is deliberately no public SELECT policy on public.profiles. The
-- view above is the only anonymous read path, so columns such as `email` are
-- never exposed alongside storefront data.
