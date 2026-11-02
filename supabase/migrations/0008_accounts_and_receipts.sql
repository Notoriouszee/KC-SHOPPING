-- Seller/customer accounts, seller payment details, payment receipts and
-- delivery-fee-paid-on-delivery (PostgreSQL / Supabase).

alter table public.profiles
  add column account_type text not null default 'seller'
    check (account_type in ('seller', 'customer')),
  add column shop_bank_name text,
  add column shop_account_name text,
  add column shop_account_number text,
  add column shop_delivery_fee_kobo bigint not null default 0
    check (shop_delivery_fee_kobo >= 0),
  add column shop_delivery_note text;

comment on column public.profiles.account_type is
  'seller = manages a shop; customer = browses and buys only.';

alter table public.orders
  add column buyer_user_id uuid references public.profiles (id) on delete set null,
  add column receipt_url text,
  add column receipt_note text,
  add column receipt_amount_kobo bigint,
  add column receipt_uploaded_at timestamptz,
  add column delivery_fee_on_delivery boolean not null default false,
  add column amount_due_online_kobo bigint;

create index orders_buyer_idx on public.orders (buyer_user_id, created_at desc);

-- A customer may read and update *their own* orders (to attach a receipt) but
-- never another customer's, and never the seller's private fields.
create policy orders_select_own_as_buyer on public.orders
  for select using (buyer_user_id = auth.uid());

comment on column public.orders.amount_due_online_kobo is
  'Goods amount to transfer now. NULL means the full total_kobo.';

------------------------------------------------------------------------------
-- Receipt uploads (storage)
------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-receipts', 'payment-receipts', false, 4194304,
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Receipts are private: only the buyer and the seller of that order may read.
create policy "receipts readable by buyer and seller"
  on storage.objects for select
  using (
    bucket_id = 'payment-receipts'
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1]
        and (o.buyer_user_id = auth.uid() or o.seller_id = auth.uid())
    )
  );

create policy "buyers upload their own receipts"
  on storage.objects for insert
  with check (
    bucket_id = 'payment-receipts'
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1]
        and (o.buyer_user_id = auth.uid() or o.seller_id = auth.uid())
    )
  );
