-- Admin area, delivery confirmation, site-wide visits and password resets
-- (PostgreSQL / Supabase).
--
-- Note: with Supabase Auth the password-reset flow uses
-- `supabase.auth.resetPasswordForEmail` and its own email delivery, so
-- `password_resets` exists only for the local SQLite backend. It is created here
-- too so both schemas stay identical.

alter table public.orders
  add column received_confirmed_at timestamptz;

comment on column public.orders.received_confirmed_at is
  'Set when the customer confirms delivery. Visible to the seller and admin.';

create table public.site_visits (
  id           uuid primary key default gen_random_uuid(),
  path         text not null,
  visitor_hash text not null,
  created_at   timestamptz not null default now()
);

create index site_visits_created_idx on public.site_visits (created_at desc);
create index site_visits_visitor_idx on public.site_visits (visitor_hash, created_at desc);

alter table public.site_visits enable row level security;

-- No policies: written by the server (service role), read only by the admin path.

create table public.password_resets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create index password_resets_user_idx on public.password_resets (user_id, created_at desc);

alter table public.password_resets enable row level security;

------------------------------------------------------------------------------
-- Admin role
------------------------------------------------------------------------------

-- `profiles.role` already exists ('seller' | 'admin'). Admins read across tenants,
-- so the helper below is used by admin-only views; it is NOT a policy shortcut.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- Admins may read every order (for payment disputes and receipt lookups).
drop policy if exists orders_admin_read on public.orders;
create policy orders_admin_read on public.orders
  for select using (public.is_admin());

drop policy if exists orders_admin_update on public.orders;
create policy orders_admin_update on public.orders
  for update using (public.is_admin()) with check (public.is_admin());

-- Admins may read receipts for any order.
create policy "admins read all receipts"
  on storage.objects for select
  using (bucket_id = 'payment-receipts' and public.is_admin());
