-- Product catalogue (PostgreSQL / Supabase).
--
-- Two independent product states:
--   publication_status: draft | published  (is it publicly visible at all?)
--   availability:       available | out_of_stock (can the seller fulfil it?)
--
-- Product slugs are unique per seller because product URLs are namespaced by
-- the shop: /product/<shop-slug>/<product-slug>.

create table public.products (
  id                 uuid primary key default gen_random_uuid(),
  seller_id          uuid not null references public.profiles (id) on delete cascade,
  name               text not null check (char_length(trim(name)) between 1 and 120),
  slug               text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$'),
  description        text,
  price_kobo         bigint not null check (price_kobo >= 0),
  publication_status text not null default 'draft'
                     check (publication_status in ('draft', 'published')),
  availability       text not null default 'available'
                     check (availability in ('available', 'out_of_stock')),
  published_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index products_seller_slug_unique
  on public.products (seller_id, lower(slug));

create index products_seller_created_idx on public.products (seller_id, created_at desc);
create index products_public_idx
  on public.products (seller_id, publication_status, availability);

create table public.product_images (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  seller_id  uuid not null references public.profiles (id) on delete cascade,
  url        text not null,
  alt        text,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

create index product_images_product_idx on public.product_images (product_id, position);

------------------------------------------------------------------------------
-- Row Level Security
------------------------------------------------------------------------------

alter table public.products       enable row level security;
alter table public.product_images enable row level security;

-- Sellers manage only their own products.
create policy products_select_own on public.products
  for select using (seller_id = auth.uid());

create policy products_insert_own on public.products
  for insert with check (seller_id = auth.uid());

create policy products_update_own on public.products
  for update using (seller_id = auth.uid()) with check (seller_id = auth.uid());

create policy products_delete_own on public.products
  for delete using (seller_id = auth.uid());

-- Anonymous visitors may read published products belonging to a shop that has a
-- live slug. Drafts are invisible even if the id is guessed.
create policy products_public_read on public.products
  for select using (
    publication_status = 'published'
    and exists (
      select 1 from public.profiles p
      where p.id = seller_id and p.shop_slug is not null
    )
  );

create policy product_images_select_own on public.product_images
  for select using (seller_id = auth.uid());

create policy product_images_insert_own on public.product_images
  for insert with check (
    seller_id = auth.uid()
    and exists (
      select 1 from public.products pr
      where pr.id = product_id and pr.seller_id = auth.uid()
    )
  );

create policy product_images_update_own on public.product_images
  for update using (seller_id = auth.uid()) with check (seller_id = auth.uid());

create policy product_images_delete_own on public.product_images
  for delete using (seller_id = auth.uid());

-- Images are public only when their product is published and the shop is live.
create policy product_images_public_read on public.product_images
  for select using (
    exists (
      select 1 from public.products pr
      join public.profiles p on p.id = pr.seller_id
      where pr.id = product_id
        and pr.publication_status = 'published'
        and p.shop_slug is not null
    )
  );

------------------------------------------------------------------------------
-- Storage: product photographs
------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152,
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Public read: the bucket is public, but writes stay owner-scoped by folder.
create policy "product images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'product-images');

create policy "sellers upload product images to their own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "sellers update their own product images"
  on storage.objects for update
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "sellers delete their own product images"
  on storage.objects for delete
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
