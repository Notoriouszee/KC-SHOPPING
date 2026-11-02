-- Shop logos and profile images.
--
-- Products live in `product-images` and payment proofs in the private
-- `payment-receipts` bucket; this is the one missing piece for the storefront.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop-assets', 'shop-assets', true, 2097152,
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Public read: logos are shown on public shop and product pages.
create policy "shop assets are publicly readable"
  on storage.objects for select
  using (bucket_id = 'shop-assets');

-- Writes stay owner-scoped: the first path segment must be the seller's id.
create policy "sellers upload their own shop assets"
  on storage.objects for insert
  with check (
    bucket_id = 'shop-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "sellers update their own shop assets"
  on storage.objects for update
  using (
    bucket_id = 'shop-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "sellers delete their own shop assets"
  on storage.objects for delete
  using (
    bucket_id = 'shop-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
