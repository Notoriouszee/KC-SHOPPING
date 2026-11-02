-- Seller subscriptions: one free month, then a monthly plan paid through Paystack.

create table public.seller_subscriptions (
  seller_id          uuid primary key references public.profiles (id) on delete cascade,
  plan               text not null default 'seller-monthly',
  status             text not null default 'trialing',
  trial_ends_at      timestamptz,
  current_period_end timestamptz,
  amount_kobo        integer not null default 250000,
  paystack_reference text,
  last_payment_at    timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index seller_subscriptions_status_idx
  on public.seller_subscriptions (status, current_period_end);

alter table public.seller_subscriptions enable row level security;

-- Sellers read their own subscription; only the server (service role) writes.
create policy "sellers read their own subscription"
  on public.seller_subscriptions for select
  using (seller_id = auth.uid() or public.is_admin());

create policy "admins update subscriptions"
  on public.seller_subscriptions for update
  using (public.is_admin()) with check (public.is_admin());

-- Start every existing seller on the trial.
insert into public.seller_subscriptions (seller_id, status, trial_ends_at, amount_kobo)
select p.id, 'trialing', now() + interval '30 days', 250000
from public.profiles p
where p.account_type = 'seller'
on conflict (seller_id) do nothing;
