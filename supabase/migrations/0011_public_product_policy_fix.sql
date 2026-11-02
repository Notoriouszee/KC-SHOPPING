-- Fix: public product visibility depended on reading `profiles`.
--
-- The original policies ran an `exists (select 1 from profiles …)` check. Policies
-- are evaluated with the *querying* role's privileges, and anonymous visitors have
-- no SELECT policy on `profiles` — so the subquery always returned nothing and
-- published products were invisible to the public.
--
-- The fix routes the check through `public_shops`, a SECURITY DEFINER view that
-- exposes only storefront columns. That keeps `profiles` private while letting the
-- policy see whether the shop is live.

drop policy if exists products_public_read on public.products;

create policy products_public_read on public.products
  for select using (
    publication_status = 'published'
    and exists (
      select 1 from public.public_shops s
      where s.id = products.seller_id
    )
  );

drop policy if exists product_images_public_read on public.product_images;

create policy product_images_public_read on public.product_images
  for select using (
    exists (
      select 1
      from public.products pr
      join public.public_shops s on s.id = pr.seller_id
      where pr.id = product_images.product_id
        and pr.publication_status = 'published'
    )
  );

-- `public_shops` must be readable by anonymous visitors for the policies above.
grant select on public.public_shops to anon, authenticated;
