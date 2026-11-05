-- Rename `profiles` to `users`.
--
-- The application's SQL was written against a `users` table (that is the name in
-- the SQLite schema). Rather than rewriting ~40 queries, the Postgres table takes
-- the same name. Views, foreign keys, indexes, triggers and row-level policies
-- follow the rename automatically because they reference the table by OID; only
-- function bodies, which are stored as text, need rewriting.

alter table public.profiles rename to users;

-- View used by policy checks and by anonymous storefront reads.
-- Recreated explicitly so its definition reads `users`.
create or replace view public.public_shops
with (security_invoker = false)
as
select
  id,
  shop_slug,
  coalesce(shop_name, business_name) as shop_name,
  shop_description,
  shop_logo_url,
  shop_contact_phone,
  shop_bank_name,
  shop_account_name,
  shop_account_number,
  shop_delivery_fee_kobo,
  shop_delivery_note
from public.users
where shop_slug is not null;

grant select on public.public_shops to anon, authenticated;

-- Admin helper (used by the admin policies).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- Shop-slug assignment for rows inserted directly (mirrors / sync jobs).
create or replace function public.ensure_profile_slug()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base      text;
  candidate text;
  suffix    integer := 1;
begin
  if new.account_type <> 'seller' or new.shop_slug is not null then
    return new;
  end if;

  base := lower(regexp_replace(coalesce(nullif(new.shop_name, ''), new.business_name, 'shop'),
                               '[^a-zA-Z0-9]+', '-', 'g'));
  base := trim(both '-' from base);
  if length(base) < 3 then
    base := base || '-shop';
  end if;
  base := left(base, 34);

  candidate := base;
  while exists (select 1 from public.users u
                where u.shop_slug is not null and lower(u.shop_slug) = candidate) loop
    suffix := suffix + 1;
    candidate := base || '-' || suffix::text;
  end loop;

  new.shop_slug := candidate;
  return new;
end;
$$;

-- Supabase Auth profile mirror (kept for compatibility; the app manages accounts).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_type text := coalesce(new.raw_user_meta_data ->> 'account_type', 'seller');
begin
  if v_account_type not in ('seller', 'customer') then
    v_account_type := 'seller';
  end if;

  insert into public.users (id, email, owner_name, business_name, account_type)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'owner_name', ''),
    coalesce(new.raw_user_meta_data ->> 'business_name',
             new.raw_user_meta_data ->> 'owner_name',
             ''),
    v_account_type
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Public ordering functions (kept working; they reference the users table).
create or replace function public.create_public_order(
  p_shop_slug    text,
  p_product_slug text,
  p_name         text,
  p_phone        text,
  p_quantity     integer,
  p_address      text default null,
  p_notes        text default null,
  p_ip_hash      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller   uuid;
  v_product  public.products;
  v_customer uuid;
  v_order    uuid;
  v_reference text;
  v_token    text;
  v_total    bigint;
  v_recent   integer;
  v_name     text := btrim(coalesce(p_name, ''));
  v_phone    text := btrim(coalesce(p_phone, ''));
begin
  if p_ip_hash is not null then
    select count(*) into v_recent
    from public.public_order_attempts
    where ip_hash = p_ip_hash and created_at > now() - interval '15 minutes';

    if v_recent >= 5 then
      insert into public.public_order_attempts (product_id, ip_hash, outcome)
      values (null, p_ip_hash, 'rejected');
      raise exception 'Too many order attempts. Please try again later.'
        using errcode = 'check_violation';
    end if;
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Enter your name.' using errcode = 'check_violation';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 20 then
    raise exception 'Choose a quantity between 1 and 20.' using errcode = 'check_violation';
  end if;

  select u.id into v_seller
  from public.users u
  where u.shop_slug is not null and lower(u.shop_slug) = lower(p_shop_slug);

  if v_seller is null then
    raise exception 'Product not available.' using errcode = 'check_violation';
  end if;

  select * into v_product
  from public.products
  where seller_id = v_seller
    and lower(slug) = lower(p_product_slug)
    and publication_status = 'published';

  if v_product.id is null or v_product.availability <> 'available' then
    raise exception 'Product not available.' using errcode = 'check_violation';
  end if;

  v_total := v_product.price_kobo * p_quantity;

  select id into v_customer
  from public.customers
  where seller_id = v_seller and phone = v_phone;

  if v_customer is null then
    insert into public.customers (seller_id, name, phone, address, notes)
    values (v_seller, v_name, v_phone, nullif(btrim(coalesce(p_address, '')), ''), null)
    returning id into v_customer;
  end if;

  v_reference := public.generate_order_reference();
  v_token := encode(gen_random_bytes(24), 'hex');

  insert into public.orders (
    seller_id, customer_id, reference, status, payment_status,
    subtotal_kobo, delivery_fee_kobo, total_kobo, paid_kobo,
    delivery_address, notes, source, product_id, public_token
  ) values (
    v_seller, v_customer, v_reference, 'new', 'unpaid',
    v_total, 0, v_total, 0,
    nullif(btrim(coalesce(p_address, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    'product_link', v_product.id, v_token
  )
  returning id into v_order;

  insert into public.order_items (
    order_id, seller_id, product_id, description, quantity, unit_price_kobo, line_total_kobo
  ) values (
    v_order, v_seller, v_product.id, v_product.name, p_quantity,
    v_product.price_kobo, v_total
  );

  insert into public.order_events (order_id, seller_id, type, message)
  values (v_order, v_seller, 'created', 'Order placed from a shared product link.');

  if p_ip_hash is not null then
    insert into public.public_order_attempts (product_id, ip_hash, outcome)
    values (v_product.id, p_ip_hash, 'accepted');
  end if;

  return jsonb_build_object(
    'reference', v_reference,
    'token', v_token,
    'total_kobo', v_total
  );
end;
$$;

create or replace function public.get_public_order(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'reference', o.reference,
    'status', o.status,
    'payment_status', o.payment_status,
    'total_kobo', o.total_kobo,
    'created_at', o.created_at,
    'shop_name', coalesce(u.shop_name, u.business_name),
    'shop_slug', u.shop_slug,
    'shop_phone', u.shop_contact_phone,
    'product_name', i.description,
    'quantity', i.quantity,
    'unit_price_kobo', i.unit_price_kobo
  )
  from public.orders o
  join public.users u on u.id = o.seller_id
  join public.order_items i on i.order_id = o.id
  where o.public_token = p_token
  limit 1;
$$;
